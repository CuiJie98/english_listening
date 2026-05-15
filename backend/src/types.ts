export interface Env {
  DB: D1Database;
  RSS_FEED_URL: string;
  BBC_BASE_URL: string;
  ADMIN_SECRET?: string;
}

export interface Episode {
  id: number;
  bbc_id: string;
  title: string;
  description: string;
  audio_url: string;
  audio_r2_key: string | null;
  page_url: string;
  duration_sec: number | null;
  transcript_start_sec: number | null;
  transcript_end_sec: number | null;
  published_at: number;
  transcript: string | null;
  transcript_segments: string | null;
  fetch_status: 'pending' | 'fetching' | 'done' | 'failed';
  created_at: number;
}

export interface EpisodeSummary {
  id: number;
  bbc_id: string;
  title: string;
  description: string;
  duration_sec: number | null;
  transcript_start_sec: number | null;
  transcript_end_sec: number | null;
  published_at: number;
  has_transcript: boolean;
  fetch_status: string;
}

export interface VocabCard {
  id: number;
  user_id: string;
  word_or_phrase: string;
  context: string | null;
  definition: string | null;
  episode_id: number | null;
  created_at: number;
}

export interface ReviewState {
  card_id: number;
  easiness: number;
  interval_days: number;
  repetitions: number;
  next_review: number;
  last_review: number | null;
}

export interface VocabWithReview extends VocabCard {
  easiness: number;
  interval_days: number;
  repetitions: number;
  next_review: number;
  last_review: number | null;
}

export interface Attempt {
  id: number;
  user_id: string;
  episode_id: number;
  type: 'listen' | 'shadow';
  user_answer: string | null;
  score: number | null;
  duration_ms: number | null;
  created_at: number;
}

export interface AttemptWithEpisode extends Attempt {
  episode_title: string | null;
}

export interface FeedItem {
  bbc_id: string;
  title: string;
  description: string;
  audio_url: string;
  page_url: string;
  published_at: number;
  duration_sec: number | null;
}
