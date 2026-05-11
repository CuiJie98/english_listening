import { config } from '../constants/config';
import type { FeedItem } from '../types/feed';

export async function fetchFeed(): Promise<FeedItem[]> {
  const response = await fetch(config.bbcRssUrl);
  const xml = await response.text();
  return parseRssXml(xml);
}

function parseRssXml(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
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

    if (!title || !enclosure) continue;

    const bbcId = guid || extractBbcIdFromLink(link) || title;
    const audioUrl = enclosure;

    items.push({
      bbc_id: bbcId,
      title: extractCdataContent(title) || title,
      description: description ? (extractCdataContent(description) || description) : '',
      audio_url: extractUrlAttribute(audioUrl),
      page_url: link || '',
      published_at: pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : 0,
      duration_sec: duration ? parseDuration(duration) : null,
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

function extractEnclosure(xml: string): string | null {
  const regex = /<enclosure[^>]*url="([^"]*)"[^>]*\/?>/i;
  const match = regex.exec(xml);
  return match ? match[1] : null;
}

function extractUrlAttribute(text: string): string {
  const urlMatch = /url="([^"]*)"/i.exec(text);
  if (urlMatch) return urlMatch[1];
  if (text.startsWith('http')) return text;
  return text;
}

function extractDuration(xml: string): string | null {
  const regex = /<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/i;
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

function extractCdataContent(text: string): string {
  const cdataMatch = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(text);
  return cdataMatch ? cdataMatch[1] : text;
}

function extractBbcIdFromLink(link: string | null): string | null {
  if (!link) return null;
  const match = /\/ep-([^/?\s]+)/i.exec(link);
  return match ? match[1] : null;
}

function parseDuration(duration: string): number | null {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}
