import { describe, it, expect } from 'vitest';
import { parseTrainingUpdate } from '../src/utils/parse-training-update.js';

const fixedNow = new Date('2026-02-13T10:00:00Z');

describe('training update parser', () => {
  it('parses avg hr and notes', () => {
    const res = parseTrainingUpdate('средний пульс 142, заметка: легко далось', fixedNow);
    expect(res.avg_heart_rate).toBe(142);
    expect(res.notes).toBe('легко далось');
  });

  it('parses feeling', () => {
    const res = parseTrainingUpdate('самочувствие отличное', fixedNow);
    expect(res.feeling).toBe('great');
  });
});
