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
  await supabase.from('job_requests').delete().eq('phone', phone);
}

// --- Save / upsert a completed freelancer profile ---
// Only writes the 4 columns that actually exist in the `freelancers` table.
// Uses upsert (conflict on `phone`) so re-runs are safe and don't duplicate rows.
export async function saveFreelancerProfile(phone, data) {
  const row = {
    phone,
    name:              data.name              || null,
    profile_link:      data.profile_link      || null,
    brief_description: data.brief_description || null,
  };

  console.log('[supabase] saveFreelancerProfile — upserting row:', JSON.stringify(row));

  const { data: upserted, error } = await supabase
    .from('freelancers')
    .upsert(row, { onConflict: 'phone' })
    .select();

  if (error) {
    console.error('[supabase] saveFreelancerProfile FAILED:', JSON.stringify(error));
  } else {
    console.log('[supabase] saveFreelancerProfile OK — row id:', upserted?.[0]?.id);
  }
}

// --- Save / upsert a completed client job request ---
// Writes all client-collected fields into the `job_requests` table.
// Uses upsert (conflict on `phone`) so re-runs are safe.
export async function saveJobRequest(phone, data) {
  const row = {
    phone,
    name:                data.name                || null,
    project_description: data.project_description || null,
    hire_type:           data.hire_type           || null,
    budget_project:      data.budget_project       || null,
    budget_hourly:       data.budget_hourly        || null,
    project_count:       data.project_count        || null,
    deadline:            data.deadline             || null,
    deadline_normalized: data.deadline_normalized  || null,
    is_recurring:        data.is_recurring         ?? null,
    brief_description:   data.brief_description    || null,
  };

  console.log('[supabase] saveJobRequest — upserting row:', JSON.stringify(row));

  const { data: upserted, error } = await supabase
    .from('job_requests')
    .upsert(row, { onConflict: 'phone' })
    .select();

  if (error) {
    console.error('[supabase] saveJobRequest FAILED:', JSON.stringify(error));
  } else {
    console.log('[supabase] saveJobRequest OK — row id:', upserted?.[0]?.id);
  }
}

// --- Updates a single field for an already-completed freelancer ---
export async function updateFreelancerField(phone, field, value) {
  const { error } = await supabase
    .from('freelancers')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('phone', phone);
  if (error) console.error(`[supabase] updateFreelancerField (${field}) error:`, JSON.stringify(error));
}
