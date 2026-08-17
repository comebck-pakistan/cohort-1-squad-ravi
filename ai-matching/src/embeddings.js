import { config } from './config.js';

/**
 * Builds a dense, structured text representation of a freelancer profile for vector embedding.
 *
 * @param {object} data Freelancer profile data
 * @returns {string}
 */
export function buildFreelancerEmbeddingText(data) {
  if (!data) return '';
  const parts = [
    `Role: Freelancer`,
    data.name ? `Name: ${data.name}` : '',
    data.skills ? `Skills & Technologies: ${data.skills}` : '',
    data.tools ? `Tools & Software: ${data.tools}` : '',
    data.preferences ? `Preferences & Niche: ${data.preferences}` : '',
    data.brief_description ? `Bio / Summary: ${data.brief_description}` : '',
    data.portfolio ? `Portfolio: ${data.portfolio}` : '',
    data.rate ? `Rate: ${data.rate}` : '',
  ].filter(Boolean);

  return parts.join(' | ');
}

/**
 * Builds a dense, structured text representation of a client job request for vector embedding.
 *
 * @param {object} data Job request data
 * @returns {string}
 */
export function buildJobEmbeddingText(data) {
  if (!data) return '';
  const parts = [
    `Role: Client Project Request`,
    data.project_description ? `Project Description: ${data.project_description}` : '',
    data.brief_description ? `Extra Details / Scope: ${data.brief_description}` : '',
    data.hire_type ? `Hire Type: ${data.hire_type}` : '',
    data.budget_hourly || data.budget_project ? `Budget: ${data.budget_hourly || data.budget_project}` : '',
    data.deadline || data.deadline_normalized ? `Deadline: ${data.deadline_normalized || data.deadline}` : '',
  ].filter(Boolean);

  return parts.join(' | ');
}

/**
 * Generates a 384-dimensional dense embedding vector using Hugging Face's
 * free serverless inference API (sentence-transformers/all-MiniLM-L6-v2).
 *
 * Returns null if no API key is set or if the network request fails,
 * enabling seamless graceful fallback to rule-based token matching.
 *
 * @param {string} text Input text to embed
 * @returns {Promise<number[]|null>}
 */
export async function generateEmbedding(text) {
  const apiKey = config.huggingface.apiKey;
  if (!apiKey || !text || !text.trim()) {
    return null;
  }

  const cleanText = text.trim().slice(0, 4000);
  const modelName = config.huggingface.model || 'sentence-transformers/all-MiniLM-L6-v2';

  // Hugging Face router feature-extraction pipeline endpoint
  const url = `https://router.huggingface.co/hf-inference/models/${modelName}/pipeline/feature-extraction`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'x-wait-for-model': 'true',
      },
      body: JSON.stringify({
        inputs: cleanText,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[embeddings] HuggingFace API error (${response.status}):`, errText);
      return null;
    }

    const rawData = await response.json();
    return parseEmbeddingResponse(rawData);
  } catch (err) {
    console.error('[embeddings] Embedding generation exception:', err.message);
    return null;
  }
}

function parseEmbeddingResponse(rawData) {
  let vector = rawData;
  if (Array.isArray(vector) && Array.isArray(vector[0])) {
    vector = vector[0];
  }
  if (Array.isArray(vector) && vector.length > 0 && typeof vector[0] === 'number') {
    return vector;
  }
  return null;
}
