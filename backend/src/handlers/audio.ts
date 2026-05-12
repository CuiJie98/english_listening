import { getEpisodeByBbcId, updateEpisodeAudioUrl } from '../db/queries';
import { fetchAudioUrl } from '../services/transcriptExtractor';
import type { Env } from '../types';

export async function handleStreamAudio(request: Request, params: Record<string, string>, env: Env): Promise<Response> {
  const bbcId = decodeURIComponent(params.bbcId);
  if (!bbcId) {
    return Response.json({ error: 'Missing bbcId' }, { status: 400 });
  }

  const episode = await getEpisodeByBbcId(env.DB, bbcId);
  if (!episode) {
    return Response.json({ error: 'Episode not found' }, { status: 404 });
  }

  let audioUrl = episode.audio_url;

  // If audio_url is a page URL (not MP3), try to extract the actual audio URL
  if (audioUrl && !audioUrl.includes('.mp3') && !audioUrl.includes('sounds.bbc')) {
    const extracted = await fetchAudioUrl(audioUrl);
    if (extracted) {
      audioUrl = extracted;
      // Cache the extracted URL for future requests
      await updateEpisodeAudioUrl(env.DB, bbcId, extracted);
    }
  }

  if (!audioUrl) {
    return Response.json({ error: 'No audio URL available' }, { status: 404 });
  }

  // Proxy audio from BBC
  const rangeHeader = request.headers.get('Range');

  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; BBCEnglishBot/1.0)',
  };
  if (rangeHeader) {
    fetchHeaders['Range'] = rangeHeader;
  }

  try {
    const upstream = await fetch(audioUrl, {
      headers: fetchHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      return Response.json({ error: `Audio source returned ${upstream.status}`, url: audioUrl.substring(0, 100) }, { status: 502 });
    }

    const responseHeaders = new Headers({
      'Content-Type': upstream.headers.get('Content-Type') || 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
      'Accept-Ranges': 'bytes',
    });

    if (upstream.headers.get('Content-Range')) {
      responseHeaders.set('Content-Range', upstream.headers.get('Content-Range')!);
    }
    if (upstream.headers.get('Content-Length')) {
      responseHeaders.set('Content-Length', upstream.headers.get('Content-Length')!);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return Response.json({ error: `Audio proxy failed: ${err?.message}` }, { status: 502 });
  }
}
