import { describe, it, expect, vi } from 'vitest';
import { renderPlanWithGPT } from '../src/ai/presenter-gpt.js';
import * as openai from '../src/services/openai.js';

const plan = {
  week_start: '2026-02-16',
  week_end: '2026-02-22',
  total_km: 20,
  workouts: [{
    date: '2026-02-16',
    day_ru: 'понедельник',
    type: 'easy_run',
    type_ru: 'Лёгкий бег',
    description: 'Лёгкий бег',
    distance_km: 5,
    target_pace_min_km: '6:00',
    treadmill_kmh: 10,
    rpe: 4
  }],
  raw_plan: 'RAW',
  meta: { generator: 'ts-bot', version: 'v1', created_at: 'now' }
};

describe('gpt presenter', () => {
  it('uses gpt text when provided', async () => {
    vi.spyOn(openai, 'extractWithOpenAI').mockResolvedValueOnce({ text: 'OK' });
    const res = await renderPlanWithGPT(plan as any);
    expect(res).toBe('OK');
  });

  it('fallbacks to raw plan', async () => {
    vi.spyOn(openai, 'extractWithOpenAI').mockResolvedValueOnce({});
    const res = await renderPlanWithGPT(plan as any);
    expect(res).toBe('RAW');
  });
});
