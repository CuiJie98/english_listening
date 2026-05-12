import type { FeedItem } from '../types';

export async function fetchFeed(rssUrl: string): Promise<FeedItem[]> {
  const response = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BBCEnglishBot/1.0)' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Feed request failed: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = parseRssXml(xml);

  if (items.length === 0) {
    throw new Error('Feed returned no episodes');
  }

  return items;
}

function parseRssXml(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const description = extractTag(itemXml, 'description');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const guid = extractTag(itemXml, 'guid');
    const enclosure = extractEnclosure(itemXml);
    const duration = extractDuration(itemXml);

    if (!title) continue;

    const rawGuid = guid ? extractCdataContent(guid) : null;
    const bbcId = rawGuid || extractBbcIdFromLink(link) || title;
    const cleanLink = link ? extractCdataContent(link) : '';

    items.push({
      bbc_id: bbcId,
      title: extractCdataContent(title) || title,
      description: description ? (extractCdataContent(description) || description) : '',
      audio_url: enclosure || '',
      page_url: cleanLink || '',
      published_at: pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : 0,
      duration_sec: duration ? parseDuration(duration) : null,
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = regex.exec(xml);
  return m ? m[1].trim() : null;
}

function extractEnclosure(xml: string): string | null {
  // Try <enclosure> tag first
  const enclosureRegex = /<enclosure\b[^>]*\burl=["']([^"']*)["'][^>]*\/?>/i;
  const enclosureMatch = enclosureRegex.exec(xml);
  if (enclosureMatch) return enclosureMatch[1];

  // Try <media:content> tag (used by BBC RSS)
  const mediaRegex = /<media:content\b[^>]*\burl=["']([^"']*)["'][^>]*\/?>/i;
  const mediaMatch = mediaRegex.exec(xml);
  if (mediaMatch) return mediaMatch[1];

  return null;
}

function extractDuration(xml: string): string | null {
  const regex = /<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/i;
  const m = regex.exec(xml);
  return m ? m[1].trim() : null;
}

function extractCdataContent(text: string): string {
  const m = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(text);
  return m ? m[1] : text;
}

function extractBbcIdFromLink(link: string | null): string | null {
  if (!link) return null;
  const clean = extractCdataContent(link);
  // Try ep-XXXXXX pattern first
  const epMatch = /\/ep-([^/?\s]+)/i.exec(clean);
  if (epMatch) return epMatch[1];
  // Try /XXXXXX pattern (like /260122)
  const numMatch = /\/(\d{6})(?:\/|$)/.exec(clean);
  if (numMatch) return numMatch[1];
  return null;
}

function parseDuration(duration: string): number | null {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}
