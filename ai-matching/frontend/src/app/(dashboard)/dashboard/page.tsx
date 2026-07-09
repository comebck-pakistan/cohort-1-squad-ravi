'use client';

import { motion } from 'framer-motion';
import {
  Zap, TrendingUp, Star, Bell, ArrowUpRight, MessageCircle,
  BarChart3, Target, Brain, Sparkles, Clock, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useAuthContext } from '@/components/auth/auth-provider';
import { useFreelancerProfile, useUserRole } from '@/hooks/useProfile';
import { useMatches } from '@/hooks/useMatches';
import { useNotifications } from '@/hooks/useNotifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { calculateProfileScore, getScoreBg, parseSkills, formatRelativeTime, getWhatsAppLink } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart,
  Radar, PolarGrid, PolarAngleAxis
} from 'recharts';

const WEEKLY_DATA = [
  { day: 'Mon', matches: 2, views: 8 },
  { day: 'Tue', matches: 5, views: 15 },
  { day: 'Wed', matches: 3, views: 12 },
  { day: 'Thu', matches: 8, views: 24 },
  { day: 'Fri', matches: 6, views: 18 },
  { day: 'Sat', matches: 4, views: 10 },
  { day: 'Sun', matches: 7, views: 20 },
];

const SKILL_DEMAND = [
  { skill: 'Flutter', demand: 92 },
  { skill: 'React', demand: 88 },
  { skill: 'Node.js', demand: 75 },
  { skill: 'Python', demand: 85 },
  { skill: 'AI/ML', demand: 96 },
];

const AI_TIPS = [
  { icon: TrendingUp, text: 'Increase your rate by 15% — market demand is up', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { icon: Star, text: 'Add a portfolio link to get 3x more matches', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { icon: Brain, text: 'Flutter developers are trending — highlight this skill', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { icon: Target, text: 'Your response speed puts you in the top 20%', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function DashboardPage() {
  const { user } = useAuthContext();
  const phone = user?.phone ?? null;
  const { data: profile, isLoading: profileLoading } = useFreelancerProfile(phone);
  const { data: role } = useUserRole(phone);
  const { data: matches = [], isLoading: matchesLoading } = useMatches(phone, role ?? null);
  const { data: notifications = [] } = useNotifications(phone);

  const profileScore = profile ? calculateProfileScore(profile) : 0;
  const unread = notifications.filter(n => !n.read).length;
  const skills = parseSkills(profile?.skills ?? null);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = profile?.name ?? phone?.slice(-4) ?? 'there';

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">

        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-sm mb-1">{greeting}</p>
            <h1 className="font-display text-3xl font-bold text-white">
              {profileLoading ? <Skeleton className="h-9 w-48" /> : `${displayName} 👋`}
            </h1>
            <p className="text-white/40 text-sm mt-1">Here\'s your AI intelligence overview</p>
          </div>
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <Link href="/notifications">
                <Button variant="glass" size="sm" className="gap-2">
                  <Bell className="w-4 h-4" />
                  <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center">{unread}</span>
                </Button>
              </Link>
            )}
            <Link href="/profile">
              <Button variant="gradient" size="sm" className="gap-2">
                <Zap className="w-4 h-4" />
                Manage Profile
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Stats Row */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Profile Score', value: profileLoading ? '—' : `${profileScore}%`, icon: Target, color: 'text-violet-400', glow: 'shadow-glow' },
            { label: 'Total Matches', value: matchesLoading ? '—' : matches.length, icon: Star, color: 'text-cyan-400', glow: 'shadow-cyan' },
            { label: 'Profile Views', value: '142', icon: BarChart3, color: 'text-emerald-400', glow: '' },
            { label: 'Notifications', value: unread, icon: Bell, color: 'text-amber-400', glow: '' },
          ].map((stat) => (
            <Card key={stat.label} className="hover:shadow-card-hover transition-all duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/40 text-xs font-medium">{stat.label}</span>
                  <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center ${stat.color}`}>
                    <stat.icon size={16} />
                  </div>
                </div>
                <div className="font-display text-3xl font-bold text-white">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Profile Health */}
          <motion.div variants={fadeUp}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Profile Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profileLoading ? (
                  <div className="space-y-3">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <>
                    {/* Big score ring */}
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-display text-5xl font-black text-white">{profileScore}</div>
                        <div className="text-white/40 text-xs">/100 score</div>
                      </div>
                      <div className="w-20 h-20 rounded-full relative flex items-center justify-center">
                        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                          <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                          <circle
                            cx="40" cy="40" r="32" fill="none"
                            stroke="url(#scoreGrad)" strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 32}`}
                            strokeDashoffset={`${2 * Math.PI * 32 * (1 - profileScore / 100)}`}
                            className="transition-all duration-1000"
                          />
                          <defs>
                            <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#7c3aed" />
                              <stop offset="100%" stopColor="#06b6d4" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-bold text-white">{profileScore}%</span>
                        </div>
                      </div>
                    </div>

                    {[
                      { label: 'Name & Bio', done: !!(profile?.name), weight: 30 },
                      { label: 'Skills', done: !!(profile?.skills), weight: 20 },
                      { label: 'Portfolio', done: !!(profile?.portfolio), weight: 15 },
                      { label: 'Rate Set', done: !!(profile?.rate), weight: 10 },
                      { label: 'Availability', done: !!(profile?.availability), weight: 10 },
                      { label: 'Profile Link', done: !!(profile?.profile_link), weight: 10 },
                    ].map(item => (
                      <div key={item.label} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className={item.done ? 'text-white/70' : 'text-white/30'}>{item.label}</span>
                          <span className={item.done ? 'text-emerald-400' : 'text-white/20'}>{item.done ? '✓' : `+${item.weight}pts`}</span>
                        </div>
                        <Progress value={item.done ? 100 : 0} className="h-1" indicatorClassName={item.done ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : ''} />
                      </div>
                    ))}

                    <Link href="/profile">
                      <Button variant="outline" size="sm" className="w-full mt-2">
                        Complete Profile
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Activity Chart */}
          <motion.div variants={fadeUp} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Weekly Activity</CardTitle>
                <Badge variant="secondary" className="text-xs">Last 7 days</Badge>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={WEEKLY_DATA}>
                    <defs>
                      <linearGradient id="matchGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="viewGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#fff', fontSize: 12 }}
                      cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                    />
                    <Area type="monotone" dataKey="views" stroke="#06b6d4" strokeWidth={2} fill="url(#viewGrad)" name="Views" />
                    <Area type="monotone" dataKey="matches" stroke="#7c3aed" strokeWidth={2} fill="url(#matchGrad)" name="Matches" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Matches */}
          <motion.div variants={fadeUp} className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent Matches</CardTitle>
                <Link href="/matches">
                  <Button variant="ghost" size="sm" className="text-violet-400 text-xs gap-1">
                    View all <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {matchesLoading ? (
                  [1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)
                ) : matches.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 rounded-2xl bg-violet-600/10 flex items-center justify-center mx-auto mb-3">
                      <Star className="w-6 h-6 text-violet-400" />
                    </div>
                    <p className="text-white/40 text-sm">No matches yet</p>
                    <p className="text-white/25 text-xs mt-1">Complete your profile to start getting matches</p>
                  </div>
                ) : (
                  matches.slice(0, 4).map((match) => (
                    <Link key={match.id} href={`/matches/${match.id}`}>
                      <motion.div
                        whileHover={{ x: 4 }}
                        className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={match.freelancer?.avatar_url ?? ''} />
                          <AvatarFallback className="text-sm">
                            {(match.freelancer?.name ?? 'M')[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{match.freelancer?.name ?? 'Anonymous'}</p>
                          <p className="text-xs text-white/40 truncate">{match.freelancer?.skills ?? 'Skills not listed'}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-bold text-violet-400">{match.compatibility_score}%</div>
                            <div className="text-xs text-white/30">match</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-white/20" />
                        </div>
                      </motion.div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* AI Recommendations */}
          <motion.div variants={fadeUp}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  AI Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {AI_TIPS.map((tip, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className={`p-3 rounded-xl border border-white/[0.06] ${tip.bg} flex items-start gap-3`}
                  >
                    <div className={`w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 ${tip.color}`}>
                      <tip.icon size={14} />
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed">{tip.text}</p>
                  </motion.div>
                ))}
                <Link href="/insights">
                  <Button variant="outline" size="sm" className="w-full mt-1">
                    Full AI Insights
                    <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Skill Demand */}
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Skill Market Demand</CardTitle>
              <Badge variant="cyan" className="text-xs">Live data</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {SKILL_DEMAND.map((item) => (
                  <div key={item.skill} className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60 font-medium">{item.skill}</span>
                      <span className="text-white/40">{item.demand}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.demand}%` }}
                        transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* WhatsApp CTA */}
        <motion.div variants={fadeUp}>
          <div className="glass-card p-6 flex items-center justify-between gap-4 border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Update your profile via WhatsApp</p>
                <p className="text-xs text-white/40">Say \"edit my rate\" or \"update my skills\" to our bot</p>
              </div>
            </div>
            <a href="https://wa.me/923001234567" target="_blank" rel="noopener noreferrer">
              <Button variant="whatsapp" size="sm" className="gap-2 flex-shrink-0">
                <MessageCircle className="w-4 h-4" />
                Open WhatsApp
              </Button>
            </a>
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
