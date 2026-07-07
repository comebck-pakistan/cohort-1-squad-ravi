'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Zap, Mail, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ContactPage() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Message sent! We will get back to you within 24 hours.');
  };

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

      <main className="max-w-3xl mx-auto px-6 py-24">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Contact</Badge>
          <h1 className="font-display text-5xl font-black mb-4">
            Get in <span className="gradient-text">touch</span>
          </h1>
          <p className="text-white/50">Have a question or feedback? We'd love to hear from you.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <div className="space-y-4">
              <div className="glass-card p-5 flex items-center gap-3">
                <Mail className="w-5 h-5 text-violet-400" />
                <div><p className="text-sm font-medium text-white">Email</p><p className="text-xs text-white/40">hello@aimatchmaker.com</p></div>
              </div>
              <div className="glass-card p-5 flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-emerald-400" />
                <div><p className="text-sm font-medium text-white">WhatsApp</p><p className="text-xs text-white/40">+92 300 123 4567</p></div>
              </div>
            </div>
          </motion.div>

          <motion.form initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" placeholder="Your name" required />
            <Input label="Email" type="email" placeholder="you@example.com" required />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white/70">Message</label>
              <textarea
                placeholder="Your message..."
                rows={4}
                required
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              />
            </div>
            <Button type="submit" variant="gradient" size="lg" className="w-full gap-2">
              <Send className="w-4 h-4" /> Send Message
            </Button>
          </motion.form>
        </div>
      </main>
    </div>
  );
}
