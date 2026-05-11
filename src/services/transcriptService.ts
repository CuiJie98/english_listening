export async function fetchTranscript(pageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pageUrl);
    const html = await response.text();
    return extractTranscript(html);
  } catch {
    return null;
  }
}

function extractTranscript(html: string): string | null {
  // Try multiple patterns to find transcript content
  const patterns = [
    // BBC Learning English transcript containers
    /<div[^>]*class="[^"]*text-with-mp3[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*widget/i,
    /<div[^>]*class="[^"]*widget-richtext[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    // Generic content area
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]{200,}?)<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match && match[1]) {
      const text = cleanHtml(match[1]);
      if (text.length > 100) return text;
    }
  }

  // Last resort: extract all paragraph text
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = cleanHtml(pMatch[1]);
    if (text.length > 20 && isTranscriptLine(text)) {
      paragraphs.push(text);
    }
  }

  if (paragraphs.length >= 3) {
    return paragraphs.join('\n');
  }

  return null;
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isTranscriptLine(text: string): boolean {
  // Filter out navigation, headers, and short labels
  if (text.length < 10) return false;
  if (/^(next|previous|menu|home|back|share|download)$/i.test(text)) return false;
  if (/^\d+\.\s*$/.test(text)) return false;
  // Transcript lines typically contain conversational English
  return /[a-z]{3,}/i.test(text);
}
