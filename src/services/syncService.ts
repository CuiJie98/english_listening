import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchFeed } from './feedService';
import { fetchTranscript } from './transcriptService';
import {
  getEpisodeByBbcId,
  insertEpisode,
  updateEpisodeTranscript,
  updateEpisodeFetchStatus,
} from '../database/queries';

export interface SyncProgress {
  total: number;
  processed: number;
  newEpisodes: number;
  transcriptsFetched: number;
  status: 'idle' | 'fetching_feed' | 'syncing' | 'done' | 'error';
}

export async function syncEpisodes(
  db: SQLiteDatabase,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncProgress> {
  const progress: SyncProgress = {
    total: 0,
    processed: 0,
    newEpisodes: 0,
    transcriptsFetched: 0,
    status: 'idle',
  };

  try {
    progress.status = 'fetching_feed';
    onProgress?.(progress);

    const feedItems = await fetchFeed();
    progress.total = feedItems.length;
    progress.status = 'syncing';
    onProgress?.(progress);

    for (const item of feedItems) {
      const existing = await getEpisodeByBbcId(db, item.bbc_id);

      if (!existing) {
        await insertEpisode(db, {
          bbc_id: item.bbc_id,
          title: item.title,
          description: item.description,
          audio_url: item.audio_url,
          audio_local: null,
          page_url: item.page_url,
          duration_sec: item.duration_sec,
          published_at: item.published_at,
          transcript: null,
          transcript_segments: null,
          fetch_status: 'pending',
        });
        progress.newEpisodes++;
      }

      progress.processed++;
      onProgress?.(progress);
    }

    // Fetch transcripts for episodes that don't have one
    const pendingRows = await db.getAllAsync<{ bbc_id: string; page_url: string | null }>(
      "SELECT bbc_id, page_url FROM episodes WHERE (transcript IS NULL OR transcript = '') AND fetch_status != 'failed' LIMIT 5"
    );

    for (const row of pendingRows) {
      if (!row.page_url) {
        await updateEpisodeFetchStatus(db, row.bbc_id, 'failed');
        continue;
      }

      await updateEpisodeFetchStatus(db, row.bbc_id, 'fetching');
      onProgress?.(progress);

      const transcript = await fetchTranscript(row.page_url);
      if (transcript) {
        await updateEpisodeTranscript(db, row.bbc_id, transcript, 'done');
        progress.transcriptsFetched++;
      } else {
        await updateEpisodeTranscript(db, row.bbc_id, '', 'failed');
      }
    }

    progress.status = 'done';
    onProgress?.(progress);
    return progress;
  } catch (err) {
    progress.status = 'error';
    onProgress?.(progress);
    throw err;
  }
}
