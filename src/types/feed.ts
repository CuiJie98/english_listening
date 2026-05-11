export interface FeedItem {
  bbc_id: string;
  title: string;
  description: string;
  audio_url: string;
  page_url: string;
  published_at: number;
  duration_sec: number | null;
}
