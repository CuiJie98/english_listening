import { requireUserId } from '../auth';
import { getAttempts, insertAttempt } from '../db/queries';
import type { Env } from '../types';

export async function handleListAttempts(request: Request, _params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  const attempts = await getAttempts(env.DB, userId, Number.isNaN(limit) ? 10 : limit);
  return Response.json({ attempts });
}

export async function handleCreateAttempt(request: Request, _params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const body = await request.json<{
    episode_id: number;
    type: 'listen' | 'shadow';
    duration_ms?: number;
    score?: number;
    segment_index?: number;
    segment_start_sec?: number;
    segment_end_sec?: number;
    segment_text?: string;
    self_rating?: 'again' | 'hard' | 'good' | 'easy';
  }>();

  if (!body.episode_id || !body.type) {
    return Response.json({ error: 'episode_id and type are required' }, { status: 400 });
  }

  if (body.type !== 'listen' && body.type !== 'shadow') {
    return Response.json({ error: 'type must be listen or shadow' }, { status: 400 });
  }

  if (body.score !== undefined && (!Number.isFinite(body.score) || body.score < 0 || body.score > 100)) {
    return Response.json({ error: 'score must be between 0 and 100' }, { status: 400 });
  }

  if (
    body.self_rating !== undefined &&
    !['again', 'hard', 'good', 'easy'].includes(body.self_rating)
  ) {
    return Response.json({ error: 'self_rating must be again, hard, good, or easy' }, { status: 400 });
  }

  if (body.segment_index !== undefined && (!Number.isInteger(body.segment_index) || body.segment_index < 0)) {
    return Response.json({ error: 'segment_index must be a non-negative integer' }, { status: 400 });
  }

  if (
    (body.segment_start_sec !== undefined && !Number.isFinite(body.segment_start_sec)) ||
    (body.segment_end_sec !== undefined && !Number.isFinite(body.segment_end_sec))
  ) {
    return Response.json({ error: 'segment_start_sec and segment_end_sec must be numbers' }, { status: 400 });
  }

  if (
    body.segment_start_sec !== undefined &&
    body.segment_end_sec !== undefined &&
    body.segment_end_sec <= body.segment_start_sec
  ) {
    return Response.json({ error: 'segment_end_sec must be greater than segment_start_sec' }, { status: 400 });
  }

  const id = await insertAttempt(env.DB, {
    user_id: userId,
    episode_id: body.episode_id,
    type: body.type,
    duration_ms: body.duration_ms,
    score: body.score,
    segment_index: body.segment_index,
    segment_start_sec: body.segment_start_sec,
    segment_end_sec: body.segment_end_sec,
    segment_text: body.segment_text,
    self_rating: body.self_rating,
  });

  return Response.json({ id }, { status: 201 });
}
