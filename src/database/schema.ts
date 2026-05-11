import type { SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 1;

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS episodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    bbc_id        TEXT UNIQUE NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    audio_url     TEXT NOT NULL,
    audio_local   TEXT,
    page_url      TEXT,
    duration_sec  INTEGER,
    published_at  INTEGER,
    transcript    TEXT,
    transcript_segments TEXT,
    fetch_status  TEXT DEFAULT 'pending'
                  CHECK(fetch_status IN ('pending','fetching','done','failed')),
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  )`,

  `CREATE TABLE IF NOT EXISTS attempts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id    INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    type          TEXT CHECK(type IN ('listen','shadow')) NOT NULL,
    user_answer   TEXT,
    score         REAL,
    recording_uri TEXT,
    duration_ms   INTEGER,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_episode ON attempts(episode_id)`,

  `CREATE TABLE IF NOT EXISTS vocab_cards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    word_or_phrase TEXT NOT NULL,
    context       TEXT,
    definition    TEXT,
    episode_id    INTEGER REFERENCES episodes(id),
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  )`,

  `CREATE TABLE IF NOT EXISTS review_state (
    card_id       INTEGER PRIMARY KEY REFERENCES vocab_cards(id) ON DELETE CASCADE,
    easiness      REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions   INTEGER NOT NULL DEFAULT 0,
    next_review   INTEGER NOT NULL DEFAULT (unixepoch()),
    last_review   INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_next ON review_state(next_review)`,

  `CREATE TABLE IF NOT EXISTS settings (
    key           TEXT PRIMARY KEY,
    value         TEXT NOT NULL
  )`,
];

export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  );

  const rows = await db.getAllAsync<{ value: string }>(
    "SELECT value FROM _meta WHERE key = 'schema_version'"
  );
  const currentVersion = rows.length > 0 ? parseInt(rows[0].value, 10) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    for (const sql of CREATE_TABLES) {
      await db.execAsync(sql);
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)",
      [SCHEMA_VERSION.toString()]
    );
  }
}
