import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Service role key bypasses RLS entirely - same as the n8n Supabase credential did.
export const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// --- Equivalent of "Search Conversations" node ---
// Returns the most recent conversation row for a phone number, or null.
export async function findConversation(phone) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('phone', phone)
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('findConversation error:', error);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

// --- Equivalent of "Search Freelancers" node ---
export async function findFreelancer(phone) {
  const { data, error } = await supabase
    .from('freelancers')
    .select('*')
    .eq('phone', phone)
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('findFreelancer error:', error);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

// --- Equivalent of "Upsert/Create Conversation" nodes + the "If" branch ---
// Updates by id if the row already exists, otherwise inserts a new row.
export async function saveConversation({ id, phone, role, step, temp_data }) {
  const row = {
    phone,
    role,
    step,
    temp_data,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase.from('conversations').update(row).eq('id', id);
    if (error) console.error('saveConversation (update) error:', error);
  } else {
    const { error } = await supabase.from('conversations').insert(row);
    if (error) console.error('saveConversation (insert) error:', error);
  }
}

// --- Equivalent of "Delete Conversations" + "Delete Freelancers" (reset command) ---
export async function resetUser(phone) {
  await supabase.from('conversations').delete().eq('phone', phone);
  await supabase.from('freelancers').delete().eq('phone', phone);
}

// --- Equivalent of "Save Freelancer Profile" node ---
export async function saveFreelancerProfile(phone, data) {
  const row = {
    phone,
    name: data.name || null,
    profile_link: data.profile_link || null,
    portfolio: data.portfolio || null,
    skills: data.skills || null,
    tools: data.tools || null,
    rate: data.rate || null,
    availability: data.availability || null,
    preferences: data.preferences || null,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('freelancers').insert(row);
  if (error) console.error('saveFreelancerProfile error:', error);
}
