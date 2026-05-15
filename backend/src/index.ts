import { Router } from './router';
import { handleListEpisodes, handleGetEpisode } from './handlers/episodes';
import { handleStreamAudio } from './handlers/audio';
import { handleListVocab, handleDueVocab, handleCreateVocab, handleUpdateVocab, handleDeleteVocab, handleReviewVocab } from './handlers/vocab';
import { handleCreateAttempt, handleListAttempts } from './handlers/attempts';
import { handleGetStats } from './handlers/stats';
import { fetchFeed } from './services/feedFetcher';
import { fetchTranscript, fetchAudioUrl, fetchTranscriptVerbose } from './services/transcriptExtractor';
import {
  getEpisode,
  getEpisodeByBbcId,
  insertEpisode,
  updateEpisodeTranscript,
  updateEpisodeTranscriptById,
  updateEpisodeFetchStatus,
  updateEpisodeAudioUrl,
  getPendingEpisodes,
  updateEpisodeAlignmentWindow,
  updateEpisodeAlignedSegments,
  getEpisodesNeedingAlignment,
} from './db/queries';
import {
  alignTranscriptSegments,
  parseTranscriptSegments,
  resolveAlignmentWindow,
} from './services/transcriptAligner';
import type { Env } from './types';

const router = new Router();

// Health check
router.get('/', () => Response.json({ status: 'ok', version: '1.0.0' }));

// Episodes
router.get('/api/episodes', (req, _params, env) => handleListEpisodes(req, env));
router.get('/api/episodes/:id', (req, params, env) => handleGetEpisode(req, params, env));

// Audio route handled separately due to slashes in bbc_id

// Vocab
router.get('/api/vocab', (req, params, env) => handleListVocab(req, params, env));
router.get('/api/vocab/due', (req, params, env) => handleDueVocab(req, params, env));
router.post('/api/vocab', (req, params, env) => handleCreateVocab(req, params, env));
router.put('/api/vocab/:id', (req, params, env) => handleUpdateVocab(req, params, env));
router.delete('/api/vocab/:id', (req, params, env) => handleDeleteVocab(req, params, env));
router.post('/api/vocab/:id/review', (req, params, env) => handleReviewVocab(req, params, env));

// Attempts
router.get('/api/attempts', (req, params, env) => handleListAttempts(req, params, env));
router.post('/api/attempts', (req, params, env) => handleCreateAttempt(req, params, env));

// Stats
router.get('/api/stats', (req, params, env) => handleGetStats(req, params, env));

// Alignment admin endpoints
router.post('/api/episodes/:id/alignment-window', async (req, params, env) => {
  const adminError = requireAdmin(req, env);
  if (adminError) return adminError;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const ep = await getEpisode(env.DB, id);
  if (!ep) return Response.json({ error: 'Not found' }, { status: 404 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const startInput = Object.prototype.hasOwnProperty.call(body, 'start')
    ? body.start
    : Object.prototype.hasOwnProperty.call(body, 'transcript_start_sec')
      ? body.transcript_start_sec
      : ep.transcript_start_sec;
  const endInput = Object.prototype.hasOwnProperty.call(body, 'end')
    ? body.end
    : Object.prototype.hasOwnProperty.call(body, 'transcript_end_sec')
      ? body.transcript_end_sec
      : ep.transcript_end_sec;
  const start = readOptionalSeconds(startInput);
  const end = readOptionalSeconds(endInput);
  if (start.invalid || end.invalid) {
    return Response.json({ error: 'start and end must be numbers or null' }, { status: 400 });
  }
  if (start.value !== null && start.value < 0) {
    return Response.json({ error: 'start must be greater than or equal to 0' }, { status: 400 });
  }
  if (start.value !== null && end.value !== null && end.value <= start.value) {
    return Response.json({ error: 'end must be greater than start' }, { status: 400 });
  }
  if (ep.duration_sec !== null && end.value !== null && end.value > ep.duration_sec + 0.5) {
    return Response.json({ error: 'end cannot exceed episode duration' }, { status: 400 });
  }

  await updateEpisodeAlignmentWindow(env.DB, id, start.value, end.value);
  return Response.json({
    ok: true,
    episodeId: id,
    transcript_start_sec: start.value,
    transcript_end_sec: end.value,
  });
});

router.post('/api/episodes/:id/align', async (req, params, env) => {
  const adminError = requireAdmin(req, env);
  if (adminError) return adminError;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const result = await alignEpisode(env, id);
  return Response.json(result.body, { status: result.status });
});

router.post('/api/episodes/align-batch', async (req, _params, env) => {
  const adminError = requireAdmin(req, env);
  if (adminError) return adminError;

  let limit = 20;
  try {
    const body: any = await req.json();
    if (body?.limit !== undefined) {
      const parsed = Number(body.limit);
      if (Number.isFinite(parsed)) limit = parsed;
    }
  } catch {
    // Empty body is fine.
  }

  const episodes = await getEpisodesNeedingAlignment(env.DB, limit);
  const log: string[] = [];
  let success = 0;

  for (const ep of episodes) {
    const result = await alignEpisode(env, ep.id);
    if (result.status === 200) {
      success++;
      log.push(`OK: ${ep.id} (${result.body.segmentCount} segments)`);
    } else {
      log.push(`SKIP: ${ep.id} (${result.body.error})`);
    }
  }

  return Response.json({
    ok: true,
    processed: episodes.length,
    success,
    skipped: episodes.length - success,
    log,
  });
});

// Debug: check audio URL extraction for an episode
router.get('/api/debug/audio/:id', async (_req, params, env) => {
  const adminError = requireAdmin(_req, env);
  if (adminError) return adminError;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const ep = await env.DB.prepare('SELECT * FROM episodes WHERE id = ?').bind(id).first();
  if (!ep) return Response.json({ error: 'Not found' }, { status: 404 });

  const pageUrl = ep.page_url;
  if (!pageUrl) return Response.json({ error: 'No page URL', episode: ep });

  try {
    const resp = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BBCEnglishBot/1.0)' },
    });
    const html = await resp.text();

    // Find all URLs that look like audio
    const mp3Matches = [...html.matchAll(/https?:\/\/[^"'\s<>]+\.mp3[^"'\s<>]*/gi)];
    const soundsMatches = [...html.matchAll(/https?:\/\/sounds\.bbc\.co\.uk[^"'\s<>]+/gi)];
    const podcastMatches = [...html.matchAll(/https?:\/\/podcasts\.files\.bbc\.co\.uk[^"'\s<>]+/gi)];

    return Response.json({
      episode: { id: ep.id, bbc_id: ep.bbc_id, audio_url: ep.audio_url },
      pageLength: html.length,
      mp3Urls: mp3Matches.map(m => m[0]).slice(0, 5),
      soundsUrls: soundsMatches.map(m => m[0]).slice(0, 5),
      podcastUrls: podcastMatches.map(m => m[0]).slice(0, 5),
    });
  } catch (err: any) {
    return Response.json({ error: err?.message });
  }
});

// Debug: check transcript extraction for an episode (verbose)
router.get('/api/debug/transcript/:id', async (_req, params, env) => {
  const adminError = requireAdmin(_req, env);
  if (adminError) return adminError;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const ep = await getEpisode(env.DB, id);
  if (!ep) return Response.json({ error: 'Not found' }, { status: 404 });

  const pageUrl = ep.page_url;
  if (!pageUrl) return Response.json({ error: 'No page URL', episode: ep });

  try {
    const { result, diag } = await fetchTranscriptVerbose(pageUrl);
    return Response.json({
      episode: { id: ep.id, bbc_id: ep.bbc_id, title: ep.title },
      diag,
      extraction: result ? {
        segmentCount: result.segments.length,
        speakers: [...new Set(result.segments.map(s => s.speaker))],
        firstSegments: result.segments.slice(0, 5),
        lastSegments: result.segments.slice(-3),
        plainLength: result.plain.length,
      } : null,
    });
  } catch (err: any) {
    return Response.json({ error: err?.message });
  }
});

// Reparse: re-extract transcript for an episode without changing fetch_status
router.get('/api/reparse/:id', async (_req, params, env) => {
  const adminError = requireAdmin(_req, env);
  if (adminError) return adminError;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 });

  const ep = await getEpisode(env.DB, id);
  if (!ep) return Response.json({ error: 'Not found' }, { status: 404 });

  const pageUrl = ep.page_url;
  if (!pageUrl) return Response.json({ error: 'No page URL' });

  try {
    const result = await fetchTranscript(pageUrl);
    if (result && result.segments.length > 0) {
      const segmentsJson = JSON.stringify(result.segments);
      await updateEpisodeTranscriptById(env.DB, id, result.plain, segmentsJson);
      return Response.json({
        ok: true,
        segmentCount: result.segments.length,
        speakers: [...new Set(result.segments.map(s => s.speaker))],
      });
    } else if (result && result.plain.length > 0) {
      await updateEpisodeTranscriptById(env.DB, id, result.plain, null);
      return Response.json({ ok: true, segmentCount: 0, plainLength: result.plain.length });
    } else {
      return Response.json({ ok: false, reason: 'No transcript found' });
    }
  } catch (err: any) {
    return Response.json({ error: err?.message });
  }
});

// Clear all transcript data for re-extraction
router.get('/api/clear-transcripts', async (_req, _params, env) => {
  const adminError = requireAdmin(_req, env);
  if (adminError) return adminError;

  const result = await env.DB.prepare(
    `UPDATE episodes SET transcript = NULL, transcript_segments = NULL, fetch_status = 'pending'`
  ).run();

  return Response.json({ ok: true, updated: result.meta.changes });
});

// Batch reparse: re-extract transcripts for all episodes (limit 10 per call)
router.get('/api/reparse-all', async (_req, _params, env) => {
  const adminError = requireAdmin(_req, env);
  if (adminError) return adminError;

  const { results } = await env.DB.prepare(
    `SELECT id, bbc_id, title, page_url FROM episodes
     WHERE page_url IS NOT NULL AND page_url != ''
       AND (fetch_status IS NULL OR fetch_status != 'done' OR transcript_segments IS NULL OR transcript_segments = '')
     ORDER BY id`
  ).all();

  if (!results || results.length === 0) {
    return Response.json({ ok: true, message: 'No episodes to reparse' });
  }

  const log: string[] = [];
  let processed = 0;
  let successCount = 0;

  for (const ep of results) {
    if (processed >= 10) break; // Limit per call to avoid timeout
    processed++;

    try {
      const result = await fetchTranscript(ep.page_url);
      if (result && result.segments.length > 0) {
        const segmentsJson = JSON.stringify(result.segments);
        await updateEpisodeTranscriptById(env.DB, ep.id, result.plain, segmentsJson);
        await updateEpisodeFetchStatus(env.DB, ep.bbc_id, 'done');
        log.push(`OK: ${ep.bbc_id} (${result.segments.length} segments)`);
        successCount++;
      } else {
        log.push(`SKIP: ${ep.bbc_id} (no transcript found)`);
      }
    } catch (err: any) {
      log.push(`ERR: ${ep.bbc_id} (${err?.message})`);
    }
  }

  return Response.json({
    ok: true,
    processed,
    success: successCount,
    remaining: results.length - processed,
    log,
  });
});

// Debug: check raw RSS response
router.get('/api/debug/rss', async (_req, _params, env) => {
  const adminError = requireAdmin(_req, env);
  if (adminError) return adminError;

  try {
    const resp = await fetch(env.RSS_FEED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BBCEnglishBot/1.0)' },
      redirect: 'follow',
    });
    const text = await resp.text();

    // Extract first item for debugging
    const itemMatch = /<item>([\s\S]*?)<\/item>/i.exec(text);
    const firstItem = itemMatch ? itemMatch[1] : 'NO ITEM FOUND';

    return Response.json({
      status: resp.status,
      length: text.length,
      hasItem: text.includes('<item>'),
      firstItem,
    });
  } catch (err: any) {
    return Response.json({ error: err?.message });
  }
});

// Manual sync trigger (GET for easy browser access)
router.get('/api/sync', async (_req, _params, env) => {
  const adminError = requireAdmin(_req, env);
  if (adminError) return adminError;

  const result = await syncEpisodes(env);
  return Response.json(result);
});

function requireAdmin(request: Request, env: Env): Response | null {
  const secret = env.ADMIN_SECRET;
  if (!secret) {
    return Response.json({ error: 'Admin routes are disabled' }, { status: 403 });
  }
  const url = new URL(request.url);
  const fromHeader = request.headers.get('X-Admin-Secret');
  const fromQuery = url.searchParams.get('secret');
  if (fromHeader !== secret && fromQuery !== secret) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function readOptionalSeconds(value: unknown): { value: number | null; invalid: boolean } {
  if (value === undefined || value === null || value === '') {
    return { value: null, invalid: false };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { value: null, invalid: true };
  }
  return { value: Math.round(parsed * 100) / 100, invalid: false };
}

async function alignEpisode(env: Env, id: number): Promise<{ status: number; body: Record<string, any> }> {
  const ep = await getEpisode(env.DB, id);
  if (!ep) return { status: 404, body: { error: 'Not found' } };

  const segments = parseTranscriptSegments(ep.transcript_segments);
  if (segments.length === 0) {
    return { status: 400, body: { error: 'Episode has no transcript segments' } };
  }

  const window = resolveAlignmentWindow(ep);
  if (!window) {
    return {
      status: 400,
      body: {
        error: 'Episode needs a duration or transcript_end_sec before alignment',
        transcript_start_sec: ep.transcript_start_sec,
        transcript_end_sec: ep.transcript_end_sec,
        duration_sec: ep.duration_sec,
      },
    };
  }

  const aligned = alignTranscriptSegments(segments, window);
  await updateEpisodeAlignedSegments(env.DB, id, JSON.stringify(aligned));

  return {
    status: 200,
    body: {
      ok: true,
      episodeId: id,
      segmentCount: aligned.length,
      window,
      firstSegment: aligned[0] ? { start: aligned[0].start, end: aligned[0].end } : null,
      lastSegment: aligned[aligned.length - 1]
        ? { start: aligned[aligned.length - 1].start, end: aligned[aligned.length - 1].end }
        : null,
    },
  };
}

// CORS headers
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Admin-Secret',
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Handle audio route separately (bbc_id contains slashes)
      const reqUrl = new URL(request.url);
      if (request.method === 'GET' && reqUrl.pathname.startsWith('/api/audio/')) {
        const bbcId = decodeURIComponent(reqUrl.pathname.substring('/api/audio/'.length));
        return handleStreamAudio(request, { bbcId }, env);
      }

      const response = await router.handle(request, env, ctx);
      if (response) {
        const headers = new Headers(response.headers);
        Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return Response.json({ error: 'Not found', path: reqUrl.pathname, method: request.method }, { status: 404, headers: corsHeaders() });
    } catch (err: any) {
      if (err instanceof Response) {
        const headers = new Headers(err.headers);
        Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
        return new Response(err.body, { status: err.status, headers });
      }
      console.error('Unhandled error:', err);
      return Response.json(
        { error: err?.message || 'Internal server error' },
        { status: 500, headers: corsHeaders() }
      );
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron triggered:', event.cron);
    try {
      await syncEpisodes(env);
    } catch (err: any) {
      console.error('Cron sync failed:', err?.message);
    }
  },
};

async function syncEpisodes(env: Env): Promise<Record<string, any>> {
  const rssUrl = env.RSS_FEED_URL;
  const log: string[] = [];

  // Step 1: Fetch and parse RSS feed
  let feedItems;
  try {
    feedItems = await fetchFeed(rssUrl);
    log.push(`RSS parsed: ${feedItems.length} items`);
  } catch (err: any) {
    log.push(`RSS error: ${err?.message}`);
    return { ok: false, log };
  }

  // Step 2: Insert new episodes into D1
  let newCount = 0;
  for (const item of feedItems) {
    const existing = await getEpisodeByBbcId(env.DB, item.bbc_id);
    if (!existing) {
      await insertEpisode(env.DB, {
        bbc_id: item.bbc_id,
        title: item.title,
        description: item.description,
        audio_url: item.audio_url,
        audio_r2_key: null,
        page_url: item.page_url,
        duration_sec: item.duration_sec,
        published_at: item.published_at,
        transcript: null,
        transcript_segments: null,
        fetch_status: 'pending',
      });
      newCount++;
    }
  }
  log.push(`Inserted ${newCount} new episodes`);

  // Step 3: Fetch transcripts and audio URLs for pending episodes
  const pending = await getPendingEpisodes(env.DB, 5);
  log.push(`Pending transcripts: ${pending.length}`);

  for (const ep of pending) {
    if (!ep.page_url) {
      await updateEpisodeFetchStatus(env.DB, ep.bbc_id, 'failed');
      log.push(`No page_url: ${ep.bbc_id}`);
      continue;
    }

    await updateEpisodeFetchStatus(env.DB, ep.bbc_id, 'fetching');

    try {
      // Fetch both transcript and audio URL from the page
      const [transcript, audioUrl] = await Promise.all([
        fetchTranscript(ep.page_url),
        fetchAudioUrl(ep.page_url),
      ]);

      if (transcript && transcript.segments.length > 0) {
        const segmentsJson = JSON.stringify(transcript.segments);
        await updateEpisodeTranscript(env.DB, ep.bbc_id, transcript.plain, segmentsJson, 'done');
        log.push(`Transcript OK: ${ep.bbc_id} (${transcript.segments.length} segments)`);
      } else if (transcript && transcript.plain.length > 0) {
        await updateEpisodeTranscript(env.DB, ep.bbc_id, transcript.plain, null, 'done');
        log.push(`Transcript plain only: ${ep.bbc_id} (${transcript.plain.length} chars)`);
      } else {
        await updateEpisodeTranscript(env.DB, ep.bbc_id, '', null, 'failed');
        log.push(`Transcript empty: ${ep.bbc_id}`);
      }

      if (audioUrl) {
        await updateEpisodeAudioUrl(env.DB, ep.bbc_id, audioUrl);
        log.push(`Audio URL found: ${ep.bbc_id} → ${audioUrl.substring(0, 80)}`);
      } else {
        log.push(`No audio URL: ${ep.bbc_id}`);
      }
    } catch (err: any) {
      await updateEpisodeTranscript(env.DB, ep.bbc_id, '', null, 'failed');
      log.push(`Error (${ep.bbc_id}): ${err?.message}`);
    }
  }

  return { ok: true, log };
}
