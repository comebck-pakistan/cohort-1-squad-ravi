'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MessageCircle, Phone, ArrowRight, Zap, User, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { getBotWhatsAppLink } from '@/lib/utils';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'role' | 'phone' | 'otp'>('role');
  const [role, setRole] = useState<'freelancer' | 'client' | null>(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const handleSendOtp = async () => {
    setPhoneError('');
    if (!phone.match(/^\+?[1-9]\d{9,14}$/)) {
      setPhoneError('Enter a valid phone number with country code');
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
      const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
      if (error) throw error;
      setPhone(formattedPhone);
      setStep('otp');
      toast.success('OTP sent!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send OTP';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
      if (error) throw error;
      toast.success('Account created! Redirecting to your dashboard...');
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid OTP';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090a] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <Link href="/" className="flex items-center gap-2 justify-center mb-10">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-white text-lg">AI Matchmaker</span>
          </Link>
        </motion.div>

        {/* Step: Role */}
        {step === 'role' && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-10">
              <h1 className="font-display text-4xl font-bold text-white mb-3">Join AI Matchmaker</h1>
              <p className="text-white/50">How do you plan to use the platform?</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {[{ value: 'freelancer' as const, icon: User, title: 'Freelancer', desc: 'I offer services and skills' },
               { value: 'client' as const, icon: Briefcase, title: 'Client', desc: 'I want to hire talent' }].map((opt) => (
                <motion.button
                  key={opt.value}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setRole(opt.value)}
                  className={`p-6 rounded-2xl border-2 text-left transition-all duration-200 ${
                    role === opt.value
                      ? 'border-violet-500 bg-violet-600/15'
                      : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                    role === opt.value ? 'bg-violet-600/30' : 'bg-white/5'
                  }`}>
                    <opt.icon className={`w-5 h-5 ${role === opt.value ? 'text-violet-400' : 'text-white/50'}`} />
                  </div>
                  <div className={`font-semibold text-sm ${role === opt.value ? 'text-white' : 'text-white/70'}`}>{opt.title}</div>
                  <div className="text-xs text-white/40 mt-1">{opt.desc}</div>
                </motion.button>
              ))}
            </div>

            <div className="glass-card p-5 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <MessageCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-medium text-white">Complete your profile on WhatsApp first</span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Your profile is built through a natural WhatsApp conversation with our AI. If you haven't done that yet,
                start there — then come back to sign in.
              </p>
              <a href={getBotWhatsAppLink()} target="_blank" rel="noopener noreferrer" className="inline-block mt-3">
                <Button variant="whatsapp" size="sm" className="gap-2">
                  <MessageCircle className="w-3.5 h-3.5" />
                  Open WhatsApp Bot
                </Button>
              </a>
            </div>

            <Button
              onClick={() => role && setStep('phone')}
              disabled={!role}
              size="lg"
              className="w-full"
              variant="gradient"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>

            <p className="text-center text-sm text-white/40 mt-4">
              Already have an account?{' '}
              <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">Sign in</Link>
            </p>
          </motion.div>
        )}

        {/* Step: Phone */}
        {step === 'phone' && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={() => setStep('role')} className="text-sm text-white/40 hover:text-white mb-8 flex items-center gap-1 transition-colors">← Back</button>
            <div className="mb-8">
              <h2 className="font-display text-3xl font-bold text-white mb-2">Your phone number</h2>
              <p className="text-white/50">Use the same number you chatted with on WhatsApp</p>
            </div>
            <div className="space-y-5">
              <Input
                label="Phone Number"
                placeholder="+923001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                icon={<Phone className="w-4 h-4" />}
                error={phoneError}
              />
              <Button onClick={handleSendOtp} loading={loading} size="lg" className="w-full" variant="gradient">
                Send OTP
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step: OTP */}
        {step === 'otp' && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={() => setStep('phone')} className="text-sm text-white/40 hover:text-white mb-8 flex items-center gap-1 transition-colors">← Back</button>
            <div className="mb-8">
              <h2 className="font-display text-3xl font-bold text-white mb-2">Verify your number</h2>
              <p className="text-white/50">6-digit code sent to <span className="text-white">{phone}</span></p>
            </div>
            <div className="space-y-5">
              <Input
                label="OTP Code"
                placeholder="123456"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <Button onClick={handleVerifyOtp} loading={loading} size="lg" className="w-full" variant="gradient">
                Verify & Create Account
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
