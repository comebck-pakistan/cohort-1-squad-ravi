import { config } from './config.js';
import { getActiveFreelancers, getActiveJobRequests, getDeclinedPairs, getAllLiveMatchesForPhone, insertMatch } from './supabase.js';
import { sendWhatsAppMessage, sendWhatsAppButtons } from './whatsapp.js';

// ── Tokenisation helper ──────────────────────────────────────────────────────
function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,;|/•·\-–—]+/)
      .map(t => t.replace(/[^a-z0-9#+.]/g, ''))
      .filter(t => t.length > 1),
  );
}

// ── USD formatting helper ────────────────────────────────────────────────────
// Prepends '$' only when the stored value is purely numeric (e.g. "200" → "$200").
// If the value already contains '$' or non-numeric text, returns it unchanged.
function formatUSD(value) {
  if (value == null) return '';
  const str = String(value).trim();
  if (!str) return '';
  // Already has a dollar sign — don't double up
  if (str.includes('$')) return str;
  // Purely numeric (with optional commas/decimals) — prepend $
  if (/^[\d,]+(\.\d+)?$/.test(str)) return `$${str}`;
  return str;
}

// ── Numeric parser ───────────────────────────────────────────────────────────
function parseFirstNumber(text) {
  if (text == null) return null;
  const match = String(text).match(/[\d,.]+/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

// ── Set overlap ratio ────────────────────────────────────────────────────────
function overlapRatio(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Simple hash for declined-pair comparison ─────────────────────────────────
function simpleHash(text) {
  if (!text) return '';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}

// ── UUID generator (no dependency needed) ────────────────────────────────────
function generateBatchId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  1. RULE-BASED SCORING  (0 – 100)
// ═════════════════════════════════════════════════════════════════════════════
function scoreRuleBased(freelancer, jobRequest) {
  const descTokens = tokenize(jobRequest.project_description);

  // ── Skill overlap (50%) ────────────────────────────────────────────────
  const skillTokens = tokenize(freelancer.skills);
  const skillScore = overlapRatio(skillTokens, descTokens) * 100;

  // ── Tool overlap (20%) — neutral 50 if either side is empty ────────────
  const toolTokens = tokenize(freelancer.tools);
  const toolScore = toolTokens.size === 0 || descTokens.size === 0
    ? 50
    : overlapRatio(toolTokens, descTokens) * 100;

  // ── Budget fit (30%) — neutral 50 if parsing fails ─────────────────────
  const freelancerRate = parseFirstNumber(freelancer.rate);
  const clientBudget   = parseFirstNumber(jobRequest.budget_hourly)
                      ?? parseFirstNumber(jobRequest.budget_project);

  let budgetScore = 50;
  if (freelancerRate != null && clientBudget != null && clientBudget > 0) {
    if (freelancerRate <= clientBudget) {
      budgetScore = 100;
    } else {
      budgetScore = Math.max(0, 100 - ((freelancerRate - clientBudget) / clientBudget) * 100);
    }
  }

  const total = skillScore * 0.5 + toolScore * 0.2 + budgetScore * 0.3;
  return Math.round(total * 100) / 100;
}

// ═════════════════════════════════════════════════════════════════════════════
//  2. AI-BASED SCORING  (self-contained Groq call)
// ═════════════════════════════════════════════════════════════════════════════
const AI_SYSTEM_PROMPT = `You are a freelancer-job matching evaluator.
Compare the job request against the freelancer profile.
Return ONLY valid JSON: {"fit_score": 0-100, "reasoning": "one sentence"}
No markdown, no preamble, no extra keys.`;

async function scoreAIFit(freelancer, jobRequest) {
  const userContent = [
    `Job Description: ${jobRequest.project_description || ''}`,
    `Job Brief: ${jobRequest.brief_description || ''}`,
    `Budget: ${jobRequest.budget_hourly || jobRequest.budget_project || 'not specified'}`,
    `Deadline: ${jobRequest.deadline || 'not specified'}`,
    '---',
    `Freelancer Skills: ${freelancer.skills || ''}`,
    `Freelancer Tools: ${freelancer.tools || ''}`,
    `Freelancer Portfolio: ${freelancer.portfolio || ''}`,
    `Freelancer Preferences: ${freelancer.preferences || ''}`,
    `Freelancer Rate: ${freelancer.rate || ''}`,
    `Freelancer Availability: ${freelancer.availability || ''}`,
  ].join('\n');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user',   content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[matching] Groq AI scoring error (${response.status}):`, errText);
      return { fit_score: 50, reasoning: 'AI scoring unavailable' };
    }

    const data = await response.json();
    const rawContent = data.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const cleaned = rawContent.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const score = Number(parsed.fit_score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      console.warn('[matching] AI returned invalid fit_score, falling back to 50');
      return { fit_score: 50, reasoning: parsed.reasoning || 'AI score out of range' };
    }

    return {
      fit_score: score,
      reasoning: parsed.reasoning || '',
    };
  } catch (err) {
    console.error('[matching] AI scoring exception:', err.message);
    return { fit_score: 50, reasoning: 'AI scoring unavailable' };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  3. CORE SCORING PIPELINE
//     Scores a list of candidates against a reference, returns ranked results.
// ═════════════════════════════════════════════════════════════════════════════
async function scoreCandidates(candidates, jobRequest, freelancerExtractor) {
  const scored = [];

  for (const candidate of candidates) {
    const freelancer = freelancerExtractor(candidate);
    const ruleScore = scoreRuleBased(freelancer, jobRequest);
    const { fit_score: aiScore, reasoning: aiReasoning } = await scoreAIFit(freelancer, jobRequest);
    const finalScore = Math.round(
      (ruleScore * config.matching.ruleWeight + aiScore * config.matching.aiWeight) * 100
    ) / 100;

    console.log(
      `[matching] scoring ${freelancer.phone || candidate.phone} — rule: ${ruleScore} ai: ${aiScore} final: ${finalScore}`,
    );

    scored.push({ candidate, ruleScore, aiScore, finalScore, aiReasoning });
  }

  return scored
    .filter(m => m.finalScore >= config.matching.threshold)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, config.matching.maxMatches);
}

// ═════════════════════════════════════════════════════════════════════════════
//  4. BIDIRECTIONAL findMatches
//     Direction A: new client   → score against active freelancers
//     Direction B: new freelancer → score against active job_requests
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Find matches for a newly registered client.
 * Scores all active freelancers against this job request.
 */
export async function findMatchesForClient(jobRequest) {
  const freelancers = await getActiveFreelancers();
  const declinedPairs = await getDeclinedPairs();
  const liveMatches = await getAllLiveMatchesForPhone(jobRequest.phone);

  // Filter out declined pairs (unless job description changed)
  const currentHash = simpleHash(jobRequest.project_description);
  const declinedSet = new Set(
    declinedPairs
      .filter(dp => dp.job_phone === jobRequest.phone && dp.job_description_hash === currentHash)
      .map(dp => dp.freelancer_phone),
  );

  const liveMatchedPhones = new Set(liveMatches.map(m => m.freelancer_phone));

  const eligible = freelancers.filter(f => !declinedSet.has(f.phone) && !liveMatchedPhones.has(f.phone));
  console.log(`[matching] Client scan: ${eligible.length} eligible freelancer(s) (${freelancers.length} total, ${declinedSet.size} declined-excluded, ${liveMatchedPhones.size} live-excluded)`);

  if (eligible.length === 0) return [];

  return scoreCandidates(eligible, jobRequest, f => f);
}

/**
 * Find matches for a newly registered freelancer.
 * Scores all active job requests, treating each as a potential match.
 */
export async function findMatchesForFreelancer(freelancer) {
  const jobRequests = await getActiveJobRequests();
  const declinedPairs = await getDeclinedPairs();
  const liveMatches = await getAllLiveMatchesForPhone(freelancer.phone);

  // Filter out declined pairs (unless job description changed)
  const declinedMap = new Map(
    declinedPairs
      .filter(dp => dp.freelancer_phone === freelancer.phone)
      .map(dp => [dp.job_phone, dp.job_description_hash]),
  );

  const liveMatchedPhones = new Set(liveMatches.map(m => m.job_phone));

  const eligible = jobRequests.filter(jr => {
    if (liveMatchedPhones.has(jr.phone)) return false;

    const prevHash = declinedMap.get(jr.phone);
    if (prevHash === undefined) return true; // never declined
    // Re-allow if the job description changed
    return prevHash !== simpleHash(jr.project_description);
  });

  console.log(`[matching] Freelancer scan: ${eligible.length} eligible job request(s) (${jobRequests.length} total, ${liveMatchedPhones.size} live-excluded)`);

  if (eligible.length === 0) return [];

  // Score each job request against this freelancer
  const scored = [];
  for (const jr of eligible) {
    const ruleScore = scoreRuleBased(freelancer, jr);
    const { fit_score: aiScore, reasoning: aiReasoning } = await scoreAIFit(freelancer, jr);
    const finalScore = Math.round(
      (ruleScore * config.matching.ruleWeight + aiScore * config.matching.aiWeight) * 100
    ) / 100;

    console.log(
      `[matching] scoring job ${jr.phone} for freelancer ${freelancer.phone} — rule: ${ruleScore} ai: ${aiScore} final: ${finalScore}`,
    );

    scored.push({ candidate: jr, ruleScore, aiScore, finalScore, aiReasoning });
  }

  return scored
    .filter(m => m.finalScore >= config.matching.threshold)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, config.matching.maxMatches);
}

// ═════════════════════════════════════════════════════════════════════════════
//  5. PERSIST & NOTIFY (ranked sequential — Phase 2 will add reply handling)
//     For now: persist all matches, notify only rank 1.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Persist scored matches to DB and send the rank-1 notification.
 * Returns the batch_id for tracking.
 */
export async function persistAndNotifyMatches({ matches, initiatorRole, initiatorPhone, jobData, freelancerData }) {
  if (matches.length === 0) return null;

  const batchId = generateBatchId();

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const rank = i + 1;
    const isFirst = rank === 1;

    const freelancerPhone = initiatorRole === 'client' ? m.candidate.phone : initiatorPhone;
    const jobPhone        = initiatorRole === 'client' ? initiatorPhone : m.candidate.phone;

    await insertMatch({
      initiator_role:   initiatorRole,
      initiator_phone:  initiatorPhone,
      job_phone:        jobPhone,
      freelancer_phone: freelancerPhone,
      rule_score:       m.ruleScore,
      ai_score:         m.aiScore,
      final_score:      m.finalScore,
      ai_reasoning:     m.aiReasoning,
      rank,
      status:           isFirst ? 'awaiting_response' : 'pending',
      notified_at:      isFirst ? new Date().toISOString() : null,
      batch_id:         batchId,
    });

    // Notify only the #1 ranked candidate
    if (isFirst) {
      const notifyPhone = initiatorRole === 'client' ? freelancerPhone : jobPhone;
      const notifyText  = buildNotificationText(initiatorRole, jobData, m, freelancerData);
      const buttons = [
        { id: 'match_interested', title: '✅ Interested' },
        { id: 'match_declined',   title: '❌ Not Interested' },
      ];
      await sendWhatsAppButtons(
        notifyPhone,
        notifyText,
        buttons,
        initiatorRole === 'client' ? '🚀 New Project Match' : '🎯 New Freelancer Match',
        'Tap an option to respond'
      );
      console.log(`[matching] Notified rank-1 match with buttons: ${notifyPhone} (batch ${batchId})`);
    }
  }

  return batchId;
}

/**
 * Build the WhatsApp notification message for a match.
 */
function buildNotificationText(initiatorRole, jobData, match, freelancerData) {
  if (initiatorRole === 'client') {
    // Notifying a freelancer about a client's job
    const budgetLine = jobData.budget_hourly
      ? `*Budget:* ${formatUSD(jobData.budget_hourly)}/hr`
      : jobData.budget_project
        ? `*Budget:* ${formatUSD(jobData.budget_project)} (project)`
        : '';
    const deadlineLine = jobData.deadline
      ? `*Deadline:* ${jobData.deadline}`
      : '';
      
    // Use project_description or brief_description, or a default string.
    const projectDesc = jobData.project_description || jobData.brief_description || 'New project available';

    return [
      `🚀 New project match!`,
      ``,
      `*Project Title:* ${projectDesc}`,
      budgetLine,
      deadlineLine,
      ``,
      `Reply *interested* if you'd like to connect, or *not interested* to pass.`,
    ].filter(Boolean).join('\n');
  } else {
    // Notifying a client about a freelancer — use the passed freelancerData
    // (the initiator's profile) instead of match.candidate (which is the job row)
    const freelancer = freelancerData || match.candidate;
    return [
      `🎯 We found a freelancer who looks like a great match for your project!`,
      ``,
      `*Name:* ${freelancer.name || 'N/A'}`,
      `*Skills:* ${freelancer.skills || 'N/A'}`,
      freelancer.rate ? `*Rate:* ${freelancer.rate}` : '',
      freelancer.portfolio ? `*Portfolio:* ${freelancer.portfolio}` : '',
      ``,
      `Reply *interested* if you'd like to connect, or *not interested* to pass.`,
    ].filter(Boolean).join('\n');
  }
}

// Re-export simpleHash for use in declined-pair storage
export { simpleHash };
