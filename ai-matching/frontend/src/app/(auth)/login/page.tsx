'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MessageCircle, Phone, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const phoneSchema = z.object({
  phone: z.string().min(10, 'Enter a valid phone number').regex(/^\+?[1-9]\d{9,14}$/, 'Include country code e.g. +923001234567'),
});

const otpSchema = z.object({
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'Numbers only'),
});

type PhoneForm = z.infer<typeof phoneSchema>;
type OtpForm = z.infer<typeof otpSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(otpSchema) });

  const onSendOtp = async (data: PhoneForm) => {
    setLoading(true);
    try {
      const formattedPhone = data.phone.startsWith('+') ? data.phone : `+${data.phone}`;
      const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
      if (error) throw error;
      setPhone(formattedPhone);
      setStep('otp');
      toast.success('OTP sent to your WhatsApp number!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send OTP';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async (data: OtpForm) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: data.otp, type: 'sms' });
      if (error) throw error;
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid OTP';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090a] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] border-r border-white/[0.06] p-12 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-cyan-500/5" />
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-white text-lg">AI Matchmaker</span>
          </Link>

          <div className="space-y-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <h1 className="font-display text-4xl font-bold text-white mb-3">
                The future of hiring,<br /><span className="gradient-text">in your pocket</span>
              </h1>
              <p className="text-white/50 leading-relaxed">
                Sign in with the same phone number you used on WhatsApp. Your profile is already waiting.
              </p>
            </motion.div>

            <div className="space-y-4">
              {[
                { icon: MessageCircle, title: 'WhatsApp-native', desc: 'Your onboarding happened in WhatsApp. Just sign in here.' },
                { icon: ShieldCheck, title: 'Secure OTP', desc: 'Phone-based authentication. No passwords to forget.' },
                { icon: Zap, title: 'Instant access', desc: 'Your dashboard, matches and insights are ready instantly.' },
              ].map((item, i) => (
                <motion.div key={item.title} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <item.icon className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{item.title}</div>
                    <div className="text-xs text-white/40">{item.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="relative z-10 glass-card p-5">
          <p className="text-sm text-white/60 italic">&ldquo;I matched with my best client in 48 hours. The AI understood my profile perfectly.&rdquo;</p>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">SC</div>
            <span className="text-xs text-white/40">Sarah Chen — Flutter Developer</span>
          </div>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-white text-lg">AI Matchmaker</span>
          </div>

          {step === 'phone' ? (
            <>
              <div className="mb-8">
                <h2 className="font-display text-3xl font-bold text-white mb-2">Sign in</h2>
                <p className="text-white/50">Enter the phone number you used on WhatsApp</p>
              </div>

              <form onSubmit={phoneForm.handleSubmit(onSendOtp)} className="space-y-5">
                <Input
                  label="Phone Number"
                  placeholder="+923001234567"
                  icon={<Phone className="w-4 h-4" />}
                  {...phoneForm.register('phone')}
                  error={phoneForm.formState.errors.phone?.message}
                />
                <Button type="submit" loading={loading} size="lg" className="w-full" variant="gradient">
                  Send OTP
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </form>

              <p className="text-center text-sm text-white/40 mt-6">
                New user?{' '}
                <Link href="/register" className="text-violet-400 hover:text-violet-300 transition-colors">
                  Create account
                </Link>
              </p>
            </>
          ) : (
            <>
              <button onClick={() => setStep('phone')} className="flex items-center gap-2 text-sm text-white/40 hover:text-white mb-8 transition-colors">
                ← Back
              </button>
              <div className="mb-8">
                <h2 className="font-display text-3xl font-bold text-white mb-2">Check your SMS</h2>
                <p className="text-white/50">Enter the 6-digit code sent to <span className="text-white">{phone}</span></p>
              </div>

              <form onSubmit={otpForm.handleSubmit(onVerifyOtp)} className="space-y-5">
                <Input
                  label="One-time Password"
                  placeholder="123456"
                  maxLength={6}
                  {...otpForm.register('otp')}
                  error={otpForm.formState.errors.otp?.message}
                />
                <Button type="submit" loading={loading} size="lg" className="w-full" variant="gradient">
                  Verify & Sign In
                </Button>
              </form>

              <p className="text-center text-sm text-white/40 mt-6">
                Didn't receive it?{' '}
                <button onClick={() => onSendOtp({ phone })} className="text-violet-400 hover:text-violet-300 transition-colors">Resend</button>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
