'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Search, ArrowUpRight, Target, DollarSign, Clock, Users } from 'lucide-react';
import Link from 'next/link';
import { useAuthContext } from '@/components/auth/auth-provider';
import { useMatches } from '@/hooks/useMatches';
import { useUserRole } from '@/hooks/useProfile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { parseSkills } from '@/lib/utils';
import { Match } from '@/types';

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = size / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#7c3aed' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-white">{score}%</span>
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const skills = parseSkills(match.freelancer?.skills ?? null);
  const overallScore = match.total_score ?? match.compatibility_score;
  const trustScore = match.trust_score ?? match.freelancer?.trust_score ?? 0;
  const confidenceLabel = overallScore >= 80 ? 'High' :
    overallScore >= 60 ? 'Medium' : 'Low';
  const confidenceVariant = overallScore >= 80 ? 'success' :
    overallScore >= 60 ? 'default' : 'warning';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <Card className="hover:shadow-card-hover hover:border-white/10 transition-all duration-300 cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <Avatar className="w-12 h-12 ring-2 ring-white/10">
              <AvatarImage src={match.freelancer?.avatar_url ?? ''} />
              <AvatarFallback className="text-base font-bold">{(match.freelancer?.name ?? 'M')[0]}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-white text-sm truncate">{match.freelancer?.name ?? 'Anonymous'}</h3>
                <Badge variant={confidenceVariant} className="text-xs flex-shrink-0">{confidenceLabel} confidence</Badge>
              </div>
              <p className="text-xs text-white/40 mb-3 line-clamp-1">{match.ai_explanation || 'AI match based on skills and preferences'}</p>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <Badge variant="secondary" className="text-xs">Skill {match.compatibility_score}%</Badge>
                <Badge variant={trustScore >= 55 ? 'success' : trustScore >= 35 ? 'warning' : 'secondary'} className="text-xs">Trust {trustScore}</Badge>
              </div>

              {/* Signals */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-white/50">
                  <DollarSign className="w-3 h-3 text-emerald-400" />
                  <span>{match.freelancer?.rate ?? 'Rate TBD'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/50">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>{match.freelancer?.availability ?? 'Available'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {match.budget_fit
                    ? <><span className="text-emerald-400">✓</span> <span className="text-white/50">Budget fit</span></>
                    : <><span className="text-red-400">✗</span> <span className="text-white/40">Budget mismatch</span></>}
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {match.availability_fit
                    ? <><span className="text-emerald-400">✓</span> <span className="text-white/50">Available</span></>
                    : <><span className="text-amber-400">~</span> <span className="text-white/40">Limited availability</span></>}
                </div>
              </div>

              {/* Skills */}
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {skills.slice(0, 3).map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                  {skills.length > 3 && <Badge variant="secondary" className="text-xs">+{skills.length - 3}</Badge>}
                </div>
              )}
            </div>

            <ScoreRing score={overallScore} size={56} />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] mt-2">
            <div className="flex items-center gap-2">
              {match.skills_overlap?.slice(0, 2).map(s => (
                <span key={s} className="text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
            <Link href={`/matches/${match.id}`}>
              <Button variant="gradient" size="sm" className="gap-1.5">
                View Details
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function MatchesPage() {
  const { user } = useAuthContext();
  const phone = user?.phone ?? null;
  const { data: role } = useUserRole(phone);
  const { data: matches = [], isLoading } = useMatches(phone, role ?? null);

  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState(0);

  const filtered = matches.filter(m => {
    const overallScore = m.total_score ?? m.compatibility_score;
    const nameMatch = (m.freelancer?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (m.freelancer?.skills ?? '').toLowerCase().includes(search.toLowerCase());
    const scoreMatch = overallScore >= minScore;
    return nameMatch && scoreMatch;
  });

  const avgScore = matches.length ? Math.round(matches.reduce((a, b) => a + (b.total_score ?? b.compatibility_score), 0) / matches.length) : 0;
  const highConf = matches.filter(m => (m.total_score ?? m.compatibility_score) >= 80).length;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-bold text-white mb-1">Your Matches</h1>
          <p className="text-white/40 text-sm">AI-powered compatibility matching across {matches.length} candidates</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Matches', value: matches.length, icon: Users, color: 'text-violet-400' },
            { label: 'Avg Compatibility', value: `${avgScore}%`, icon: Target, color: 'text-cyan-400' },
            { label: 'High Confidence', value: highConf, icon: Star, color: 'text-emerald-400' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center ${s.color}`}>
                  <s.icon size={16} />
                </div>
                <div>
                  <div className="font-display text-xl font-bold text-white">{s.value}</div>
                  <div className="text-xs text-white/40">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or skill..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <select
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="px-4 py-2.5 rounded-xl border border-white/[0.08] bg-[#18181b] text-sm text-white/60 outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value={0}>All scores</option>
            <option value={60}>60%+ match</option>
            <option value={80}>80%+ match</option>
            <option value={90}>90%+ match</option>
          </select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mx-auto mb-4">
              <Star className="w-8 h-8 text-violet-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">No matches found</h3>
            <p className="text-white/40 text-sm max-w-xs mx-auto">
              {matches.length === 0
                ? 'Complete your profile to start getting AI-powered matches'
                : 'Try adjusting your search or score filter'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((match, i) => (
              <motion.div key={match.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
                <MatchCard match={match} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
