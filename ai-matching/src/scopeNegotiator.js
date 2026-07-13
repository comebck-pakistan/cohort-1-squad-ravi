import { config } from './config.js';

async function callGroqSummary(cleanInput) {
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
            content: "You are a professional project manager API. Summarize the freelancer's availability and timeline input into a single clean sentence. Example: 'Available 20 hrs/week, starting Monday.'",
          },
          { role: 'user', content: cleanInput },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error('[scopeNegotiator] Groq summary error:', err);
    return null;
  }
}

export async function processInterviewState(userReply, activeMatchState) {
  if (!userReply) return null;
  const cleanInput = userReply.trim();

  if (!activeMatchState.interview_step) {
    activeMatchState.interview_step = 'awaiting_freelancer_response';
    return {
      target: 'freelancer',
      message: "📢 Pukaar Interview Assistant: Client ke sath contract freeze karne se pehle, please aek choti si baat confirm karein:\n\n❓ Aap is project ke liye per week kitne ghante (hours) de saken gay aur kab se start kar sakte hain?\n\n(Please reply in text naturally).",
    };
  }

  if (activeMatchState.interview_step === 'awaiting_freelancer_response') {
    const cleanSummary = await callGroqSummary(cleanInput);
    if (cleanSummary) {
      activeMatchState.interview_step = 'scope_finalized';
      activeMatchState.interview_summary = cleanSummary;
      return {
        target: 'client',
        message: `🎯 Freelancer Interview Summary:\n"${cleanSummary}"\n\nTerms freeze karne aur secure payment gateway par janay ke liye **'1'** ya **'approve scope'** reply karein.`,
      };
    }
  }

  return null;
}
