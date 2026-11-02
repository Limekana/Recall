import { describe, expect, it } from 'vitest';
import { detectDelimiter, editDistance, gradeAnswer, isAnswerCorrect, parseImportText } from './utils';

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

  it('ignores punctuation and treats parenthesised asides as optional', () => {
    expect(isAnswerCorrect('thank you', 'Thank you!')).toBe(true);
    expect(isAnswerCorrect('well-known', 'well known')).toBe(true);
    expect(isAnswerCorrect('mitochondria', 'Mitochondria (organelle)')).toBe(true);
    expect(isAnswerCorrect('mitochondria organelle', 'Mitochondria (organelle)')).toBe(true);
  });

  it('accepts small typos on longer answers and reports them', () => {
    expect(gradeAnswer('photosynthesis', 'Photosynthesis')).toBe('correct');
    expect(gradeAnswer('photosynthsis', 'Photosynthesis')).toBe('typo');
    expect(gradeAnswer('recieve', 'receive')).toBe('typo');
    expect(gradeAnswer('fotosynthesis', 'photosynthesis')).toBe('typo');
    expect(gradeAnswer('photosyn', 'photosynthesis')).toBe('wrong');
  });

  it('allows no typos on short words or numbers', () => {
    expect(gradeAnswer('hen', 'hej')).toBe('wrong');
    expect(gradeAnswer('1946', '1945')).toBe('wrong');
  });

  it('measures edit distance with transpositions', () => {
    expect(editDistance('abcd', 'abdc')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('still rejects different or empty answers', () => {
    expect(isAnswerCorrect('hello', 'goodbye')).toBe(false);
    expect(isAnswerCorrect('!!!', 'Hi')).toBe(false);
  });
});
