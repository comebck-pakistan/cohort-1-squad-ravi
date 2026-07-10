const questions = {
  welcome: [
    "Hey! I'm your assistant 👋 Are you a Freelancer looking for work, or a Client looking to hire? (Type 'reset ai' anytime to start over)",
    "Welcome! Let's get you sorted — Freelancer or Client? 🚀 (You can always type 'reset ai' to start fresh)",
    "Hi there! Quick one first: are you here to find work, or find someone to hire? (Type 'reset ai' anytime to restart)",
    "Hey, good to have you here 🙌 So — Freelancer looking for gigs, or Client looking to hire? (Type 'reset ai' if you ever want a clean start)",
    "Yo! Let's kick things off — Freelancer or Client, which one's you? 😎 (Type 'reset ai' anytime to reset)",
    "Hi! I'm your matchmaking assistant. Are you a Freelancer or a Client today? (Type 'reset ai' to start over anytime)",
  ],
  collect_role: [
    "Are you a Freelancer looking for work, or a Client looking to hire?",
    "Let's get you sorted — Freelancer or Client?",
    "So — Freelancer looking for gigs, or Client looking to hire?",
  ],
  collect_project: [
    "Nice! Tell me a bit about the project you need help with. 📋",
    "Cool — what's the project you're looking to get done?",
    "Alright, give me a quick rundown of what you need built.",
    "Let's hear it — what's the project about?",
    "Got it, Client! What kind of work are you looking to hire for?",
  ],
  collect_hire_type: [
    "Are you looking to hire full-time, or is this project-based? 💼",
    "Quick one — full-time hire, or a one-off project?",
    "Is this a full-time role you're hiring for, or project-based work?",
    "Full-time or project-based — which one fits what you need?",
  ],
  collect_budget_fulltime: [
    "What's your budget for the hourly rate? 💵",
    "Got it — what hourly rate are you budgeting for?",
    "What's the hourly rate range you're working with?",
    "What's your budget looking like, per hour?",
  ],
  collect_budget_project: [
    "What's your budget for this project, and how many projects are we talking? 💰",
    "Got it — what's your project budget, and roughly how many projects total?",
    "What budget do you have per project, and how many are you looking to get done?",
    "What's the project budget, and how many projects should I expect?",
  ],
  collect_deadline: [
    "Almost there! What's your deadline or timeline? ⏰ (e.g. \"2 weeks\", \"July 15\", \"weekly\")",
  ],
  collect_name: [
    "Great! What's your full name? ✍️",
    "Awesome, let's start with your name.",
    "Cool — what should I call you? Full name works best.",
    "Nice one! What's your name?",
  ],
  collect_profile_link: [
    "Perfect. Drop your LinkedIn link here. Verified profiles get matched first. 📄 (or type 'skip')",
    "Got it — can you share your LinkedIn profile? Verified profiles get matched first. (or type 'skip')",
  ],
  collect_linkedin: [
    "Perfect. Drop your LinkedIn link here. Verified profiles get matched first. 📄 (or type 'skip')",
    "Got it — can you share your LinkedIn profile? Verified profiles get matched first. (or type 'skip')",
    "Now send over your LinkedIn link if you have one. Verified profiles get matched first. (or type 'skip')",
  ],
  collect_github: [
    "Got a GitHub profile? It helps verify your skills and gets strong profiles matched first. 🧑‍💻 (or type 'skip')",
    "Send your GitHub link if you have one. Verified skill proof helps you get matched first. (or type 'skip')",
    "Any GitHub profile I can check for skill proof? Verified profiles get matched first. (or type 'skip')",
  ],
  collect_cv: [
    "Share a CV/resume link if you have one. It helps verify your skills and gets profiles matched first. 📄 (or type 'skip')",
    "Got a CV or resume link? Verified profiles get matched first. (or type 'skip')",
    "Send your CV/resume link for skill verification if available. (or type 'skip')",
  ],
  collect_support_docs: [
    "Any extra proof links — certificates, docs, case studies? Verified profiles get matched first. 🛡️ (or type 'skip')",
    "Send any supporting docs or certificates if you have them. Verified profiles get matched first. (or type 'skip')",
    "One more proof link if you've got it: certificates, docs, or anything that backs up your skills. (or type 'skip')",
  ],
  collect_portfolio: [
    "Any portfolio or work samples link you can send over? 📁 (or type 'skip')",
    "Got a portfolio link? Drop it here, or type 'skip'.",
    "Do you have any work samples or a portfolio site to share? (or type 'skip')",
    "Send me a link to your portfolio if you've got one, or type 'skip'.",
  ],
  collect_skills: [
    "What skills/tools would you say you're best at? ⚙️",
    "What are you strongest at — skills and tools?",
    "Tell me your go-to skills and the tools you use most.",
    "What would you say is your specialty, skill and tool-wise?",
  ],
  collect_rate: [
    "What's your hourly rate, in USD? 💵",
    "What do you charge per hour, in USD?",
    "Quick one — hourly rate, in USD?",
    "What's your rate looking like, USD/hr?",
  ],
  collect_availability: [
    "How many hours a week can you commit? ⏳",
    "What's your weekly availability looking like?",
    "How many hours/week can you put in?",
    "How much time can you commit each week?",
  ],
  collect_preferences: [
    "Final question: any preferences on project type or client geography? 🌍",
    "Almost done — any project types or regions you prefer working with? 🎯",
    "Last one! Any preference on project type or where your clients are based?",
    "Wrapping up — got any preferences on project type or client location?",
  ],
  collect_working_status: [
    "Quick one — are you currently open to taking on new work? (yes/no) 💼",
    "Are you available for new projects right now? A simple yes or no works! ✅",
    "Almost done! Are you actively looking for work at the moment? (yes/no)",
    "One more thing — should I match you with clients right now, or are you fully booked? (yes = match me)",
  ],
  collect_hiring_status: [
    "Quick check — are you actively hiring for this right now? (yes/no) 🎯",
    "Are you ready to hire as soon as we find the right person? (yes/no) ✅",
    "One quick thing — is this an active hire right now, or are you just planning ahead? (yes = hiring now)",
    "Before the last step: are you currently hiring for this project? A simple yes or no works!",
  ],
  collect_contact_sharing: [
    "Do you want matched people to see your WhatsApp contact directly? (yes/no) If you say no, they'll have to request it and I'll ask you first.",
    "Should I show your WhatsApp contact to approved matches automatically? (yes/no) If not, I'll only share it after you approve.",
    "Contact privacy check: can matched people see your WhatsApp number directly? A simple yes or no works.",
  ],
};

// ── Niche-aware preferences variants ────────────────────────────────────────
// Each entry: { niche, keywords (matched against temp_data), messages[] }
const PREFERENCE_VARIANTS = [
  {
    niche: 'video_editing',
    keywords: ['video', 'edit', 'editing', 'premiere', 'after effects', 'davinci', 'final cut', 'motion graphics', 'vfx', 'animation'],
    messages: [
      "Last one! 🎯 Since you're into video editing — got a niche or client type you vibe with? (e.g. \"YouTube long-form, short-form reels\" or \"English-speaking clients\") — or just say 'open to anything'",
      "Almost done! 🎬 Any preference on the type of video work or clients you'd love? (e.g. \"music videos, corporate\", \"US-based brands\") — or say 'no preference' if you're down for whatever",
    ],
  },
  {
    niche: 'web_dev',
    keywords: ['web', 'website', 'frontend', 'front-end', 'backend', 'back-end', 'fullstack', 'full-stack', 'react', 'next', 'node', 'developer', 'wordpress', 'shopify', 'html', 'css', 'javascript', 'typescript', 'php', 'laravel'],
    messages: [
      "Last one! 💻 Since you're in web dev — any niche or client type you prefer? (e.g. \"e-commerce stores\", \"SaaS startups\", \"US/EU clients\") — or just say 'open to anything'",
      "Almost there! 🌐 Got a preference for the type of web projects or clients? (e.g. \"landing pages for agencies\", \"full-stack apps\") — or say 'no preference' and we'll match you broadly",
    ],
  },
  {
    niche: 'graphic_design',
    keywords: ['logo', 'design', 'graphic', 'branding', 'illustrat', 'photoshop', 'figma', 'canva', 'ui', 'ux', 'poster', 'flyer', 'packaging', 'brand identity'],
    messages: [
      "Last one! 🎨 Since you're into design — any niche or client type you'd prefer? (e.g. \"tech startup branding\", \"packaging for DTC brands\") — or just say 'open to anything'",
      "Almost done! ✏️ Got a preference for design work or client type? (e.g. \"social media graphics\", \"European agencies\") — or say 'no preference' if you're flexible",
    ],
  },
  {
    niche: 'content_writing',
    keywords: ['writing', 'writer', 'content', 'copywriting', 'copy', 'blog', 'article', 'seo', 'ghostwrit', 'script', 'email'],
    messages: [
      "Last one! ✍️ Since you're a writer — any content niche or client type you vibe with? (e.g. \"tech blogs\", \"email sequences for e-com\", \"English-speaking startups\") — or say 'open to anything'",
      "Almost there! 📝 Got a preference on the type of writing or clients? (e.g. \"SaaS landing pages\", \"health & wellness blogs\") — or say 'no preference' if you're down for all kinds",
    ],
  },
  {
    niche: 'social_media',
    keywords: ['social media', 'smm', 'instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'community', 'influencer', 'growth', 'engagement', 'scheduling'],
    messages: [
      "Last one! 📱 Since you're in social media — any platform or client niche you prefer? (e.g. \"TikTok for DTC brands\", \"LinkedIn for B2B\") — or just say 'open to anything'",
      "Almost done! 🚀 Got a preference on social media niche or client type? (e.g. \"Instagram growth for restaurants\", \"content calendars for coaches\") — or say 'no preference'",
    ],
  },
  {
    niche: 'virtual_assistant',
    keywords: ['virtual assistant', ' va ', 'admin', 'data entry', 'scheduling', 'bookkeeping', 'customer support', 'customer service', 'inbox', 'calendar'],
    messages: [
      "Last one! 📋 Since you're in the VA space — any industry or task type you'd prefer? (e.g. \"real estate admin\", \"e-com customer support\", \"US-based entrepreneurs\") — or say 'open to anything'",
      "Almost there! 🗂️ Got a preference for the kind of VA work or clients? (e.g. \"exec calendar management\", \"Shopify order processing\") — or say 'no preference' if you're flexible",
    ],
  },
  {
    niche: 'ugc_ads',
    keywords: ['ugc', 'ad ', 'ads', 'creative', 'tiktok ad', 'meta ad', 'facebook ad', 'performance', 'paid media', 'user generated', 'ugc creator', 'spark ad'],
    messages: [
      "Last one! 🎥 Since you're into UGC / ad creation — any niche or brand type you prefer? (e.g. \"beauty & skincare UGC\", \"tech product demos\", \"US DTC brands\") — or say 'open to anything'",
      "Almost done! 🔥 Got a preference on the type of ads or clients? (e.g. \"TikTok spark ads for fashion\", \"Meta ads for SaaS\") — or say 'no preference' and we'll cast a wide net",
    ],
  },
  {
    niche: 'mobile_dev',
    keywords: ['mobile', 'app', 'ios', 'android', 'flutter', 'react native', 'swift', 'kotlin'],
    messages: [
      "Last one! 📲 Since you're into mobile dev — any platform or client niche you prefer? (e.g. \"iOS fintech apps\", \"cross-platform MVPs for startups\") — or say 'open to anything'",
      "Almost there! 🛠️ Got a preference on the type of mobile projects? (e.g. \"Android e-commerce\", \"Flutter prototypes\") — or say 'no preference' if you're flexible",
    ],
  },
  {
    niche: 'data_analytics',
    keywords: ['data', 'analytics', 'dashboard', 'excel', 'sql', 'python', 'tableau', 'power bi', 'analysis', 'machine learning', 'ml', 'ai '],
    messages: [
      "Last one! 📊 Since you're into data — any industry or project type you prefer? (e.g. \"marketing analytics for e-com\", \"financial dashboards\") — or say 'open to anything'",
      "Almost done! 🔢 Got a preference on the kind of data work or clients? (e.g. \"startup KPI dashboards\", \"ML pipelines for healthtech\") — or say 'no preference'",
    ],
  },
  {
    niche: 'catchall',
    keywords: [],
    messages: [
      "Final question: any preferences on project type or client geography? 🌍 (e.g. \"e-commerce projects\", \"US-based startups\") — or just say 'open to anything'",
      "Almost done — any project types or regions you prefer working with? 🎯 (e.g. \"tech companies\", \"European clients\") — or say 'no preference' if you're flexible",
      "Last one! Any preference on what kind of projects or clients you'd love to work with? (e.g. \"creative agencies\", \"remote-first teams\") — or say 'open to anything' 🚀",
      "Wrapping up — got any preferences on project type or client location? 🌐 (e.g. \"SaaS products\", \"MENA-based brands\") — or say 'no preference'",
    ],
  },
];

/**
 * Scans text fields in temp_data for keyword hits and returns the matching niche name,
 * or null if nothing matches.
 */
function detectNiche(tempData) {
  if (!tempData) return null;

  // Build a single searchable string from all text fields collected so far
  const searchable = [
    tempData.project_description,
    tempData.brief_description,
    tempData.skills,
    tempData.tools,
    tempData.name, // sometimes people put "Video Editor Jo" as their name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!searchable) return null;

  for (const variant of PREFERENCE_VARIANTS) {
    if (variant.niche === 'catchall') continue; // skip catchall during matching
    for (const kw of variant.keywords) {
      if (searchable.includes(kw.toLowerCase())) {
        return variant.niche;
      }
    }
  }
  return null;
}

/**
 * Smart preferences reply picker.
 * 1. Keyword-match temp_data → pick a random message from that niche's bank
 * 2. No match → pick a random message from ALL variants (including catchall)
 *
 * @param {object} tempData  The conversation's current temp_data
 * @returns {string}         The reply text
 */
export function pickPreferencesReply(tempData) {
  const niche = detectNiche(tempData);

  if (niche) {
    const matched = PREFERENCE_VARIANTS.find((v) => v.niche === niche);
    if (matched) {
      console.log(`[replies] Preferences niche detected: ${niche}`);
      return pickRandom(matched.messages);
    }
  }

  // Fallback: pick from every variant's messages combined
  const allMessages = PREFERENCE_VARIANTS.flatMap((v) => v.messages);
  console.log('[replies] No niche detected — using random preferences variant');
  return pickRandom(allMessages);
}

// ── Re-open the questions object to avoid breaking existing references ───────
// (The object was closed above so we could define PREFERENCE_VARIANTS inline.
//  We continue the remaining question definitions here by merging them in.)
Object.assign(questions, {
  collect_freelancer_brief_desc: [
    "Lastly, give me a brief description of yourself, what you do, and who you want to match up with, in your own words.",
  ],
  collect_client_brief_desc: [
    "Lastly, give me a brief description of your project, in your own words.",
  ],
  completed: [
    'All done! 🎉 Your profile is officially saved.',
    "You're all set! 🙌 Everything is saved and good to go. 🚀",
    "Perfect! Your details are recorded. We'll be in touch!",
  ],
});

const postCompletionReplies = [
  "You're all set! 🙌 We'll reach out as soon as there's a match.",
  "Thanks! Your profile's already saved — sit tight, we'll be in touch soon.",
  "All good — you're in the system. We'll message you here once there's a match! 🚀",
  "No action needed — you're already registered. We'll ping you when something comes up!",
];

const editVagueReplies = [
  "Sure! Here is what we have so far:\n{LIST}\n\nWhat would you like to update?",
  "No problem. Here's your current info:\n{LIST}\n\nWhich part do you want to change?",
  "I can help with that! Here's what's saved:\n{LIST}\n\nWhat field are we editing?",
];

const editSpecificConfirmReplies = [
  "Got it! What would you like your new {FIELD} to be?",
  "Sure thing. Send over your new {FIELD} now.",
  "Okay, let's update that. What's the new {FIELD}?",
];

const editSuccessReplies = [
  "Done! I've updated your {FIELD} to: {VALUE}.",
  "All set! Your {FIELD} is now: {VALUE}.",
  "Successfully updated! {FIELD} -> {VALUE}.",
];


const alreadyRegisteredReply =
  "You're already registered with our platform! We'll reach out as soon as there's a match. (Type 'reset ai' if you'd like to start over)";

const resetReply = "Done! Your data's been wiped. Send 'Hi' whenever you're ready to start fresh. 👋";

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Equivalent of "Pick Reply Text" node
export function pickReplyText(nextStep) {
  let step = (nextStep || 'welcome').toLowerCase().trim();
  if (step.includes('completed')) step = 'completed';
  const arr = questions[step] || questions.welcome;
  return { step, text: pickRandom(arr) };
}

// Equivalent of "Code in JavaScript" node (post-completion short-circuit reply)
export function pickPostCompletionReply() {
  return pickRandom(postCompletionReplies);
}

export function getAlreadyRegisteredReply() {
  return alreadyRegisteredReply;
}

export function getResetReply() {
  return resetReply;
}

export function isSkipMessage(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  if (t === 'skip') return true;
  return ['skip this', 'no thanks', 'n/a', 'none', 'pass'].some((phrase) => t.includes(phrase));
}

function formatCurrentData(data) {
  if (!data || Object.keys(data).length === 0) return "Nothing saved yet!";
  return Object.entries(data)
    .map(([k, v]) => `- *${k}*: ${v || 'Not provided'}`)
    .join('\n');
}

export function pickEditVagueReply(currentData) {
  const text = pickRandom(editVagueReplies);
  return text.replace('{LIST}', formatCurrentData(currentData));
}

export function pickEditConfirmReply(field) {
  const text = pickRandom(editSpecificConfirmReplies);
  return text.replace(/\{FIELD\}/g, field.replace(/_/g, ' '));
}

export function pickEditSuccessReply(field, value) {
  const text = pickRandom(editSuccessReplies);
  return text
    .replace(/\{FIELD\}/g, field.replace(/_/g, ' '))
    .replace(/\{VALUE\}/g, value || 'Not provided');
}


// Localized Multilingual Translation Matrix 
const localizedOnboardingReplies = {
    english: {
        welcome: "Welcome! Let's get your profile set up. First, what is your full name?",
        askSkills: "Great! Please list your primary professional skills (comma-separated):",
        trustScoreNudge: (score) => `Your current profile Trust Score is ${score}%. To unlock premium, high-paying clients, you can update your LinkedIn or GitHub links anytime!`,
        contactApproved: "Contact access approved! The other party has been notified."
    },
    roman_urdu: {
        welcome: "Khushamdeed! Aiye aapka profile banate hain. Sab se pehle, aapka poora naam kya hai?",
        askSkills: "Zabardast! Apni khusoosi maharat (skills) likhein (comma se alag karein):",
        trustScoreNudge: (score) => `Aapka current Trust Score ${score}% hai. Premium clients ke sath match hone ke liye aap kisi bhi waqt apna LinkedIn ya GitHub link bhi update kar sakte hain!`,
        contactApproved: "Rabta karne ki ijazat mil gayi hai! Dusri party ko inform kar diya gaya hai."
    }
};

module.exports = {
    ...module.exports,
    localizedOnboardingReplies
};


// Premium Multilingual Conversational Matrix 
const fullyLocalizedAppReplies = {
    english: {
        welcome: "Welcome to Pukaar! Let's build your profile. First, what is your full name?",
        askSkills: "Great! Please list your primary professional skills (comma-separated):",
        onboardingComplete: "Registration complete! 🚀 Our matching engine is actively scanning positions.",
        matchAlert: (title, score) => `🔥 New Match Found: ${title}\nCompatibility Score: ${score}%\n\nReply '1' or 'interested' to proceed.\nReply '2' or 'decline' to pass.`,
        contactRequestPrompt: "The client has requested your WhatsApp contact details. Reply 'yes' to share or 'no' to keep it private."
    },
    roman_urdu: {
        welcome: "Pukaar App par khushamdeed! Aiye aapka profile banate hain. Sab se pehle, aapka poora naam kya hai?",
        askSkills: "Zabardast! Apni khusoosi maharat (skills) likhein (jaise: React, UI/UX, Graphic Design):",
        onboardingComplete: "Aapki registration mukammal ho chuki hai! 🚀 Hamara system aapke liye best matches dhoond raha hai.",
        matchAlert: (title, score) => `🔥 Naya Match Mila Hai: ${title}\nCompatibility Score: ${score}%\n\nAage barhne ke liye '1' ya 'interested' ka jawab dein.\nReject karne ke liye '2' ya 'decline' ka jawab dein.`,
        contactRequestPrompt: "Client aapka WhatsApp contact number mang raha hai. Ijazat dene ke liye 'yes' likhein ya ijazat na dene ke liye 'no' likhein."
    }
};

module.exports = {
    ...module.exports,
    fullyLocalizedAppReplies
};

// Conversational Contract Presenter Bridge 
function generateContractInvoicePrompt(langState, clientName, budgetValue) {
    const templates = {
        english: `🤝 Mutual Interest Confirmed with Client: ${clientName}!\n\nTo lock this project securely in escrow, please review your financial threshold:\n💰 Milestone Budget: $${budgetValue}\n\nTo authorize funding now, please reply with exactly: **'1'** or **'pay milestone'**.`,
        roman_urdu: `🤝 Client ${clientName} ke sath aapka mutual interest confirm ho gaya hai!\n\nProject ko escrow me महफूज़ (secure) karne ke liye details review karein:\n💰 Milestone Budget: $${budgetValue}\n\nPayment authorization ke liye abhi reply karein: **'1'** ya **'pay milestone'**.`
    };
    
    return templates[langState] || templates['english'];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.generateContractInvoicePrompt = generateContractInvoicePrompt;
}

// Localized Autonomous QA System Notification Matrix
const shieldQAReplies = {
    english: {
        qaFailed: (feedback) => `⚠️ QA Guard Review Note: Your submission was reviewed and requires adjustments.\n\n❌ Missing Items: ${feedback}\n\nPlease update your files and submit again to trigger client escrow release.`,
        qaPassed: (feedback) => `✅ QA Shield Verified! The freelancer has completed all scope requirements perfectly.\n\n📝 Evaluation: ${feedback}\n\nTo release the escrow milestone payment immediately, reply '1' or 'release payment'.`
    },
    roman_urdu: {
        qaFailed: (feedback) => `⚠️ QA Guard Review Note: Aapki submission check ki gayi hai aur usme kuch tabdeelian zaroori hain.\n\n❌ Khamiyaan: ${feedback}\n\nPlease apne files update karke dubara submit karein taake client escrow release ho sake.`,
        qaPassed: (feedback) => `✅ QA Shield Verified! Freelancer ne tamaam scope requirements ko mukammal taur par poora kar diya hai.\n\n📝 Evaluation: ${feedback}\n\nEscrow milestone payment ko abhi release karne ke liye '1' ya 'release payment' ka jawab dein.`
    }
};

module.exports = {
    ...module.exports,
    shieldQAReplies
};
