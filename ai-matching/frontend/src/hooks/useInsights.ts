'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Insight } from '@/types';

export function useInsights(phone: string | null) {
  return useQuery({
    queryKey: ['insights', phone],
    enabled: !!phone,
    queryFn: async () => {
      if (!phone) return [];
      const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('phone', phone)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Insight[];
    },
  });
}
