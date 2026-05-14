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
  // Strategy A: Find transcript heading (h2/h3 or p+strong), extract region after it
  const regionA = findTranscriptRegion(html);
  if (regionA) {
    const segments = splitBySpeakers(regionA);
    if (segments.length >= 4) return buildResult(segments);
  }

  // Strategy B: Find <div class="transcript">
  const divMatch = /<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (divMatch) {
    const segments = splitBySpeakers(divMatch[1]);
    if (segments.length >= 4) return buildResult(segments);
  }

  // Strategy C: Full-page scan — collect all <p> tags with speaker labels
  const segments = scanPageForSpeakers(html);
  if (segments.length >= 4) return buildResult(segments);

  return null;
}

// Strategy A helper: find the transcript region after a heading
function findTranscriptRegion(html: string): string | null {
  // Old format: <h2>Transcript</h2>
  let match = /<h[23][^>]*>[^<]*transcript[^<]*<\/h[23]>/i.exec(html);
  if (match) {
    const start = match.index + match[0].length;
    const rest = html.substring(start);
    // Stop at next heading or widget div
    const endMatch = /(?:<h[1-6][^>]*>|<div[^>]*class="[^"]*widget[^"]*")/i.exec(rest);
    return endMatch ? rest.substring(0, endMatch.index) : rest.substring(0, 50000);
  }

  // New format: <p><strong>TRANSCRIPT</strong></p>
  match = /<p[^>]*>\s*<(?:strong|b)[^>]*>[^<]*transcript[^<]*<\/(?:strong|b)>\s*<\/p>/i.exec(html);
  if (match) {
    const start = match.index + match[0].length;
    const rest = html.substring(start);
    // Stop at next heading or widget div
    const endMatch = /(?:<h[1-6][^>]*>|<div[^>]*class="[^"]*widget[^"]*")/i.exec(rest);
    return endMatch ? rest.substring(0, endMatch.index) : rest.substring(0, 50000);
  }

  return null;
}

// Strategy C helper: scan all <p> tags on the page for speaker-labeled content
function scanPageForSpeakers(html: string): TranscriptSegment[] {
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  const allSpeakerContent: string[] = [];

  while ((match = pRegex.exec(html)) !== null) {
    const content = match[1];
    // Only keep <p> tags that contain speaker format: <strong>Name</strong><br /> or <strong>Name<br /></strong>
    if (/<(?:strong|b)[^>]*>[^<]+<br\s*\/?>\s*<\/(?:strong|b)>/i.test(content) ||
        /<(?:strong|b)[^>]*>[^<]+<\/(?:strong|b)>\s*<br\s*\/?>/i.test(content) ||
        /^\s*<(?:strong|b)[^>]*>[^<]+<br\s*\/?>\s*<\/(?:strong|b)>/i.test(content) ||
        /^\s*<(?:strong|b)[^>]*>[^<]+<\/(?:strong|b)>\s*<br\s*\/?>/i.test(content)) {
      allSpeakerContent.push(content);
    }
  }

  // Join all speaker-labeled content and split by speakers
  return splitBySpeakers(allSpeakerContent.join('\n'));
}

// Core: split HTML content by speaker label boundaries
// BBC HTML format: <strong>Neil</strong><br />Hello. This is 6 Minute English...
// The <br> comes AFTER the speaker name, separating it from dialogue.
// Bold words in dialogue appear mid-sentence without trailing <br>:
//   ...the <strong>worst-case scenario</strong> is...
function splitBySpeakers(html: string): TranscriptSegment[] {
  // Match speaker labels in two BBC formats:
  // 1. <strong>Neil</strong><br /> — <br> outside <strong>
  // 2. <strong>Georgie<br /></strong> — <br> inside <strong>
  // At least one <br> must be present (to exclude bold words in dialogue).
  const speakerRegex = /<(?:strong|b)[^>]*>([^<]+)<br\s*\/?>\s*<\/(?:strong|b)>|<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>\s*<br\s*\/?>/gi;
  const speakers: Array<{ name: string; tagStart: number; afterTag: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = speakerRegex.exec(html)) !== null) {
    const name = decodeEntities(match[1] || match[2]).trim();
    // Skip long text (likely not a speaker name) and common non-speaker labels
    if (name.length > 30 || /^(?:transcript|note|notes|quiz|worksheet|download)$/i.test(name)) continue;
    speakers.push({
      name,
      tagStart: match.index,
      afterTag: match.index + match[0].length,
    });
  }

  // Also check if content starts with a speaker (no preceding <br>)
  const startMatch = /^\s*<(?:strong|b)[^>]*>([^<]+)<br\s*\/?>\s*<\/(?:strong|b)>|^\s*<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>\s*<br\s*\/?>/i.exec(html);
  if (startMatch) {
    const name = decodeEntities(startMatch[1] || startMatch[2]).trim();
    if (name.length <= 30 && !/^(?:transcript|note|notes|quiz|worksheet|download)$/i.test(name)) {
      // Only add if not already captured at index 0
      if (speakers.length === 0 || speakers[0].tagStart !== 0) {
        speakers.unshift({
          name,
          tagStart: 0,
          afterTag: startMatch[0].length,
        });
      }
    }
  }

  if (speakers.length === 0) return [];

  // Deduplicate speakers at the same position
  const unique = speakers.filter((s, i) => i === 0 || s.tagStart !== speakers[i - 1].tagStart);

  const segments: TranscriptSegment[] = [];

  for (let i = 0; i < unique.length; i++) {
    const speaker = unique[i];
    const contentStart = speaker.afterTag;
    const contentEnd = i + 1 < unique.length ? unique[i + 1].tagStart : html.length;
    const rawContent = html.substring(contentStart, contentEnd);
    const text = cleanHtml(rawContent).trim();
    if (text.length > 0) {
      segments.push({ speaker: speaker.name, text });
    }
  }

  return segments;
}

function buildResult(segments: TranscriptSegment[]): TranscriptResult {
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
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&pound;/g, '£')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
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

export interface VerboseDiag {
  httpStatus: number | null;
  htmlLength: number;
  headingFound: boolean;
  headingText: string | null;
  headingIndex: number;
  fallbackDivFound: boolean;
  fallbackSegments: number;
  strategy: string | null;
  segmentCount: number;
  speakers: string[];
}

export async function fetchTranscriptVerbose(pageUrl: string): Promise<{ result: TranscriptResult | null; diag: VerboseDiag }> {
  const diag: VerboseDiag = {
    httpStatus: null,
    htmlLength: 0,
    headingFound: false,
    headingText: null,
    headingIndex: -1,
    fallbackDivFound: false,
    fallbackSegments: 0,
    strategy: null,
    segmentCount: 0,
    speakers: [],
  };

  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BBCEnglishBot/1.0)' },
      redirect: 'follow',
    });

    diag.httpStatus = response.status;
    if (!response.ok) return { result: null, diag };

    const html = await response.text();
    diag.htmlLength = html.length;

    // Check heading
    let headingMatch = /<h[23][^>]*>[^<]*transcript[^<]*<\/h[23]>/i.exec(html);
    if (!headingMatch) {
      headingMatch = /<p[^>]*>\s*<(?:strong|b)[^>]*>[^<]*transcript[^<]*<\/(?:strong|b)>\s*<\/p>/i.exec(html);
    }
    if (headingMatch) {
      diag.headingFound = true;
      diag.headingText = headingMatch[0].substring(0, 200);
      diag.headingIndex = headingMatch.index;
    }

    // Check fallback div
    const divMatch = /<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (divMatch) {
      diag.fallbackDivFound = true;
      diag.fallbackSegments = splitBySpeakers(divMatch[1]).length;
    }

    // Run extraction and determine which strategy succeeded
    const regionA = findTranscriptRegion(html);
    if (regionA) {
      const segs = splitBySpeakers(regionA);
      if (segs.length >= 4) {
        diag.strategy = 'A: heading region';
      }
    }
    if (!diag.strategy && divMatch) {
      const segs = splitBySpeakers(divMatch[1]);
      if (segs.length >= 4) {
        diag.strategy = 'B: transcript div';
      }
    }
    if (!diag.strategy) {
      const segs = scanPageForSpeakers(html);
      if (segs.length >= 4) {
        diag.strategy = 'C: full-page scan';
      }
    }

    const result = extractTranscript(html);
    if (result) {
      diag.segmentCount = result.segments.length;
      diag.speakers = [...new Set(result.segments.map(s => s.speaker))];
    }

    return { result, diag };
  } catch (err: any) {
    return { result: null, diag };
  }
}
