"""
matching.py - the matching engine

Runs when an onboarding conversation reaches `completed`:
  - client completes  -> score all freelancers against the new job request
  - freelancer completes -> score all open job requests against the new profile

Scoring is fully local (zero API calls). One batched Groq call per run adds
the human-readable analysis (`ai_explanation` / `potential_risks` /
`recommended_action`) for the top matches; if Groq fails, deterministic
fallback text is used so matches are always written.

Output goes to the `matches`, `notifications`, and `insights` tables - the
exact shape the Next.js dashboard already reads.
"""
import re

from app.supabase_client import (
    find_freelancer,
    find_job_request,
    get_all_freelancers,
    get_all_job_requests,
    upsert_matches,
    insert_notifications,
    replace_insights,
    get_ranked_matches_for_phone,
    get_client,
)
from app.groq_client import generate_match_analyses
from app.whatsapp import send_whatsapp_message

MIN_SCORE = 35   # below this a pairing isn't worth showing
MAX_MATCHES = 5  # top-N written per run
COMPATIBILITY_WEIGHT = 0.75
TRUST_WEIGHT = 0.25

# -- Skill extraction -----------------------------------------------------------
# Skills/tools/project descriptions are free text, so overlap is computed
# against a curated dictionary instead of raw word tokens. Each entry maps a
# display name to the regexes that detect it.
SKILL_PATTERNS: list[tuple[str, list[re.Pattern]]] = [
    ("Video Editing", [re.compile(p, re.I) for p in [r"\bvideo\s*edit", r"\bpremiere\b", r"\bafter\s*effects\b", r"\bdavinci\b", r"\bfinal\s*cut\b", r"\bmotion\s*graphics\b", r"\bvfx\b", r"\bvideos?\b"]]),
    ("Animation", [re.compile(p, re.I) for p in [r"\banimat(?:ion|or|ed)\b", r"\b2d\s*animation\b", r"\b3d\b", r"\bblender\b"]]),
    ("Web Development", [re.compile(p, re.I) for p in [r"\bweb\s*(?:dev|development|developer|site|app)", r"\bwebsites?\b", r"\bfront[-\s]?end\b", r"\bback[-\s]?end\b", r"\bfull[-\s]?stack\b", r"\blanding\s*page"]]),
    ("React", [re.compile(p, re.I) for p in [r"\breact(?:\.?js)?\b", r"\bnext\.?js\b"]]),
    ("Node.js", [re.compile(p, re.I) for p in [r"\bnode(?:\.?js)?\b", r"\bexpress(?:\.?js)?\b"]]),
    ("JavaScript", [re.compile(p, re.I) for p in [r"\bjavascript\b", r"\btypescript\b", r"\bjs\b", r"\bhtml\b", r"\bcss\b"]]),
    ("WordPress", [re.compile(p, re.I) for p in [r"\bwordpress\b", r"\belementor\b", r"\bwoocommerce\b"]]),
    ("Shopify", [re.compile(r"\bshopify\b", re.I)]),
    ("PHP / Laravel", [re.compile(p, re.I) for p in [r"\bphp\b", r"\blaravel\b"]]),
    ("Python", [re.compile(p, re.I) for p in [r"\bpython\b", r"\bdjango\b", r"\bflask\b"]]),
    ("Mobile Apps", [re.compile(p, re.I) for p in [r"\bmobile\s*app", r"\bios\b", r"\bandroid\b", r"\bflutter\b", r"\breact\s*native\b", r"\bswift\b", r"\bkotlin\b", r"\bapp\s*(?:dev|development)\b"]]),
    ("UI/UX Design", [re.compile(p, re.I) for p in [r"\bui\s*\/?\s*ux\b", r"\bux\b", r"\bui\s*design", r"\bfigma\b", r"\bwireframe", r"\bprototyp"]]),
    ("Graphic Design", [re.compile(p, re.I) for p in [r"\bgraphic\s*design", r"\blogos?\b", r"\bbrand(?:ing|\s*identity)\b", r"\bphotoshop\b", r"\billustrator\b", r"\bcanva\b", r"\bposters?\b", r"\bflyers?\b", r"\bpackaging\b"]]),
    ("Content Writing", [re.compile(p, re.I) for p in [r"\bcontent\s*writ", r"\bcopywrit", r"\bblog", r"\barticles?\b", r"\bghostwrit", r"\bwriter\b", r"\bwriting\b", r"\bscripts?\b"]]),
    ("SEO", [re.compile(p, re.I) for p in [r"\bseo\b", r"\bsearch\s*engine", r"\bkeyword\s*research"]]),
    ("Social Media", [re.compile(p, re.I) for p in [r"\bsocial\s*media\b", r"\bsmm\b", r"\binstagram\b", r"\btiktok\b", r"\bfacebook\b", r"\blinkedin\b", r"\bcommunity\s*manag", r"\bcontent\s*calendar"]]),
    ("Digital Marketing", [re.compile(p, re.I) for p in [r"\bdigital\s*marketing\b", r"\bmarketing\b", r"\bgoogle\s*ads\b", r"\bmeta\s*ads\b", r"\bfacebook\s*ads\b", r"\bad\s*campaigns?\b", r"\bpaid\s*media\b", r"\bperformance\s*marketing\b"]]),
    ("UGC / Ad Creatives", [re.compile(p, re.I) for p in [r"\bugc\b", r"\bad\s*creatives?\b", r"\bspark\s*ads?\b", r"\buser[-\s]generated\b"]]),
    ("Virtual Assistance", [re.compile(p, re.I) for p in [r"\bvirtual\s*assistant\b", r"\bva\b", r"\bdata\s*entry\b", r"\badmin(?:istrative)?\s*(?:work|support|tasks?)\b", r"\bcustomer\s*(?:support|service)\b", r"\binbox\s*manag", r"\bcalendar\s*manag"]]),
    ("Data & Analytics", [re.compile(p, re.I) for p in [r"\bdata\s*analy", r"\bdashboards?\b", r"\bexcel\b", r"\bsql\b", r"\btableau\b", r"\bpower\s*bi\b", r"\bmachine\s*learning\b", r"\bdata\s*science\b", r"\bai\b", r"\bartificial\s*intelligence\b"]]),
    ("E-commerce", [re.compile(p, re.I) for p in [r"\be-?com(?:merce)?\b", r"\bonline\s*store\b", r"\bdropship", r"\bamazon\s*(?:fba|listing)"]]),
    ("Translation", [re.compile(p, re.I) for p in [r"\btranslat", r"\btranscri", r"\bsubtitl"]]),
    ("Photography", [re.compile(p, re.I) for p in [r"\bphotograph", r"\bphoto\s*edit", r"\bretouch"]]),
    ("Accounting", [re.compile(p, re.I) for p in [r"\baccounting\b", r"\bbookkeep", r"\bquickbooks\b", r"\bfinanc(?:e|ial)\b"]]),
]


def extract_skills(text: str | None) -> list[str]:
    """Detects known skills in free text. Returns display names, e.g.
    ["Video Editing", "Social Media"]."""
    if not text:
        return []
    found = []
    for name, patterns in SKILL_PATTERNS:
        if any(p.search(text) for p in patterns):
            found.append(name)
    return found


# -- Budget / availability parsing -----------------------------------------------

def parse_money(text, pick: str = "min") -> float | None:
    """Pulls dollar-ish numbers out of free text ("$20/hr", "20-30", "1.5k").
    pick='min' for a freelancer's rate, pick='max' for a client's budget.
    Returns None when no number is present."""
    if not text:
        return None
    matches = re.finditer(r"(\d+(?:[.,]\d+)?)\s*(k)?", str(text), re.I)
    values = []
    for m in matches:
        try:
            n = float(m.group(1).replace(",", ".")) * (1000 if m.group(2) else 1)
        except ValueError:
            continue
        if n > 0:
            values.append(n)
    if not values:
        return None
    return max(values) if pick == "max" else min(values)


def parse_hours_per_week(text) -> int | None:
    """Parses weekly availability text into hours/week. Understands "20 hours",
    "full time" (40), "part time" (20), or a bare number. None when unclear."""
    if not text:
        return None
    t = str(text).lower()
    if re.search(r"full[-\s]?time", t):
        return 40
    if re.search(r"part[-\s]?time", t):
        return 20
    hour_match = re.search(r"(\d+)\s*(?:\+\s*)?(?:hours?|hrs?|h)\b", t)
    if hour_match:
        return int(hour_match.group(1))
    bare = re.match(r"^\s*(\d+)\s*\+?\s*$", t)
    if bare:
        n = int(bare.group(1))
        if 0 < n <= 100:
            return n
    return None


# -- Scoring ---------------------------------------------------------------------

def score_match(freelancer: dict, job: dict) -> dict:
    """Scores one freelancer against one job request. Local only, no API calls.
    Weights: skills 55%, budget 25%, availability 20%.

    Returns { score, skills_overlap, budget_fit, availability_fit }
    """
    freelancer_text = " ".join(
        str(v) for v in [freelancer.get("skills"), freelancer.get("tools"), freelancer.get("preferences"), freelancer.get("brief_description")] if v
    )
    job_text = " ".join(
        str(v) for v in [job.get("project_description"), job.get("brief_description")] if v
    )

    freelancer_skills = extract_skills(freelancer_text)
    job_skills = extract_skills(job_text)
    overlap = [s for s in freelancer_skills if s in job_skills]

    # Skills: fraction of what the job needs that the freelancer covers.
    # When the job text mentions nothing we recognise, stay neutral instead of
    # zeroing everyone out.
    skill_score = 0.4 if len(job_skills) == 0 else len(overlap) / len(job_skills)

    # Budget: only comparable when the client gave an hourly budget. A project
    # budget can't be compared to an hourly rate without knowing duration, so
    # that case stays neutral with fit = True (no evidence against).
    rate = parse_money(freelancer.get("rate"), "min")
    client_hourly = parse_money(job.get("budget_hourly"), "max")
    budget_score = 0.6
    budget_fit = True
    if rate is not None and client_hourly is not None:
        if client_hourly >= rate:
            budget_score = 1
        elif client_hourly >= rate * 0.75:
            budget_score = 0.7  # close enough to negotiate
        else:
            budget_score = 0.2
            budget_fit = False

    # Availability: full-time hires need real weekly hours; project work is
    # satisfied by much less. Unparseable availability stays neutral.
    hours = parse_hours_per_week(freelancer.get("availability"))
    needed_hours = 30 if job.get("hire_type") == "full-time" else 10
    availability_score = 0.7
    availability_fit = True
    if hours is not None:
        if hours >= needed_hours:
            availability_score = 1
        elif hours >= needed_hours / 2:
            availability_score = 0.6
        else:
            availability_score = 0.3
            availability_fit = False

    score = round(100 * (0.55 * skill_score + 0.25 * budget_score + 0.2 * availability_score))
    return {"score": score, "skills_overlap": overlap, "budget_fit": budget_fit, "availability_fit": availability_fit}


# -- AI analysis (with deterministic fallback) -----------------------------------

def _fallback_analysis(scored: dict) -> dict:
    score = scored["score"]
    skills_overlap = scored["skills_overlap"]
    budget_fit = scored["budget_fit"]
    availability_fit = scored["availability_fit"]
    return {
        "ai_explanation": (
            f"Matched on {', '.join(skills_overlap)} with an overall compatibility score of {score}%."
            if skills_overlap
            else f"Profile broadly fits this project with an overall compatibility score of {score}%."
        ),
        "potential_risks": (
            "The quoted rate may exceed the stated budget — confirm pricing early."
            if not budget_fit
            else "Weekly availability may be tight for this timeline — confirm hours upfront."
            if not availability_fit
            else "Limited history on the platform — ask for recent work samples."
        ),
        "recommended_action": "Review the portfolio and message them on WhatsApp to confirm scope and timeline.",
    }


async def _attach_analyses(job: dict, scored_candidates: list[dict]) -> list[dict]:
    """Attaches ai_explanation / potential_risks / recommended_action to each
    scored candidate - one batched Groq call, falling back to template text
    per-candidate if the call fails or skips someone."""
    analyses: dict[str, dict] = {}
    try:
        analyses = await generate_match_analyses(job, scored_candidates)
    except Exception as err:
        print(f"[matching] Groq analysis failed — using fallback text: {err}")

    results = []
    for c in scored_candidates:
        ai = analyses.get(str(c["freelancer"]["phone"]))
        fallback = _fallback_analysis(c)
        results.append({
            **c,
            "ai_explanation": (ai or {}).get("ai_explanation") or fallback["ai_explanation"],
            "potential_risks": (ai or {}).get("potential_risks") or fallback["potential_risks"],
            "recommended_action": (ai or {}).get("recommended_action") or fallback["recommended_action"],
        })
    return results


# -- Shared: score, persist, notify ------------------------------------------------

def _trust_score_for_freelancer(freelancer: dict | None) -> float | None:
    value = (freelancer or {}).get("trust_score")
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def compute_total_score(compatibility_score, trust_score) -> int:
    return round(
        COMPATIBILITY_WEIGHT * float(compatibility_score or 0) +
        TRUST_WEIGHT * float(trust_score if trust_score is not None else 0)
    )


def _with_trust_snapshot(scored: dict) -> dict:
    trust_score = _trust_score_for_freelancer(scored["freelancer"])
    return {
        **scored,
        "trust_score": trust_score,
        "total_score": compute_total_score(scored["score"], trust_score),
    }


def _to_match_row(job: dict, c: dict) -> dict:
    return {
        "freelancer_phone": c["freelancer"]["phone"],
        "client_phone": job["phone"],
        "compatibility_score": c["score"],
        "trust_score": c.get("trust_score"),
        "total_score": c["total_score"],
        "skills_overlap": c["skills_overlap"],
        "budget_fit": c["budget_fit"],
        "availability_fit": c["availability_fit"],
        "ai_explanation": c["ai_explanation"],
        "potential_risks": c["potential_risks"],
        "recommended_action": c["recommended_action"],
    }


def _short_project_line(job: dict) -> str:
    desc = (job.get("project_description") or job.get("brief_description") or "a new project").strip()
    return f"{desc[:117]}..." if len(desc) > 120 else desc


def _whatsapp_link(phone) -> str:
    cleaned = re.sub(r"\D", "", str(phone or ""))
    return f"wa.me/{cleaned}" if cleaned else "contact unavailable"


def _contact_line_for_rank(profile: dict | None, rank: int) -> str:
    if (profile or {}).get("contact_sharing_allowed") is True:
        return f"📱 Contact: {_whatsapp_link(profile.get('phone'))}"
    return f'🔒 Contact hidden. Reply "request contact {rank}" and I\'ll ask them first.'


def _hidden_contact_note(profile: dict | None, role_label: str) -> str:
    if (profile or {}).get("contact_sharing_allowed") is True:
        return f"📱 {role_label} contact: {_whatsapp_link(profile.get('phone'))}\n"
    return f"🔒 {role_label} contact is private for now.\n"


async def _rank_for_match(phone: str, role: str, match_id) -> int | None:
    matches = await get_ranked_matches_for_phone(phone, role)
    for index, m in enumerate(matches):
        if str(m.get("id")) == str(match_id):
            return index + 1
    return None


def _score_freelancers_for_job(job: dict, freelancers: list[dict]) -> list[dict]:
    candidates = []
    for f in freelancers:
        if f.get("phone") == job.get("phone"):
            continue
        # Only freelancers who said "yes" to currently working/open to work take
        # part in matching (None = never answered, e.g. pre-feature rows).
        if f.get("working_currently") is not True:
            continue
        scored = {"freelancer": f, **score_match(f, job)}
        if scored["score"] >= MIN_SCORE:
            candidates.append(_with_trust_snapshot(scored))
    candidates.sort(key=lambda c: (c["total_score"], c["score"]), reverse=True)
    return candidates[:MAX_MATCHES]


# -- Entry point: client finished onboarding --------------------------------------

async def run_matching_for_client(client_phone: str) -> None:
    """Called after a client's job request is saved. Scores every registered
    freelancer, writes the top matches, notifies both sides."""
    job = await find_job_request(client_phone)
    if not job:
        print(f"[matching] runMatchingForClient — no job_request row for {client_phone}")
        return

    # Only actively-hiring clients get matched
    if job.get("hiring_currently") is not True:
        print(f"[matching] client {client_phone} is not actively hiring — skipping matching")
        await send_whatsapp_message(
            client_phone,
            "Got it — since you're not actively hiring right now, I've saved your project without matching you to "
            "freelancers. Whenever you're ready, just tell me \"change my hiring status\" and I'll get to work! 👍",
        )
        return

    freelancers = await get_all_freelancers()
    top = _score_freelancers_for_job(job, freelancers)
    print(f"[matching] client {client_phone}: {len(freelancers)} freelancer(s) considered, {len(top)} match(es) >= {MIN_SCORE}%")

    if not top:
        await send_whatsapp_message(
            client_phone,
            "I've saved your project! 📋 No registered freelancer is a strong fit *yet* — new freelancers join "
            "daily and I'll message you here the moment one matches. 🔔",
        )
        return

    analysed = await _attach_analyses(job, top)
    written_matches = await upsert_matches([_to_match_row(job, c) for c in analysed])
    written_by_freelancer = {m["freelancer_phone"]: m for m in written_matches}

    # In-app notifications for both sides
    project_line = _short_project_line(job)
    await insert_notifications([
        {
            "phone": client_phone,
            "type": "new_match",
            "title": f"{len(analysed)} freelancer match{'es' if len(analysed) > 1 else ''} found",
            "body": f"Top match: {analysed[0]['freelancer'].get('name') or 'a freelancer'} ({analysed[0]['total_score']}% overall).",
        },
        *[
            {
                "phone": c["freelancer"]["phone"],
                "type": "new_match",
                "title": "New project matches your skills",
                "body": f"{job.get('name') or 'A client'} is looking for: {project_line} ({c['score']}% skill match).",
            }
            for c in analysed
        ],
    ])

    # WhatsApp: summary to the client (they just messaged us, so we're inside
    # the 24h reply window)...
    list_lines = []
    for i, c in enumerate(analysed):
        f = c["freelancer"]
        skills = ", ".join(c["skills_overlap"]) if c["skills_overlap"] else (f.get("skills") or "profile on file")
        rate_part = f" · {f['rate']}" if f.get("rate") else ""
        list_lines.append(
            f"{i + 1}. *{f.get('name') or 'Freelancer'}* — Overall {c['total_score']}% · Skill {c['score']}% · Trust {c.get('trust_score') or 0}\n"
            f"   {skills}{rate_part}\n"
            f"   {_contact_line_for_rank(f, i + 1)}"
        )
    list_text = "\n\n".join(list_lines)
    greeting_name_part = f", {job['name']}" if job.get("name") else ""
    await send_whatsapp_message(
        client_phone,
        f"🎯 Great news{greeting_name_part}! I found {len(analysed)} freelancer"
        f"{'s' if len(analysed) > 1 else ''} for your project:\n\n{list_text}\n\n"
        'Use direct contact links where shown. For hidden contacts, reply with the request command and I\'ll ask '
        'them first.\n\nNext steps: reply "shortlist 1", "hire 1", "decline 1", or "useful 1 yes/no". 🤝',
    )

    # ...and a heads-up to each matched freelancer. These can fail if the
    # freelancer hasn't messaged in 24h (Meta's messaging window) - that's
    # logged inside send_whatsapp_message and shouldn't stop the loop.
    for c in analysed:
        row = written_by_freelancer.get(c["freelancer"]["phone"])
        rank = await _rank_for_match(c["freelancer"]["phone"], "freelancer", row["id"]) if row else None
        action_hint = (
            f'\n\nReply "interested {rank}" if you want this project, or "decline {rank}" if it\'s not a fit.'
            if rank
            else '\n\nReply "show my matches" to see and update this match.'
        )
        budget_line = f"💰 Budget: {job.get('budget_project') or job.get('budget_hourly')}\n" if (job.get("budget_project") or job.get("budget_hourly")) else ""
        deadline_line = f"⏰ Timeline: {job['deadline']}\n" if job.get("deadline") else ""
        contact_note = _hidden_contact_note(job, "Client")
        shared_note = (
            "I've shared your details with them, so they may reach out here on WhatsApp soon!"
            if c["freelancer"].get("contact_sharing_allowed") is True
            else "I have not shared your contact; if the client asks for it, I'll request your approval first."
        )
        await send_whatsapp_message(
            c["freelancer"]["phone"],
            f"🎉 New project match, {c['freelancer'].get('name') or 'there'}!\n\n"
            f"*{job.get('name') or 'A client'}* needs: {project_line}\n{budget_line}{deadline_line}{contact_note}"
            f"It's a {c['score']}% skill match with your profile. {shared_note}{action_hint}",
        )


# -- Entry point: freelancer finished onboarding -----------------------------------

async def run_matching_for_freelancer(freelancer_phone: str) -> None:
    """Called after a freelancer's profile is saved. Scores every open job
    request, writes the top matches, refreshes the freelancer's dashboard
    insights, and notifies the freelancer (clients get in-app notifications
    only, so a new signup doesn't WhatsApp-blast every past client)."""
    freelancer = await find_freelancer(freelancer_phone)
    if not freelancer:
        print(f"[matching] runMatchingForFreelancer — no freelancer row for {freelancer_phone}")
        return

    jobs = await get_all_job_requests()

    # Dashboard insights are cheap to compute here since jobs are already loaded
    await _write_freelancer_insights(freelancer, jobs)

    # Only freelancers who said "yes" to currently working/open to work get matched
    if freelancer.get("working_currently") is not True:
        print(f"[matching] freelancer {freelancer_phone} is not open to work — skipping matching")
        await send_whatsapp_message(
            freelancer_phone,
            "Since you're not taking on work right now, I won't match you with clients yet. Tell me "
            '"change my working status" whenever you\'re ready and I\'ll start matching you! 👍',
        )
        return

    scored = []
    for j in jobs:
        if j.get("phone") == freelancer_phone:
            continue
        # Only actively-hiring clients are shown to freelancers
        if j.get("hiring_currently") is not True:
            continue
        m = {"job": j, "freelancer": freelancer, **score_match(freelancer, j)}
        if m["score"] >= MIN_SCORE:
            scored.append(_with_trust_snapshot(m))
    scored.sort(key=lambda m: (m["total_score"], m["score"]), reverse=True)
    scored = scored[:MAX_MATCHES]

    print(f"[matching] freelancer {freelancer_phone}: {len(jobs)} job(s) considered, {len(scored)} match(es) >= {MIN_SCORE}%")
    if not scored:
        return  # completion reply already promised "we'll reach out"

    # The batched Groq analysis takes one job + many candidates; here every row
    # has a different job, so AI text is generated only for the best pairing
    # (one call) and the rest use fallback text to keep token spend flat.
    best = scored[0]
    try:
        analyses = await generate_match_analyses(best["job"], [{
            "freelancer": freelancer,
            "score": best["score"],
            "trust_score": best.get("trust_score"),
            "skills_overlap": best["skills_overlap"],
            "budget_fit": best["budget_fit"],
            "availability_fit": best["availability_fit"],
        }])
        ai = analyses.get(str(freelancer["phone"]))
        analysed = []
        for i, m in enumerate(scored):
            fallback = _fallback_analysis(m)
            analysed.append({
                **m,
                "ai_explanation": ai["ai_explanation"] if i == 0 and ai and ai.get("ai_explanation") else fallback["ai_explanation"],
                "potential_risks": ai["potential_risks"] if i == 0 and ai and ai.get("potential_risks") else fallback["potential_risks"],
                "recommended_action": ai["recommended_action"] if i == 0 and ai and ai.get("recommended_action") else fallback["recommended_action"],
            })
    except Exception as err:
        print(f"[matching] Groq analysis failed — using fallback text: {err}")
        analysed = [{**m, **_fallback_analysis(m)} for m in scored]

    await upsert_matches([_to_match_row(m["job"], m) for m in analysed])

    await insert_notifications([
        {
            "phone": freelancer_phone,
            "type": "new_match",
            "title": f"{len(analysed)} project{'s match' if len(analysed) > 1 else ' matches'} your profile",
            "body": f"Top match: {_short_project_line(analysed[0]['job'])} ({analysed[0]['total_score']}% overall).",
        },
        *[
            {
                "phone": m["job"]["phone"],
                "type": "new_match",
                "title": "New freelancer matches your project",
                "body": f"{freelancer.get('name') or 'A freelancer'} just joined and is a {m['score']}% skill match for your project.",
            }
            for m in analysed
        ],
    ])

    list_lines = []
    for i, m in enumerate(analysed):
        budget = m["job"].get("budget_project") or m["job"].get("budget_hourly")
        budget_part = f" · 💰 {budget}" if budget else ""
        list_lines.append(
            f"{i + 1}. {_short_project_line(m['job'])} — Overall {m['total_score']}% · Skill {m['score']}% · "
            f"Trust {m.get('trust_score') or 0}{budget_part}\n   {_contact_line_for_rank(m['job'], i + 1)}"
        )
    list_text = "\n".join(list_lines)
    await send_whatsapp_message(
        freelancer_phone,
        f"🎯 Good news, {freelancer.get('name') or 'there'}! Your profile already matches {len(analysed)} open "
        f"project{'s' if len(analysed) > 1 else ''}:\n\n{list_text}\n\n"
        f"I've notified the client{'s' if len(analysed) > 1 else ''} about you. "
        'Reply "interested 1", "decline 1", "request contact 1", or "useful 1 yes/no". 🤝',
    )


async def refresh_match_totals_for_freelancer(freelancer_phone: str) -> None:
    """Refreshes trust snapshots and total scores on existing match rows after
    a single-artifact re-vet. Compatibility scores stay untouched."""
    freelancer = await find_freelancer(freelancer_phone)
    if not freelancer:
        print(f"[matching] refreshMatchTotalsForFreelancer — no freelancer row for {freelancer_phone}")
        return

    from postgrest.exceptions import APIError

    try:
        client = await get_client()
        res = await (
            client.table("matches")
            .select("id, compatibility_score")
            .eq("freelancer_phone", freelancer_phone)
            .execute()
        )
        rows = res.data or []
    except APIError as err:
        print(f"[matching] refreshMatchTotalsForFreelancer read FAILED: {err}")
        return

    trust_score = _trust_score_for_freelancer(freelancer)
    for match in rows:
        try:
            client = await get_client()
            await (
                client.table("matches")
                .update({
                    "trust_score": trust_score,
                    "total_score": compute_total_score(match["compatibility_score"], trust_score),
                })
                .eq("id", match["id"])
                .execute()
            )
        except APIError as err:
            print(f"[matching] refreshMatchTotalsForFreelancer update FAILED: {err}")


# -- Freelancer dashboard insights (local, zero API calls) --------------------------

async def _write_freelancer_insights(freelancer: dict, jobs: list[dict]) -> None:
    phone = freelancer["phone"]
    profile_fields = ["name", "profile_link", "portfolio", "skills", "tools", "rate", "availability", "preferences", "brief_description"]
    filled = sum(1 for f in profile_fields if freelancer.get(f))
    completeness = round((100 * filled) / len(profile_fields))

    my_skills = extract_skills(" ".join(str(v) for v in [freelancer.get("skills"), freelancer.get("tools"), freelancer.get("brief_description")] if v))
    matching_jobs = 0
    for j in jobs:
        if j.get("hiring_currently") is not True:
            continue  # only count active demand
        job_skills = extract_skills(" ".join(str(v) for v in [j.get("project_description"), j.get("brief_description")] if v))
        if any(s in my_skills for s in job_skills):
            matching_jobs += 1

    rows = [
        {
            "phone": phone,
            "insight_type": "profile_strength",
            "content": (
                f"Your profile is {completeness}% complete — strong profiles like yours get matched first."
                if completeness >= 80
                else f'Your profile is {completeness}% complete. Filling in the missing fields (via WhatsApp: "edit my info") improves your match ranking.'
            ),
            "metric_value": completeness,
            "metric_label": "Profile completeness (%)",
            "icon": "star",
            "color": "violet",
        },
        {
            "phone": phone,
            "insight_type": "market_demand",
            "content": (
                f"{matching_jobs} open client project{'s mention' if matching_jobs > 1 else ' mentions'} skills you have — expect match notifications."
                if matching_jobs > 0
                else "No open projects mention your skills yet — new client requests arrive daily."
            ),
            "metric_value": matching_jobs,
            "metric_label": "Open matching projects",
            "icon": "target",
            "color": "emerald",
        },
    ]

    if my_skills:
        rows.append({
            "phone": phone,
            "insight_type": "opportunity",
            "content": f"We detected {len(my_skills)} marketable skill{'s' if len(my_skills) > 1 else ''} on your profile: {', '.join(my_skills)}.",
            "metric_value": len(my_skills),
            "metric_label": "Detected skills",
            "icon": "zap",
            "color": "cyan",
        })

    trust_score = freelancer.get("trust_score")
    trust_breakdown = freelancer.get("trust_breakdown")
    if trust_score is not None and trust_breakdown:
        b = trust_breakdown
        rows.append({
            "phone": phone,
            "insight_type": "profile_strength",
            "content": (
                f"Your trust score is {trust_score}/100 ({freelancer.get('trust_tier') or 'unverified'}). "
                f"Identity & Links: {b.get('identity_links', 0)}/45, Skill Proof: {b.get('skill_proof', 0)}/35."
            ),
            "metric_value": trust_score,
            "metric_label": "Trust score",
            "icon": "shield",
            "color": "emerald",
        })

    await replace_insights(phone, rows)
