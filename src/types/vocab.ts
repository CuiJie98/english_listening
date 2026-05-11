export interface VocabCard {
  id: number;
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
  review: ReviewState | null;
}
