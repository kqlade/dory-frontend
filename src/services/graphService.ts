import { API_BASE_URL, CONCEPTS_ENDPOINTS } from '../config';
import { RecentConceptResponse } from '../types/graph';

const STORAGE_KEY_PREFIX = 'recentConcept_';

/**
 * Fetch the most‑recent concept graph for the given user and cache it
 * in localStorage. Returns the parsed response.
 */
export async function fetchRecentConcept(userId: string): Promise<RecentConceptResponse> {
  const endpoint = `${API_BASE_URL}${CONCEPTS_ENDPOINTS.RECENT(userId)}`;
  const res = await fetch(endpoint, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch recent concept: ${res.status} ${res.statusText}`);
  }
  const data: RecentConceptResponse = await res.json();
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(data));
  } catch (err) {
    console.warn('[graphService] Unable to cache recent concept:', err);
  }
  return data;
}

/**
 * Get the cached recent concept for a user, or null if not present / invalid.
 */
export function getCachedRecentConcept(userId: string): RecentConceptResponse | null {
  const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RecentConceptResponse;
  } catch {
    return null;
  }
} 