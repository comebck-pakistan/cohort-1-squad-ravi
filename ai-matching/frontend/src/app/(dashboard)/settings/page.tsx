'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Moon, Sun, Bell, Globe, Shield, User, LogOut, ChevronRight,
  Smartphone, Mail, Lock, Trash2, Download
} from 'lucide-react';
import { useAuthContext } from '@/components/auth/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function SettingsPage() {
  const { user, signOut } = useAuthContext();
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState({
    matches: true,
    aiTips: true,
    profileUpdates: false,
    deadlines: true,
  });

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
    toast.success('Signed out successfully');
  };

  const SettingRow = ({ icon: Icon, label, description, children, danger = false }: {
    icon: React.ElementType; label: string; description?: string; children: React.ReactNode; danger?: boolean;
  }) => (
    <div className="flex items-center gap-4 p-4 rounded-xl hover:bg-white/[0.02] transition-all group">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
        danger ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5'
      }`}>
        <Icon className={`w-4 h-4 ${danger ? 'text-red-400' : 'text-white/40'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
        {description && <p className="text-xs text-white/35 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUp}>
          <h1 className="font-display text-3xl font-bold text-white mb-1">Settings</h1>
          <p className="text-white/40 text-sm">Manage your account and preferences</p>
        </motion.div>

        {/* Account */}
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-white/40" /> Account</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <SettingRow icon={Smartphone} label="Phone Number" description="Your WhatsApp identity">
                <Badge variant="secondary" className="text-xs">{user?.phone ?? '—'}</Badge>
              </SettingRow>
              <SettingRow icon={Shield} label="Authentication" description="Phone OTP via SMS">
                <Badge variant="success" className="text-xs">Verified</Badge>
              </SettingRow>
            </CardContent>
          </Card>
        </motion.div>

        {/* Appearance */}
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sun className="w-4 h-4 text-white/40" /> Appearance</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <SettingRow icon={darkMode ? Moon : Sun} label="Dark Mode" description="Currently using dark theme">
                <Switch
                  checked={darkMode}
                  onCheckedChange={(v) => {
                    setDarkMode(v);
                    toast.info(v ? 'Dark mode enabled' : 'Light mode enabled');
                  }}
                />
              </SettingRow>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications */}
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4 text-white/40" /> Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <SettingRow icon={Bell} label="New Matches" description="When AI finds a new match for you">
                <Switch checked={notifications.matches} onCheckedChange={v => setNotifications(prev => ({ ...prev, matches: v }))} />
              </SettingRow>
              <SettingRow icon={Bell} label="AI Tips" description="Career and profile improvement suggestions">
                <Switch checked={notifications.aiTips} onCheckedChange={v => setNotifications(prev => ({ ...prev, aiTips: v }))} />
              </SettingRow>
              <SettingRow icon={Bell} label="Profile Updates" description="When your profile data changes">
                <Switch checked={notifications.profileUpdates} onCheckedChange={v => setNotifications(prev => ({ ...prev, profileUpdates: v }))} />
              </SettingRow>
              <SettingRow icon={Bell} label="Deadline Reminders" description="For upcoming project deadlines">
                <Switch checked={notifications.deadlines} onCheckedChange={v => setNotifications(prev => ({ ...prev, deadlines: v }))} />
              </SettingRow>
            </CardContent>
          </Card>
        </motion.div>

        {/* Privacy */}
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-white/40" /> Privacy</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <SettingRow icon={Globe} label="Profile Visibility" description="Your profile is visible to matched clients">
                <Badge variant="success" className="text-xs">Public</Badge>
              </SettingRow>
              <SettingRow icon={Download} label="Export My Data" description="Download all your profile data">
                <Button variant="outline" size="sm" onClick={() => toast.info('Data export coming soon')}>Export</Button>
              </SettingRow>
              <SettingRow icon={Lock} label="Data Encryption" description="All data is encrypted at rest">
                <Badge variant="success" className="text-xs">✓ Secure</Badge>
              </SettingRow>
            </CardContent>
          </Card>
        </motion.div>

        {/* Danger Zone */}
        <motion.div variants={fadeUp}>
          <Card className="border-red-500/20">
            <CardHeader><CardTitle className="text-base text-red-400">Danger Zone</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <SettingRow icon={LogOut} label="Sign Out" description="Sign out of AI Matchmaker" danger>
                <Button variant="destructive" size="sm" onClick={handleSignOut}>Sign Out</Button>
              </SettingRow>
              <SettingRow icon={Trash2} label="Delete Account" description="Permanently delete your account and data" danger>
                <Button variant="destructive" size="sm" onClick={() => toast.error('Please contact support to delete your account')}>Delete</Button>
              </SettingRow>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp} className="text-center">
          <p className="text-xs text-white/20">AI Matchmaker v1.0.0 • Built with ♥</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
