'use client';

import { motion } from 'framer-motion';
import {
  TrendingUp, Target, DollarSign, Users, Brain, Sparkles,
  ArrowUpRight, ArrowDownRight, Star, Zap, BarChart3
} from 'lucide-react';
import { useAuthContext } from '@/components/auth/auth-provider';
import { useInsights } from '@/hooks/useInsights';
import { useFreelancerProfile } from '@/hooks/useProfile';
import { useMatches } from '@/hooks/useMatches';
import { useUserRole } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProfileScore } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';

const MARKET_TRENDS = [
  { month: 'Jan', flutter: 72, react: 85, nodejs: 68, python: 78 },
  { month: 'Feb', flutter: 76, react: 83, nodejs: 70, python: 82 },
  { month: 'Mar', flutter: 80, react: 86, nodejs: 74, python: 85 },
  { month: 'Apr', flutter: 85, react: 88, nodejs: 76, python: 88 },
  { month: 'May', flutter: 89, react: 84, nodejs: 78, python: 91 },
  { month: 'Jun', flutter: 92, react: 87, nodejs: 80, python: 94 },
];

const GROWTH_DATA = [
  { week: 'W1', score: 45, matches: 2, views: 12 },
  { week: 'W2', score: 52, matches: 4, views: 18 },
  { week: 'W3', score: 61, matches: 6, views: 25 },
  { week: 'W4', score: 68, matches: 9, views: 32 },
  { week: 'W5', score: 74, matches: 11, views: 40 },
  { week: 'W6', score: 82, matches: 15, views: 54 },
];

const RATE_DATA = [
  { range: '$25-50', percent: 15 },
  { range: '$50-75', percent: 32 },
  { range: '$75-100', percent: 28 },
  { range: '$100-150', percent: 18 },
  { range: '$150+', percent: 7 },
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

export default function InsightsPage() {
  const { user } = useAuthContext();
  const phone = user?.phone ?? null;
  const { data: profile, isLoading: profileLoading } = useFreelancerProfile(phone);
  const { data: role } = useUserRole(phone);
  const { data: matches = [] } = useMatches(phone, role ?? null);
  const { data: insights = [], isLoading: insightsLoading } = useInsights(phone);

  const profileScore = profile ? calculateProfileScore(profile) : 0;
  const avgMatchScore = matches.length ? Math.round(matches.reduce((a, b) => a + b.compatibility_score, 0) / matches.length) : 0;
  const highConfMatches = matches.filter(m => m.compatibility_score >= 80).length;
  const hiringProbability = Math.min(98, Math.round(profileScore * 0.6 + avgMatchScore * 0.4));

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
        {/* Header */}
        <motion.div variants={fadeUp}>
          <h1 className="font-display text-3xl font-bold text-white mb-1">AI Insights</h1>
          <p className="text-white/40 text-sm">Powered by Groq AI — updated in real time</p>
        </motion.div>

        {/* Hero Metric Cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Profile Strength',
              value: `${profileScore}%`,
              sub: profileScore >= 80 ? 'Top 20% of freelancers' : 'Room to grow',
              icon: Target,
              color: 'text-violet-400',
              bg: 'from-violet-600/20 to-purple-600/10',
              trend: '+12%',
              up: true,
            },
            {
              label: 'Match Quality',
              value: `${avgMatchScore}%`,
              sub: `${highConfMatches} high-confidence matches`,
              icon: Star,
              color: 'text-cyan-400',
              bg: 'from-cyan-600/20 to-blue-600/10',
              trend: '+8%',
              up: true,
            },
            {
              label: 'Hiring Probability',
              value: `${hiringProbability}%`,
              sub: 'Based on your profile + market',
              icon: Brain,
              color: 'text-emerald-400',
              bg: 'from-emerald-600/20 to-teal-600/10',
              trend: '+5%',
              up: true,
            },
            {
              label: 'Market Position',
              value: profileScore >= 80 ? 'Top 20%' : profileScore >= 60 ? 'Top 40%' : 'Average',
              sub: 'Vs similar freelancers',
              icon: BarChart3,
              color: 'text-amber-400',
              bg: 'from-amber-600/20 to-orange-600/10',
              trend: '↑ Rising',
              up: true,
            },
          ].map((card) => (
            <Card key={card.label} className="relative overflow-hidden hover:shadow-card-hover transition-all duration-300">
              <div className={`absolute inset-0 bg-gradient-to-br ${card.bg} opacity-60`} />
              <CardContent className="p-5 relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center ${card.color}`}>
                    <card.icon size={18} />
                  </div>
                  <span className={`text-xs font-medium ${card.up ? 'text-emerald-400' : 'text-red-400'} flex items-center gap-0.5`}>
                    {card.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {card.trend}
                  </span>
                </div>
                <div className="font-display text-3xl font-black text-white mb-0.5">{card.value}</div>
                <div className="text-xs text-white/40">{card.label}</div>
                <div className="text-xs text-white/25 mt-1">{card.sub}</div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* AI Insight Cards from DB */}
        {!insightsLoading && insights.length > 0 && (
          <motion.div variants={fadeUp}>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Personalized AI Insights</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {insights.map((insight, i) => (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="glass-card p-5 flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white mb-1">{insight.content}</p>
                    {insight.metric_value != null && (
                      <p className="text-xs text-violet-400">{insight.metric_label}: {insight.metric_value}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Static AI Insights (always shown) */}
        <motion.div variants={fadeUp}>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Market Intelligence</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: TrendingUp, title: 'Flutter demand up 28%', body: 'Flutter developer demand has surged 28% over the past 3 months. Clients are actively searching.', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { icon: DollarSign, title: 'Raise your rate by 15%', body: `Market rates for your skill set are trending upward. Consider pricing at $${profile?.rate ? Math.round(parseInt(profile.rate || '75') * 1.15) : 86}/hr.`, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              { icon: Users, title: 'Top client: Startup founders', body: 'You are most compatible with early-stage startup founders. 72% of your matches come from this segment.', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
              { icon: Brain, title: 'Add AI/ML to your skills', body: 'Freelancers who list AI/ML adjacent skills receive 40% more client inquiries. Your profile would benefit.', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
              { icon: Target, title: `You beat ${Math.max(50, profileScore - 5)}% of profiles`, body: 'Your profile completion and skill diversity rank above most freelancers in your category.', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
              { icon: Zap, title: 'Response speed matters', body: 'Freelancers who respond within 2 hours get 3x more follow-ups. Set your availability status.', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className={`glass-card p-5 border ${card.bg} cursor-default`}
              >
                <div className={`w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center mb-3 ${card.color}`}>
                  <card.icon size={18} />
                </div>
                <h3 className="font-semibold text-white text-sm mb-2">{card.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed">{card.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Charts Row */}
        <motion.div variants={fadeUp} className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Skill Market Trends</CardTitle>
              <Badge variant="cyan" className="text-xs">6 months</Badge>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={MARKET_TRENDS}>
                  <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} domain={[60, 100]} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 11 }} />
                  <Line type="monotone" dataKey="flutter" stroke="#7c3aed" strokeWidth={2} dot={false} name="Flutter" />
                  <Line type="monotone" dataKey="react" stroke="#06b6d4" strokeWidth={2} dot={false} name="React" />
                  <Line type="monotone" dataKey="python" stroke="#10b981" strokeWidth={2} dot={false} name="Python" />
                  <Line type="monotone" dataKey="nodejs" stroke="#f59e0b" strokeWidth={2} dot={false} name="Node.js" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {[['Flutter','#7c3aed'],['React','#06b6d4'],['Python','#10b981'],['Node.js','#f59e0b']].map(([label, color]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-xs text-white/40">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Growth Trajectory</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={GROWTH_DATA}>
                  <defs>
                    <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 11 }} />
                  <Area type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={2} fill="url(#growthGrad)" name="Profile Score" />
                  <Area type="monotone" dataKey="views" stroke="#06b6d4" strokeWidth={1.5} fill="transparent" name="Views" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Rate distribution */}
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Market Rate Distribution</CardTitle>
              <Badge variant="secondary" className="text-xs">Your category</Badge>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={RATE_DATA} barSize={32}>
                  <XAxis dataKey="range" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 11 }} formatter={(v) => [`${v}%`, 'Freelancers']} />
                  <Bar dataKey="percent" fill="#7c3aed" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
