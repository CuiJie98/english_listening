import type { Episode, EpisodeSummary } from '../types/episode';
import { API_BASE } from '../constants/config';
import { getOrCreateUserId } from './storage';

async function headers(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': await getOrCreateUserId(),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...(await headers()), ...options?.headers },
    });
  } catch {
    throw new Error('Network error. Please check your connection.');
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `API error: ${resp.status}`);
  }
  if (resp.status === 204 || options?.method === 'DELETE') {
    return undefined as T;
  }
  return resp.json();
}

// ── Episodes ──

export async function getEpisodes(page = 1, limit = 50): Promise<{ episodes: EpisodeSummary[]; total: number }> {
  return apiFetch(`/api/episodes?page=${page}&limit=${limit}`);
}

export async function getEpisode(id: number): Promise<Episode> {
  return apiFetch(`/api/episodes/${id}`);
}

// ── Audio ──

export function getAudioUrl(bbcId: string): string {
  return `${API_BASE}/api/audio/${encodeURIComponent(bbcId)}`;
}

// ── Vocab ──

export interface VocabWithReview {
  id: number;
  user_id: string;
  word_or_phrase: string;
  context: string | null;
  definition: string | null;
  episode_id: number | null;
  created_at: number;
  easiness: number;
  interval_days: number;
  repetitions: number;
  next_review: number;
  last_review: number | null;
}

export async function getVocabCards(): Promise<VocabWithReview[]> {
  const data = await apiFetch<{ cards: VocabWithReview[] }>('/api/vocab');
  return data.cards;
}

export async function getDueVocabCards(): Promise<VocabWithReview[]> {
  const data = await apiFetch<{ cards: VocabWithReview[] }>('/api/vocab/due');
  return data.cards;
}

export async function insertVocabCard(card: {
  word_or_phrase: string;
  context?: string;
  definition?: string;
  episode_id?: number;
}): Promise<number> {
  const data = await apiFetch<{ id: number }>('/api/vocab', {
    method: 'POST',
    body: JSON.stringify(card),
  });
  return data.id;
}

export async function deleteVocabCard(id: number): Promise<void> {
  await apiFetch(`/api/vocab/${id}`, { method: 'DELETE' });
}

export async function updateVocabCard(id: number, fields: { word_or_phrase?: string; context?: string; definition?: string }): Promise<void> {
  await apiFetch(`/api/vocab/${id}`, { method: 'PUT', body: JSON.stringify(fields) });
}

export interface ReviewResult {
  easiness: number;
  interval_days: number;
  repetitions: number;
  next_review: number;
}

export async function submitReview(cardId: number, quality: number): Promise<ReviewResult> {
  return apiFetch(`/api/vocab/${cardId}/review`, {
    method: 'POST',
    body: JSON.stringify({ quality }),
  });
}

// ── Attempts ──

export async function insertAttempt(attempt: {
  episode_id: number;
  type: 'listen' | 'shadow';
  duration_ms?: number;
  score?: number;
  segment_index?: number;
  segment_start_sec?: number;
  segment_end_sec?: number;
  segment_text?: string;
  self_rating?: 'again' | 'hard' | 'good' | 'easy';
}): Promise<number> {
  const data = await apiFetch<{ id: number }>('/api/attempts', {
    method: 'POST',
    body: JSON.stringify(attempt),
  });
  return data.id;
}

export interface AttemptWithEpisode {
  id: number;
  user_id: string;
  episode_id: number;
  episode_title: string | null;
  type: 'listen' | 'shadow';
  duration_ms: number | null;
  score: number | null;
  segment_index: number | null;
  segment_start_sec: number | null;
  segment_end_sec: number | null;
  segment_text: string | null;
  self_rating: 'again' | 'hard' | 'good' | 'easy' | null;
  created_at: number;
}

export async function getAttempts(limit = 10): Promise<AttemptWithEpisode[]> {
  const data = await apiFetch<{ attempts: AttemptWithEpisode[] }>(`/api/attempts?limit=${limit}`);
  return data.attempts;
}

// ── Stats ──

export interface Stats {
  streak: number;
  dueCount: number;
  totalEpisodes: number;
}

export async function getStats(): Promise<Stats> {
  return apiFetch('/api/stats');
}
