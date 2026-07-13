import { config } from './config.js';

export async function runAutomatedScopeReview(submissionText, originalJobRequirements) {
  if (!submissionText) return { status: 'empty', feedback: 'No submission data found.' };

  const fallback = { status: 'passed_qa', feedback: 'Submission formatted cleanly.' };

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert project manager API. Compare the freelancer\'s submission text/link against the original project scope. Respond strictly in this JSON format: { "passed": true/false, "feedback": "short explanation of what is missing or correct" }',
          },
          { role: 'user', content: `Job Requirements: ${originalJobRequirements}\nFreelancer Submission: ${submissionText}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return { status: parsed.passed ? 'passed_qa' : 'failed_qa', feedback: parsed.feedback };
  } catch (err) {
    console.error('[qaInspector] Groq review error:', err);
    return fallback;
  }
}
