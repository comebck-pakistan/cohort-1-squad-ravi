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

export async function findJobRequest(phone) {
  const { data, error } = await supabase
    .from('job_requests')
    .select('*')
    .eq('phone', phone)
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('findJobRequest error:', error);
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
// Full wipe: profile, job, conversation, AND any match rows tied to this phone.
export async function resetUser(phone) {
  await supabase.from('conversations').delete().eq('phone', phone);
  await supabase.from('freelancers').delete().eq('phone', phone);
  await supabase.from('job_requests').delete().eq('phone', phone);

  // Cancel any matches where this phone appears on either side
  await supabase
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('freelancer_phone', phone)
    .in('status', ['pending', 'awaiting_response', 'awaiting_other', 'connected']);

  await supabase
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('job_phone', phone)
    .in('status', ['pending', 'awaiting_response', 'awaiting_other', 'connected']);
}

// --- Save / upsert a completed freelancer profile ---
// Writes ALL collected fields into the `freelancers` table.
// Uses upsert (conflict on `phone`) so re-runs are safe and don't duplicate rows.
export async function saveFreelancerProfile(phone, data) {
  const row = {
    phone,
    name:              data.name              || null,
    profile_link:      data.profile_link      || null,
    portfolio:         data.portfolio         || null,
    skills:            data.skills            || null,
    tools:             data.tools             || null,
    rate:              data.rate              || null,
    availability:      data.availability      || null,
    preferences:       data.preferences       || null,
    brief_description: data.brief_description || null,
    status:            'active',
    is_available:      true,
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
    is_available:        true,
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

// --- Fetch active freelancers (status = 'active') for matching ---
export async function getActiveFreelancers() {
  const { data, error } = await supabase
    .from('freelancers')
    .select('*')
    .eq('status', 'active')
    .eq('is_available', true);

  if (error) {
    console.error('[supabase] getActiveFreelancers error:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

// --- Fetch active job requests (status = 'active') for matching ---
export async function getActiveJobRequests() {
  const { data, error } = await supabase
    .from('job_requests')
    .select('*')
    .eq('status', 'active')
    .eq('is_available', true);

  if (error) {
    console.error('[supabase] getActiveJobRequests error:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

// --- Fetch declined pairs to exclude from matching ---
export async function getDeclinedPairs() {
  const { data, error } = await supabase
    .from('declined_pairs')
    .select('freelancer_phone, job_phone, job_description_hash');

  if (error) {
    console.error('[supabase] getDeclinedPairs error:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

// --- Insert a single match result (new schema with batch/rank) ---
export async function insertMatch(row) {
  const { data, error } = await supabase
    .from('matches')
    .insert(row)
    .select();

  if (error) {
    console.error('[supabase] insertMatch FAILED:', JSON.stringify(error));
    return null;
  }
  console.log('[supabase] insertMatch OK — id:', data?.[0]?.id);
  return data?.[0] || null;
}

// --- Update match status ---
export async function updateMatchStatus(matchId, updates) {
  const { error } = await supabase
    .from('matches')
    .update(updates)
    .eq('id', matchId);

  if (error) {
    console.error('[supabase] updateMatchStatus FAILED:', JSON.stringify(error));
  }
}

// --- Get matches by batch_id ---
export async function getMatchesByBatch(batchId) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('batch_id', batchId)
    .order('rank', { ascending: true });

  if (error) {
    console.error('[supabase] getMatchesByBatch error:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

// --- Get active/pending matches for a phone (any role) ---
export async function getActiveMatchesForPhone(phone) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .or(`job_phone.eq.${phone},freelancer_phone.eq.${phone}`)
    .in('status', ['pending', 'awaiting_response', 'accepted', 'awaiting_other']);

  if (error) {
    console.error('[supabase] getActiveMatchesForPhone error:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

// --- Get all live (non-declined) matches for a phone (any role) ---
// Includes connected matches, unlike getActiveMatchesForPhone.
export async function getAllLiveMatchesForPhone(phone) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .or(`job_phone.eq.${phone},freelancer_phone.eq.${phone}`)
    .in('status', ['pending', 'awaiting_response', 'awaiting_other', 'connected'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[supabase] getAllLiveMatchesForPhone error:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

// --- Update user status (freelancer or job_request) ---
export async function updateUserStatus(phone, role, status) {
  const table = role === 'freelancer' ? 'freelancers' : 'job_requests';
  const { error } = await supabase
    .from(table)
    .update({ status })
    .eq('phone', phone);

  if (error) {
    console.error(`[supabase] updateUserStatus (${table}) FAILED:`, JSON.stringify(error));
  } else {
    console.log(`[supabase] updateUserStatus — ${phone} → ${status}`);
  }
}

// --- Set is_available flag for a freelancer or job_request ---
export async function setAvailability(phone, role, isAvailable) {
  const table = role === 'freelancer' ? 'freelancers' : 'job_requests';
  const { error } = await supabase
    .from(table)
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq('phone', phone);

  if (error) {
    console.error(`[supabase] setAvailability (${table}, ${phone}) FAILED:`, JSON.stringify(error));
  } else {
    console.log(`[supabase] setAvailability — ${phone} (${table}) → ${isAvailable}`);
  }
}

