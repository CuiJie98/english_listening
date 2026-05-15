CREATE TABLE IF NOT EXISTS episodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bbc_id        TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  audio_url     TEXT NOT NULL,
  audio_r2_key  TEXT,
  page_url      TEXT,
  duration_sec  INTEGER,
  transcript_start_sec REAL,
  transcript_end_sec REAL,
  published_at  INTEGER,
  transcript    TEXT,
  transcript_segments TEXT,
  fetch_status  TEXT DEFAULT 'pending'
                CHECK(fetch_status IN ('pending','fetching','done','failed')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS vocab_cards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL,
  word_or_phrase TEXT NOT NULL,
  context        TEXT,
  definition     TEXT,
  episode_id     INTEGER REFERENCES episodes(id),
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_vocab_user ON vocab_cards(user_id);

CREATE TABLE IF NOT EXISTS review_state (
  card_id       INTEGER PRIMARY KEY REFERENCES vocab_cards(id) ON DELETE CASCADE,
  easiness      REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  next_review   INTEGER NOT NULL DEFAULT (unixepoch()),
  last_review   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_review_next ON review_state(next_review);

CREATE TABLE IF NOT EXISTS attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  episode_id INTEGER NOT NULL REFERENCES episodes(id),
  type       TEXT CHECK(type IN ('listen','shadow')) NOT NULL,
  user_answer TEXT,
  score      REAL,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_episode ON attempts(episode_id);
