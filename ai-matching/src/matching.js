/**
 * matching.js — the matching engine
 *
 * Runs when an onboarding conversation reaches `completed`:
 *   - client completes  → score all freelancers against the new job request
 *   - freelancer completes → score all open job requests against the new profile
 *
 * Scoring is fully local (zero API calls). One batched Groq call per run adds
 * the human-readable analysis (`ai_explanation` / `potential_risks` /
 * `recommended_action`) for the top matches; if Groq fails, deterministic
 * fallback text is used so matches are always written.
 *
 * Output goes to the `matches`, `notifications`, and `insights` tables — the
 * exact shape the Next.js dashboard already reads.
 */

import {
  findFreelancer,
  findJobRequest,
  getAllFreelancers,
  getAllJobRequests,
  upsertMatches,
  insertNotifications,
  replaceInsights,
  getRankedMatchesForPhone,
  supabase,
} from './supabase.js';
import { generateMatchAnalyses } from './groq.js';
import { sendWhatsAppMessage } from './whatsapp.js';

const MIN_SCORE = 35;   // below this a pairing isn't worth showing
const MAX_MATCHES = 5;  // top-N written per run
export const COMPATIBILITY_WEIGHT = 0.75;
export const TRUST_WEIGHT = 0.25;

// ── Skill extraction ──────────────────────────────────────────────────────────
// Skills/tools/project descriptions are free text, so overlap is computed
// against a curated dictionary instead of raw word tokens. Each entry maps a
// display name to the regexes that detect it.
const SKILL_PATTERNS = [
  ['Video Editing',      [/\bvideo\s*edit/i, /\bpremiere\b/i, /\bafter\s*effects\b/i, /\bdavinci\b/i, /\bfinal\s*cut\b/i, /\bmotion\s*graphics\b/i, /\bvfx\b/i, /\bvideos?\b/i]],
  ['Animation',          [/\banimat(?:ion|or|ed)\b/i, /\b2d\s*animation\b/i, /\b3d\b/i, /\bblender\b/i]],
  ['Web Development',    [/\bweb\s*(?:dev|development|developer|site|app)/i, /\bwebsites?\b/i, /\bfront[-\s]?end\b/i, /\bback[-\s]?end\b/i, /\bfull[-\s]?stack\b/i, /\blanding\s*page/i]],
  ['React',              [/\breact(?:\.?js)?\b/i, /\bnext\.?js\b/i]],
  ['Node.js',            [/\bnode(?:\.?js)?\b/i, /\bexpress(?:\.?js)?\b/i]],
  ['JavaScript',         [/\bjavascript\b/i, /\btypescript\b/i, /\bjs\b/, /\bhtml\b/i, /\bcss\b/i]],
  ['WordPress',          [/\bwordpress\b/i, /\belementor\b/i, /\bwoocommerce\b/i]],
  ['Shopify',            [/\bshopify\b/i]],
  ['PHP / Laravel',      [/\bphp\b/i, /\blaravel\b/i]],
  ['Python',             [/\bpython\b/i, /\bdjango\b/i, /\bflask\b/i]],
  ['Mobile Apps',        [/\bmobile\s*app/i, /\bios\b/i, /\bandroid\b/i, /\bflutter\b/i, /\breact\s*native\b/i, /\bswift\b/i, /\bkotlin\b/i, /\bapp\s*(?:dev|development)\b/i]],
  ['UI/UX Design',       [/\bui\s*\/?\s*ux\b/i, /\bux\b/i, /\bui\s*design/i, /\bfigma\b/i, /\bwireframe/i, /\bprototyp/i]],
  ['Graphic Design',     [/\bgraphic\s*design/i, /\blogos?\b/i, /\bbrand(?:ing|\s*identity)\b/i, /\bphotoshop\b/i, /\billustrator\b/i, /\bcanva\b/i, /\bposters?\b/i, /\bflyers?\b/i, /\bpackaging\b/i]],
  ['Content Writing',    [/\bcontent\s*writ/i, /\bcopywrit/i, /\bblog/i, /\barticles?\b/i, /\bghostwrit/i, /\bwriter\b/i, /\bwriting\b/i, /\bscripts?\b/i]],
  ['SEO',                [/\bseo\b/i, /\bsearch\s*engine/i, /\bkeyword\s*research/i]],
  ['Social Media',       [/\bsocial\s*media\b/i, /\bsmm\b/i, /\binstagram\b/i, /\btiktok\b/i, /\bfacebook\b/i, /\blinkedin\b/i, /\bcommunity\s*manag/i, /\bcontent\s*calendar/i]],
  ['Digital Marketing',  [/\bdigital\s*marketing\b/i, /\bmarketing\b/i, /\bgoogle\s*ads\b/i, /\bmeta\s*ads\b/i, /\bfacebook\s*ads\b/i, /\bad\s*campaigns?\b/i, /\bpaid\s*media\b/i, /\bperformance\s*marketing\b/i]],
  ['UGC / Ad Creatives', [/\bugc\b/i, /\bad\s*creatives?\b/i, /\bspark\s*ads?\b/i, /\buser[-\s]generated\b/i]],
  ['Virtual Assistance', [/\bvirtual\s*assistant\b/i, /\bva\b/, /\bdata\s*entry\b/i, /\badmin(?:istrative)?\s*(?:work|support|tasks?)\b/i, /\bcustomer\s*(?:support|service)\b/i, /\binbox\s*manag/i, /\bcalendar\s*manag/i]],
  ['Data & Analytics',   [/\bdata\s*analy/i, /\bdashboards?\b/i, /\bexcel\b/i, /\bsql\b/i, /\btableau\b/i, /\bpower\s*bi\b/i, /\bmachine\s*learning\b/i, /\bdata\s*science\b/i, /\bai\b/, /\bartificial\s*intelligence\b/i]],
  ['E-commerce',         [/\be-?com(?:merce)?\b/i, /\bonline\s*store\b/i, /\bdropship/i, /\bamazon\s*(?:fba|listing)/i]],
  ['Translation',        [/\btranslat/i, /\btranscri/i, /\bsubtitl/i]],
  ['Photography',        [/\bphotograph/i, /\bphoto\s*edit/i, /\bretouch/i]],
  ['Accounting',         [/\baccounting\b/i, /\bbookkeep/i, /\bquickbooks\b/i, /\bfinanc(?:e|ial)\b/i]],
];

/**
 * Detects known skills in free text. Returns display names, e.g.
 * ["Video Editing", "Social Media"].
 */
export function extractSkills(text) {
  if (!text) return [];
  const found = [];
  for (const [name, patterns] of SKILL_PATTERNS) {
    if (patterns.some((p) => p.test(text))) found.push(name);
  }
  return found;
}

// ── Budget / availability parsing ─────────────────────────────────────────────

/**
 * Pulls dollar-ish numbers out of free text ("$20/hr", "20-30", "1.5k").
 * pick='min' for a freelancer's rate, pick='max' for a client's budget.
 * Returns null when no number is present.
 */
export function parseMoney(text, pick = 'min') {
  if (!text) return null;
  const matches = [...String(text).matchAll(/(\d+(?:[.,]\d+)?)\s*(k)?/gi)];
  const values = matches
    .map((m) => parseFloat(m[1].replace(',', '.')) * (m[2] ? 1000 : 1))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (values.length === 0) return null;
  return pick === 'max' ? Math.max(...values) : Math.min(...values);
}

/**
 * Parses weekly availability text into hours/week. Understands "20 hours",
 * "full time" (40), "part time" (20), or a bare number. Null when unclear.
 */
export function parseHoursPerWeek(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/full[-\s]?time/.test(t)) return 40;
  if (/part[-\s]?time/.test(t)) return 20;
  const hourMatch = t.match(/(\d+)\s*(?:\+\s*)?(?:hours?|hrs?|h)\b/);
  if (hourMatch) return parseInt(hourMatch[1], 10);
  const bare = t.match(/^\s*(\d+)\s*\+?\s*$/);
  if (bare) {
    const n = parseInt(bare[1], 10);
    if (n > 0 && n <= 100) return n;
  }
  return null;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Scores one freelancer against one job request. Local only, no API calls.
 * Weights: skills 55%, budget 25%, availability 20%.
 *
 * @returns {{ score: number, skills_overlap: string[],
 *             budget_fit: boolean, availability_fit: boolean }}
 */
export function scoreMatch(freelancer, job) {
  const freelancerText = [freelancer.skills, freelancer.tools, freelancer.preferences, freelancer.brief_description]
    .filter(Boolean)
    .join(' ');
  const jobText = [job.project_description, job.brief_description]
    .filter(Boolean)
    .join(' ');

  const freelancerSkills = extractSkills(freelancerText);
  const jobSkills = extractSkills(jobText);
  const overlap = freelancerSkills.filter((s) => jobSkills.includes(s));

  // Skills: fraction of what the job needs that the freelancer covers.
  // When the job text mentions nothing we recognise, stay neutral instead of
  // zeroing everyone out.
  const skillScore = jobSkills.length === 0 ? 0.4 : overlap.length / jobSkills.length;

  // Budget: only comparable when the client gave an hourly budget. A project
  // budget can't be compared to an hourly rate without knowing duration, so
  // that case stays neutral with fit = true (no evidence against).
  const rate = parseMoney(freelancer.rate, 'min');
  const clientHourly = parseMoney(job.budget_hourly, 'max');
  let budgetScore = 0.6;
  let budgetFit = true;
  if (rate != null && clientHourly != null) {
    if (clientHourly >= rate) {
      budgetScore = 1;
    } else if (clientHourly >= rate * 0.75) {
      budgetScore = 0.7; // close enough to negotiate
    } else {
      budgetScore = 0.2;
      budgetFit = false;
    }
  }

  // Availability: full-time hires need real weekly hours; project work is
  // satisfied by much less. Unparseable availability stays neutral.
  const hours = parseHoursPerWeek(freelancer.availability);
  const neededHours = job.hire_type === 'full-time' ? 30 : 10;
  let availabilityScore = 0.7;
  let availabilityFit = true;
  if (hours != null) {
    if (hours >= neededHours) {
      availabilityScore = 1;
    } else if (hours >= neededHours / 2) {
      availabilityScore = 0.6;
    } else {
      availabilityScore = 0.3;
      availabilityFit = false;
    }
  }

  const score = Math.round(100 * (0.55 * skillScore + 0.25 * budgetScore + 0.2 * availabilityScore));
  return { score, skills_overlap: overlap, budget_fit: budgetFit, availability_fit: availabilityFit };
}

// ── AI analysis (with deterministic fallback) ─────────────────────────────────

function fallbackAnalysis(scored) {
  const { score, skills_overlap, budget_fit, availability_fit } = scored;
  return {
    ai_explanation: skills_overlap.length > 0
      ? `Matched on ${skills_overlap.join(', ')} with an overall compatibility score of ${score}%.`
      : `Profile broadly fits this project with an overall compatibility score of ${score}%.`,
    potential_risks: !budget_fit
      ? 'The quoted rate may exceed the stated budget — confirm pricing early.'
      : !availability_fit
        ? 'Weekly availability may be tight for this timeline — confirm hours upfront.'
        : 'Limited history on the platform — ask for recent work samples.',
    recommended_action: 'Review the portfolio and message them on WhatsApp to confirm scope and timeline.',
  };
}

/**
 * Attaches ai_explanation / potential_risks / recommended_action to each
 * scored candidate — one batched Groq call, falling back to template text
 * per-candidate if the call fails or skips someone.
 */
async function attachAnalyses(job, scoredCandidates) {
  let analyses = new Map();
  try {
    analyses = await generateMatchAnalyses({ job, candidates: scoredCandidates });
  } catch (err) {
    console.error('[matching] Groq analysis failed — using fallback text:', err.message);
  }

  return scoredCandidates.map((c) => {
    const ai = analyses.get(String(c.freelancer.phone));
    const fallback = fallbackAnalysis(c);
    return {
      ...c,
      ai_explanation: ai?.ai_explanation || fallback.ai_explanation,
      potential_risks: ai?.potential_risks || fallback.potential_risks,
      recommended_action: ai?.recommended_action || fallback.recommended_action,
    };
  });
}

// ── Shared: score, persist, notify ────────────────────────────────────────────

function trustScoreForFreelancer(freelancer) {
  const value = Number(freelancer?.trust_score);
  return Number.isFinite(value) ? value : null;
}

export function computeTotalScore(compatibilityScore, trustScore) {
  return Math.round(
    COMPATIBILITY_WEIGHT * Number(compatibilityScore || 0) +
    TRUST_WEIGHT * Number(trustScore ?? 0),
  );
}

function withTrustSnapshot(scored) {
  const trustScore = trustScoreForFreelancer(scored.freelancer);
  return {
    ...scored,
    trust_score: trustScore,
    total_score: computeTotalScore(scored.score, trustScore),
  };
}

function toMatchRow(job, c) {
  return {
    freelancer_phone: c.freelancer.phone,
    client_phone: job.phone,
    compatibility_score: c.score,
    trust_score: c.trust_score ?? null,
    total_score: c.total_score,
    skills_overlap: c.skills_overlap,
    budget_fit: c.budget_fit,
    availability_fit: c.availability_fit,
    ai_explanation: c.ai_explanation,
    potential_risks: c.potential_risks,
    recommended_action: c.recommended_action,
  };
}

function shortProjectLine(job) {
  const desc = (job.project_description || job.brief_description || 'a new project').trim();
  return desc.length > 120 ? `${desc.slice(0, 117)}...` : desc;
}

function whatsappLink(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  return cleaned ? `wa.me/${cleaned}` : 'contact unavailable';
}

function contactLineForRank(profile, rank) {
  if (profile?.contact_sharing_allowed === true) {
    return `📱 Contact: ${whatsappLink(profile.phone)}`;
  }
  return `🔒 Contact hidden. Reply "request contact ${rank}" and I'll ask them first.`;
}

function hiddenContactNote(profile, roleLabel) {
  if (profile?.contact_sharing_allowed === true) {
    return `📱 ${roleLabel} contact: ${whatsappLink(profile.phone)}\n`;
  }
  return `🔒 ${roleLabel} contact is private for now.\n`;
}

async function rankForMatch(phone, role, matchId) {
  const matches = await getRankedMatchesForPhone(phone, role);
  const index = matches.findIndex((m) => String(m.id) === String(matchId));
  return index >= 0 ? index + 1 : null;
}

function scoreFreelancersForJob(job, freelancers) {
  return freelancers
    .filter((f) => f.phone !== job.phone)
    // Only freelancers who said "yes" to currently working/open to work take
    // part in matching (null = never answered, e.g. pre-feature rows).
    .filter((f) => f.working_currently === true)
    .map((f) => ({ freelancer: f, ...scoreMatch(f, job) }))
    .filter((m) => m.score >= MIN_SCORE)
    .map(withTrustSnapshot)
    .sort((a, b) => (b.total_score - a.total_score) || (b.score - a.score))
    .slice(0, MAX_MATCHES);
}

// ── Entry point: client finished onboarding ───────────────────────────────────

/**
 * Called after a client's job request is saved. Scores every registered
 * freelancer, writes the top matches, notifies both sides.
 */
export async function runMatchingForClient(clientPhone) {
  const job = await findJobRequest(clientPhone);
  if (!job) {
    console.warn('[matching] runMatchingForClient — no job_request row for', clientPhone);
    return;
  }

  // Only actively-hiring clients get matched
  if (job.hiring_currently !== true) {
    console.log(`[matching] client ${clientPhone} is not actively hiring — skipping matching`);
    await sendWhatsAppMessage(
      clientPhone,
      "Got it — since you're not actively hiring right now, I've saved your project without matching you to freelancers. Whenever you're ready, just tell me \"change my hiring status\" and I'll get to work! 👍"
    );
    return;
  }

  const freelancers = await getAllFreelancers();
  const top = scoreFreelancersForJob(job, freelancers);
  console.log(`[matching] client ${clientPhone}: ${freelancers.length} freelancer(s) considered, ${top.length} match(es) >= ${MIN_SCORE}%`);

  if (top.length === 0) {
    await sendWhatsAppMessage(
      clientPhone,
      "I've saved your project! 📋 No registered freelancer is a strong fit *yet* — new freelancers join daily and I'll message you here the moment one matches. 🔔"
    );
    return;
  }

  const analysed = await attachAnalyses(job, top);
  const writtenMatches = await upsertMatches(analysed.map((c) => toMatchRow(job, c)));
  const writtenByFreelancer = new Map(writtenMatches.map((m) => [m.freelancer_phone, m]));

  // In-app notifications for both sides
  const projectLine = shortProjectLine(job);
  await insertNotifications([
    {
      phone: clientPhone,
      type: 'new_match',
      title: `${analysed.length} freelancer match${analysed.length > 1 ? 'es' : ''} found`,
      body: `Top match: ${analysed[0].freelancer.name || 'a freelancer'} (${analysed[0].total_score}% overall).`,
    },
    ...analysed.map((c) => ({
      phone: c.freelancer.phone,
      type: 'new_match',
      title: 'New project matches your skills',
      body: `${job.name || 'A client'} is looking for: ${projectLine} (${c.score}% skill match).`,
    })),
  ]);

  // WhatsApp: summary to the client (they just messaged us, so we're inside
  // the 24h reply window)...
  const list = analysed
    .map((c, i) => {
      const f = c.freelancer;
      const skills = c.skills_overlap.length > 0 ? c.skills_overlap.join(', ') : (f.skills || 'profile on file');
      return `${i + 1}. *${f.name || 'Freelancer'}* — Overall ${c.total_score}% · Skill ${c.score}% · Trust ${c.trust_score ?? 0}\n   ${skills}${f.rate ? ` · ${f.rate}` : ''}\n   ${contactLineForRank(f, i + 1)}`;
    })
    .join('\n\n');
  await sendWhatsAppMessage(
    clientPhone,
    `🎯 Great news${job.name ? `, ${job.name}` : ''}! I found ${analysed.length} freelancer${analysed.length > 1 ? 's' : ''} for your project:\n\n${list}\n\nUse direct contact links where shown. For hidden contacts, reply with the request command and I'll ask them first.\n\nNext steps: reply "shortlist 1", "hire 1", "decline 1", or "useful 1 yes/no". 🤝`
  );

  // ...and a heads-up to each matched freelancer. These can fail if the
  // freelancer hasn't messaged in 24h (Meta's messaging window) — that's
  // logged inside sendWhatsAppMessage and shouldn't stop the loop.
  for (const c of analysed) {
    const row = writtenByFreelancer.get(c.freelancer.phone);
    const rank = row ? await rankForMatch(c.freelancer.phone, 'freelancer', row.id) : null;
    const actionHint = rank
      ? `\n\nReply "interested ${rank}" if you want this project, or "decline ${rank}" if it's not a fit.`
      : '\n\nReply "show my matches" to see and update this match.';
    await sendWhatsAppMessage(
      c.freelancer.phone,
      `🎉 New project match, ${c.freelancer.name || 'there'}!\n\n*${job.name || 'A client'}* needs: ${projectLine}\n${job.budget_project || job.budget_hourly ? `💰 Budget: ${job.budget_project || job.budget_hourly}\n` : ''}${job.deadline ? `⏰ Timeline: ${job.deadline}\n` : ''}${hiddenContactNote(job, 'Client')}It's a ${c.score}% skill match with your profile. ${c.freelancer.contact_sharing_allowed === true ? "I've shared your contact with the client, so they may reach out here on WhatsApp soon!" : "I have not shared your contact; if the client asks for it, I'll request your approval first."}${actionHint}`
    );
  }
}

// ── Entry point: freelancer finished onboarding ───────────────────────────────

/**
 * Called after a freelancer's profile is saved. Scores every open job request,
 * writes the top matches, refreshes the freelancer's dashboard insights, and
 * notifies the freelancer (clients get in-app notifications only, so a new
 * signup doesn't WhatsApp-blast every past client).
 */
export async function runMatchingForFreelancer(freelancerPhone) {
  const freelancer = await findFreelancer(freelancerPhone);
  if (!freelancer) {
    console.warn('[matching] runMatchingForFreelancer — no freelancer row for', freelancerPhone);
    return;
  }

  const jobs = await getAllJobRequests();

  // Dashboard insights are cheap to compute here since jobs are already loaded
  await writeFreelancerInsights(freelancer, jobs);

  // Only freelancers who said "yes" to currently working/open to work get matched
  if (freelancer.working_currently !== true) {
    console.log(`[matching] freelancer ${freelancerPhone} is not open to work — skipping matching`);
    await sendWhatsAppMessage(
      freelancerPhone,
      "Since you're not taking on work right now, I won't match you with clients yet. Tell me \"change my working status\" whenever you're ready and I'll start matching you! 👍"
    );
    return;
  }

  const scored = jobs
    .filter((j) => j.phone !== freelancerPhone)
    // Only actively-hiring clients are shown to freelancers
    .filter((j) => j.hiring_currently === true)
    .map((j) => ({ job: j, freelancer, ...scoreMatch(freelancer, j) }))
    .filter((m) => m.score >= MIN_SCORE)
    .map(withTrustSnapshot)
    .sort((a, b) => (b.total_score - a.total_score) || (b.score - a.score))
    .slice(0, MAX_MATCHES);

  console.log(`[matching] freelancer ${freelancerPhone}: ${jobs.length} job(s) considered, ${scored.length} match(es) >= ${MIN_SCORE}%`);
  if (scored.length === 0) return; // completion reply already promised "we'll reach out"

  // The batched Groq analysis takes one job + many candidates; here every row
  // has a different job, so AI text is generated only for the best pairing
  // (one call) and the rest use fallback text to keep token spend flat.
  const best = scored[0];
  let analysed;
  try {
    const analyses = await generateMatchAnalyses({
      job: best.job,
      candidates: [{ freelancer, score: best.score, trust_score: best.trust_score, skills_overlap: best.skills_overlap, budget_fit: best.budget_fit, availability_fit: best.availability_fit }],
    });
    const ai = analyses.get(String(freelancer.phone));
    analysed = scored.map((m, i) => {
      const fallback = fallbackAnalysis(m);
      return {
        ...m,
        ai_explanation: i === 0 && ai?.ai_explanation ? ai.ai_explanation : fallback.ai_explanation,
        potential_risks: i === 0 && ai?.potential_risks ? ai.potential_risks : fallback.potential_risks,
        recommended_action: i === 0 && ai?.recommended_action ? ai.recommended_action : fallback.recommended_action,
      };
    });
  } catch (err) {
    console.error('[matching] Groq analysis failed — using fallback text:', err.message);
    analysed = scored.map((m) => ({ ...m, ...fallbackAnalysis(m) }));
  }

  await upsertMatches(analysed.map((m) => toMatchRow(m.job, m)));

  await insertNotifications([
    {
      phone: freelancerPhone,
      type: 'new_match',
      title: `${analysed.length} project${analysed.length > 1 ? 's match' : ' matches'} your profile`,
      body: `Top match: ${shortProjectLine(analysed[0].job)} (${analysed[0].total_score}% overall).`,
    },
    ...analysed.map((m) => ({
      phone: m.job.phone,
      type: 'new_match',
      title: 'New freelancer matches your project',
      body: `${freelancer.name || 'A freelancer'} just joined and is a ${m.score}% skill match for your project.`,
    })),
  ]);

  const list = analysed
    .map((m, i) => `${i + 1}. ${shortProjectLine(m.job)} — Overall ${m.total_score}% · Skill ${m.score}% · Trust ${m.trust_score ?? 0}${m.job.budget_project || m.job.budget_hourly ? ` · 💰 ${m.job.budget_project || m.job.budget_hourly}` : ''}\n   ${contactLineForRank(m.job, i + 1)}`)
    .join('\n');
  await sendWhatsAppMessage(
    freelancerPhone,
    `🎯 Good news, ${freelancer.name || 'there'}! Your profile already matches ${analysed.length} open project${analysed.length > 1 ? 's' : ''}:\n\n${list}\n\nI've notified the client${analysed.length > 1 ? 's' : ''} about you. Reply "interested 1", "decline 1", "request contact 1", or "useful 1 yes/no". 🤝`
  );
}

/**
 * Refreshes trust snapshots and total scores on existing match rows after a
 * single-artifact re-vet. Compatibility scores stay untouched.
 */
export async function refreshMatchTotalsForFreelancer(freelancerPhone) {
  const freelancer = await findFreelancer(freelancerPhone);
  if (!freelancer) {
    console.warn('[matching] refreshMatchTotalsForFreelancer — no freelancer row for', freelancerPhone);
    return;
  }

  const { data, error } = await supabase
    .from('matches')
    .select('id, compatibility_score')
    .eq('freelancer_phone', freelancerPhone);

  if (error) {
    console.error('[matching] refreshMatchTotalsForFreelancer read FAILED:', JSON.stringify(error));
    return;
  }

  const trustScore = trustScoreForFreelancer(freelancer);
  const results = await Promise.all((data || []).map((match) => supabase
    .from('matches')
    .update({
      trust_score: trustScore,
      total_score: computeTotalScore(match.compatibility_score, trustScore),
    })
    .eq('id', match.id)));
  for (const result of results) {
    if (result.error) {
      console.error('[matching] refreshMatchTotalsForFreelancer update FAILED:', JSON.stringify(result.error));
    }
  }
}

// ── Freelancer dashboard insights (local, zero API calls) ─────────────────────

async function writeFreelancerInsights(freelancer, jobs) {
  const phone = freelancer.phone;
  const profileFields = ['name', 'profile_link', 'portfolio', 'skills', 'tools', 'rate', 'availability', 'preferences', 'brief_description'];
  const filled = profileFields.filter((f) => freelancer[f]).length;
  const completeness = Math.round((100 * filled) / profileFields.length);

  const mySkills = extractSkills([freelancer.skills, freelancer.tools, freelancer.brief_description].filter(Boolean).join(' '));
  const matchingJobs = jobs.filter((j) => {
    if (j.hiring_currently !== true) return false; // only count active demand
    const jobSkills = extractSkills([j.project_description, j.brief_description].filter(Boolean).join(' '));
    return jobSkills.some((s) => mySkills.includes(s));
  }).length;

  const rows = [
    {
      phone,
      insight_type: 'profile_strength',
      content: completeness >= 80
        ? `Your profile is ${completeness}% complete — strong profiles like yours get matched first.`
        : `Your profile is ${completeness}% complete. Filling in the missing fields (via WhatsApp: "edit my info") improves your match ranking.`,
      metric_value: completeness,
      metric_label: 'Profile completeness (%)',
      icon: 'star',
      color: 'violet',
    },
    {
      phone,
      insight_type: 'market_demand',
      content: matchingJobs > 0
        ? `${matchingJobs} open client project${matchingJobs > 1 ? 's mention' : ' mentions'} skills you have — expect match notifications.`
        : 'No open projects mention your skills yet — new client requests arrive daily.',
      metric_value: matchingJobs,
      metric_label: 'Open matching projects',
      icon: 'target',
      color: 'emerald',
    },
  ];

  if (mySkills.length > 0) {
    rows.push({
      phone,
      insight_type: 'opportunity',
      content: `We detected ${mySkills.length} marketable skill${mySkills.length > 1 ? 's' : ''} on your profile: ${mySkills.join(', ')}.`,
      metric_value: mySkills.length,
      metric_label: 'Detected skills',
      icon: 'zap',
      color: 'cyan',
    });
  }

  if (freelancer.trust_score != null && freelancer.trust_breakdown) {
    const b = freelancer.trust_breakdown;
    rows.push({
      phone,
      insight_type: 'profile_strength',
      content: `Your trust score is ${freelancer.trust_score}/100 (${freelancer.trust_tier || 'unverified'}). Identity & Links: ${b.identity_links ?? 0}/45, Skill Proof: ${b.skill_proof ?? 0}/35.`,
      metric_value: freelancer.trust_score,
      metric_label: 'Trust score',
      icon: 'shield',
      color: 'emerald',
    });
  }

  await replaceInsights(phone, rows);
}
