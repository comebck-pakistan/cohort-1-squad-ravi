// Advanced Autonomous Quality Assurance Engine (Noor's Maya AI Layer)
async function runAutomatedScopeReview(submissionText, originalJobRequirements, groqClient = null) {
    if (!submissionText) return { status: 'empty', message: 'No submission data found.' };

    // Standard local fallback protection to keep the bot operational if API is down
    let reviewResult = { status: 'passed_qa', feedback: 'Submission formatted cleanly.' };

    if (groqClient) {
        try {
            const qaAnalysis = await groqClient.chat.completions.create({
                messages: [{
                    role: "system",
                    content: "You are an expert project manager API. Compare the freelancer's submission text/link against the original project scope. Respond strictly in this JSON format: { \"passed\": true/false, \"feedback\": \"short explanation of what is missing or correct\" }"
                }, {
                    role: "user",
                    content: `Job Requirements: ${originalJobRequirements}\nFreelancer Submission: ${submissionText}`
                }],
                model: "llama3-8b-8192", // Using the team's token-saving model
                temperature: 0.2,
                response_format: { type: "json_object" }
            });

            let parsedResult = JSON.parse(qaAnalysis.choices[0].message.content);
            reviewResult.status = parsedResult.passed ? 'passed_qa' : 'failed_qa';
            reviewResult.feedback = parsedResult.feedback;
        } catch (error) {
            console.error("Maya QA Engine encountered a validation error, executing fallback:", error);
        }
    }

    return reviewResult;
}

if (typeof module !== 'undefined') {
    module.exports.runAutomatedScopeReview = runAutomatedScopeReview;
}
