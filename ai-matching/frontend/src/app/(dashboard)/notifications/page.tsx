'use client';

import { motion } from 'framer-motion';
import { Bell, Star, User, Brain, Clock, CheckCheck } from 'lucide-react';
import { useAuthContext } from '@/components/auth/auth-provider';
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '@/hooks/useNotifications';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/utils';
import { Notification } from '@/types';

const TYPE_CONFIG = {
  new_match: { icon: Star, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', label: 'New Match' },
  match_status: { icon: CheckCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Match Status' },
  profile_update: { icon: User, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20', label: 'Profile' },
  ai_recommendation: { icon: Brain, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'AI Tip' },
  deadline: { icon: Clock, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', label: 'Deadline' },
  system: { icon: Bell, color: 'text-white/50', bg: 'bg-white/5 border-white/10', label: 'System' },
};

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.system;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 cursor-pointer hover:bg-white/[0.03] ${
        notification.read ? 'border-white/[0.04] opacity-60' : `${config.bg}`
      }`}
      onClick={() => !notification.read && onRead(notification.id)}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bg} border`}>
        <Icon className={`w-4.5 h-4.5 ${config.color}`} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className={`text-sm font-medium ${notification.read ? 'text-white/50' : 'text-white'}`}>{notification.title}</p>
              <Badge variant="secondary" className="text-xs py-0">{config.label}</Badge>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">{notification.body}</p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-xs text-white/25">{formatRelativeTime(notification.created_at)}</span>
            {!notification.read && (
              <div className="w-2 h-2 rounded-full bg-violet-500" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuthContext();
  const phone = user?.phone ?? null;
  const { data: notifications = [], isLoading } = useNotifications(phone);
  const markRead = useMarkNotificationRead(phone ?? '');
  const markAll = useMarkAllRead(phone ?? '');

  const unread = notifications.filter(n => !n.read);
  const read = notifications.filter(n => n.read);

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-white mb-1">Notifications</h1>
            <p className="text-white/40 text-sm">{unread.length} unread</p>
          </div>
          {unread.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAll.mutate()} className="gap-2">
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-white/20" />
            </div>
            <h3 className="font-semibold text-white mb-2">No notifications yet</h3>
            <p className="text-white/40 text-sm">We\'ll notify you about new matches, AI tips, and profile updates.</p>
          </div>
        ) : (
          <>
            {unread.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-white/30 uppercase tracking-wider font-medium">Unread</p>
                {unread.map(n => (
                  <NotificationItem key={n.id} notification={n} onRead={(id) => markRead.mutate(id)} />
                ))}
              </div>
            )}
            {read.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-white/30 uppercase tracking-wider font-medium">Earlier</p>
                {read.slice(0, 20).map(n => (
                  <NotificationItem key={n.id} notification={n} onRead={(id) => markRead.mutate(id)} />
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
