'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Zap, Target, Brain, Heart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AboutPage() {
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

      <main className="max-w-4xl mx-auto px-6 py-24">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">About Us</Badge>
          <h1 className="font-display text-5xl font-black mb-4">
            Built for the <span className="gradient-text">future of hiring</span>
          </h1>
          <p className="text-white/50 text-lg max-w-2xl mx-auto leading-relaxed">
            AI Matchmaker is an AI-powered platform that reimagines how freelancers and clients find each other.
            We believe the best matches come from deep compatibility — not just keyword overlap.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {[
            { icon: Target, title: 'Our Mission', text: 'Make intelligent matching accessible to every freelancer and client — regardless of size or budget.', color: 'text-violet-400' },
            { icon: Brain, title: 'AI-First', text: "Every feature is designed around AI intelligence. We use Groq's Llama model for real reasoning, not simple filters.", color: 'text-cyan-400' },
            { icon: Heart, title: 'Human-Centered', text: "We build tools that feel natural. WhatsApp onboarding exists because that's where real conversations happen.", color: 'text-emerald-400' },
          ].map((item, i) => (
            <motion.div key={item.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}
              className="glass-card p-6">
              <item.icon className={`w-8 h-8 ${item.color} mb-4`} />
              <h3 className="font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{item.text}</p>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="text-center glass-card p-12">
          <h2 className="font-display text-3xl font-bold text-white mb-4">Ready to try it?</h2>
          <p className="text-white/50 mb-6">Join thousands of freelancers and clients already using AI Matchmaker.</p>
          <Link href="/register">
            <Button variant="gradient" size="lg" className="gap-2">
              Get Started <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
