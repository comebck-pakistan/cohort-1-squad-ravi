// Advanced Autonomous Scope Negotiator (Pukaar Interview Engine)
async function processInterviewState(userReply, activeMatchState, groqClient = null) {
    if (!userReply) return null;
    let cleanInput = userReply.trim();

    // Prevent free-text typos from breaking the system by holding an explicit step flag
    if (!activeMatchState.interview_step) {
        activeMatchState.interview_step = 'awaiting_freelancer_response';
        return {
            target: 'freelancer',
            message: "📢 Pukaar Interview Assistant: Client ke sath contract freeze karne se pehle, please aek choti si baat confirm karein:\n\n❓ Aap is project ke liye per week kitne ghante (hours) de saken gay aur kab se start kar sakte hain?\n\n(Please reply in text naturally)."
        };
    }

    if (activeMatchState.interview_step === 'awaiting_freelancer_response' && groqClient) {
        try {
            // Use Groq to cleanly summarize the freelancer's local availability slang for the global client
            const summaryAnalysis = await groqClient.chat.completions.create({
                messages: [{
                    role: "system",
                    content: "You are a professional project manager API. Summarize the freelancer's availability and timeline input into a single clean sentence. Example: 'Available 20 hrs/week, starting Monday.'"
                }, {
                    role: "user",
                    content: cleanInput
                }],
                model: "llama3-8b-8192", // Team's token-saving config
                temperature: 0.2
            });

            let cleanSummary = summaryAnalysis.choices.message.content.trim();
            activeMatchState.interview_step = 'scope_finalized';
            activeMatchState.interview_summary = cleanSummary;

            return {
                target: 'client',
                message: `🎯 Freelancer Interview Summary:\n"${cleanSummary}"\n\nTerms freeze karne aur secure payment gateway par janay ke liye **'1'** ya **'approve scope'** reply karein.`
            };
        } catch (error) {
            console.error("Scope negotiator encountered an API fallback event:", error);
        }
    }

    return null;
}

export { processInterviewState };

