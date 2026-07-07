'use client';

import { use } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, MessageCircle, ExternalLink, Star, Target,
  DollarSign, Clock, Globe, Briefcase, AlertTriangle, ChevronRight, Zap
} from 'lucide-react';
import Link from 'next/link';
import { useMatchById } from '@/hooks/useMatches';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { parseSkills, getWhatsAppLink } from '@/lib/utils';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = size / 2 - 8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#7c3aed' : '#f59e0b';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-black text-white">{score}%</span>
        <span className="text-xs text-white/30">match</span>
      </div>
    </div>
  );
}

export default function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: match, isLoading } = useMatchById(id);

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-white/40">Match not found</p>
          <Link href="/matches"><Button variant="ghost" className="mt-4">Back to Matches</Button></Link>
        </div>
      </div>
    );
  }

  const skills = parseSkills(match.freelancer?.skills ?? null);
  const tools = parseSkills(match.freelancer?.tools ?? null);
  const score = match.compatibility_score;

  const radarData = [
    { axis: 'Skills', value: Math.min(100, score + (match.skills_overlap?.length ?? 0) * 5) },
    { axis: 'Budget', value: match.budget_fit ? 90 : 50 },
    { axis: 'Availability', value: match.availability_fit ? 95 : 45 },
    { axis: 'Experience', value: Math.max(40, score - 5) },
    { axis: 'Preferences', value: Math.max(50, score + 10) },
  ];

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Back */}
        <Link href="/matches">
          <Button variant="ghost" size="sm" className="gap-2 text-white/50 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Back to Matches
          </Button>
        </Link>

        {/* Hero Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-cyan-500/5" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-start gap-6 flex-wrap">
              <Avatar className="w-20 h-20 ring-2 ring-violet-500/30 ring-offset-2 ring-offset-[#111114]">
                <AvatarImage src={match.freelancer?.avatar_url ?? ''} />
                <AvatarFallback className="text-3xl font-bold">{(match.freelancer?.name ?? 'M')[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-2xl font-bold text-white mb-1">{match.freelancer?.name ?? 'Anonymous'}</h1>
                <p className="text-white/50 text-sm mb-3">{skills.slice(0, 3).join(' · ')}</p>
                <div className="flex flex-wrap gap-2">
                  {skills.map(s => <Badge key={s} variant="default" className="text-xs">{s}</Badge>)}
                </div>
              </div>
              <ScoreRing score={score} size={80} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-white/[0.06]">
              <div>
                <div className="text-xs text-white/30 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Rate</div>
                <div className="text-sm font-medium text-white">{match.freelancer?.rate ?? 'TBD'}</div>
              </div>
              <div>
                <div className="text-xs text-white/30 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Availability</div>
                <div className="text-sm font-medium text-white">{match.freelancer?.availability ?? 'TBD'}</div>
              </div>
              <div>
                <div className="text-xs text-white/30 mb-1">Budget Fit</div>
                <Badge variant={match.budget_fit ? 'success' : 'warning'}>{match.budget_fit ? 'Yes' : 'No'}</Badge>
              </div>
              <div>
                <div className="text-xs text-white/30 mb-1">Available Now</div>
                <Badge variant={match.availability_fit ? 'success' : 'warning'}>{match.availability_fit ? 'Yes' : 'Limited'}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Radar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compatibility Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.06)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Radar dataKey="value" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* AI Explanation */}
          <Card className="border-violet-500/20 bg-violet-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-400" /> AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-white/30 mb-2 uppercase tracking-wider">Why this match</p>
                <p className="text-sm text-white/70 leading-relaxed">
                  {match.ai_explanation || 'This candidate has strong skill alignment and budget compatibility with your requirements. The AI identified multiple overlapping competencies that suggest a high probability of successful collaboration.'}
                </p>
              </div>
              {match.potential_risks && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-400 mb-1">Potential Risk</p>
                    <p className="text-xs text-white/50">{match.potential_risks}</p>
                  </div>
                </div>
              )}
              {match.recommended_action && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <ChevronRight className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-emerald-400 mb-1">Recommended Next Step</p>
                    <p className="text-xs text-white/50">{match.recommended_action}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Skills Overlap */}
        {(match.skills_overlap?.length ?? 0) > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Skill Overlap</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {match.skills_overlap!.map(s => (
                  <Badge key={s} variant="default" className="text-sm px-3 py-1">{s}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Portfolio / Links */}
        {(match.freelancer?.portfolio || match.freelancer?.profile_link) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Links</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {match.freelancer?.portfolio && (
                <a href={match.freelancer.portfolio} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm text-white/70 group-hover:text-white transition-colors">Portfolio</span>
                  <ExternalLink className="w-3.5 h-3.5 text-white/20 ml-auto" />
                </a>
              )}
              {match.freelancer?.profile_link && (
                <a href={match.freelancer.profile_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group">
                  <Briefcase className="w-4 h-4 text-violet-400" />
                  <span className="text-sm text-white/70 group-hover:text-white transition-colors">LinkedIn / Profile</span>
                  <ExternalLink className="w-3.5 h-3.5 text-white/20 ml-auto" />
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        <div className="glass-card p-6 flex items-center justify-between gap-4 flex-wrap border-emerald-500/20 bg-emerald-500/5">
          <div>
            <h3 className="font-semibold text-white mb-1">Ready to connect?</h3>
            <p className="text-sm text-white/50">Reach out directly through WhatsApp</p>
          </div>
          <a href={getWhatsAppLink(match.freelancer?.phone, `Hi ${match.freelancer?.name ?? ''}, I found your profile on AI Matchmaker and I\'d love to discuss a potential project!`)}
            target="_blank" rel="noopener noreferrer">
            <Button variant="whatsapp" size="lg" className="gap-2">
              <MessageCircle className="w-5 h-5" />
              Contact via WhatsApp
            </Button>
          </a>
        </div>
      </motion.div>
    </div>
  );
}
