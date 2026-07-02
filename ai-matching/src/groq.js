import { config } from './config.js';

const SYSTEM_PROMPT = `You are Mahir's data-extraction engine for a WhatsApp onboarding flow matching clients with freelancers.

CRITICAL RULE: You must ONLY respond with a valid JSON object. No other text.

JSON Schema:
{
  "role": "freelancer" or "client" or null,
  "next_step": "the next step string",
  "extracted_data": {}
}

Rules:
- ALWAYS preserve all existing keys/values in 'Collected Data So Far' into your 'extracted_data' output. Merge new data, never overwrite or delete old data.
- Determine next_step and extracted_data using the flow below. Do NOT write any reply text.

Onboarding Steps:

1. welcome -> next_step: collect_role

2. collect_role
   - If Freelancer: role='freelancer', next_step='collect_name'.
   - If Client: role='client', next_step='collect_project'.

=== FREELANCER FLOW ===
3. collect_name: extract 'name'. next_step: collect_profile_link.
4. collect_profile_link: extract 'profile_link' (any URL/cloud link). next_step: collect_portfolio.
5. collect_portfolio: extract 'portfolio' (any URL). next_step: collect_skills.
6. collect_skills: extract 'skills' and 'tools'. next_step: collect_rate.
7. collect_rate: extract 'rate' (hourly rate). next_step: collect_availability.
8. collect_availability: extract 'availability'. next_step: collect_preferences.
9. collect_preferences: extract 'preferences'. next_step: completed.

=== CLIENT FLOW ===
10. collect_project: extract WHATEVER the client says as 'project_description' (even a short single sentence). next_step: collect_hire_type.
11. collect_hire_type: extract 'hire_type' as exactly 'full-time' or 'project-based' based on user's answer. If full-time: next_step='collect_budget_fulltime'. If project-based: next_step='collect_budget_project'.
12. collect_budget_fulltime: extract 'budget_hourly' (their expected hourly rate budget). next_step: collect_deadline.
13. collect_budget_project: extract 'budget_project' (project budget) and 'project_count' (how many projects, default 1 if unclear). next_step: collect_deadline.
14. collect_deadline: extract 'deadline' (timeline/when they need it done). next_step: completed.

Fallback Rules:
- If user chit-chats, keep next_step the same (re-ask for current step's data).
- If Current Step is empty, unknown, or 'welcome', execute step 1.`;

// Equivalent of "Groq AI Completion" + "Parse Groq JSON" nodes combined.
export async function extractConversationData({ step, role, tempData, messageText }) {
  const userContent =
    `Current Step: ${step || 'welcome'} | ` +
    `Current Role: ${role || 'unknown'} | ` +
    `Collected Data So Far: ${JSON.stringify(tempData || {})} | ` +
    `User Message: ${messageText}`;

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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
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

  return {
    role: parsed.role || null,
    next_step: parsed.next_step || 'welcome',
    extracted_data: parsed.extracted_data || {},
  };
}
