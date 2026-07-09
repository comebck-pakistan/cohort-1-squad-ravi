'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Home, ArrowLeft, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#08090a] flex items-center justify-center p-6">
      <div className="absolute inset-0 dot-grid opacity-30" />
      <div className="absolute inset-0 bg-hero-gradient" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center max-w-md"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center mx-auto mb-8 shadow-glow"
        >
          <Zap className="w-10 h-10 text-white" />
        </motion.div>
        <div className="font-display text-9xl font-black gradient-text mb-4">404</div>
        <h1 className="font-display text-2xl font-bold text-white mb-3">Page not found</h1>
        <p className="text-white/50 text-sm leading-relaxed mb-8">
          This page doesn't exist or has been moved. Let's get you back on track.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/">
            <Button variant="gradient" size="lg" className="gap-2">
              <Home className="w-4 h-4" /> Go Home
            </Button>
          </Link>
          <Button variant="glass" size="lg" onClick={() => history.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Go Back
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
