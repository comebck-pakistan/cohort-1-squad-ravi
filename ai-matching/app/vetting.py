"""
vetting.py - automated freelancer trust and skill-proof checks.

Full vets run at freelancer completion before matching. Re-vets run for one
artifact only and reuse the stored Groq claims row, so link fixes cost zero
Groq tokens.
"""
import io
import re
import time
import urllib.parse
from datetime import datetime, timezone

import httpx

from app.config import config
from app.supabase_client import (
    find_freelancer,
    get_vetting_checks,
    replace_vetting_checks,
    update_freelancer_trust,
)
from app.groq_client import generate_vetting_analysis
from app.matching import extract_skills, refresh_match_totals_for_freelancer
from app.whatsapp import send_whatsapp_message

HTTP_TIMEOUT_S = 6.0
RECENT_PUSH_DAYS = 180
MAX_EVIDENCE_CHARS = 3000

CORE_TRIO = ["linkedin_url", "github_url", "cv_url"]
ARTIFACT_FIELDS = ["linkedin_url", "github_url", "cv_url", "support_docs", "portfolio"]
RECHECKABLE_FIELDS = set(ARTIFACT_FIELDS)

ARTIFACT_LABELS = {
    "linkedin_url": "LinkedIn",
    "github_url": "GitHub",
    "cv_url": "CV",
    "support_docs": "support docs",
    "portfolio": "portfolio",
}


def _clean_url_token(token) -> str:
    return re.sub(r"[)\],.!?]+$", "", str(token or "").strip())


def _normalise_url(url) -> str | None:
    cleaned = _clean_url_token(url)
    if not cleaned:
        return None
    if re.match(r"^https?://", cleaned, re.I):
        return cleaned
    return f"https://{cleaned.lstrip('/')}"


def _to_url(url) -> urllib.parse.ParseResult | None:
    normalised = _normalise_url(url)
    if not normalised:
        return None
    try:
        parsed = urllib.parse.urlparse(normalised)
        if not parsed.scheme or not parsed.netloc:
            return None
        return parsed
    except ValueError:
        return None


def _has_value(value) -> bool:
    return bool(value.strip()) if isinstance(value, str) else bool(value)


def _unique(values: list) -> list:
    seen = []
    for v in values:
        if v and v not in seen:
            seen.append(v)
    return seen


def _clamp(n, lo, hi):
    return max(lo, min(hi, n))


def _normalize_name(text) -> str:
    lowered = re.sub(r"[^a-z0-9\s]", " ", str(text or "").lower())
    return re.sub(r"\s+", " ", lowered).strip()


def _fuzzy_name_matches(candidate, registered_name) -> bool | None:
    cand = _normalize_name(candidate)
    name = _normalize_name(registered_name)
    if not cand or not name:
        return None
    if name in cand or cand in name:
        return True

    tokens = [t for t in name.split(" ") if len(t) > 1]
    if not tokens:
        return None
    hits = sum(1 for token in tokens if token in cand)
    return hits >= min(2, len(tokens))


def _row(artifact: str, check_type: str, status: str, evidence: dict | None = None) -> dict:
    return {"artifact": artifact, "check_type": check_type, "status": status, "evidence": evidence or {}}


def _http_status_to_vetting_status(status: int) -> str:
    if 200 <= status < 400:
        return "pass"
    if status in (404, 410):
        return "fail"
    if status in (401, 403, 429, 999) or status >= 500:
        return "unverifiable"
    return "unverifiable"


def _error_to_vetting_status(err: Exception) -> str:
    if isinstance(err, httpx.TimeoutException):
        return "unverifiable"
    if isinstance(err, httpx.ConnectError):
        return "fail"
    return "unverifiable"


async def _fetch_with_timeout(url: str, headers: dict | None = None, method: str = "GET") -> httpx.Response:
    all_headers = {
        "User-Agent": "AI-Matchmaker-Vetting/1.0 (+https://example.com)",
        "Accept": "text/html,application/json,text/plain,application/pdf,*/*",
        **(headers or {}),
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S, follow_redirects=True) as client:
        return await client.request(method, url, headers=all_headers)


def _strip_html(html) -> str:
    text = str(html or "")
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text).strip()


def _looks_like_login_wall(text) -> bool:
    t = str(text or "").lower()
    if len(t) < 80:
        return True
    return bool(re.search(r"(sign in|log in|login required|access denied|request access|you need permission|enable cookies)", t, re.I))


def _skills_from_text(text) -> list[str]:
    return extract_skills(str(text or ""))


def _add_evidence_snippet(evidence: list, artifact: str, text) -> None:
    snippet = str(text or "")[:MAX_EVIDENCE_CHARS].strip()
    if snippet:
        evidence.append({"artifact": artifact, "text": snippet})


def extract_first_url(text) -> str | None:
    """Extracts the first URL-like token from a WhatsApp message."""
    if not text:
        return None
    match = re.search(
        r'https?://[^\s<>"\']+|www\.[^\s<>"\']+|'
        r'(?:github\.com|linkedin\.com|docs\.google\.com|drive\.google\.com|dropbox\.com)/[^\s<>"\']+|'
        r'[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s<>"\']*)?',
        str(text),
        re.I,
    )
    return _normalise_url(match.group(0)) if match else None


def classify_link_field(url) -> str | None:
    """Classifies known proof links into the canonical freelancer link columns."""
    parsed = _to_url(url)
    if not parsed:
        return None
    host = parsed.hostname.lower().removeprefix("www.") if parsed.hostname else ""
    path = parsed.path.lower()

    if host == "github.com":
        return "github_url"
    if host == "linkedin.com" and re.match(r"^/(in|pub)/", path):
        return "linkedin_url"
    if host in ("docs.google.com", "drive.google.com", "dropbox.com") or path.endswith(".pdf"):
        return "cv_url"
    return None


def _parse_github_user(url) -> str | None:
    parsed = _to_url(url)
    if not parsed or (parsed.hostname or "").lower().removeprefix("www.") != "github.com":
        return None
    parts = [p for p in parsed.path.split("/") if p]
    if not parts:
        return None
    username = parts[0]
    if username.lower() in ("orgs", "marketplace", "topics", "features", "pricing"):
        return None
    return username


async def _check_github(url, freelancer: dict, evidence_for_groq: list) -> list[dict]:
    artifact = "github_url"
    username = _parse_github_user(url)
    if not username:
        return [_row(artifact, "liveness", "fail", {"url": url, "reason": "not_a_github_profile"})]

    headers = {"Accept": "application/vnd.github+json"}
    if config.github.token:
        headers["Authorization"] = f"Bearer {config.github.token}"

    try:
        user_response = await _fetch_with_timeout(f"https://api.github.com/users/{urllib.parse.quote(username)}", headers)
        liveness_status = _http_status_to_vetting_status(user_response.status_code)
        if liveness_status != "pass":
            return [_row(artifact, "liveness", liveness_status, {"url": url, "status_code": user_response.status_code})]
        user = user_response.json()
    except httpx.HTTPError as err:
        return [_row(artifact, "liveness", _error_to_vetting_status(err), {"url": url, "reason": str(err)})]

    rows = [
        _row(artifact, "liveness", "pass", {"url": url, "username": username}),
        _row(artifact, "identity", "pass", {
            "name_matched": _fuzzy_name_matches(" ".join(v for v in [user.get("name"), user.get("login")] if v), freelancer.get("name")),
            "profile_name": user.get("name") or user.get("login") or None,
        }),
    ]

    try:
        repos_response = await _fetch_with_timeout(
            f"https://api.github.com/users/{urllib.parse.quote(username)}/repos?per_page=100&sort=pushed", headers
        )
        repos_status = _http_status_to_vetting_status(repos_response.status_code)
        if repos_status != "pass":
            rows.append(_row(artifact, "content", repos_status, {"status_code": repos_response.status_code, "skills_found": []}))
            return rows

        repos = repos_response.json()
        originals = [repo for repo in repos if not repo.get("fork")] if isinstance(repos, list) else []
        repo_text = " ".join(
            " ".join(str(v) for v in [repo.get("name"), repo.get("description"), repo.get("language"), *(repo.get("topics") or [])] if v)
            for repo in originals
        )
        skills_found = _skills_from_text(repo_text)
        recent_since = time.time() - RECENT_PUSH_DAYS * 24 * 60 * 60
        has_recent_push = any(
            repo.get("pushed_at") and _parse_iso_to_epoch(repo["pushed_at"]) >= recent_since
            for repo in originals
        )

        rows.append(_row(artifact, "content", "pass", {
            "original_repo_count": len(originals),
            "recent_push_within_days": RECENT_PUSH_DAYS if has_recent_push else None,
            "skills_found": skills_found,
            "languages": _unique([repo.get("language") for repo in originals]),
        }))
        _add_evidence_snippet(evidence_for_groq, artifact, repo_text)
    except httpx.HTTPError as err:
        rows.append(_row(artifact, "content", _error_to_vetting_status(err), {"reason": str(err), "skills_found": []}))

    return rows


def _parse_iso_to_epoch(iso_str: str) -> float:
    try:
        return datetime.fromisoformat(iso_str.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def _linkedin_slug(url) -> str | None:
    parsed = _to_url(url)
    if not parsed:
        return None
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if host != "linkedin.com":
        return None
    parts = [p for p in parsed.path.split("/") if p]
    if not parts or parts[0].lower() not in ("in", "pub") or len(parts) < 2:
        return None
    return parts[1]


async def _check_linkedin(url, freelancer: dict) -> list[dict]:
    artifact = "linkedin_url"
    slug = _linkedin_slug(url)
    if not slug:
        return [_row(artifact, "liveness", "fail", {"url": url, "reason": "not_a_linkedin_profile"})]

    return [
        _row(artifact, "liveness", "unverifiable", {"url": url, "reason": "linkedin_not_fetched", "slug": slug}),
        _row(artifact, "identity", "unverifiable", {
            "name_matched": _fuzzy_name_matches(re.sub(r"[-_0-9]+", " ", slug), freelancer.get("name")),
            "slug": slug,
        }),
    ]


def _google_docs_export_url(parsed: urllib.parse.ParseResult) -> str | None:
    match = re.search(r"docs\.google\.com/document/d/([^/]+)", parsed.geturl(), re.I)
    return f"https://docs.google.com/document/d/{match.group(1)}/export?format=txt" if match else None


def _drive_download_url(parsed: urllib.parse.ParseResult) -> str | None:
    match = re.search(r"drive\.google\.com/file/d/([^/]+)", parsed.geturl(), re.I)
    if match:
        return f"https://drive.google.com/uc?export=download&id={match.group(1)}"
    qs = urllib.parse.parse_qs(parsed.query)
    file_id = qs.get("id", [None])[0]
    if "drive.google.com" in (parsed.hostname or "") and file_id:
        return f"https://drive.google.com/uc?export=download&id={file_id}"
    return None


def _extract_pdf_text(buffer: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(buffer))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


async def _check_cv(url, freelancer: dict, evidence_for_groq: list) -> list[dict]:
    artifact = "cv_url"
    parsed = _to_url(url)
    if not parsed:
        return [_row(artifact, "liveness", "fail", {"url": url, "reason": "invalid_url"})]

    fetch_url = _google_docs_export_url(parsed) or _drive_download_url(parsed) or parsed.geturl()

    try:
        response = await _fetch_with_timeout(fetch_url)
    except httpx.HTTPError as err:
        return [_row(artifact, "liveness", _error_to_vetting_status(err), {"url": url, "reason": str(err)})]

    liveness_status = _http_status_to_vetting_status(response.status_code)
    if liveness_status != "pass":
        return [_row(artifact, "liveness", liveness_status, {"url": url, "status_code": response.status_code})]

    rows = [_row(artifact, "liveness", "pass", {"url": url, "fetched_url": fetch_url, "status_code": response.status_code})]
    content_type = response.headers.get("content-type", "")
    is_pdf = bool(re.search(r"\.pdf($|\?)", parsed.path, re.I)) or "application/pdf" in content_type.lower()

    try:
        if is_pdf:
            text = _extract_pdf_text(response.content)
        else:
            raw = response.text
            text = _strip_html(raw) if "html" in content_type.lower() else raw
            if "html" in content_type.lower() and _looks_like_login_wall(text):
                rows.append(_row(artifact, "identity", "unverifiable", {"name_matched": None, "reason": "login_wall_or_too_little_text"}))
                rows.append(_row(artifact, "content", "unverifiable", {"skills_found": [], "reason": "login_wall_or_too_little_text"}))
                return rows
    except Exception as err:  # PDF parse or decode errors
        rows.append(_row(artifact, "identity", "unverifiable", {"name_matched": None, "reason": str(err)}))
        rows.append(_row(artifact, "content", "unverifiable", {"skills_found": [], "reason": str(err)}))
        return rows

    skills_found = _skills_from_text(text)
    rows.append(_row(artifact, "identity", "pass", {"name_matched": _fuzzy_name_matches(text[:1500], freelancer.get("name"))}))
    rows.append(_row(artifact, "content", "pass" if skills_found else "unverifiable", {
        "skills_found": skills_found,
        "text_chars": len(text),
        "content_type": content_type or None,
    }))
    _add_evidence_snippet(evidence_for_groq, artifact, text)
    return rows


def _is_youtube(host: str) -> bool:
    return host in ("youtube.com", "youtu.be", "m.youtube.com") or host.endswith(".youtube.com")


def _is_vimeo(host: str) -> bool:
    return host == "vimeo.com" or host.endswith(".vimeo.com")


async def _check_portfolio(url, freelancer: dict, evidence_for_groq: list) -> list[dict]:
    artifact = "portfolio"
    parsed = _to_url(url)
    if not parsed:
        return [_row(artifact, "liveness", "fail", {"url": url, "reason": "invalid_url"})]
    host = (parsed.hostname or "").lower().removeprefix("www.")

    if _is_youtube(host) or _is_vimeo(host):
        endpoint = (
            f"https://www.youtube.com/oembed?url={urllib.parse.quote(parsed.geturl())}&format=json"
            if _is_youtube(host)
            else f"https://vimeo.com/api/oembed.json?url={urllib.parse.quote(parsed.geturl())}"
        )
        try:
            response = await _fetch_with_timeout(endpoint, {"Accept": "application/json"})
            liveness_status = _http_status_to_vetting_status(response.status_code)
            if liveness_status != "pass":
                return [_row(artifact, "liveness", liveness_status, {"url": url, "status_code": response.status_code})]
            data = response.json()
            evidence_text = " ".join(v for v in [data.get("title"), data.get("author_name")] if v)
            _add_evidence_snippet(evidence_for_groq, artifact, evidence_text)
            return [
                _row(artifact, "liveness", "pass", {"url": url, "provider": "youtube" if _is_youtube(host) else "vimeo"}),
                _row(artifact, "identity", "pass", {
                    "name_matched": _fuzzy_name_matches(data.get("author_name"), freelancer.get("name")),
                    "author_name": data.get("author_name") or None,
                }),
                _row(artifact, "content", "pass", {"skills_found": _skills_from_text(evidence_text), "title": data.get("title") or None}),
            ]
        except httpx.HTTPError as err:
            return [_row(artifact, "liveness", _error_to_vetting_status(err), {"url": url, "reason": str(err)})]

    try:
        response = await _fetch_with_timeout(parsed.geturl())
        liveness_status = _http_status_to_vetting_status(response.status_code)
        if liveness_status != "pass":
            return [_row(artifact, "liveness", liveness_status, {"url": url, "status_code": response.status_code})]

        content_type = response.headers.get("content-type", "")
        raw = response.text
        text = _strip_html(raw) if "html" in content_type.lower() else raw
        if "html" in content_type.lower() and _looks_like_login_wall(text):
            return [
                _row(artifact, "liveness", "unverifiable", {"url": url, "reason": "login_wall_or_too_little_text"}),
                _row(artifact, "identity", "unverifiable", {"name_matched": None}),
                _row(artifact, "content", "unverifiable", {"skills_found": []}),
            ]

        skills_found = _skills_from_text(text)
        _add_evidence_snippet(evidence_for_groq, artifact, text)
        return [
            _row(artifact, "liveness", "pass", {"url": url, "status_code": response.status_code}),
            _row(artifact, "identity", "pass", {"name_matched": _fuzzy_name_matches(text[:1500], freelancer.get("name"))}),
            _row(artifact, "content", "pass" if skills_found else "unverifiable", {
                "skills_found": skills_found,
                "content_type": content_type or None,
            }),
        ]
    except httpx.HTTPError as err:
        return [_row(artifact, "liveness", _error_to_vetting_status(err), {"url": url, "reason": str(err)})]


async def _check_support_docs(url) -> list[dict]:
    artifact = "support_docs"
    parsed = _to_url(url)
    if not parsed:
        return [_row(artifact, "liveness", "fail", {"url": url, "reason": "invalid_url"})]

    try:
        response = await _fetch_with_timeout(parsed.geturl())
        liveness_status = _http_status_to_vetting_status(response.status_code)
        content_type = response.headers.get("content-type", "")
        rows = [_row(artifact, "liveness", liveness_status, {"url": url, "status_code": response.status_code})]
        if liveness_status == "pass":
            rows.append(_row(artifact, "content", "pass", {"content_type": content_type or None, "skills_found": []}))
        return rows
    except httpx.HTTPError as err:
        return [_row(artifact, "liveness", _error_to_vetting_status(err), {"url": url, "reason": str(err)})]


async def _check_artifact(artifact: str, url, freelancer: dict, evidence_for_groq: list) -> list[dict]:
    if not _has_value(url):
        return []
    if artifact == "github_url":
        return await _check_github(url, freelancer, evidence_for_groq)
    if artifact == "linkedin_url":
        return await _check_linkedin(url, freelancer)
    if artifact == "cv_url":
        return await _check_cv(url, freelancer, evidence_for_groq)
    if artifact == "portfolio":
        return await _check_portfolio(url, freelancer, evidence_for_groq)
    if artifact == "support_docs":
        return await _check_support_docs(url)
    return []


def _score_rows(rows: list[dict], check_type: str) -> list[float]:
    scores = []
    for r in rows:
        if r["check_type"] != check_type or r["artifact"] == "claims":
            continue
        if check_type == "liveness":
            scores.append(1 if r["status"] == "pass" else 0.6 if r["status"] == "unverifiable" else 0)
        else:
            matched = r["evidence"].get("name_matched")
            scores.append(1 if matched is True else 0 if matched is False else 0.5)
    return scores


def _row_average(scores: list[float]) -> float:
    return sum(scores) / len(scores) if scores else 0


def _normalize_skill(skill) -> str:
    return str(skill or "").lower().strip()


def _get_claims_row(rows: list[dict]) -> dict | None:
    return next((r for r in rows if r["artifact"] == "claims" and r["check_type"] == "groq_consistency"), None)


def _tier_for_score(score: int) -> str:
    if score >= 75:
        return "highly_trusted"
    if score >= 55:
        return "trusted"
    if score >= 35:
        return "basic"
    return "unverified"


def _human_tier(tier: str | None) -> str:
    return " ".join(part.capitalize() for part in str(tier or "unverified").split("_"))


def _broken_links_from_rows(rows: list[dict]) -> list[dict]:
    return [
        {
            "artifact": r["artifact"],
            "label": ARTIFACT_LABELS.get(r["artifact"], r["artifact"]),
            "url": r["evidence"].get("url"),
            "status_code": r["evidence"].get("status_code"),
            "reason": r["evidence"].get("reason"),
        }
        for r in rows
        if r["check_type"] == "liveness" and r["status"] == "fail"
    ]


def _unverifiable_links_from_rows(rows: list[dict]) -> list[dict]:
    return [
        {
            "artifact": r["artifact"],
            "label": ARTIFACT_LABELS.get(r["artifact"], r["artifact"]),
            "url": r["evidence"].get("url"),
            "status_code": r["evidence"].get("status_code"),
            "reason": r["evidence"].get("reason"),
        }
        for r in rows
        if r["check_type"] == "liveness" and r["status"] == "unverifiable"
    ]


def compute_trust_score(freelancer: dict, rows: list[dict]) -> dict:
    """Computes the 100-point trust score from stored rows plus the latest profile."""
    provided_core_count = sum(1 for field in CORE_TRIO if _has_value(freelancer.get(field)))
    coverage_points = 10 if provided_core_count >= 2 else 4 if provided_core_count == 1 else 0

    link_integrity_points = _row_average(_score_rows(rows, "liveness")) * 20
    identity_points = _row_average(_score_rows(rows, "identity")) * 15
    identity_links_points = coverage_points + link_integrity_points + identity_points

    claimed_skills = extract_skills(" ".join(str(v) for v in [freelancer.get("skills"), freelancer.get("tools"), freelancer.get("brief_description")] if v))
    evidenced_skills = _unique([s for r in rows if r["check_type"] == "content" for s in (r["evidence"].get("skills_found") or [])])
    evidenced_set = {_normalize_skill(s) for s in evidenced_skills}
    overlap = [s for s in claimed_skills if _normalize_skill(s) in evidenced_set]
    local_ratio = (0.3 if evidenced_skills else 0) if not claimed_skills else len(overlap) / len(claimed_skills)

    claims_row = _get_claims_row(rows)
    groq_ran = bool(claims_row and claims_row["evidence"].get("groq_ran") is True)
    supported_skills = (claims_row["evidence"].get("supported_skills") if claims_row else None) or []
    unsupported_skills = (claims_row["evidence"].get("unsupported_skills") if claims_row else None) or []
    groq_denominator = len(supported_skills) + len(unsupported_skills)
    groq_ratio = len(supported_skills) / groq_denominator if groq_ran and groq_denominator > 0 else 0
    blended_skill_ratio = (local_ratio + groq_ratio) / 2 if groq_ran else local_ratio
    skill_proof_points = blended_skill_ratio * 35

    consistency_score = _clamp(float((claims_row["evidence"].get("consistency_score") if claims_row else 0) or 0), 0, 100) if groq_ran else 0
    claims_consistency_points = (consistency_score / 100) * 20

    trust_score = round(identity_links_points + skill_proof_points + claims_consistency_points)
    trust_tier = _tier_for_score(trust_score)
    broken_links = _broken_links_from_rows(rows)
    unverifiable_links = _unverifiable_links_from_rows(rows)

    return {
        "trust_score": trust_score,
        "trust_tier": trust_tier,
        "trust_breakdown": {
            "identity_links": round(identity_links_points),
            "skill_proof": round(skill_proof_points),
            "claims_consistency": round(claims_consistency_points),
            "max": {"identity_links": 45, "skill_proof": 35, "claims_consistency": 20},
            "coverage_points": coverage_points,
            "link_integrity_points": round(link_integrity_points),
            "identity_points": round(identity_points),
            "claimed_skills": claimed_skills,
            "evidenced_skills": evidenced_skills,
            "local_supported_skills": overlap,
            "groq_ran": groq_ran,
            "supported_skills": supported_skills,
            "unsupported_skills": unsupported_skills,
            "consistency_score": consistency_score,
            "summary": (claims_row["evidence"].get("summary") if claims_row else None) or "",
            "broken_links": broken_links,
            "unverifiable_links": unverifiable_links,
        },
    }


def _lowest_bucket_tip(breakdown: dict) -> str:
    if breakdown["coverage_points"] < 10:
        return "Add at least 2 of LinkedIn/GitHub/CV to strengthen your identity coverage."

    buckets = sorted(
        [
            {"key": "identity_links", "ratio": breakdown["identity_links"] / 45},
            {"key": "skill_proof", "ratio": breakdown["skill_proof"] / 35},
            {"key": "claims_consistency", "ratio": breakdown["claims_consistency"] / 20},
        ],
        key=lambda b: b["ratio"],
    )

    if buckets[0]["key"] == "skill_proof":
        return "Add proof that mentions your main skills, like GitHub repos, portfolio case studies, or a CV with project details."
    if buckets[0]["key"] == "claims_consistency":
        return "Make your profile claims match the proof links: use the same skill names and recent project examples."
    return "Fix unverifiable or broken proof links so clients can open them confidently."


def _broken_links_prompt(broken_links: list[dict]) -> str:
    if not broken_links:
        return ""
    first = broken_links[0]
    reason = str(first["status_code"]) if first.get("status_code") else (first.get("reason") or "it did not open")
    extra = f" I also found {len(broken_links) - 1} other broken link{'s' if len(broken_links) > 2 else ''}." if len(broken_links) > 1 else ""
    return (
        f"\n\nYour {first['label']} link didn't open ({reason}). Your score was calculated with it marked broken."
        f"{extra} Resend just that link here and I'll re-check only that link."
    )


def _trust_message(score_result: dict, prefix: str = "Trust Score") -> str:
    b = score_result["trust_breakdown"]
    return (
        f"🛡️ {prefix}: {score_result['trust_score']}/100 ({_human_tier(score_result['trust_tier'])})\n"
        f"Identity & Links: {b['identity_links']}/45\n"
        f"Skill Proof: {b['skill_proof']}/35\n"
        f"Claims Consistency: {b['claims_consistency']}/20\n\n"
        f"Tip: {_lowest_bucket_tip(b)}{_broken_links_prompt(b['broken_links'])}"
    )


def _claims_row_from_analysis(analysis: dict | None, groq_ran: bool) -> dict:
    return _row("claims", "groq_consistency", "pass" if groq_ran else "unverifiable", {
        "groq_ran": groq_ran,
        "consistency_score": (analysis or {}).get("consistency_score", 0),
        "name_matches": (analysis or {}).get("name_matches") or [],
        "supported_skills": (analysis or {}).get("supported_skills") or [],
        "unsupported_skills": (analysis or {}).get("unsupported_skills") or [],
        "summary": (analysis or {}).get("summary") or "",
    })


async def _run_all_artifact_checks(freelancer: dict, evidence_for_groq: list) -> list[dict]:
    all_rows = []
    for artifact in ARTIFACT_FIELDS:
        rows = await _check_artifact(artifact, freelancer.get(artifact), freelancer, evidence_for_groq)
        all_rows.extend(rows)
    return all_rows


async def run_vetting_for_freelancer(phone: str) -> dict | None:
    """Runs a full freelancer vet, stores all checks and trust columns, then
    sends the freelancer a transparent score breakdown."""
    freelancer = await find_freelancer(phone)
    if not freelancer:
        print(f"[vetting] runVettingForFreelancer - no freelancer row for {phone}")
        return None

    evidence_for_groq: list = []
    rows = await _run_all_artifact_checks(freelancer, evidence_for_groq)

    analysis = None
    groq_ran = False
    if evidence_for_groq:
        try:
            claimed_skills = extract_skills(" ".join(str(v) for v in [freelancer.get("skills"), freelancer.get("tools"), freelancer.get("brief_description")] if v))
            analysis = await generate_vetting_analysis(freelancer, claimed_skills, evidence_for_groq)
            groq_ran = True
        except Exception as err:
            print(f"[vetting] Groq vetting analysis failed - scoring locally: {err}")

    rows = [*rows, _claims_row_from_analysis(analysis, groq_ran)]
    await replace_vetting_checks(phone, rows)

    score_result = compute_trust_score(freelancer, rows)
    await update_freelancer_trust(phone, score_result["trust_score"], score_result["trust_tier"], score_result["trust_breakdown"])
    await send_whatsapp_message(phone, _trust_message(score_result))
    return score_result


async def revet_artifact(phone: str, artifact: str) -> dict | None:
    """Re-checks one artifact only, reuses stored Groq claims, updates trust
    columns, refreshes existing match totals, and sends the updated score."""
    if artifact not in RECHECKABLE_FIELDS:
        print(f"[vetting] revetArtifact ignored unknown artifact: {artifact}")
        return None

    freelancer = await find_freelancer(phone)
    if not freelancer:
        print(f"[vetting] revetArtifact - no freelancer row for {phone}")
        return None

    evidence_for_groq: list = []
    artifact_rows = await _check_artifact(artifact, freelancer.get(artifact), freelancer, evidence_for_groq)
    await replace_vetting_checks(phone, artifact_rows, artifact)

    rows = await get_vetting_checks(phone)
    score_result = compute_trust_score(freelancer, rows)
    await update_freelancer_trust(phone, score_result["trust_score"], score_result["trust_tier"], score_result["trust_breakdown"])
    await refresh_match_totals_for_freelancer(phone)
    await send_whatsapp_message(phone, _trust_message(score_result, "Updated Trust Score"))
    return score_result
