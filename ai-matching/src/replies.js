const questions = {
  welcome: [
    "Hey! I'm Mahir 👋 Are you a Freelancer looking for work, or a Client looking to hire? (Type 'reset ai' anytime to start over)",
    "Welcome! Let's get you sorted — Freelancer or Client? 🚀 (You can always type 'reset ai' to start fresh)",
    "Hi there! Quick one first: are you here to find work, or find someone to hire? (Type 'reset ai' anytime to restart)",
    "Hey, good to have you here 🙌 So — Freelancer looking for gigs, or Client looking to hire? (Type 'reset ai' if you ever want a clean start)",
    "Yo! Let's kick things off — Freelancer or Client, which one's you? 😎 (Type 'reset ai' anytime to reset)",
    "Hi! I'm Mahir, your matchmaking assistant. Are you a Freelancer or a Client today? (Type 'reset ai' to start over anytime)",
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
    "Last one — when do you need this done by? ⏰",
    "Almost there — what's your deadline or timeline?",
    "When are you hoping to have this completed?",
    "What's your target timeline for this?",
  ],
  collect_name: [
    "Great! What's your full name? ✍️",
    "Awesome, let's start with your name.",
    "Cool — what should I call you? Full name works best.",
    "Nice one! What's your name?",
  ],
  collect_profile_link: [
    "Perfect. Drop a LinkedIn link or your CV/Resume link here. 📄 (or type 'skip' if you'd rather not share this)",
    "Got it — can you share your LinkedIn or resume link? (or type 'skip' if you'd rather not share this)",
    "Now send over your LinkedIn or CV link. (or type 'skip' if you'd rather not share this)",
    "Almost there — LinkedIn or resume link, please. (or type 'skip' if you'd rather not share this)",
  ],
  collect_portfolio: [
    "Any portfolio or work samples link you can send over? 📁",
    "Got a portfolio link? Drop it here.",
    "Do you have any work samples or a portfolio site to share?",
    "Send me a link to your portfolio, if you've got one.",
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
  completed: [
    'All done! 🎉 Your profile is officially saved.',
    "You're all set! 🙌 Everything is saved and good to go. 🚀",
    "Perfect! Your details are recorded. We'll be in touch!",
  ],
};

const postCompletionReplies = [
  "You're all set! 🙌 We'll reach out as soon as there's a match.",
  "Thanks! Your profile's already saved — sit tight, we'll be in touch soon.",
  "All good — you're in the system. We'll message you here once there's a match! 🚀",
  "No action needed — you're already registered. We'll ping you when something comes up!",
];

const alreadyRegisteredReply =
  "You're already registered with Mahir! We'll reach out as soon as there's a match. (Type 'reset ai' if you'd like to start over)";

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
