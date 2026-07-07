import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ProfileCompletionField, FreelancerProfile } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export function getProfileCompletionFields(profile: Partial<FreelancerProfile>): ProfileCompletionField[] {
  return [
    { key: 'name', label: 'Full Name', completed: !!profile.name, weight: 15 },
    { key: 'bio', label: 'Bio', completed: !!profile.bio, weight: 15 },
    { key: 'skills', label: 'Skills', completed: !!profile.skills, weight: 20 },
    { key: 'rate', label: 'Hourly Rate', completed: !!profile.rate, weight: 10 },
    { key: 'portfolio', label: 'Portfolio', completed: !!profile.portfolio, weight: 15 },
    { key: 'availability', label: 'Availability', completed: !!profile.availability, weight: 10 },
    { key: 'profile_link', label: 'LinkedIn/Profile', completed: !!profile.profile_link, weight: 10 },
    { key: 'avatar_url', label: 'Profile Photo', completed: !!profile.avatar_url, weight: 5 },
  ];
}

export function calculateProfileScore(profile: Partial<FreelancerProfile>): number {
  const fields = getProfileCompletionFields(profile);
  return fields.reduce((acc, f) => acc + (f.completed ? f.weight : 0), 0);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-violet-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

export function getScoreBg(score: number): string {
  if (score >= 80) return 'from-emerald-500 to-teal-500';
  if (score >= 60) return 'from-violet-500 to-purple-500';
  if (score >= 40) return 'from-amber-500 to-orange-500';
  return 'from-red-500 to-rose-500';
}

export function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

export function parseSkills(skills: string | null): string[] {
  if (!skills) return [];
  return skills.split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
}

export function getWhatsAppLink(phone?: string, message?: string): string {
  const cleanPhone = phone ? phone.replace(/\D/g, '') : '923001234567';
  const text = encodeURIComponent(message || 'Hi! I found your profile on AI Matchmaker.');
  return `https://wa.me/${cleanPhone}?text=${text}`;
}

export function getBotWhatsAppLink(): string {
  return `https://wa.me/923001234567?text=${encodeURIComponent('Hi')}`;
}
