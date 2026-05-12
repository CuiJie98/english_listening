export interface Episode {
  id: number;
  bbc_id: string;
  title: string;
  description: string | null;
  audio_url: string;
  audio_local: string | null;
  page_url: string | null;
  duration_sec: number | null;
  published_at: number | null;
  transcript: string | null;
  transcript_segments: TranscriptSegment[] | null;
  fetch_status: 'pending' | 'fetching' | 'done' | 'failed';
  created_at: number;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

export interface EpisodeSummary {
  id: number;
  title: string;
  published_at: number | null;
  duration_sec: number | null;
  has_transcript: boolean;
  fetch_status: Episode['fetch_status'];
}
