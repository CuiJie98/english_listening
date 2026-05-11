import { Paths, Directory, File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { updateEpisodeAudioLocal } from '../database/queries';

function getAudioDir(): Directory {
  return new Directory(Paths.document, 'audio');
}

function sanitizeFilename(url: string): string {
  const parts = url.split('/');
  const last = parts[parts.length - 1] || 'audio.mp3';
  return last.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function downloadEpisodeAudio(
  db: SQLiteDatabase,
  bbcId: string,
  audioUrl: string
): Promise<string | null> {
  try {
    const audioDir = getAudioDir();
    const info = Paths.info(audioDir.uri);
    if (!info.exists) {
      audioDir.createDirectory('');
    }

    const filename = sanitizeFilename(audioUrl);
    const file = new File(audioDir, filename);
    const fileInfo = Paths.info(file.uri);

    if (fileInfo.exists) {
      await updateEpisodeAudioLocal(db, bbcId, file.uri);
      return file.uri;
    }

    const response = await fetch(audioUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const writable = file.writableStream();
    const writer = writable.getWriter();
    await writer.write(new Uint8Array(arrayBuffer));
    await writer.close();

    await updateEpisodeAudioLocal(db, bbcId, file.uri);
    return file.uri;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
