'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { FreelancerProfile, ClientProfile, ConversationRecord } from '@/types';
import { calculateProfileScore } from '@/lib/utils';

export function useFreelancerProfile(phone: string | null) {
  return useQuery({
    queryKey: ['freelancer', phone],
    enabled: !!phone,
    queryFn: async () => {
      if (!phone) return null;
      const { data, error } = await supabase
        .from('freelancers')
        .select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as FreelancerProfile | null;
    },
  });
}

export function useClientProfile(phone: string | null) {
  return useQuery({
    queryKey: ['client', phone],
    enabled: !!phone,
    queryFn: async () => {
      if (!phone) return null;
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('phone', phone)
        .eq('role', 'client')
        .order('id', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;
      const td = data.temp_data as Record<string, unknown> | null;
      return {
        id: data.id,
        phone: data.phone,
        name: td?.name as string ?? null,
        project_description: td?.project_description as string ?? null,
        hire_type: td?.hire_type as 'full-time' | 'project-based' ?? null,
        budget_hourly: td?.budget_hourly as string ?? null,
        budget_project: td?.budget_project as string ?? null,
        project_count: td?.project_count as number ?? null,
        deadline: td?.deadline as string ?? null,
        deadline_date: td?.deadline_date as string ?? null,
        contact_sharing_allowed: td?.contact_sharing_allowed as boolean ?? null,
        role: 'client' as const,
        created_at: data.updated_at,
        updated_at: data.updated_at,
      } satisfies ClientProfile;
    },
  });
}

export function useUserRole(phone: string | null) {
  return useQuery({
    queryKey: ['userRole', phone],
    enabled: !!phone,
    queryFn: async () => {
      if (!phone) return null;
      const { data } = await supabase
        .from('conversations')
        .select('role')
        .eq('phone', phone)
        .order('id', { ascending: false })
        .limit(1)
        .single();
      return (data?.role as 'freelancer' | 'client' | null) ?? null;
    },
  });
}

export function useUpdateFreelancerProfile(phone: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields: Partial<FreelancerProfile>) => {
      const { error } = await supabase
        .from('freelancers')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('phone', phone);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['freelancer', phone] }),
  });
}

export function useProfileScore(phone: string | null) {
  const { data: profile } = useFreelancerProfile(phone);
  if (!profile) return 0;
  return calculateProfileScore(profile);
}
