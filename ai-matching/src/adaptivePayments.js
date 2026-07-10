// Premium Multi-Gateway Adaptive Payment Router (Noor's Core Moat Feature)
function routeAdaptiveMilestone(commandText, userPhoneNumber, matchState) {
    if (!commandText) return null;
    let input = commandText.toLowerCase().trim();
    
    // Check if the user is domestic (Pakistan) or international based on phone prefix
    let isLocalPakistani = userPhoneNumber.startsWith('+92') || userPhoneNumber.startsWith('92') || userPhoneNumber.startsWith('03');

    if (input === 'pay milestone' || input === '1') {
        if (isLocalPakistani) {
            matchState.payment_gateway_tier = 'domestic';
            return {
                gateway: 'local_hub',
                message: "🇵🇰 Local Payment Hub Active. Please choose your account type:\n1. EasyPaisa\n2. JazzCash\n3. Local Bank Transfer (Nayapay/Sadapay)\n\nReply with your selection number (e.g., '1')."
            };
        } else {
            matchState.payment_gateway_tier = 'international';
            return {
                gateway: 'global_hub',
                message: "🌐 Global Payment Hub Active. Secure credit/debit card link generated via Stripe checkout.\n\nPlease tap the link to fund the milestone securely: https://pukaar.app"
            };
        }
    }

    // Process local menu numbers to eliminate free-text slang bugs
    if (matchState.payment_gateway_tier === 'domestic') {
        if (input === '1') { matchState.selected_method = 'EasyPaisa'; }
        else if (input === '2') { matchState.selected_method = 'JazzCash'; }
        else if (input === '3') { matchState.selected_method = 'Bank_Transfer'; }
        
        matchState.escrow_status = 'payment_pending';
        return {
            status: 'pending_verification',
            message: `Aap ne ${matchState.selected_method} select kiya hai. Please enter your mobile wallet number to receive the automated payment popup request (e.g., 'wallet 03XXXXXXXXX').`
        };
    }

    return null;
}

if (typeof module !== 'undefined') {
    module.exports.routeAdaptiveMilestone = routeAdaptiveMilestone;
}
