'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  ArrowRight, Zap, MessageCircle, Brain, Target, TrendingUp,
  Shield, Globe, Star, ChevronDown, Check, Users, Briefcase,
  Sparkles, Bot, BarChart3, Clock, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getBotWhatsAppLink } from '@/lib/utils';

const FEATURES = [
  {
    icon: Bot,
    title: 'WhatsApp AI Onboarding',
    description: 'No forms, no friction. Our AI learns everything about you through a natural WhatsApp conversation in under 5 minutes.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Brain,
    title: 'Intelligent Matching',
    description: 'Our AI analyzes 12+ compatibility signals — skills, budget, availability, timezone, and work style — to surface your best matches.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Target,
    title: 'Match Confidence Score',
    description: 'Every match comes with a detailed AI explanation and a confidence score so you never waste time on bad fits.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: TrendingUp,
    title: 'Career Insights',
    description: 'Get personalized AI insights: when to raise your rate, which skills are trending, and how to beat 80% of your competition.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: Shield,
    title: 'Verified Profiles',
    description: 'Every profile is built through our AI interview process — so you only interact with serious freelancers and genuine clients.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    description: 'Track your profile views, match rates, response scores, and market positioning — all in a beautiful live dashboard.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Start a WhatsApp conversation',
    description: 'Send a message to our AI bot on WhatsApp. No app download. No account creation. Just a conversation.',
    icon: MessageCircle,
    color: 'from-green-500 to-emerald-500',
  },
  {
    step: '02',
    title: 'AI builds your profile',
    description: 'Our Groq-powered AI asks smart questions and automatically structures your profile — skills, rate, availability, preferences.',
    icon: Brain,
    color: 'from-violet-500 to-purple-500',
  },
  {
    step: '03',
    title: 'Get intelligent matches',
    description: 'The algorithm computes compatibility across multiple dimensions and surfaces your best matches with full AI explanations.',
    icon: Target,
    color: 'from-cyan-500 to-blue-500',
  },
  {
    step: '04',
    title: 'Track everything in your dashboard',
    description: 'Your AI Matchmaker dashboard gives you insights, analytics, and match management — all in one premium interface.',
    icon: BarChart3,
    color: 'from-amber-500 to-orange-500',
  },
];

const TESTIMONIALS = [
  {
    name: 'Sarah Chen',
    role: 'Senior Flutter Developer',
    text: 'I landed my best client in 48 hours. The AI understood my niche better than I could describe it myself.',
    rating: 5,
    avatar: 'SC',
    color: 'from-violet-500 to-purple-600',
  },
  {
    name: 'Marcus Rodriguez',
    role: 'Startup Founder, Fintech',
    text: 'We hired our lead designer through AI Matchmaker. The compatibility score was 94% and it was absolutely accurate.',
    rating: 5,
    avatar: 'MR',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    name: 'Priya Sharma',
    role: 'UX Designer',
    text: 'The AI insights told me to raise my rate by 20%. I was hesitant but did it anyway. Now I\'m fully booked.',
    rating: 5,
    avatar: 'PS',
    color: 'from-emerald-500 to-teal-600',
  },
];

const FAQS = [
  {
    q: 'How does the WhatsApp onboarding work?',
    a: 'You send a message to our WhatsApp bot and it asks you a series of natural questions — your skills, rate, availability, preferences. The AI extracts all the important data and builds your profile automatically. It takes about 3-5 minutes.',
  },
  {
    q: 'How does the AI matching algorithm work?',
    a: 'Our algorithm uses Groq AI to compute compatibility across 12+ signals: skill overlap, budget alignment, timezone, availability windows, work style preferences, and more. Every match comes with a confidence score and a plain-English explanation.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All data is stored in Supabase with row-level security. We never share your contact information without consent. Your WhatsApp number is the only identifier we use.',
  },
  {
    q: 'What if I want to update my profile?',
    a: 'You can update any field either through the dashboard or by telling the WhatsApp bot — just say "change my rate" or "update my availability" and it handles the rest.',
  },
  {
    q: 'Is this free?',
    a: 'AI Matchmaker is currently free during our beta phase. We will introduce premium plans with advanced features, priority matching, and detailed analytics.',
  },
];

export function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#08090a] text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/[0.04] bg-[#08090a]/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-white text-lg">AI Matchmaker</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-white/60">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link href="/register">
            <Button variant="gradient" size="sm">Get Started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="absolute inset-0 bg-hero-gradient" />
        <motion.div
          style={{ y }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[120px]"
        />
        <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-cyan-500/8 blur-[80px]" />

        <div className="relative z-10 text-center max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="mb-6 px-4 py-1.5 text-xs font-medium border-violet-500/30 bg-violet-500/10 text-violet-300">
              <Sparkles className="w-3 h-3" />
              Powered by Groq AI · WhatsApp-native
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-6xl md:text-7xl lg:text-8xl font-black leading-[0.95] tracking-tight mb-6"
          >
            Finding great talent
            <br />
            <span className="gradient-text">shouldn\'t feel like</span>
            <br />
            searching in the dark.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            AI Matchmaker uses conversational AI over WhatsApp to build rich profiles,
            then intelligently matches freelancers with clients based on real compatibility — not just keywords.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a href={getBotWhatsAppLink()} target="_blank" rel="noopener noreferrer">
              <Button variant="whatsapp" size="xl" className="gap-3">
                <MessageCircle className="w-5 h-5" />
                Start on WhatsApp
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <Link href="/dashboard">
              <Button variant="glass" size="xl" className="gap-2">
                View Dashboard
              </Button>
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-8 mt-16 pt-8 border-t border-white/[0.06]"
          >
            {[['2min', 'Avg onboarding'], ['94%', 'Match accuracy'], ['12+', 'AI signals analyzed'], ['48h', 'Avg time-to-match']].map(([stat, label]) => (
              <div key={label} className="text-center">
                <div className="font-display text-2xl font-bold text-white">{stat}</div>
                <div className="text-xs text-white/40 mt-1">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <ChevronDown className="w-6 h-6 text-white/30" />
        </motion.div>
      </section>

      {/* Problem */}
      <section className="py-32 px-6 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <Badge variant="secondary" className="mb-4">The Problem</Badge>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Hiring platforms are <span className="gradient-text">broken</span>
          </h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            You spend hours on forms, wade through irrelevant results, and still can't tell if someone is actually a good fit.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Clock, title: 'Endless forms', desc: 'Creating a profile takes 45 minutes of copy-pasting from your LinkedIn. Most people give up.', color: 'text-red-400' },
            { icon: Users, title: 'Keyword matching', desc: 'Platforms match on keywords, not actual compatibility. A 90% skill overlap often means 40% cultural fit.', color: 'text-amber-400' },
            { icon: Briefcase, title: 'No signal quality', desc: "You can\'t tell if a match is great or mediocre. There\'s no explanation, no confidence score, no context.", color: 'text-orange-400' },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="glass-card p-6"
            >
              <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 ${item.color}`}>
                <item.icon size={20} />
              </div>
              <h3 className="font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">Features</Badge>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Built for the <span className="gradient-text">future of work</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Every feature is designed to remove friction, increase signal quality, and make matching feel intelligent.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`glass-card p-6 border ${feature.bg} cursor-default`}
              >
                <div className={`w-10 h-10 rounded-xl ${feature.bg} border flex items-center justify-center mb-4 ${feature.color}`}>
                  <feature.icon size={20} />
                </div>
                <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-600/5 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">How It Works</Badge>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Zero to matched in <span className="gradient-text">minutes</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative"
              >
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-white/10 to-transparent z-10" />
                )}
                <div className="glass-card p-6 h-full">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <step.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-xs font-mono text-white/30 mb-2">{step.step}</div>
                  <h3 className="font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why WhatsApp */}
      <section className="py-32 px-6 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <Badge variant="secondary" className="mb-4">Why WhatsApp</Badge>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              The app everyone<br />already <span className="gradient-text">has open</span>
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-8">
              WhatsApp has 2.7 billion monthly active users. It\'s the most natural place to have a conversation.
              Our AI meets you where you already are — no new app, no new habit, no friction.
            </p>
            <ul className="space-y-3">
              {[
                'No app download required',
                'Conversational and natural — not form-based',
                'Works on any smartphone worldwide',
                'Profile updates anytime via chat',
                'Multilingual support via Groq AI',
              ].map((point) => (
                <li key={point} className="flex items-center gap-3 text-white/70">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </div>
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-white">AI Matchmaker Bot</div>
                  <div className="text-xs text-emerald-400">● Online</div>
                </div>
              </div>
              {[
                { sender: 'bot', text: 'Hi! Are you a freelancer or a client looking to hire?' },
                { sender: 'user', text: 'I\'m a freelancer — Flutter developer' },
                { sender: 'bot', text: 'Great! What\'s your hourly rate? And are you available full-time or for projects?' },
                { sender: 'user', text: '$75/hr, open to both' },
                { sender: 'bot', text: '✨ Perfect. Your profile is taking shape. What skills and tools do you work with?' },
              ].map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: msg.sender === 'bot' ? -10 : 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                    msg.sender === 'bot'
                      ? 'bg-white/10 text-white rounded-tl-sm'
                      : 'bg-emerald-500/20 text-emerald-100 rounded-tr-sm border border-emerald-500/20'
                  }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-violet-600/20 blur-2xl" />
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-32 px-6 bg-gradient-to-b from-transparent via-violet-600/5 to-transparent">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">Testimonials</Badge>
            <h2 className="font-display text-4xl md:text-5xl font-bold">
              People love it
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                whileHover={{ y: -4 }}
                className="glass-card p-6"
              >
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-white/70 text-sm leading-relaxed mb-6">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold`}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white">{t.name}</div>
                    <div className="text-xs text-white/40">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-32 px-6 max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge variant="secondary" className="mb-4">FAQ</Badge>
          <h2 className="font-display text-4xl font-bold">Common questions</h2>
        </motion.div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass-card overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left text-sm font-medium text-white hover:text-violet-300 transition-colors"
              >
                {faq.q}
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              <motion.div
                initial={false}
                animate={{ height: openFaq === i ? 'auto' : 0, opacity: openFaq === i ? 1 : 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <p className="px-5 pb-5 text-sm text-white/50 leading-relaxed">{faq.a}</p>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center glass-card p-16 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-cyan-500/5" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
          <div className="relative z-10">
            <Award className="w-12 h-12 text-violet-400 mx-auto mb-6" />
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Ready to find your<br /><span className="gradient-text">perfect match?</span>
            </h2>
            <p className="text-white/50 text-lg mb-10 max-w-xl mx-auto">
              Start your WhatsApp onboarding in 2 minutes. No credit card. No complex setup. Just results.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href={getBotWhatsAppLink()} target="_blank" rel="noopener noreferrer">
                <Button variant="whatsapp" size="xl" className="gap-3">
                  <MessageCircle className="w-5 h-5" />
                  Start on WhatsApp
                </Button>
              </a>
              <Link href="/register">
                <Button variant="glass" size="xl">Create Account</Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-display font-bold text-white">AI Matchmaker</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/40">
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
              <Link href="/about" className="hover:text-white transition-colors">About</Link>
            </div>
            <p className="text-xs text-white/30">© 2025 AI Matchmaker. Built with ♥</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
