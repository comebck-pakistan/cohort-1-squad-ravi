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

export async function getInactiveIncompleteConversations({ staleBefore, limit = 25 }) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .neq('step', 'completed')
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[supabase] getInactiveIncompleteConversations FAILED:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

export async function markRegistrationReminderSent(conversation) {
  const tempData = {
    ...(conversation.temp_data || {}),
    registration_reminder_sent_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('conversations')
    .update({
      temp_data: tempData,
      updated_at: conversation.updated_at,
    })
    .eq('id', conversation.id);

  if (error) console.error('[supabase] markRegistrationReminderSent FAILED:', JSON.stringify(error));
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
  // Matches reference freelancers/job_requests by phone — clear them first so
  // the reset also works on databases without ON DELETE CASCADE.
  await supabase.from('matches').delete().or(`freelancer_phone.eq.${phone},client_phone.eq.${phone}`);
  await supabase.from('notifications').delete().eq('phone', phone);
  await supabase.from('insights').delete().eq('phone', phone);
  await supabase.from('vetting_checks').delete().eq('phone', phone);
  await supabase.from('conversations').delete().eq('phone', phone);
  await supabase.from('freelancers').delete().eq('phone', phone);
  await supabase.from('job_requests').delete().eq('phone', phone);
}

// --- Save / upsert a completed freelancer profile ---
// Writes every field the onboarding flow collects — matching depends on
// skills/rate/availability being present in the permanent table.
// Uses upsert (conflict on `phone`) so re-runs are safe and don't duplicate rows.
export async function saveFreelancerProfile(phone, data) {
  const row = {
    phone,
    name:              data.name              || null,
    profile_link:      data.linkedin_url      || data.cv_url || data.profile_link || null,
    linkedin_url:      data.linkedin_url      || null,
    github_url:        data.github_url        || null,
    cv_url:            data.cv_url            || null,
    support_docs:      data.support_docs      || null,
    portfolio:         data.portfolio         || null,
    skills:            data.skills            || null,
    tools:             data.tools             || null,
    rate:              data.rate              || null,
    availability:      data.availability      || null,
    preferences:       data.preferences       || null,
    working_currently: data.working_currently ?? null,
    contact_sharing_allowed: data.contact_sharing_allowed ?? null,
    brief_description: data.brief_description || null,
    updated_at:        new Date().toISOString(),
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
    hiring_currently:    data.hiring_currently     ?? null,
    contact_sharing_allowed: data.contact_sharing_allowed ?? null,
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

// --- Reads used by the matching engine ---
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

export async function getAllFreelancers() {
  const { data, error } = await supabase.from('freelancers').select('*');
  if (error) {
    console.error('getAllFreelancers error:', error);
    return [];
  }
  return data || [];
}

export async function getAllJobRequests() {
  const { data, error } = await supabase.from('job_requests').select('*');
  if (error) {
    console.error('getAllJobRequests error:', error);
    return [];
  }
  return data || [];
}

// --- Writes used by the matching engine ---
// Upserts on (freelancer_phone, client_phone) so re-running matching after a
// profile edit refreshes scores instead of duplicating rows.
export async function upsertMatches(rows) {
  if (!rows || rows.length === 0) return [];
  const { data, error } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: 'freelancer_phone,client_phone' })
    .select();
  if (error) {
    console.error('[supabase] upsertMatches FAILED:', JSON.stringify(error));
    return [];
  }
  console.log(`[supabase] upsertMatches OK — ${data?.length ?? 0} row(s)`);
  return data || [];
}

export async function getRankedMatchesForPhone(phone, role) {
  const field = role === 'freelancer' ? 'freelancer_phone' : 'client_phone';
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq(field, phone)
    .order('total_score', { ascending: false, nullsFirst: false })
    .order('compatibility_score', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[supabase] getRankedMatchesForPhone FAILED:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

export async function findMatchById(id) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('[supabase] findMatchById FAILED:', JSON.stringify(error));
    return null;
  }
  return data;
}

export async function updateMatchLifecycle(id, patch) {
  const { data, error } = await supabase
    .from('matches')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[supabase] updateMatchLifecycle FAILED:', JSON.stringify(error));
    return null;
  }
  return data;
}

export async function upsertMatchFeedback(row) {
  const stamped = {
    ...row,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('match_feedback')
    .upsert(stamped, { onConflict: 'match_id,phone' })
    .select()
    .single();
  if (error) {
    console.error('[supabase] upsertMatchFeedback FAILED:', JSON.stringify(error));
    return null;
  }
  return data;
}

export async function findPendingContactRequest({ matchId, requesterPhone, targetPhone }) {
  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('match_id', matchId)
    .eq('requester_phone', requesterPhone)
    .eq('target_phone', targetPhone)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[supabase] findPendingContactRequest FAILED:', JSON.stringify(error));
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

export async function findLatestPendingContactApproval(targetPhone) {
  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('target_phone', targetPhone)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[supabase] findLatestPendingContactApproval FAILED:', JSON.stringify(error));
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

export async function getPendingContactRequestsForTarget(targetPhone) {
  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('target_phone', targetPhone)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[supabase] getPendingContactRequestsForTarget FAILED:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

export async function createContactRequest(row) {
  const { data, error } = await supabase
    .from('contact_requests')
    .insert(row)
    .select()
    .single();
  if (error) {
    console.error('[supabase] createContactRequest FAILED:', JSON.stringify(error));
    return null;
  }
  return data;
}

export async function updateContactRequestStatus(id, status) {
  const { data, error } = await supabase
    .from('contact_requests')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[supabase] updateContactRequestStatus FAILED:', JSON.stringify(error));
    return null;
  }
  return data;
}

export async function insertNotifications(rows) {
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) console.error('[supabase] insertNotifications FAILED:', JSON.stringify(error));
}

// Insights are a snapshot, not a log — replace the user's old rows each time
// they're regenerated so the dashboard never shows stale duplicates.
export async function replaceInsights(phone, rows) {
  const { error: delError } = await supabase.from('insights').delete().eq('phone', phone);
  if (delError) console.error('[supabase] replaceInsights delete FAILED:', JSON.stringify(delError));
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from('insights').insert(rows);
  if (error) console.error('[supabase] replaceInsights insert FAILED:', JSON.stringify(error));
}

// --- Vetting checks are replaced per full run or per single artifact re-vet ---
export async function replaceVettingChecks(phone, rows, artifact = null) {
  let query = supabase.from('vetting_checks').delete().eq('phone', phone);
  if (artifact) query = query.eq('artifact', artifact);

  const { error: delError } = await query;
  if (delError) console.error('[supabase] replaceVettingChecks delete FAILED:', JSON.stringify(delError));

  if (!rows || rows.length === 0) return [];

  const stamped = rows.map((row) => ({
    phone,
    artifact: row.artifact,
    check_type: row.check_type,
    status: row.status,
    evidence: row.evidence || {},
  }));

  const { data, error } = await supabase
    .from('vetting_checks')
    .insert(stamped)
    .select();

  if (error) {
    console.error('[supabase] replaceVettingChecks insert FAILED:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

export async function getVettingChecks(phone) {
  const { data, error } = await supabase
    .from('vetting_checks')
    .select('*')
    .eq('phone', phone);
  if (error) {
    console.error('[supabase] getVettingChecks FAILED:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

export async function updateFreelancerTrust(phone, { trust_score, trust_tier, trust_breakdown, vetted_at }) {
  const row = {
    trust_score: trust_score ?? null,
    trust_tier: trust_tier || null,
    trust_breakdown: trust_breakdown || null,
    vetted_at: vetted_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('freelancers')
    .update(row)
    .eq('phone', phone);
  if (error) console.error('[supabase] updateFreelancerTrust FAILED:', JSON.stringify(error));
}

// --- Updates a single field for an already-completed freelancer ---
export async function updateFreelancerField(phone, field, value) {
  const { error } = await supabase
    .from('freelancers')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('phone', phone);
  if (error) console.error(`[supabase] updateFreelancerField (${field}) error:`, JSON.stringify(error));
}

// --- Updates a single field for an already-completed client job request ---
// No-op (0 rows) when the client hasn't completed onboarding yet.
export async function updateJobRequestField(phone, field, value) {
  const { error } = await supabase
    .from('job_requests')
    .update({ [field]: value })
    .eq('phone', phone);
  if (error) console.error(`[supabase] updateJobRequestField (${field}) error:`, JSON.stringify(error));
}

// --- Removes a user's matches (either side) ---
// Used when someone flips hiring_currently / working_currently to "no", so
// they stop being displayed until they opt back in.
export async function deleteMatchesForPhone(phone) {
  const { error } = await supabase
    .from('matches')
    .delete()
    .or(`freelancer_phone.eq.${phone},client_phone.eq.${phone}`);
  if (error) console.error('[supabase] deleteMatchesForPhone error:', JSON.stringify(error));
}
