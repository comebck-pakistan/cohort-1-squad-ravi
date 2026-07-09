'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Match } from '@/types';

export function useMatches(phone: string | null, role: 'freelancer' | 'client' | null) {
  return useQuery({
    queryKey: ['matches', phone, role],
    enabled: !!phone && !!role,
    queryFn: async () => {
      if (!phone || !role) return [];
      const field = role === 'freelancer' ? 'freelancer_phone' : 'client_phone';
      const { data, error } = await supabase
        .from('matches')
        .select('*, freelancer:freelancers(*)')
        .eq(field, phone)
        .order('total_score', { ascending: false, nullsFirst: false })
        .order('compatibility_score', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Match[];
    },
  });
}

export function useMatchById(id: string | null) {
  return useQuery({
    queryKey: ['match', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('matches')
        .select('*, freelancer:freelancers(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Match;
    },
  });
}
