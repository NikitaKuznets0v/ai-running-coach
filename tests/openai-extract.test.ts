import { describe, it, expect, vi } from 'vitest';
import * as openai from '../src/services/openai.js';
import { fallbackExtract } from '../src/utils/openai-extract.js';

describe('openai fallback extract', () => {
  it('returns parsed json', async () => {
    vi.spyOn(openai, 'extractWithOpenAI').mockResolvedValueOnce({ age: 32 });
    const res = await fallbackExtract('age', 'мне 32');
    expect(res.age).toBe(32);
  });
});
