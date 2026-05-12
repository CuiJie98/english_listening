import { requireUserId } from '../auth';
import { getStats } from '../db/queries';
import type { Env } from '../types';

export async function handleGetStats(request: Request, _params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const stats = await getStats(env.DB, userId);
  return Response.json(stats);
}
