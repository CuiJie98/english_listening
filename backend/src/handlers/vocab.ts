import { requireUserId } from '../auth';
import {
  getVocabCards,
  getDueVocabCards,
  insertVocabCard,
  deleteVocabCard,
  updateVocabCard,
  getVocabCardById,
  getReviewState,
  upsertReviewState,
} from '../db/queries';
import { calculateSm2 } from '../utils/spacedRepetition';
import type { Env } from '../types';

export async function handleListVocab(request: Request, _params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const cards = await getVocabCards(env.DB, userId);
  return Response.json({ cards });
}

export async function handleDueVocab(request: Request, _params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const cards = await getDueVocabCards(env.DB, userId);
  return Response.json({ cards });
}

export async function handleCreateVocab(request: Request, _params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const body = await request.json<{
    word_or_phrase: string;
    context?: string;
    definition?: string;
    episode_id?: number;
  }>();

  if (!body.word_or_phrase?.trim()) {
    return Response.json({ error: 'word_or_phrase is required' }, { status: 400 });
  }

  const id = await insertVocabCard(env.DB, {
    user_id: userId,
    word_or_phrase: body.word_or_phrase.trim(),
    context: body.context,
    definition: body.definition,
    episode_id: body.episode_id,
  });

  return Response.json({ id }, { status: 201 });
}

export async function handleUpdateVocab(request: Request, params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return Response.json({ error: 'Invalid card ID' }, { status: 400 });
  }

  const body = await request.json<{ word_or_phrase?: string; context?: string; definition?: string }>();
  const fields: { word_or_phrase?: string; context?: string; definition?: string } = {};
  if (body.word_or_phrase !== undefined) fields.word_or_phrase = body.word_or_phrase.trim();
  if (body.context !== undefined) fields.context = body.context;
  if (body.definition !== undefined) fields.definition = body.definition;

  if (fields.word_or_phrase !== undefined && !fields.word_or_phrase) {
    return Response.json({ error: 'word_or_phrase cannot be empty' }, { status: 400 });
  }

  const updated = await updateVocabCard(env.DB, id, userId, fields);
  if (!updated) {
    return Response.json({ error: 'Card not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function handleDeleteVocab(request: Request, params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return Response.json({ error: 'Invalid card ID' }, { status: 400 });
  }

  const deleted = await deleteVocabCard(env.DB, id, userId);
  if (!deleted) {
    return Response.json({ error: 'Card not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function handleReviewVocab(request: Request, params: Record<string, string>, env: Env): Promise<Response> {
  const userId = requireUserId(request);

  const cardId = parseInt(params.id, 10);
  if (isNaN(cardId)) {
    return Response.json({ error: 'Invalid card ID' }, { status: 400 });
  }

  const body = await request.json<{ quality: number }>();
  const quality = body.quality;
  if (typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 5) {
    return Response.json({ error: 'quality must be 0-5' }, { status: 400 });
  }

  const card = await getVocabCardById(env.DB, cardId, userId);
  if (!card) {
    return Response.json({ error: 'Card not found' }, { status: 404 });
  }

  const existing = await getReviewState(env.DB, cardId);

  const result = calculateSm2(
    quality,
    existing?.easiness ?? 2.5,
    existing?.interval_days ?? 0,
    existing?.repetitions ?? 0
  );

  await upsertReviewState(env.DB, cardId, {
    easiness: result.easiness,
    interval_days: result.interval_days,
    repetitions: result.repetitions,
    next_review: result.next_review,
    last_review: Math.floor(Date.now() / 1000),
  });

  return Response.json(result);
}
