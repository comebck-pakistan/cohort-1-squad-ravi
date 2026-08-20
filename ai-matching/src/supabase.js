import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { generateEmbedding, buildFreelancerEmbeddingText, buildJobEmbeddingText } from './embeddings.js';
import { maskPhone, sanitizeUrl } from './security.js';

// Service role key bypasses RLS on the backend service.
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
// Full wipe: profile, job, conversation, declined pairs, AND any match rows tied to this phone.
export async function resetUser(phone) {
  const masked = maskPhone(phone);
  console.log(`[supabase] Resetting all data for user ${masked}`);
  await supabase.from('conversations').delete().eq('phone', phone);
  await supabase.from('freelancers').delete().eq('phone', phone);
  await supabase.from('job_requests').delete().eq('phone', phone);

  // Clear any declined pairs associated with this phone
  await supabase.from('declined_pairs').delete().or(`freelancer_phone.eq.${phone},job_phone.eq.${phone}`);

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
  let embedding = null;
  try {
    const text = buildFreelancerEmbeddingText({ phone, ...data });
    embedding = await generateEmbedding(text);
  } catch (embErr) {
    console.warn('[supabase] Error generating embedding for freelancer:', embErr.message);
  }

  const row = {
    phone,
    name:              data.name              || null,
    profile_link:      sanitizeUrl(data.profile_link) || null,
    portfolio:         sanitizeUrl(data.portfolio)    || null,
    skills:            data.skills            || null,
    tools:             data.tools             || null,
    rate:              data.rate              || null,
    availability:      data.availability      || null,
    preferences:       data.preferences       || null,
    brief_description: data.brief_description || null,
    status:            'active',
    is_available:      true,
    ...(embedding ? { embedding } : {}),
  };

  const masked = maskPhone(phone);
  console.log(`[supabase] saveFreelancerProfile — upserting row for ${masked} (vector embedding: ${!!embedding})`);

  let { data: upserted, error } = await supabase
    .from('freelancers')
    .upsert(row, { onConflict: 'phone' })
    .select();

  // If column doesn't exist yet in Supabase schema, retry with basic core columns
  if (error && (error.message?.includes('is_available') || error.message?.includes('status') || error.code === 'PGRST204')) {
    console.warn('[supabase] saveFreelancerProfile schema notice (retrying without extended columns):', error.message);
    const basicRow = {
      phone,
      name:              data.name              || null,
      profile_link:      sanitizeUrl(data.profile_link) || null,
      portfolio:         sanitizeUrl(data.portfolio)    || null,
      skills:            data.skills            || null,
      tools:             data.tools             || null,
      rate:              data.rate              || null,
      availability:      data.availability      || null,
      preferences:       data.preferences       || null,
      brief_description: data.brief_description || null,
      ...(embedding ? { embedding } : {}),
    };
    const retry = await supabase.from('freelancers').upsert(basicRow, { onConflict: 'phone' }).select();
    upserted = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[supabase] saveFreelancerProfile FAILED:', JSON.stringify(error));
  } else {
    console.log(`[supabase] saveFreelancerProfile OK — row id: ${upserted?.[0]?.id}`);
  }
}

// --- Save / upsert a completed client job request ---
// Writes all client-collected fields into the `job_requests` table.
// Uses upsert (conflict on `phone`) so re-runs are safe.
export async function saveJobRequest(phone, data) {
  let embedding = null;
  try {
    const text = buildJobEmbeddingText({ phone, ...data });
    embedding = await generateEmbedding(text);
  } catch (embErr) {
    console.warn('[supabase] Error generating embedding for job request:', embErr.message);
  }

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
    status:              'active',
    is_available:        true,
    ...(embedding ? { embedding } : {}),
  };

  const masked = maskPhone(phone);
  console.log(`[supabase] saveJobRequest — upserting row for ${masked} (vector embedding: ${!!embedding})`);

  let { data: upserted, error } = await supabase
    .from('job_requests')
    .upsert(row, { onConflict: 'phone' })
    .select();

  // If column doesn't exist yet in Supabase schema, retry with basic core columns
  if (error && (error.message?.includes('is_available') || error.message?.includes('status') || error.code === 'PGRST204')) {
    console.warn('[supabase] saveJobRequest schema notice (retrying without extended columns):', error.message);
    const basicRow = {
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
      ...(embedding ? { embedding } : {}),
    };
    const retry = await supabase.from('job_requests').upsert(basicRow, { onConflict: 'phone' }).select();
    upserted = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[supabase] saveJobRequest FAILED:', JSON.stringify(error));
  } else {
    console.log(`[supabase] saveJobRequest OK — row id: ${upserted?.[0]?.id}`);
  }
}

// --- Updates a single field for an already-completed freelancer ---
export async function updateFreelancerField(phone, field, value) {
  let cleanValue = value;
  if (field === 'profile_link' || field === 'portfolio') {
    cleanValue = sanitizeUrl(value);
  }

  const updates = { [field]: cleanValue, updated_at: new Date().toISOString() };

  // If updating a semantic field, recalculate the vector embedding
  const SEMANTIC_FIELDS = new Set(['skills', 'tools', 'preferences', 'brief_description', 'name']);
  if (SEMANTIC_FIELDS.has(field)) {
    try {
      const current = await findFreelancer(phone);
      const merged = { ...(current || {}), [field]: cleanValue };
      const embeddingText = buildFreelancerEmbeddingText(merged);
      const embedding = await generateEmbedding(embeddingText);
      if (embedding) {
        updates.embedding = embedding;
      }
    } catch (err) {
      console.warn('[supabase] Error regenerating embedding on field update:', err.message);
    }
  }

  const { error } = await supabase
    .from('freelancers')
    .update(updates)
    .eq('phone', phone);
  if (error) console.error(`[supabase] updateFreelancerField (${field}) error:`, JSON.stringify(error));
}

// --- Vector similarity search for freelancers (pgvector RPC) ---
export async function searchFreelancersByVector(queryEmbedding, threshold = 0.3, limit = 10) {
  if (!queryEmbedding) return [];
  try {
    const { data, error } = await supabase.rpc('match_freelancers', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.warn('[supabase] searchFreelancersByVector RPC error (falling back to rule-based):', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[supabase] searchFreelancersByVector exception:', err.message);
    return [];
  }
}

// --- Vector similarity search for jobs (pgvector RPC) ---
export async function searchJobsByVector(queryEmbedding, threshold = 0.3, limit = 10) {
  if (!queryEmbedding) return [];
  try {
    const { data, error } = await supabase.rpc('match_jobs', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.warn('[supabase] searchJobsByVector RPC error (falling back to rule-based):', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[supabase] searchJobsByVector exception:', err.message);
    return [];
  }
}

// --- Fetch active freelancers for matching ---
export async function getActiveFreelancers() {
  const { data, error } = await supabase
    .from('freelancers')
    .select('*');

  if (error) {
    console.error('[supabase] getActiveFreelancers error:', JSON.stringify(error));
    return [];
  }
  
  // Resilient memory filter: exclude only if explicitly inactive or unavailable
  return (data || []).filter(f => f.status !== 'inactive' && f.status !== 'paused' && f.is_available !== false);
}

// --- Fetch active job requests for matching ---
export async function getActiveJobRequests() {
  const { data, error } = await supabase
    .from('job_requests')
    .select('*');

  if (error) {
    console.error('[supabase] getActiveJobRequests error:', JSON.stringify(error));
    return [];
  }
  
  // Resilient memory filter: exclude only if explicitly inactive or unavailable
  return (data || []).filter(j => j.status !== 'inactive' && j.status !== 'paused' && j.is_available !== false);
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

  const masked = maskPhone(phone);
  if (error) {
    console.error(`[supabase] updateUserStatus (${table}) FAILED:`, JSON.stringify(error));
  } else {
    console.log(`[supabase] updateUserStatus — ${masked} → ${status}`);
  }
}

// --- Set is_available flag for a freelancer or job_request ---
export async function setAvailability(phone, role, isAvailable) {
  const table = role === 'freelancer' ? 'freelancers' : 'job_requests';
  const { error } = await supabase
    .from(table)
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq('phone', phone);

  const masked = maskPhone(phone);
  if (error) {
    console.error(`[supabase] setAvailability (${table}, ${masked}) FAILED:`, JSON.stringify(error));
  } else {
    console.log(`[supabase] setAvailability — ${masked} (${table}) → ${isAvailable}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  REVIEWS & REPUTATION SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

// --- Save a review and update reviewee reputation score ---
export async function saveReview({
  matchId,
  reviewerPhone,
  reviewerRole,
  revieweePhone,
  revieweeRole,
  rating,
  feedbackNote,
  projectTitle,
}) {
  const row = {
    match_id: matchId || null,
    reviewer_phone: reviewerPhone,
    reviewer_role: reviewerRole,
    reviewee_phone: revieweePhone,
    reviewee_role: revieweeRole,
    rating: Math.max(1, Math.min(5, parseInt(rating, 10) || 5)),
    feedback_note: feedbackNote || null,
    project_title: projectTitle || null,
  };

  const { data, error } = await supabase.from('reviews').insert(row).select();
  if (error) {
    console.error('[supabase] saveReview FAILED:', JSON.stringify(error));
    return null;
  }

  // Update match review status
  if (matchId) {
    const updateField = reviewerRole === 'client' ? 'client_reviewed' : 'freelancer_reviewed';
    await supabase.from('matches').update({ [updateField]: true }).eq('id', matchId);
  }

  // Recalculate average rating & review count for the reviewee
  const { data: allReviews } = await supabase
    .from('reviews')
    .select('rating')
    .eq('reviewee_phone', revieweePhone);

  if (allReviews && allReviews.length > 0) {
    const count = allReviews.length;
    const sum = allReviews.reduce((acc, r) => acc + r.rating, 0);
    const avg = Math.round((sum / count) * 10) / 10;

    const targetTable = revieweeRole === 'freelancer' ? 'freelancers' : 'job_requests';
    await supabase
      .from(targetTable)
      .update({ rating_avg: avg, review_count: count })
      .eq('phone', revieweePhone);

    const masked = maskPhone(revieweePhone);
    console.log(`[supabase] Updated reputation for ${masked} (${targetTable}): ${avg}⭐ (${count} reviews)`);
  }

  return data?.[0] || null;
}

// --- Get reputation summary for a user ---
export async function getReputation(phone, role = 'freelancer') {
  const table = role === 'freelancer' ? 'freelancers' : 'job_requests';
  const { data: user } = await supabase
    .from(table)
    .select('rating_avg, review_count')
    .eq('phone', phone)
    .single();

  const { data: recentReviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_phone', phone)
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    rating_avg: user?.rating_avg || 0,
    review_count: user?.review_count || 0,
    recent_reviews: recentReviews || [],
  };
}

// --- Fetch connected matches that are due for feedback ---
export async function getMatchesDueForFeedback() {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'connected')
    .is('feedback_requested_at', null);

  if (error) {
    console.error('[supabase] getMatchesDueForFeedback error:', JSON.stringify(error));
    return [];
  }
  return data || [];
}

// --- Mark match as feedback requested ---
export async function markFeedbackRequested(matchId) {
  const { error } = await supabase
    .from('matches')
    .update({ feedback_requested_at: new Date().toISOString() })
    .eq('id', matchId);

  if (error) console.error(`[supabase] markFeedbackRequested (${matchId}) error:`, JSON.stringify(error));
}
