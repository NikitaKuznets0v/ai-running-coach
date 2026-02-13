import { describe, it, expect, vi } from 'vitest';
import * as openai from '../src/services/openai.js';
import { parseTrainingWithAI } from '../src/ai/training-parser.js';

const fixedNow = new Date('2026-02-13T10:00:00Z');

describe('training parser', () => {
  it('parses distance and duration without OpenAI', async () => {
    const spy = vi.spyOn(openai, 'extractWithOpenAI');
    const res = await parseTrainingWithAI('пробежал 8 км за 45 минут, пульс средний 148', fixedNow);
    expect(res.distance_km).toBe(8);
    expect(res.duration_seconds).toBe(2700);
    expect(res.avg_heart_rate).toBe(148);
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back to OpenAI when missing duration', async () => {
    vi.spyOn(openai, 'extractWithOpenAI').mockResolvedValueOnce({ duration_minutes: 32 });
    const res = await parseTrainingWithAI('пробежал 5 км', fixedNow);
    expect(res.distance_km).toBe(5);
    expect(res.duration_seconds).toBe(1920);
  });
});
