'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, User, Star, Lightbulb, Bell, Settings,
  Zap, LogOut, ChevronRight, Menu, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/profile', label: 'My Profile', icon: User },
  { href: '/matches', label: 'Matches', icon: Star },
  { href: '/insights', label: 'AI Insights', icon: Lightbulb },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuthContext();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="hidden md:flex flex-col h-screen sticky top-0 border-r border-white/[0.06] bg-[#08090a] z-40 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/[0.06]">
        <motion.div animate={{ opacity: collapsed ? 0 : 1 }} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-white text-lg">AI Match</span>
        </motion.div>
        {collapsed && (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center mx-auto">
            <Zap className="w-4 h-4 text-white" />
          </div>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => setCollapsed(!collapsed)} className="ml-auto">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 2 }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer',
                  active
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/20'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className={cn('w-4.5 h-4.5 flex-shrink-0', active ? 'text-violet-400' : '')} size={18} />
                <motion.span animate={{ opacity: collapsed ? 0 : 1 }} className="whitespace-nowrap">
                  {item.label}
                </motion.span>
                {active && !collapsed && (
                  <motion.div layoutId="nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      {!collapsed && (
        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white text-xs font-bold">
              {user?.phone?.slice(-2) ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.phone ?? 'User'}</p>
              <p className="text-xs text-white/40">Logged in</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-white/50 hover:text-red-400" onClick={signOut}>
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>
      )}
    </motion.aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { signOut } = useAuthContext();

  return (
    <>
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#08090a] sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-display font-bold text-white">AI Match</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
      </header>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 md:hidden"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30 }}
            className="absolute left-0 top-0 bottom-0 w-72 bg-[#111114] border-r border-white/[0.06] p-4"
          >
            <div className="flex items-center justify-between mb-6">
              <span className="font-display font-bold text-white text-lg">AI Matchmaker</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
            <nav className="space-y-1">
              {nav.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                    <div className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                      active ? 'bg-violet-600/20 text-violet-300' : 'text-white/50'
                    )}>
                      <Icon size={18} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-8 left-4 right-4">
              <Button variant="ghost" className="w-full justify-start text-white/50 hover:text-red-400" onClick={signOut}>
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
