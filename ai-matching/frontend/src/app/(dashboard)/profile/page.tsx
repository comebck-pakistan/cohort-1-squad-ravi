'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  User, Link as LinkIcon, Briefcase, DollarSign, Clock,
  Star, Edit3, Save, X, Sparkles, ChevronRight, Globe,
  CheckCircle, AlertCircle, ExternalLink
} from 'lucide-react';
import { useAuthContext } from '@/components/auth/auth-provider';
import { useFreelancerProfile, useUpdateFreelancerProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProfileScore, getProfileCompletionFields, parseSkills, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { FreelancerProfile } from '@/types';

type EditField = keyof FreelancerProfile | null;

const AI_SUGGESTIONS = [
  { field: 'bio', text: 'Add a bio describing your expertise and what makes you unique', impact: '+15 pts', color: 'text-violet-400' },
  { field: 'portfolio', text: 'Link your best project — profiles with portfolios get 3x more matches', impact: '+15 pts', color: 'text-amber-400' },
  { field: 'profile_link', text: 'Add your LinkedIn to build trust with clients', impact: '+10 pts', color: 'text-cyan-400' },
];

export default function ProfilePage() {
  const { user } = useAuthContext();
  const phone = user?.phone ?? null;
  const { data: profile, isLoading } = useFreelancerProfile(phone);
  const updateMutation = useUpdateFreelancerProfile(phone ?? '');

  const [editField, setEditField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState('');

  const profileScore = profile ? calculateProfileScore(profile) : 0;
  const fields = profile ? getProfileCompletionFields(profile) : [];
  const skills = parseSkills(profile?.skills ?? null);
  const tools = parseSkills(profile?.tools ?? null);

  const startEdit = (field: EditField, current: string) => {
    setEditField(field);
    setEditValue(current);
  };

  const saveEdit = async () => {
    if (!editField || !phone) return;
    try {
      await updateMutation.mutateAsync({ [editField]: editValue });
      toast.success('Profile updated!');
      setEditField(null);
    } catch {
      toast.error('Failed to update. Try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="font-display text-2xl font-bold text-white mb-2">No profile found</h2>
          <p className="text-white/50 text-sm mb-6 max-w-sm">
            Complete your onboarding on WhatsApp first, then come back to manage your profile.
          </p>
          <a href="https://wa.me/923001234567" target="_blank" rel="noopener noreferrer">
            <Button variant="whatsapp">Start WhatsApp Onboarding</Button>
          </a>
        </div>
      </div>
    );
  }

  const Field = ({ label, icon: Icon, field, value, multiline = false }: {
    label: string; icon: React.ElementType; field: EditField; value: string | null; multiline?: boolean;
  }) => (
    <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.03] group transition-all">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-white/40" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/30 mb-1">{label}</p>
        {editField === field ? (
          <div className="flex items-center gap-2">
            <input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="flex-1 bg-white/5 border border-violet-500/40 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500/50"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditField(null); }}
            />
            <Button size="icon-sm" onClick={saveEdit} loading={updateMutation.isPending}><Save className="w-3.5 h-3.5" /></Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setEditField(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className={`text-sm ${value ? 'text-white' : 'text-white/25 italic'} flex-1 truncate`}>
              {value || 'Not set — click to add'}
            </p>
            {value && (field === 'portfolio' || field === 'profile_link') && (
              <a href={value} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 text-white/20 hover:text-violet-400 transition-colors" />
              </a>
            )}
            <button onClick={() => startEdit(field, value ?? '')} className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit3 className="w-3.5 h-3.5 text-white/30 hover:text-violet-400 transition-colors" />
            </button>
          </div>
        )}
      </div>
      <div className="flex-shrink-0">
        {value
          ? <CheckCircle className="w-4 h-4 text-emerald-400 opacity-60" />
          : <AlertCircle className="w-4 h-4 text-amber-400 opacity-40" />}
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">My Profile</h1>
            <p className="text-white/40 text-sm mt-1">Hover any field to edit inline</p>
          </div>
          <Badge variant={profileScore >= 80 ? 'success' : profileScore >= 50 ? 'default' : 'warning'} className="text-sm px-4 py-1.5">
            {profileScore}% complete
          </Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Avatar + Score */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <Avatar className="w-20 h-20 ring-2 ring-violet-500/30 ring-offset-2 ring-offset-[#111114]">
                    <AvatarImage src={profile.avatar_url ?? ''} />
                    <AvatarFallback className="text-2xl font-bold">{(profile.name ?? phone ?? 'U')[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[#111114] flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                </div>
                <h2 className="font-display text-xl font-bold text-white mb-0.5">{profile.name ?? 'No name'}</h2>
                <p className="text-white/40 text-xs mb-4">{phone}</p>

                {/* Radial score */}
                <div className="relative w-24 h-24 mb-4">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                    <circle cx="48" cy="48" r="38" fill="none" stroke="url(#pGrad)" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 38}`}
                      strokeDashoffset={`${2 * Math.PI * 38 * (1 - profileScore / 100)}`}
                      className="transition-all duration-1000" />
                    <defs><linearGradient id="pGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient></defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-2xl font-black text-white">{profileScore}</span>
                    <span className="text-xs text-white/30">score</span>
                  </div>
                </div>

                <Progress value={profileScore} className="w-full h-1.5 mb-3" />
                <p className="text-xs text-white/40">
                  {profileScore < 100 ? `${100 - profileScore} points to perfect score` : 'Perfect profile!'}
                </p>

                {profile.created_at && (
                  <p className="text-xs text-white/25 mt-3">Joined {formatDate(profile.created_at)}</p>
                )}
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Skills & Tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skills.map(s => (
                      <Badge key={s} variant="default" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                ) : <p className="text-xs text-white/30">No skills listed yet</p>}
                {tools.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tools.map(t => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                )}
                <button onClick={() => startEdit('skills', profile.skills ?? '')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Edit skills
                </button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Fields */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <Field label="Full Name" icon={User} field="name" value={profile.name} />
                <Field label="Bio" icon={Briefcase} field="bio" value={profile.bio} />
                <Field label="Hourly Rate" icon={DollarSign} field="rate" value={profile.rate} />
                <Field label="Availability" icon={Clock} field="availability" value={profile.availability} />
                <Field label="Skills" icon={Star} field="skills" value={profile.skills} />
                <Field label="Tools" icon={Star} field="tools" value={profile.tools} />
                <Field label="Portfolio" icon={Globe} field="portfolio" value={profile.portfolio} />
                <Field label="LinkedIn / Profile" icon={LinkIcon} field="profile_link" value={profile.profile_link} />
                <Field label="Preferences" icon={User} field="preferences" value={profile.preferences} />
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <Card className="border-violet-500/20 bg-violet-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  AI Profile Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {AI_SUGGESTIONS.filter(s => {
                  const v = profile[s.field as keyof FreelancerProfile];
                  return !v;
                }).map((tip, i) => (
                  <motion.div
                    key={tip.field}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                  >
                    <Sparkles className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tip.color}`} />
                    <p className="text-sm text-white/60 flex-1">{tip.text}</p>
                    <Badge variant="success" className="text-xs flex-shrink-0">{tip.impact}</Badge>
                  </motion.div>
                ))}
                {AI_SUGGESTIONS.filter(s => !profile[s.field as keyof FreelancerProfile]).length === 0 && (
                  <div className="text-center py-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-white/50">Your profile looks great!</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Completion Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Completion Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {fields.map((f) => (
                    <div key={f.key} className="flex items-center gap-3 p-2">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        f.completed ? 'border-emerald-500 bg-emerald-500/20' : 'border-white/20'
                      }`}>
                        {f.completed && <span className="text-emerald-400 text-xs">✓</span>}
                      </div>
                      <span className={`text-sm flex-1 ${f.completed ? 'text-white/60 line-through' : 'text-white/70'}`}>{f.label}</span>
                      <span className="text-xs text-white/30">{f.weight}pts</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
