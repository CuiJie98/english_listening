import type { SQLiteDatabase } from 'expo-sqlite';
import type { Episode, EpisodeSummary } from '../types/episode';
import type { VocabCard, VocabWithReview, ReviewState } from '../types/vocab';

// ── Episodes ──

export async function getEpisodes(db: SQLiteDatabase): Promise<EpisodeSummary[]> {
  return db.getAllAsync<EpisodeSummary>(
    `SELECT id, title, published_at, duration_sec,
            transcript IS NOT NULL AND transcript != '' as has_transcript,
            fetch_status
     FROM episodes
     ORDER BY published_at DESC`
  );
}

export async function getEpisode(db: SQLiteDatabase, id: number): Promise<Episode | null> {
  const rows = await db.getAllAsync<Episode>(
    'SELECT * FROM episodes WHERE id = ?',
    [id]
  );
  if (rows.length === 0) return null;
  const ep = rows[0];
  if (ep.transcript_segments && typeof ep.transcript_segments === 'string') {
    ep.transcript_segments = JSON.parse(ep.transcript_segments as unknown as string);
  }
  return ep;
}

export async function getEpisodeByBbcId(db: SQLiteDatabase, bbcId: string): Promise<Episode | null> {
  const rows = await db.getAllAsync<Episode>(
    'SELECT * FROM episodes WHERE bbc_id = ?',
    [bbcId]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function insertEpisode(
  db: SQLiteDatabase,
  episode: Omit<Episode, 'id' | 'created_at'>
): Promise<number> {
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO episodes
     (bbc_id, title, description, audio_url, audio_local, page_url,
      duration_sec, published_at, transcript, transcript_segments, fetch_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      episode.bbc_id,
      episode.title,
      episode.description ?? null,
      episode.audio_url,
      episode.audio_local ?? null,
      episode.page_url ?? null,
      episode.duration_sec ?? null,
      episode.published_at ?? null,
      episode.transcript ?? null,
      episode.transcript_segments
        ? JSON.stringify(episode.transcript_segments)
        : null,
      episode.fetch_status,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateEpisodeTranscript(
  db: SQLiteDatabase,
  bbcId: string,
  transcript: string,
  fetchStatus: 'done' | 'failed'
): Promise<void> {
  await db.runAsync(
    'UPDATE episodes SET transcript = ?, fetch_status = ? WHERE bbc_id = ?',
    [transcript, fetchStatus, bbcId]
  );
}

export async function updateEpisodeAudioLocal(
  db: SQLiteDatabase,
  bbcId: string,
  audioLocal: string
): Promise<void> {
  await db.runAsync(
    'UPDATE episodes SET audio_local = ? WHERE bbc_id = ?',
    [audioLocal, bbcId]
  );
}

export async function updateEpisodeFetchStatus(
  db: SQLiteDatabase,
  bbcId: string,
  status: Episode['fetch_status']
): Promise<void> {
  await db.runAsync(
    'UPDATE episodes SET fetch_status = ? WHERE bbc_id = ?',
    [status, bbcId]
  );
}

// ── Vocab Cards ──

export async function getVocabCards(db: SQLiteDatabase): Promise<VocabWithReview[]> {
  const cards = await db.getAllAsync<VocabCard>(
    'SELECT * FROM vocab_cards ORDER BY created_at DESC'
  );
  const results: VocabWithReview[] = [];
  for (const card of cards) {
    const reviewRows = await db.getAllAsync<ReviewState>(
      'SELECT * FROM review_state WHERE card_id = ?',
      [card.id]
    );
    results.push({
      ...card,
      review: reviewRows.length > 0 ? reviewRows[0] : null,
    });
  }
  return results;
}

export async function getDueVocabCards(db: SQLiteDatabase): Promise<VocabWithReview[]> {
  const now = Math.floor(Date.now() / 1000);
  const cards = await db.getAllAsync<VocabCard>(
    `SELECT vc.* FROM vocab_cards vc
     JOIN review_state rs ON vc.id = rs.card_id
     WHERE rs.next_review <= ?
     ORDER BY rs.next_review ASC`,
    [now]
  );
  const results: VocabWithReview[] = [];
  for (const card of cards) {
    const reviewRows = await db.getAllAsync<ReviewState>(
      'SELECT * FROM review_state WHERE card_id = ?',
      [card.id]
    );
    results.push({
      ...card,
      review: reviewRows.length > 0 ? reviewRows[0] : null,
    });
  }
  return results;
}

export async function insertVocabCard(
  db: SQLiteDatabase,
  card: Omit<VocabCard, 'id' | 'created_at'>,
  addToReview = true
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO vocab_cards (word_or_phrase, context, definition, episode_id) VALUES (?, ?, ?, ?)',
    [card.word_or_phrase, card.context ?? null, card.definition ?? null, card.episode_id ?? null]
  );
  const cardId = result.lastInsertRowId;

  if (addToReview) {
    const now = Math.floor(Date.now() / 1000);
    await db.runAsync(
      'INSERT INTO review_state (card_id, next_review) VALUES (?, ?)',
      [cardId, now]
    );
  }

  return cardId;
}

export async function deleteVocabCard(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM vocab_cards WHERE id = ?', [id]);
}

export async function updateReviewState(
  db: SQLiteDatabase,
  cardId: number,
  state: Omit<ReviewState, 'card_id'>
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO review_state
     (card_id, easiness, interval_days, repetitions, next_review, last_review)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cardId, state.easiness, state.interval_days, state.repetitions, state.next_review, state.last_review ?? null]
  );
}

// ── Attempts ──

export async function insertAttempt(
  db: SQLiteDatabase,
  attempt: { episode_id: number; type: 'listen' | 'shadow'; user_answer?: string; score?: number; recording_uri?: string; duration_ms?: number }
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO attempts (episode_id, type, user_answer, score, recording_uri, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
    [
      attempt.episode_id,
      attempt.type,
      attempt.user_answer ?? null,
      attempt.score ?? null,
      attempt.recording_uri ?? null,
      attempt.duration_ms ?? null,
    ]
  );
  return result.lastInsertRowId;
}

// ── Stats ──

export async function getDueReviewCount(db: SQLiteDatabase): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM review_state WHERE next_review <= ?',
    [now]
  );
  return rows[0]?.count ?? 0;
}

export async function getStreakDays(db: SQLiteDatabase): Promise<number> {
  const rows = await db.getAllAsync<{ day: string }>(
    `SELECT DISTINCT date(created_at, 'unixepoch') as day
     FROM attempts
     ORDER BY day DESC
     LIMIT 30`
  );
  if (rows.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const row of rows) {
    const rowDate = new Date(row.day);
    rowDate.setHours(0, 0, 0, 0);
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - streak);

    if (rowDate.getTime() === expectedDate.getTime()) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
