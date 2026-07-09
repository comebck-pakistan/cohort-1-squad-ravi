/**
 * vetting.js - automated freelancer trust and skill-proof checks.
 *
 * Full vets run at freelancer completion before matching. Re-vets run for one
 * artifact only and reuse the stored Groq claims row, so link fixes cost zero
 * Groq tokens.
 */

import { config } from './config.js';
import {
  findFreelancer,
  getVettingChecks,
  replaceVettingChecks,
  updateFreelancerTrust,
} from './supabase.js';
import { generateVettingAnalysis } from './groq.js';
import { extractSkills, refreshMatchTotalsForFreelancer } from './matching.js';
import { sendWhatsAppMessage } from './whatsapp.js';

const HTTP_TIMEOUT_MS = 6000;
const RECENT_PUSH_DAYS = 180;
const MAX_EVIDENCE_CHARS = 3000;

const CORE_TRIO = ['linkedin_url', 'github_url', 'cv_url'];
const ARTIFACT_FIELDS = ['linkedin_url', 'github_url', 'cv_url', 'support_docs', 'portfolio'];
const RECHECKABLE_FIELDS = new Set(ARTIFACT_FIELDS);

const ARTIFACT_LABELS = {
  linkedin_url: 'LinkedIn',
  github_url: 'GitHub',
  cv_url: 'CV',
  support_docs: 'support docs',
  portfolio: 'portfolio',
};

function cleanUrlToken(token) {
  return String(token || '').trim().replace(/[)\],.!?]+$/g, '');
}

function normaliseUrl(url) {
  const cleaned = cleanUrlToken(url);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned.replace(/^\/+/, '')}`;
}

function toUrl(url) {
  try {
    return new URL(normaliseUrl(url));
  } catch {
    return null;
  }
}

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : !!value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeName(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyNameMatches(candidate, registeredName) {
  const cand = normalizeName(candidate);
  const name = normalizeName(registeredName);
  if (!cand || !name) return null;
  if (cand.includes(name) || name.includes(cand)) return true;

  const tokens = name.split(' ').filter((t) => t.length > 1);
  if (tokens.length === 0) return null;
  const hits = tokens.filter((token) => cand.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

function row(artifact, checkType, status, evidence = {}) {
  return { artifact, check_type: checkType, status, evidence };
}

function httpStatusToVettingStatus(status) {
  if (status >= 200 && status < 400) return 'pass';
  if (status === 404 || status === 410) return 'fail';
  if (status === 401 || status === 403 || status === 429 || status >= 500 || status === 999) return 'unverifiable';
  return 'unverifiable';
}

function errorToVettingStatus(err) {
  const code = err?.cause?.code || err?.code || '';
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return 'unverifiable';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ERR_INVALID_URL'].includes(code)) return 'fail';
  return 'unverifiable';
}

async function fetchWithTimeout(url, options = {}) {
  const controller = typeof AbortSignal.timeout === 'function' ? null : new AbortController();
  let timer = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  }

  const headers = {
    'User-Agent': 'AI-Matchmaker-Vetting/1.0 (+https://example.com)',
    Accept: 'text/html,application/json,text/plain,application/pdf,*/*',
    ...(options.headers || {}),
  };

  try {
    return await fetch(url, {
      ...options,
      headers,
      redirect: 'follow',
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(HTTP_TIMEOUT_MS) : controller.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeLoginWall(text) {
  const t = String(text || '').toLowerCase();
  if (t.length < 80) return true;
  return /(sign in|log in|login required|access denied|request access|you need permission|enable cookies)/i.test(t);
}

function skillsFromText(text) {
  return extractSkills(String(text || ''));
}

function addEvidenceSnippet(evidence, artifact, text) {
  const snippet = String(text || '').slice(0, MAX_EVIDENCE_CHARS).trim();
  if (!snippet) return;
  evidence.push({ artifact, text: snippet });
}

/**
 * Extracts the first URL-like token from a WhatsApp message.
 */
export function extractFirstUrl(text) {
  if (!text) return null;
  const match = String(text).match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:github\.com|linkedin\.com|docs\.google\.com|drive\.google\.com|dropbox\.com)\/[^\s<>"']+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?/i);
  return match ? normaliseUrl(match[0]) : null;
}

/**
 * Classifies known proof links into the canonical freelancer link columns.
 */
export function classifyLinkField(url) {
  const parsed = toUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase();

  if (host === 'github.com') return 'github_url';
  if (host === 'linkedin.com' && /^\/(in|pub)\//.test(path)) return 'linkedin_url';
  if (
    host === 'docs.google.com' ||
    host === 'drive.google.com' ||
    host === 'dropbox.com' ||
    path.endsWith('.pdf')
  ) {
    return 'cv_url';
  }
  return null;
}

function parseGithubUser(url) {
  const parsed = toUrl(url);
  if (!parsed || parsed.hostname.toLowerCase().replace(/^www\./, '') !== 'github.com') return null;
  const username = parsed.pathname.split('/').filter(Boolean)[0];
  if (!username || ['orgs', 'marketplace', 'topics', 'features', 'pricing'].includes(username.toLowerCase())) return null;
  return username;
}

async function checkGithub(url, freelancer, evidenceForGroq) {
  const artifact = 'github_url';
  const username = parseGithubUser(url);
  if (!username) {
    return [row(artifact, 'liveness', 'fail', { url, reason: 'not_a_github_profile' })];
  }

  const headers = { Accept: 'application/vnd.github+json' };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;

  let user;
  try {
    const userResponse = await fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers });
    const livenessStatus = httpStatusToVettingStatus(userResponse.status);
    if (livenessStatus !== 'pass') {
      return [row(artifact, 'liveness', livenessStatus, { url, status_code: userResponse.status })];
    }
    user = await userResponse.json();
  } catch (err) {
    return [row(artifact, 'liveness', errorToVettingStatus(err), { url, reason: err.message })];
  }

  const rows = [
    row(artifact, 'liveness', 'pass', { url, username }),
    row(artifact, 'identity', 'pass', {
      name_matched: fuzzyNameMatches([user.name, user.login].filter(Boolean).join(' '), freelancer.name),
      profile_name: user.name || user.login || null,
    }),
  ];

  try {
    const reposResponse = await fetchWithTimeout(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`,
      { headers },
    );
    const reposStatus = httpStatusToVettingStatus(reposResponse.status);
    if (reposStatus !== 'pass') {
      rows.push(row(artifact, 'content', reposStatus, { status_code: reposResponse.status, skills_found: [] }));
      return rows;
    }

    const repos = await reposResponse.json();
    const originals = Array.isArray(repos) ? repos.filter((repo) => !repo.fork) : [];
    const repoText = originals
      .map((repo) => [repo.name, repo.description, repo.language, ...(repo.topics || [])].filter(Boolean).join(' '))
      .join(' ');
    const skillsFound = skillsFromText(repoText);
    const recentSince = Date.now() - RECENT_PUSH_DAYS * 24 * 60 * 60 * 1000;
    const hasRecentPush = originals.some((repo) => repo.pushed_at && Date.parse(repo.pushed_at) >= recentSince);

    rows.push(row(artifact, 'content', 'pass', {
      original_repo_count: originals.length,
      recent_push_within_days: hasRecentPush ? RECENT_PUSH_DAYS : null,
      skills_found: skillsFound,
      languages: unique(originals.map((repo) => repo.language)),
    }));
    addEvidenceSnippet(evidenceForGroq, artifact, repoText);
  } catch (err) {
    rows.push(row(artifact, 'content', errorToVettingStatus(err), { reason: err.message, skills_found: [] }));
  }

  return rows;
}

function linkedinSlug(url) {
  const parsed = toUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'linkedin.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (!['in', 'pub'].includes((parts[0] || '').toLowerCase()) || !parts[1]) return null;
  return parts[1];
}

async function checkLinkedIn(url, freelancer) {
  const artifact = 'linkedin_url';
  const slug = linkedinSlug(url);
  if (!slug) {
    return [row(artifact, 'liveness', 'fail', { url, reason: 'not_a_linkedin_profile' })];
  }

  return [
    row(artifact, 'liveness', 'unverifiable', { url, reason: 'linkedin_not_fetched', slug }),
    row(artifact, 'identity', 'unverifiable', {
      name_matched: fuzzyNameMatches(slug.replace(/[-_0-9]+/g, ' '), freelancer.name),
      slug,
    }),
  ];
}

function googleDocsExportUrl(parsed) {
  const docMatch = parsed.href.match(/docs\.google\.com\/document\/d\/([^/]+)/i);
  if (docMatch) return `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
  return null;
}

function driveDownloadUrl(parsed) {
  const fileMatch = parsed.href.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  const id = parsed.searchParams.get('id');
  if (parsed.hostname.includes('drive.google.com') && id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return null;
}

async function extractPdfText(buffer) {
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = mod.default || mod;
  const result = await pdfParse(buffer);
  return result.text || '';
}

async function checkCv(url, freelancer, evidenceForGroq) {
  const artifact = 'cv_url';
  const parsed = toUrl(url);
  if (!parsed) return [row(artifact, 'liveness', 'fail', { url, reason: 'invalid_url' })];

  const fetchUrl = googleDocsExportUrl(parsed) || driveDownloadUrl(parsed) || parsed.href;

  let response;
  try {
    response = await fetchWithTimeout(fetchUrl);
  } catch (err) {
    return [row(artifact, 'liveness', errorToVettingStatus(err), { url, reason: err.message })];
  }

  const livenessStatus = httpStatusToVettingStatus(response.status);
  if (livenessStatus !== 'pass') {
    return [row(artifact, 'liveness', livenessStatus, { url, status_code: response.status })];
  }

  const rows = [row(artifact, 'liveness', 'pass', { url, fetched_url: fetchUrl, status_code: response.status })];
  const contentType = response.headers.get('content-type') || '';
  const isPdf = /\.pdf($|\?)/i.test(parsed.pathname) || /application\/pdf/i.test(contentType);

  let text = '';
  try {
    if (isPdf) {
      const buffer = Buffer.from(await response.arrayBuffer());
      text = await extractPdfText(buffer);
    } else {
      const raw = await response.text();
      text = /html/i.test(contentType) ? stripHtml(raw) : raw;
      if (/html/i.test(contentType) && looksLikeLoginWall(text)) {
        rows.push(row(artifact, 'identity', 'unverifiable', { name_matched: null, reason: 'login_wall_or_too_little_text' }));
        rows.push(row(artifact, 'content', 'unverifiable', { skills_found: [], reason: 'login_wall_or_too_little_text' }));
        return rows;
      }
    }
  } catch (err) {
    rows.push(row(artifact, 'identity', 'unverifiable', { name_matched: null, reason: err.message }));
    rows.push(row(artifact, 'content', 'unverifiable', { skills_found: [], reason: err.message }));
    return rows;
  }

  const skillsFound = skillsFromText(text);
  rows.push(row(artifact, 'identity', 'pass', {
    name_matched: fuzzyNameMatches(text.slice(0, 1500), freelancer.name),
  }));
  rows.push(row(artifact, 'content', skillsFound.length > 0 ? 'pass' : 'unverifiable', {
    skills_found: skillsFound,
    text_chars: text.length,
    content_type: contentType || null,
  }));
  addEvidenceSnippet(evidenceForGroq, artifact, text);
  return rows;
}

function isYouTube(host) {
  return ['youtube.com', 'youtu.be', 'm.youtube.com'].includes(host) || host.endsWith('.youtube.com');
}

function isVimeo(host) {
  return host === 'vimeo.com' || host.endsWith('.vimeo.com');
}

async function checkPortfolio(url, freelancer, evidenceForGroq) {
  const artifact = 'portfolio';
  const parsed = toUrl(url);
  if (!parsed) return [row(artifact, 'liveness', 'fail', { url, reason: 'invalid_url' })];
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  if (isYouTube(host) || isVimeo(host)) {
    const endpoint = isYouTube(host)
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.href)}&format=json`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.href)}`;
    try {
      const response = await fetchWithTimeout(endpoint, { headers: { Accept: 'application/json' } });
      const livenessStatus = httpStatusToVettingStatus(response.status);
      if (livenessStatus !== 'pass') {
        return [row(artifact, 'liveness', livenessStatus, { url, status_code: response.status })];
      }
      const data = await response.json();
      const evidenceText = [data.title, data.author_name].filter(Boolean).join(' ');
      addEvidenceSnippet(evidenceForGroq, artifact, evidenceText);
      return [
        row(artifact, 'liveness', 'pass', { url, provider: isYouTube(host) ? 'youtube' : 'vimeo' }),
        row(artifact, 'identity', 'pass', {
          name_matched: fuzzyNameMatches(data.author_name, freelancer.name),
          author_name: data.author_name || null,
        }),
        row(artifact, 'content', 'pass', { skills_found: skillsFromText(evidenceText), title: data.title || null }),
      ];
    } catch (err) {
      return [row(artifact, 'liveness', errorToVettingStatus(err), { url, reason: err.message })];
    }
  }

  try {
    const response = await fetchWithTimeout(parsed.href);
    const livenessStatus = httpStatusToVettingStatus(response.status);
    if (livenessStatus !== 'pass') {
      return [row(artifact, 'liveness', livenessStatus, { url, status_code: response.status })];
    }

    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    const text = /html/i.test(contentType) ? stripHtml(raw) : raw;
    if (/html/i.test(contentType) && looksLikeLoginWall(text)) {
      return [
        row(artifact, 'liveness', 'unverifiable', { url, reason: 'login_wall_or_too_little_text' }),
        row(artifact, 'identity', 'unverifiable', { name_matched: null }),
        row(artifact, 'content', 'unverifiable', { skills_found: [] }),
      ];
    }

    const skillsFound = skillsFromText(text);
    addEvidenceSnippet(evidenceForGroq, artifact, text);
    return [
      row(artifact, 'liveness', 'pass', { url, status_code: response.status }),
      row(artifact, 'identity', 'pass', { name_matched: fuzzyNameMatches(text.slice(0, 1500), freelancer.name) }),
      row(artifact, 'content', skillsFound.length > 0 ? 'pass' : 'unverifiable', {
        skills_found: skillsFound,
        content_type: contentType || null,
      }),
    ];
  } catch (err) {
    return [row(artifact, 'liveness', errorToVettingStatus(err), { url, reason: err.message })];
  }
}

async function checkSupportDocs(url) {
  const artifact = 'support_docs';
  const parsed = toUrl(url);
  if (!parsed) return [row(artifact, 'liveness', 'fail', { url, reason: 'invalid_url' })];

  try {
    const response = await fetchWithTimeout(parsed.href);
    const livenessStatus = httpStatusToVettingStatus(response.status);
    const contentType = response.headers.get('content-type') || '';
    const rows = [row(artifact, 'liveness', livenessStatus, { url, status_code: response.status })];
    if (livenessStatus === 'pass') {
      rows.push(row(artifact, 'content', 'pass', { content_type: contentType || null, skills_found: [] }));
    }
    return rows;
  } catch (err) {
    return [row(artifact, 'liveness', errorToVettingStatus(err), { url, reason: err.message })];
  }
}

async function checkArtifact(artifact, url, freelancer, evidenceForGroq) {
  if (!hasValue(url)) return [];
  if (artifact === 'github_url') return checkGithub(url, freelancer, evidenceForGroq);
  if (artifact === 'linkedin_url') return checkLinkedIn(url, freelancer);
  if (artifact === 'cv_url') return checkCv(url, freelancer, evidenceForGroq);
  if (artifact === 'portfolio') return checkPortfolio(url, freelancer, evidenceForGroq);
  if (artifact === 'support_docs') return checkSupportDocs(url);
  return [];
}

function scoreRows(rows, checkType) {
  return rows
    .filter((r) => r.check_type === checkType && r.artifact !== 'claims')
    .map((r) => {
      if (checkType === 'liveness') {
        if (r.status === 'pass') return 1;
        if (r.status === 'unverifiable') return 0.6;
        return 0;
      }
      const matched = r.evidence?.name_matched;
      if (matched === true) return 1;
      if (matched === false) return 0;
      return 0.5;
    });
}

function rowAverage(scores) {
  if (!scores.length) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function normalizeSkill(skill) {
  return String(skill || '').toLowerCase().trim();
}

function getClaimsRow(rows) {
  return rows.find((r) => r.artifact === 'claims' && r.check_type === 'groq_consistency') || null;
}

function tierForScore(score) {
  if (score >= 75) return 'highly_trusted';
  if (score >= 55) return 'trusted';
  if (score >= 35) return 'basic';
  return 'unverified';
}

function humanTier(tier) {
  return String(tier || 'unverified')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function brokenLinksFromRows(rows) {
  return rows
    .filter((r) => r.check_type === 'liveness' && r.status === 'fail')
    .map((r) => ({
      artifact: r.artifact,
      label: ARTIFACT_LABELS[r.artifact] || r.artifact,
      url: r.evidence?.url || null,
      status_code: r.evidence?.status_code || null,
      reason: r.evidence?.reason || null,
    }));
}

function unverifiableLinksFromRows(rows) {
  return rows
    .filter((r) => r.check_type === 'liveness' && r.status === 'unverifiable')
    .map((r) => ({
      artifact: r.artifact,
      label: ARTIFACT_LABELS[r.artifact] || r.artifact,
      url: r.evidence?.url || null,
      status_code: r.evidence?.status_code || null,
      reason: r.evidence?.reason || null,
    }));
}

/**
 * Computes the 100-point trust score from stored rows plus the latest profile.
 */
export function computeTrustScore(freelancer, rows) {
  const providedCoreCount = CORE_TRIO.filter((field) => hasValue(freelancer[field])).length;
  const coveragePoints = providedCoreCount >= 2 ? 10 : providedCoreCount === 1 ? 4 : 0;

  const linkIntegrityPoints = rowAverage(scoreRows(rows, 'liveness')) * 20;
  const identityPoints = rowAverage(scoreRows(rows, 'identity')) * 15;
  const identityLinksPoints = coveragePoints + linkIntegrityPoints + identityPoints;

  const claimedSkills = extractSkills([freelancer.skills, freelancer.tools, freelancer.brief_description].filter(Boolean).join(' '));
  const evidencedSkills = unique(rows.flatMap((r) => r.check_type === 'content' ? (r.evidence?.skills_found || []) : []));
  const evidencedSet = new Set(evidencedSkills.map(normalizeSkill));
  const overlap = claimedSkills.filter((skill) => evidencedSet.has(normalizeSkill(skill)));
  const localRatio = claimedSkills.length === 0
    ? (evidencedSkills.length > 0 ? 0.3 : 0)
    : overlap.length / claimedSkills.length;

  const claimsRow = getClaimsRow(rows);
  const groqRan = claimsRow?.evidence?.groq_ran === true;
  const supportedSkills = claimsRow?.evidence?.supported_skills || [];
  const unsupportedSkills = claimsRow?.evidence?.unsupported_skills || [];
  const groqDenominator = supportedSkills.length + unsupportedSkills.length;
  const groqRatio = groqRan && groqDenominator > 0 ? supportedSkills.length / groqDenominator : 0;
  const blendedSkillRatio = groqRan ? (localRatio + groqRatio) / 2 : localRatio;
  const skillProofPoints = blendedSkillRatio * 35;

  const consistencyScore = groqRan ? clamp(Number(claimsRow?.evidence?.consistency_score || 0), 0, 100) : 0;
  const claimsConsistencyPoints = (consistencyScore / 100) * 20;

  const trustScore = Math.round(identityLinksPoints + skillProofPoints + claimsConsistencyPoints);
  const trustTier = tierForScore(trustScore);
  const brokenLinks = brokenLinksFromRows(rows);
  const unverifiableLinks = unverifiableLinksFromRows(rows);

  return {
    trust_score: trustScore,
    trust_tier: trustTier,
    trust_breakdown: {
      identity_links: Math.round(identityLinksPoints),
      skill_proof: Math.round(skillProofPoints),
      claims_consistency: Math.round(claimsConsistencyPoints),
      max: {
        identity_links: 45,
        skill_proof: 35,
        claims_consistency: 20,
      },
      coverage_points: coveragePoints,
      link_integrity_points: Math.round(linkIntegrityPoints),
      identity_points: Math.round(identityPoints),
      claimed_skills: claimedSkills,
      evidenced_skills: evidencedSkills,
      local_supported_skills: overlap,
      groq_ran: groqRan,
      supported_skills: supportedSkills,
      unsupported_skills: unsupportedSkills,
      consistency_score: consistencyScore,
      summary: claimsRow?.evidence?.summary || '',
      broken_links: brokenLinks,
      unverifiable_links: unverifiableLinks,
    },
  };
}

function lowestBucketTip(breakdown) {
  if (breakdown.coverage_points < 10) return 'Add at least 2 of LinkedIn/GitHub/CV to strengthen your identity coverage.';

  const buckets = [
    { key: 'identity_links', label: 'identity links', ratio: breakdown.identity_links / 45 },
    { key: 'skill_proof', label: 'skill proof', ratio: breakdown.skill_proof / 35 },
    { key: 'claims_consistency', label: 'claims consistency', ratio: breakdown.claims_consistency / 20 },
  ].sort((a, b) => a.ratio - b.ratio);

  if (buckets[0].key === 'skill_proof') return 'Add proof that mentions your main skills, like GitHub repos, portfolio case studies, or a CV with project details.';
  if (buckets[0].key === 'claims_consistency') return 'Make your profile claims match the proof links: use the same skill names and recent project examples.';
  return 'Fix unverifiable or broken proof links so clients can open them confidently.';
}

function brokenLinksPrompt(brokenLinks) {
  if (!brokenLinks.length) return '';
  const first = brokenLinks[0];
  const reason = first.status_code ? String(first.status_code) : (first.reason || 'it did not open');
  const extra = brokenLinks.length > 1 ? ` I also found ${brokenLinks.length - 1} other broken link${brokenLinks.length > 2 ? 's' : ''}.` : '';
  return `\n\nYour ${first.label} link didn't open (${reason}). Your score was calculated with it marked broken.${extra} Resend just that link here and I'll re-check only that link.`;
}

function trustMessage(scoreResult, prefix = 'Trust Score') {
  const b = scoreResult.trust_breakdown;
  return `🛡️ ${prefix}: ${scoreResult.trust_score}/100 (${humanTier(scoreResult.trust_tier)})\n` +
    `Identity & Links: ${b.identity_links}/45\n` +
    `Skill Proof: ${b.skill_proof}/35\n` +
    `Claims Consistency: ${b.claims_consistency}/20\n\n` +
    `Tip: ${lowestBucketTip(b)}${brokenLinksPrompt(b.broken_links)}`;
}

function claimsRowFromAnalysis(analysis, groqRan) {
  return row('claims', 'groq_consistency', groqRan ? 'pass' : 'unverifiable', {
    groq_ran: groqRan,
    consistency_score: analysis?.consistency_score ?? 0,
    name_matches: analysis?.name_matches || [],
    supported_skills: analysis?.supported_skills || [],
    unsupported_skills: analysis?.unsupported_skills || [],
    summary: analysis?.summary || '',
  });
}

async function runAllArtifactChecks(freelancer, evidenceForGroq) {
  const allRows = [];
  for (const artifact of ARTIFACT_FIELDS) {
    const rows = await checkArtifact(artifact, freelancer[artifact], freelancer, evidenceForGroq);
    allRows.push(...rows);
  }
  return allRows;
}

/**
 * Runs a full freelancer vet, stores all checks and trust columns, then sends
 * the freelancer a transparent score breakdown.
 */
export async function runVettingForFreelancer(phone) {
  const freelancer = await findFreelancer(phone);
  if (!freelancer) {
    console.warn('[vetting] runVettingForFreelancer - no freelancer row for', phone);
    return null;
  }

  const evidenceForGroq = [];
  let rows = await runAllArtifactChecks(freelancer, evidenceForGroq);

  let analysis = null;
  let groqRan = false;
  if (evidenceForGroq.length > 0) {
    try {
      analysis = await generateVettingAnalysis({
        profile: freelancer,
        claimedSkills: extractSkills([freelancer.skills, freelancer.tools, freelancer.brief_description].filter(Boolean).join(' ')),
        evidence: evidenceForGroq,
      });
      groqRan = true;
    } catch (err) {
      console.error('[vetting] Groq vetting analysis failed - scoring locally:', err.message);
    }
  }

  rows = [...rows, claimsRowFromAnalysis(analysis, groqRan)];
  await replaceVettingChecks(phone, rows);

  const scoreResult = computeTrustScore(freelancer, rows);
  await updateFreelancerTrust(phone, scoreResult);
  await sendWhatsAppMessage(phone, trustMessage(scoreResult));
  return scoreResult;
}

/**
 * Re-checks one artifact only, reuses stored Groq claims, updates trust columns,
 * refreshes existing match totals, and sends the updated score.
 */
export async function revetArtifact(phone, artifact) {
  if (!RECHECKABLE_FIELDS.has(artifact)) {
    console.warn('[vetting] revetArtifact ignored unknown artifact:', artifact);
    return null;
  }

  const freelancer = await findFreelancer(phone);
  if (!freelancer) {
    console.warn('[vetting] revetArtifact - no freelancer row for', phone);
    return null;
  }

  const evidenceForGroq = [];
  const artifactRows = await checkArtifact(artifact, freelancer[artifact], freelancer, evidenceForGroq);
  await replaceVettingChecks(phone, artifactRows, artifact);

  const rows = await getVettingChecks(phone);
  const scoreResult = computeTrustScore(freelancer, rows);
  await updateFreelancerTrust(phone, scoreResult);
  await refreshMatchTotalsForFreelancer(phone);
  await sendWhatsAppMessage(phone, trustMessage(scoreResult, 'Updated Trust Score'));
  return scoreResult;
}
