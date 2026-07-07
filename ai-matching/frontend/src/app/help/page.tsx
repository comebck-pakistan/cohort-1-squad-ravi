'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Zap, ChevronDown, MessageCircle, Book, Video, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const FAQS = [
  { q: 'How do I create my profile?', a: 'Send a WhatsApp message to our bot. It will guide you through a short conversation to build your complete profile — skills, rate, availability, and more.' },
  { q: 'How are matches calculated?', a: 'Our Groq AI analyzes 12+ compatibility signals between freelancers and clients including skill overlap, budget alignment, availability windows, timezone, and work style preferences.' },
  { q: 'How do I update my profile?', a: 'You can update any field through the Profile page (hover any field to edit inline) or by messaging the WhatsApp bot: e.g. "change my rate to $80/hr".' },
  { q: 'What does the compatibility score mean?', a: 'It represents the overall compatibility between a freelancer and client across all signals. 80%+ is considered a high-confidence match.' },
  { q: 'Is my contact information shared with matches?', a: 'No. Contact only happens through WhatsApp when both parties choose to initiate. Your phone number is not displayed on match cards.' },
  { q: 'How do AI Insights work?', a: 'Our AI analyzes your profile, market data, and match patterns to generate personalized recommendations like suggested rate changes, skill additions, and market trend alerts.' },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#08090a] text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] bg-[#08090a]/80 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-white text-lg">AI Matchmaker</span>
        </Link>
        <Link href="/login"><Button variant="gradient" size="sm">Sign In</Button></Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">Help Center</Badge>
          <h1 className="font-display text-5xl font-black mb-4">How can we <span className="gradient-text">help?</span></h1>
          <p className="text-white/50">Everything you need to know about AI Matchmaker</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4 mb-16">
          {[
            { icon: Book, title: 'Documentation', desc: 'Read detailed guides', href: '#faq' },
            { icon: MessageCircle, title: 'Contact Support', desc: 'Talk to our team', href: '/contact' },
            { icon: Video, title: 'Video Tutorial', desc: 'Watch how it works', href: '#' },
          ].map((item) => (
            <a key={item.title} href={item.href} className="glass-card p-5 hover:border-white/10 transition-all group">
              <item.icon className="w-6 h-6 text-violet-400 mb-3" />
              <p className="font-semibold text-sm text-white group-hover:text-violet-300 transition-colors">{item.title}</p>
              <p className="text-xs text-white/40 mt-1">{item.desc}</p>
            </a>
          ))}
        </div>

        <div id="faq">
          <h2 className="font-display text-2xl font-bold text-white mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="glass-card overflow-hidden">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left text-sm font-medium text-white hover:text-violet-300 transition-colors"
                >
                  {faq.q}
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180 text-violet-400' : 'text-white/30'}`} />
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: open === i ? 'auto' : 0, opacity: open === i ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-sm text-white/50 leading-relaxed">{faq.a}</p>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
