import { describe, expect, it } from 'vitest';
import { detectDelimiter, isAnswerCorrect, parseImportText } from './utils';

describe('spreadsheet import', () => {
  it('detects tab-separated rows', () => {
    const text = 'hej\thello\ntack\tthank you';
    expect(detectDelimiter(text)).toBe('\t');
    expect(parseImportText(text)).toHaveLength(2);
    expect(parseImportText(text)[1].cells).toEqual(['tack', 'thank you']);
  });

  it('handles quoted comma-separated values', () => {
    const rows = parseImportText('term,"a definition, with a comma"\nnext,answer');
    expect(rows[0].cells).toEqual(['term', 'a definition, with a comma']);
  });

  it('supports alternating newline pairs', () => {
    const rows = parseImportText('hej\nhello\ntack\nthank you');
    expect(rows).toHaveLength(2);
    expect(rows[0].cells).toEqual(['hej', 'hello']);
  });

  it('marks malformed rows instead of guessing', () => {
    const rows = parseImportText('only one line');
    expect(rows[0].valid).toBe(false);
    expect(rows[0].error).toBeTruthy();
  });
});

describe('answer comparison', () => {
  it('ignores case, surrounding whitespace, and diacritics', () => {
    expect(isAnswerCorrect('  résumé ', 'Resume')).toBe(true);
  });
});
