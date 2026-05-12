import type { Episode, EpisodeSummary, VocabCard, VocabWithReview, ReviewState, Attempt } from '../types';

// ── Episodes ──

export async function getEpisodes(
  db: D1Database,
  page = 1,
  limit = 20
): Promise<{ episodes: EpisodeSummary[]; total: number }> {
  const offset = (page - 1) * limit;
  const countResult = await db.prepare('SELECT COUNT(*) as total FROM episodes').first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await db.prepare(
    `SELECT id, bbc_id, title, description, duration_sec, published_at,
            CASE WHEN transcript IS NOT NULL AND transcript != '' THEN 1 ELSE 0 END as has_transcript,
            fetch_status
     FROM episodes ORDER BY published_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<EpisodeSummary>();

  return { episodes: results ?? [], total };
}

export async function getEpisode(db: D1Database, id: number): Promise<Episode | null> {
  return db.prepare('SELECT * FROM episodes WHERE id = ?').bind(id).first<Episode>();
}

export async function getEpisodeByBbcId(db: D1Database, bbcId: string): Promise<Episode | null> {
  return db.prepare('SELECT * FROM episodes WHERE bbc_id = ?').bind(bbcId).first<Episode>();
}

export async function insertEpisode(db: D1Database, ep: Omit<Episode, 'id' | 'created_at'>): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO episodes (bbc_id, title, description, audio_url, audio_r2_key, page_url, duration_sec, published_at, transcript, transcript_segments, fetch_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ep.bbc_id, ep.title, ep.description, ep.audio_url, ep.audio_r2_key,
    ep.page_url, ep.duration_sec, ep.published_at, ep.transcript,
    ep.transcript_segments, ep.fetch_status
  ).run();
}

export async function updateEpisodeTranscript(
  db: D1Database,
  bbcId: string,
  transcript: string,
  segments: string | null,
  status: 'done' | 'failed'
): Promise<void> {
  await db.prepare(
    'UPDATE episodes SET transcript = ?, transcript_segments = ?, fetch_status = ? WHERE bbc_id = ?'
  ).bind(transcript, segments, status, bbcId).run();
}

export async function updateEpisodeFetchStatus(
  db: D1Database,
  bbcId: string,
  status: string
): Promise<void> {
  await db.prepare(
    'UPDATE episodes SET fetch_status = ? WHERE bbc_id = ?'
  ).bind(status, bbcId).run();
}

export async function updateEpisodeAudioUrl(
  db: D1Database,
  bbcId: string,
  audioUrl: string
): Promise<void> {
  await db.prepare(
    'UPDATE episodes SET audio_url = ? WHERE bbc_id = ?'
  ).bind(audioUrl, bbcId).run();
}

export async function updateEpisodeAudioR2Key(
  db: D1Database,
  bbcId: string,
  r2Key: string
): Promise<void> {
  await db.prepare(
    'UPDATE episodes SET audio_r2_key = ? WHERE bbc_id = ?'
  ).bind(r2Key, bbcId).run();
}

export async function updateEpisodeTranscriptById(
  db: D1Database,
  id: number,
  transcript: string,
  segments: string | null
): Promise<void> {
  await db.prepare(
    'UPDATE episodes SET transcript = ?, transcript_segments = ? WHERE id = ?'
  ).bind(transcript, segments, id).run();
}

export async function getPendingEpisodes(db: D1Database, limit = 5): Promise<Episode[]> {
  const { results } = await db.prepare(
    `SELECT * FROM episodes WHERE fetch_status IN ('pending', 'failed')
      OR (fetch_status = 'done' AND (transcript IS NULL OR transcript = '' OR transcript_segments IS NULL))
     LIMIT ?`
  ).bind(limit).all<Episode>();
  return results ?? [];
}

export async function getEpisodesNeedingAudio(db: D1Database, limit = 3): Promise<Episode[]> {
  const { results } = await db.prepare(
    `SELECT * FROM episodes WHERE fetch_status = 'done' AND (audio_r2_key IS NULL OR audio_r2_key = '') LIMIT ?`
  ).bind(limit).all<Episode>();
  return results ?? [];
}

// ── Vocab ──

export async function getVocabCards(db: D1Database, userId: string): Promise<VocabWithReview[]> {
  const { results } = await db.prepare(
    `SELECT v.*, COALESCE(r.easiness, 2.5) as easiness,
            COALESCE(r.interval_days, 0) as interval_days,
            COALESCE(r.repetitions, 0) as repetitions,
            COALESCE(r.next_review, 0) as next_review,
            r.last_review
     FROM vocab_cards v
     LEFT JOIN review_state r ON r.card_id = v.id
     WHERE v.user_id = ?
     ORDER BY v.created_at DESC`
  ).bind(userId).all<VocabWithReview>();
  return results ?? [];
}

export async function getDueVocabCards(db: D1Database, userId: string): Promise<VocabWithReview[]> {
  const now = Math.floor(Date.now() / 1000);
  const { results } = await db.prepare(
    `SELECT v.*, COALESCE(r.easiness, 2.5) as easiness,
            COALESCE(r.interval_days, 0) as interval_days,
            COALESCE(r.repetitions, 0) as repetitions,
            COALESCE(r.next_review, 0) as next_review,
            r.last_review
     FROM vocab_cards v
     LEFT JOIN review_state r ON r.card_id = v.id
     WHERE v.user_id = ? AND (r.next_review IS NULL OR r.next_review <= ?)
     ORDER BY r.next_review ASC`
  ).bind(userId, now).all<VocabWithReview>();
  return results ?? [];
}

export async function insertVocabCard(
  db: D1Database,
  card: { user_id: string; word_or_phrase: string; context?: string; definition?: string; episode_id?: number }
): Promise<number> {
  const result = await db.prepare(
    `INSERT INTO vocab_cards (user_id, word_or_phrase, context, definition, episode_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(card.user_id, card.word_or_phrase, card.context ?? null, card.definition ?? null, card.episode_id ?? null).run();
  return result.meta.last_row_id as number;
}

export async function deleteVocabCard(db: D1Database, id: number, userId: string): Promise<boolean> {
  const result = await db.prepare(
    'DELETE FROM vocab_cards WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getReviewState(db: D1Database, cardId: number): Promise<ReviewState | null> {
  return db.prepare('SELECT * FROM review_state WHERE card_id = ?').bind(cardId).first<ReviewState>();
}

export async function upsertReviewState(
  db: D1Database,
  cardId: number,
  state: Omit<ReviewState, 'card_id'>
): Promise<void> {
  await db.prepare(
    `INSERT INTO review_state (card_id, easiness, interval_days, repetitions, next_review, last_review)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET
       easiness = excluded.easiness,
       interval_days = excluded.interval_days,
       repetitions = excluded.repetitions,
       next_review = excluded.next_review,
       last_review = excluded.last_review`
  ).bind(cardId, state.easiness, state.interval_days, state.repetitions, state.next_review, state.last_review).run();
}

// ── Attempts ──

export async function insertAttempt(
  db: D1Database,
  attempt: { user_id: string; episode_id: number; type: 'listen' | 'shadow'; duration_ms?: number }
): Promise<number> {
  const result = await db.prepare(
    `INSERT INTO attempts (user_id, episode_id, type, duration_ms) VALUES (?, ?, ?, ?)`
  ).bind(attempt.user_id, attempt.episode_id, attempt.type, attempt.duration_ms ?? null).run();
  return result.meta.last_row_id as number;
}

// ── Stats ──

export async function getStats(db: D1Database, userId: string): Promise<{ streak: number; dueCount: number; totalEpisodes: number }> {
  const now = Math.floor(Date.now() / 1000);

  const totalResult = await db.prepare('SELECT COUNT(*) as c FROM episodes').first<{ c: number }>();
  const totalEpisodes = totalResult?.c ?? 0;

  const dueResult = await db.prepare(
    `SELECT COUNT(*) as c FROM review_state r
     JOIN vocab_cards v ON v.id = r.card_id
     WHERE v.user_id = ? AND r.next_review <= ?`
  ).bind(userId, now).first<{ c: number }>();
  const dueCount = dueResult?.c ?? 0;

  // Streak: consecutive days with at least one attempt
  const { results: days } = await db.prepare(
    `SELECT DISTINCT date(created_at, 'unixepoch') as day
     FROM attempts WHERE user_id = ?
     ORDER BY day DESC LIMIT 365`
  ).bind(userId).all<{ day: string }>();

  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let expected = today;

  for (const row of days ?? []) {
    if (row.day === expected) {
      streak++;
      const d = new Date(expected);
      d.setDate(d.getDate() - 1);
      expected = d.toISOString().split('T')[0];
    } else {
      break;
    }
  }

  return { streak, dueCount, totalEpisodes };
}
