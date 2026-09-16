import type { Card, ImportRow } from '../types';

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”„]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ');
}

export function isAnswerCorrect(input: string, answer: string): boolean {
  return normalizeAnswer(input) === normalizeAnswer(answer);
}

export function seededNumber(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let state = seededNumber(seed) || 1;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function detectDelimiter(text: string): string | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 8);
  const candidates = ['\t', ';', ','];
  const scores = candidates.map((delimiter) => {
    const counts = lines.map((line) => splitDelimitedLine(line, delimiter).length);
    const usable = counts.filter((count) => count >= 2).length;
    const consistent = new Set(counts.filter((count) => count >= 2)).size <= 1 ? 1 : 0;
    return { delimiter, score: usable * 2 + consistent };
  });
  const best = scores.sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 3 ? best.delimiter : null;
}

export function parseImportText(text: string): ImportRow[] {
  const cleanLines = text.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = detectDelimiter(text);
  let rows: string[][];

  if (delimiter) {
    rows = cleanLines.map((line) => splitDelimitedLine(line, delimiter));
  } else if (cleanLines.length >= 2 && cleanLines.length % 2 === 0) {
    rows = [];
    for (let i = 0; i < cleanLines.length; i += 2) {
      rows.push([cleanLines[i].trim(), cleanLines[i + 1].trim()]);
    }
  } else {
    rows = cleanLines.map((line) => [line.trim()]);
  }

  return rows.map((cells, index) => {
    const nonEmpty = cells.filter(Boolean).length;
    return {
      index: index + 1,
      cells,
      valid: cells.length >= 2 && nonEmpty >= 2,
      error: cells.length < 2 ? 'Could not find a term and definition' : nonEmpty < 2 ? 'One side is empty' : undefined
    };
  });
}

export function formatRelativeDate(timestamp: number): string {
  const difference = timestamp - Date.now();
  const abs = Math.abs(difference);
  if (abs < 60_000) return difference >= 0 ? 'now' : 'just now';
  if (abs < 3_600_000) {
    const minutes = Math.round(abs / 60_000);
    return difference >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
  }
  if (abs < 86_400_000) {
    const hours = Math.round(abs / 3_600_000);
    return difference >= 0 ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.round(abs / 86_400_000);
  return difference >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function getCardSide(card: Card, reverse: boolean): { prompt: string; answer: string } {
  return reverse
    ? { prompt: card.definition, answer: card.term }
    : { prompt: card.term, answer: card.definition };
}
