/**
 * localHandler.js
 *
 * Handles the majority of onboarding steps WITHOUT calling Groq.
 * Saves ~80% of token usage on the happy path.
 *
 * Returns null  => caller must fall through to Groq
 * Returns object => aiResult-shaped, use directly
 */

// Field alias map for edit detection
const FIELD_ALIASES = {
  name: 'name', fullname: 'name',
  rate: 'rate', hourly: 'rate', price: 'rate', pay: 'rate', charge: 'rate', fee: 'rate',
  skill: 'skills', skills: 'skills', expertise: 'skills',
  portfolio: 'portfolio', work: 'portfolio', samples: 'portfolio',
  profile: 'profile_link', linkedin: 'profile_link', cv: 'profile_link',
  resume: 'profile_link', link: 'profile_link',
  availability: 'availability', hours: 'availability', schedule: 'availability',
  preference: 'preferences', preferences: 'preferences',
  project: 'project_description', description: 'project_description',
  budget: 'budget_project', payment: 'budget_project',
  deadline: 'deadline', timeline: 'deadline',
};

function normalizeField(word) {
  const lower = (word || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  return FIELD_ALIASES[lower] || lower;
}

function extractURL(msg) {
  const m = msg.match(/https?:\/\/[^\s]+/i);
  if (m) return m[0];
  const bare = msg.match(/(?:linkedin|github|behance|dribbble|upwork|fiverr|notion|drive|dropbox)[^\s]*/i);
  return bare ? `https://${bare[0]}` : null;
}

function extractRate(msg) {
  const rangeMatch = msg.match(/\$?\s*(\d+(?:\.\d+)?k?)\s*(?:to|-|–|—)\s*\$?\s*(\d+(?:\.\d+)?k?)\s*(?:\/hr?|per\s*h(?:ou)?r|hourly|ph)?/i);
  if (rangeMatch) return `$${rangeMatch[1]} - $${rangeMatch[2]}/hr`;

  const m = msg.match(/\$?\s*(\d+(?:\.\d+)?k?)\s*(?:\/hr?|per\s*h(?:ou)?r|hourly|ph)?/i);
  if (m) return `$${m[1]}/hr`;
  return msg.trim();
}

function extractBudgetProject(msg) {
  const countMatch = msg.match(/(\d+)\s*(?:project|job|task|gig|site|app|design)/i);

  const rangeMatch = msg.match(/\$?\s*(\d[\d,.]*k?)\s*(?:to|-|–|—)\s*\$?\s*(\d[\d,.]*k?)/i);
  let budget;
  if (rangeMatch) {
    const num1 = rangeMatch[1].startsWith('$') ? rangeMatch[1] : `$${rangeMatch[1]}`;
    const num2 = rangeMatch[2].startsWith('$') ? rangeMatch[2] : `$${rangeMatch[2]}`;
    budget = `${num1} - ${num2}`;
  } else {
    const budgetMatch = msg.match(/\$?\s*(\d[\d,.]*(?:k)?)/i);
    budget = budgetMatch ? (budgetMatch[0].startsWith('$') ? budgetMatch[0] : `$${budgetMatch[0]}`) : msg.trim();
  }

  return {
    budget_project: budget,
    project_count:  countMatch ? parseInt(countMatch[1], 10) : 1,
  };
}

function extractBudgetFulltime(msg) {
  return extractRate(msg);
}

function detectRoleLocally(msg) {
  const lower = msg.toLowerCase().trim();
  if (lower === 'role_freelancer' || /^f$/.test(lower)) return 'freelancer';
  if (lower === 'role_client' || /^c$/.test(lower)) return 'client';
  if (
    /\b(freelancer|freelance)\b/i.test(lower) ||
    /\blooking for (work|gigs?|projects?|clients?)\b/i.test(lower) ||
    /\bfind (work|clients?|gigs?)\b/i.test(lower) ||
    /\bget (hired|gigs?)\b/i.test(lower) ||
    /\bi('m| am) (a )?(dev|designer|writer|coder|editor|marketer|creator|va|assistant|programmer|analyst)\b/i.test(lower) ||
    /\b(developer|designer|writer|editor|marketer|creator|programmer|analyst|virtual assistant)\b/i.test(lower)
  ) return 'freelancer';
  if (
    /\b(client|employer)\b/i.test(lower) ||
    /\b(hiring|hire|looking to hire|need (a |someone|help with)|have a project|need (a )?freelancer|post(ing)? a job)\b/i.test(lower)
  ) return 'client';
  return null;
}

function detectHireTypeLocally(msg) {
  const lower = msg.toLowerCase().trim();
  if (lower === 'hire_fulltime' || /full[- ]?time|permanent|ongoing|long[- ]?term|salary|staff/i.test(lower)) return 'full-time';
  if (lower === 'hire_project' || /project[- ]?based|project|gig|one[- ]?time|one[- ]?off|contract/i.test(lower)) return 'project-based';
  return null;
}

function looksLikeQuestion(msg) {
  if (msg.trim().endsWith('?')) return true;
  return /^(what|how|why|when|where|who|can you|could you|will you|do you|does this|is this|are you|huh|wait|hold on)\b/i.test(msg.trim());
}

export function detectEditRequestLocally(msg) {
  const withVal = msg.match(/^(?:change|update|edit|fix|correct|modify)\s+(?:my\s+)?([a-z ]+?)\s+to\s+(.+)$/i);
  if (withVal) return { is_edit: true, target_field: normalizeField(withVal[1]), provided_value: withVal[2].trim() };

  const noVal = msg.match(/^(?:change|update|edit|fix|correct|modify)\s+(?:my\s+)?([a-z ]+)$/i);
  if (noVal) return { is_edit: true, target_field: normalizeField(noVal[1]), provided_value: null };

  if (/^(?:i want to|let me|i need to|i'd like to|can i)\s+(?:change|update|edit|fix|go back|redo|modify)/i.test(msg)) {
    return { is_edit: true, target_field: null, provided_value: null };
  }
  return null;
}

function passthrough(role, nextStep, data) {
  return {
    role,
    next_step: nextStep,
    extracted_data: data,
    edit_request: { is_edit: false, target_field: null, provided_value: null },
  };
}

const PURE_DATA_STEPS = new Set([
  'collect_client_brief_desc',
  'collect_freelancer_brief_desc',
  'collect_project',
]);

const NO_EDIT_STEPS = new Set([
  'collect_client_brief_desc',
  'collect_freelancer_brief_desc',
  'collect_project',
  'collect_name',
  'collect_preferences',
]);

export function tryHandleLocally(step, role, messageText, tempData) {
  const msg = (messageText || '').trim();
  if (!msg) return null;

  // Edit detection (skip for pure-data / name steps)
  if (step && !NO_EDIT_STEPS.has(step)) {
    const editResult = detectEditRequestLocally(msg);
    if (editResult) {
      return {
        role,
        next_step: step,
        extracted_data: { ...(tempData || {}) },
        edit_request: editResult,
      };
    }
  }

  switch (step) {

    // Welcome / fresh conversation
    case undefined:
    case null:
    case 'welcome': {
      const r = detectRoleLocally(msg);
      if (r) return passthrough(r, 'collect_name', {});
      return passthrough(null, 'collect_role', {}); // greeting/unclear -> ask role
    }

    case 'collect_role': {
      const r = detectRoleLocally(msg);
      if (r) return passthrough(r, 'collect_name', {});
      return null; // unusual phrasing -> Groq
    }

    case 'collect_name': {
      if (msg.length < 2) return null;
      if (looksLikeQuestion(msg)) return null; // let Groq nudge them back
      const next = role === 'client' ? 'collect_project' : 'collect_profile_link';
      return passthrough(role, next, { name: msg });
    }

    // Freelancer flow
    case 'collect_profile_link': {
      if (msg === 'skip_profile_link') {
        return passthrough(role, 'collect_portfolio', { profile_link: null });
      }
      const url = extractURL(msg);
      return passthrough(role, 'collect_portfolio', { profile_link: url || msg });
    }

    case 'collect_portfolio': {
      const url = extractURL(msg);
      return passthrough(role, 'collect_skills', { portfolio: url || msg });
    }

    case 'collect_skills':
      return passthrough(role, 'collect_rate', { skills: msg });

    case 'collect_rate':
      return passthrough(role, 'collect_availability', { rate: extractRate(msg) });

    case 'collect_availability': {
      let avail = msg;
      if (msg === 'avail_40h') avail = '40 hours/week (Full-time)';
      else if (msg === 'avail_20h') avail = '20 hours/week (Part-time)';
      else if (msg === 'avail_flexible') avail = '10-15 hours/week (Flexible)';
      return passthrough(role, 'collect_preferences', { availability: avail });
    }

    case 'collect_preferences': {
      let pref = msg;
      if (msg === 'pref_open') pref = 'Open to anything';
      else if (msg === 'pref_useu') pref = 'US/EU clients';
      return passthrough(role, 'collect_freelancer_brief_desc', { preferences: pref });
    }

    case 'collect_freelancer_brief_desc':
      return passthrough(role, 'completed', { brief_description: msg });

    // Client flow
    case 'collect_project':
      return passthrough(role, 'collect_hire_type', { project_description: msg });

    case 'collect_hire_type': {
      const ht = detectHireTypeLocally(msg);
      if (ht) {
        return passthrough(
          role,
          ht === 'full-time' ? 'collect_budget_fulltime' : 'collect_budget_project',
          { hire_type: ht }
        );
      }
      return null; // unusual phrasing -> Groq
    }

    case 'collect_budget_fulltime':
      return passthrough(role, 'collect_deadline', { budget_hourly: extractBudgetFulltime(msg) });

    case 'collect_budget_project': {
      const { budget_project, project_count } = extractBudgetProject(msg);
      return passthrough(role, 'collect_deadline', { budget_project, project_count });
    }

    case 'collect_client_brief_desc':
      if (msg === 'skip_brief_desc') {
        return passthrough(role, 'completed', { brief_description: null });
      }
      return passthrough(role, 'completed', { brief_description: msg });

    default:
      return null;
  }
}
