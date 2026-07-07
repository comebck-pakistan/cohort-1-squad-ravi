'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Notification } from '@/types';

export function useNotifications(phone: string | null) {
  return useQuery({
    queryKey: ['notifications', phone],
    enabled: !!phone,
    refetchInterval: 30000,
    queryFn: async () => {
      if (!phone) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });
}

export function useMarkNotificationRead(phone: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', phone] }),
  });
}

export function useMarkAllRead(phone: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('phone', phone)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', phone] }),
  });
}
