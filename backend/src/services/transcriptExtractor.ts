export interface TranscriptSegment {
  speaker: string;
  text: string;
}

export interface TranscriptResult {
  plain: string;
  segments: TranscriptSegment[];
}

export async function fetchTranscript(pageUrl: string): Promise<TranscriptResult | null> {
  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BBCEnglishBot/1.0)' },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const html = await response.text();
    return extractTranscript(html);
  } catch {
    return null;
  }
}

export async function fetchAudioUrl(pageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BBCEnglishBot/1.0)' },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const html = await response.text();
    return extractAudioUrl(html);
  } catch {
    return null;
  }
}

function extractAudioUrl(html: string): string | null {
  const patterns = [
    /https?:\/\/[^"'\s<>]+\.mp3[^"'\s<>]*/i,
    /https?:\/\/sounds\.bbc\.co\.uk[^"'\s<>]+/i,
    /data-media-url="([^"]+)"/i,
    /data-src="(https?:\/\/[^"]*\.mp3[^"]*)"/i,
    /"mediaUrl"\s*:\s*"([^"]+)"/i,
    /"audioUrl"\s*:\s*"([^"]+)"/i,
    /"streamUrl"\s*:\s*"([^"]+)"/i,
    /"url"\s*:\s*"(https?:\/\/[^"]*\.mp3[^"]*)"/i,
    /<source[^>]+src="(https?:\/\/[^"]*\.mp3[^"]*)"/i,
    /https?:\/\/ichef\.bbci\.co\.uk[^"'\s<>]*\.mp3[^"'\s<>]*/i,
    /https?:\/\/podcasts\.files\.bbc\.co\.uk[^"'\s<>]+/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) {
      const url = match[1] || match[0];
      return url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    }
  }

  return null;
}

function extractTranscript(html: string): TranscriptResult | null {
  // Strategy: find <h2>Transcript</h2> (or <h3>), then collect all <p> tags after it
  // within the same widget container, stopping at the next heading or end of widget.

  const headingMatch = /<h[23][^>]*>[^<]*transcript[^<]*<\/h[23]>/i.exec(html);
  if (!headingMatch) {
    // Fallback: try to find any transcript-related div
    return extractTranscriptFallback(html);
  }

  // Find the start position: right after the heading
  const startPos = headingMatch.index + headingMatch[0].length;

  // Find the end of the widget container (next <div class="widget or </div> at widget level)
  // We look for the next <h2> or <h3> at the same level, or end of the parent widget div
  const afterHeading = html.substring(startPos);

  // Collect all <p> tags until we hit another heading or a closing widget div
  const segments = parseParagraphsUntilHeading(afterHeading);

  if (segments.length === 0) {
    return extractTranscriptFallback(html);
  }

  const plain = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n');
  return { plain, segments };
}

function parseParagraphsUntilHeading(html: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const headingRegex = /<h[1-6][^>]*>/gi;
  let match: RegExpExecArray | null;
  let headingMatch: RegExpExecArray | null;

  // Find all <p> tags and <h*> tags, in order
  const allTags: Array<{ type: 'p' | 'h'; index: number; content?: string; full?: string }> = [];

  while ((match = pRegex.exec(html)) !== null) {
    allTags.push({ type: 'p', index: match.index, content: match[1], full: match[0] });
  }

  while ((headingMatch = headingRegex.exec(html)) !== null) {
    allTags.push({ type: 'h', index: headingMatch.index, full: headingMatch[0] });
  }

  // Sort by position
  allTags.sort((a, b) => a.index - b.index);

  // Process <p> tags until we hit a heading
  for (const tag of allTags) {
    if (tag.type === 'h') break; // Stop at next heading
    if (tag.type === 'p' && tag.content) {
      const segment = parseParagraphContent(tag.content);
      if (segment) segments.push(segment);
    }
  }

  return segments;
}

function parseParagraphContent(html: string): TranscriptSegment | null {
  // BBC format: <strong>Speaker Name</strong>&nbsp;&nbsp;Dialogue text
  // Or sometimes: <b>Speaker Name</b>&nbsp;&nbsp;Dialogue text

  // Try to extract speaker name from <strong> or <b> at the start
  const speakerMatch = /^<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>(?:\s|&nbsp;)*(?:<br\s*\/?>)?/i.exec(html);

  if (speakerMatch) {
    const speaker = decodeEntities(speakerMatch[1]).trim();
    const remaining = html.substring(speakerMatch[0].length);
    const text = cleanHtml(remaining).trim();
    if (text.length > 0) {
      return { speaker, text };
    }
  }

  // No speaker label — skip non-dialogue content
  return null;
}

function extractTranscriptFallback(html: string): TranscriptResult | null {
  // Look for a div with "transcript" in its class and extract <p> tags from it
  const divMatch = /<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (divMatch) {
    return parseHtmlToTranscript(divMatch[1]);
  }

  return null;
}

function parseHtmlToTranscript(html: string): TranscriptResult | null {
  const segments: TranscriptSegment[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(html)) !== null) {
    const segment = parseParagraphContent(match[1]);
    if (segment) segments.push(segment);
  }

  if (segments.length === 0) return null;

  const plain = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n');
  return { plain, segments };
}

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
