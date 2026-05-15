import { getEpisodes, getEpisode } from '../db/queries';
import type { Env } from '../types';

export async function handleListEpisodes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  const result = await getEpisodes(env.DB, page, limit);

  return Response.json(result);
}

export async function handleGetEpisode(request: Request, params: Record<string, string>, env: Env): Promise<Response> {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return Response.json({ error: 'Invalid episode ID' }, { status: 400 });
  }

  const episode = await getEpisode(env.DB, id);
  if (!episode) {
    return Response.json({ error: 'Episode not found' }, { status: 404 });
  }

  // Parse transcript_segments from JSON string to array
  let segments = null;
  if (episode.transcript_segments) {
    try {
      segments = JSON.parse(episode.transcript_segments);
    } catch {
      segments = null;
    }
  }

  let alignmentWords = null;
  if (episode.alignment_words) {
    try {
      alignmentWords = JSON.parse(episode.alignment_words);
    } catch {
      alignmentWords = null;
    }
  }

  return Response.json({
    ...episode,
    transcript_segments: segments,
    alignment_words: alignmentWords,
  });
}
