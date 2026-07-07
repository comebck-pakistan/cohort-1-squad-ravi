'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#08090a] text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-white">AI Matchmaker</span>
        </Link>
        <Link href="/login"><Button variant="gradient" size="sm">Sign In</Button></Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="font-display text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-white/40 text-sm mb-10">Last updated: July 2025</p>
        <div className="space-y-8 text-white/60 text-sm leading-relaxed">
          <div><h2 className="text-lg font-semibold text-white mb-3">1. Data We Collect</h2>
            <p>We collect your phone number (used as your identifier), profile information provided during WhatsApp onboarding (name, skills, rate, availability, portfolio links), and usage data (profile views, match interactions).</p></div>
          <div><h2 className="text-lg font-semibold text-white mb-3">2. How We Use Your Data</h2>
            <p>Your data is used to create and display your profile, compute AI-powered compatibility matches, generate personalized insights, and send relevant notifications. We do not sell your data to third parties.</p></div>
          <div><h2 className="text-lg font-semibold text-white mb-3">3. Data Storage</h2>
            <p>All data is stored in Supabase (PostgreSQL) with row-level security. Data is encrypted at rest. We use Supabase\'s infrastructure which is hosted on AWS.</p></div>
          <div><h2 className="text-lg font-semibold text-white mb-3">4. Your Rights</h2>
            <p>You may request a copy of your data, request corrections, or request deletion at any time by contacting us at hello@aimatchmaker.com. Data export is available from the Settings page.</p></div>
          <div><h2 className="text-lg font-semibold text-white mb-3">5. Contact</h2>
            <p>For any privacy concerns, contact us at <a href="mailto:hello@aimatchmaker.com" className="text-violet-400">hello@aimatchmaker.com</a>.</p></div>
        </div>
      </main>
    </div>
  );
}
