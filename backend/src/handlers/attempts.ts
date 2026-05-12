import { requireUserId } from '../auth';
import { insertAttempt } from '../db/queries';
import type { Env } from '../types';

export async function handleCreateAttempt(request: Request, _params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const body = await request.json<{
    episode_id: number;
    type: 'listen' | 'shadow';
    duration_ms?: number;
  }>();

  if (!body.episode_id || !body.type) {
    return Response.json({ error: 'episode_id and type are required' }, { status: 400 });
  }

  const id = await insertAttempt(env.DB, {
    user_id: userId,
    episode_id: body.episode_id,
    type: body.type,
    duration_ms: body.duration_ms,
  });

  return Response.json({ id }, { status: 201 });
}
