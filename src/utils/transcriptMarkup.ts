export interface TranscriptInlinePart {
  text: string;
  bold: boolean;
}

const BOLD_TAG_PATTERN = /<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const ANY_TAG_RE = /<\/?[^>]+>/g;

export function parseTranscriptMarkup(input: string): TranscriptInlinePart[] {
  const parts: TranscriptInlinePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const boldTagRe = new RegExp(BOLD_TAG_PATTERN);

  while ((match = boldTagRe.exec(input)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: decodeEntities(input.slice(lastIndex, match.index)), bold: false });
    }

    const boldText = stripTranscriptMarkup(match[2]).trim();
    if (boldText) {
      parts.push({ text: boldText, bold: true });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    parts.push({ text: decodeEntities(input.slice(lastIndex)), bold: false });
  }

  return mergeAdjacentBoldParts(parts.filter((part) => part.text.length > 0));
}

export function stripTranscriptMarkup(input: string): string {
  return decodeEntities(input.replace(new RegExp(BOLD_TAG_PATTERN), '$2').replace(ANY_TAG_RE, ''));
}

export function cleanTranscriptWord(input: string): string {
  return input.replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, '').trim();
}

export function cleanTranscriptPhrase(input: string): string {
  return stripTranscriptMarkup(input)
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’.,!?;:()[\]{}]+|[\s"'“”‘’.,!?;:()[\]{}]+$/g, '')
    .trim();
}

function mergeAdjacentBoldParts(parts: TranscriptInlinePart[]): TranscriptInlinePart[] {
  const merged: TranscriptInlinePart[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part.bold) {
      merged.push(part);
      continue;
    }

    let text = part.text;
    let cursor = i;
    while (
      cursor + 2 < parts.length &&
      !parts[cursor + 1].bold &&
      /^\s+$/.test(parts[cursor + 1].text) &&
      parts[cursor + 2].bold
    ) {
      text += parts[cursor + 1].text + parts[cursor + 2].text;
      cursor += 2;
    }

    merged.push({ text: cleanTranscriptPhrase(text), bold: true });
    i = cursor;
  }

  return merged.filter((part) => part.text.length > 0);
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/&hellip;/g, '...')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
