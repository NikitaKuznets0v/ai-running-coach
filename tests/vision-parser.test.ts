import { describe, it, expect, vi } from 'vitest';
import * as vision from '../src/services/openai-vision.js';
import { parseTrainingFromImage } from '../src/ai/vision-parser.js';

const fakeImg = 'data:image/jpeg;base64,AAAA';

describe('vision parser', () => {
  it('parses training from image', async () => {
    vi.spyOn(vision, 'extractWithOpenAIVision').mockResolvedValueOnce({
      distance_km: 5,
      duration_minutes: 30,
      avg_heart_rate: 140
    });

    const res = await parseTrainingFromImage(fakeImg, new Date('2026-02-13T10:00:00Z'));
    expect(res.distance_km).toBe(5);
    expect(res.duration_seconds).toBe(1800);
    expect(res.avg_heart_rate).toBe(140);
  });
});
