import type { Episode } from '../types';

export interface TranscriptSegmentTiming {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
}

export interface AlignmentWindow {
  start: number;
  end: number;
}

const MIN_SEGMENT_SECONDS = 2;

export function stripTranscriptMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTranscriptSegments(raw: string | null): TranscriptSegmentTiming[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((seg) => seg && typeof seg.text === 'string')
      .map((seg) => ({
        speaker: typeof seg.speaker === 'string' ? seg.speaker : '',
        text: seg.text,
        start: typeof seg.start === 'number' ? seg.start : undefined,
        end: typeof seg.end === 'number' ? seg.end : undefined,
      }));
  } catch {
    return [];
  }
}

export function resolveAlignmentWindow(episode: Pick<Episode, 'duration_sec' | 'transcript_start_sec' | 'transcript_end_sec'>): AlignmentWindow | null {
  const duration = coerceNumber(episode.duration_sec);
  const configuredStart = coerceNumber(episode.transcript_start_sec);
  const configuredEnd = coerceNumber(episode.transcript_end_sec);
  const start = configuredStart ?? 0;
  const end = configuredEnd ?? duration;

  if (end === null) return null;
  if (start < 0 || end <= start) return null;
  if (duration !== null && end > duration + 0.5) return null;

  return { start, end };
}

export function alignTranscriptSegments(
  segments: TranscriptSegmentTiming[],
  window: AlignmentWindow
): TranscriptSegmentTiming[] {
  if (segments.length === 0) return [];

  const totalDuration = Math.max(0, window.end - window.start);
  if (totalDuration <= 0) return segments;

  const effectiveMin = Math.min(MIN_SEGMENT_SECONDS, totalDuration / segments.length);
  const remainingDuration = Math.max(0, totalDuration - effectiveMin * segments.length);
  const weights = segments.map((seg) => Math.max(1, stripTranscriptMarkup(seg.text).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || segments.length;

  let cursor = window.start;
  return segments.map((seg, index) => {
    const proportional = remainingDuration * (weights[index] / totalWeight);
    const segmentDuration = effectiveMin + proportional;
    const start = roundTime(cursor);
    const end = index === segments.length - 1
      ? roundTime(window.end)
      : roundTime(Math.min(window.end, cursor + segmentDuration));
    cursor = end;
    return { ...seg, start, end };
  });
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}
