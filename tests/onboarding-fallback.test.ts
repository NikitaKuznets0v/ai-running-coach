import { describe, it, expect, vi } from 'vitest';
import { handleOnboarding } from '../src/handlers/onboarding.js';
import * as supa from '../src/services/supabase.js';
import * as openai from '../src/services/openai.js';

const baseUser = {
  id: 'u1',
  telegram_id: 1,
  first_name: 'Test',
  onboarding_stage: 'profile'
};

describe('onboarding fallback', () => {
  it('uses openai when local extraction fails', async () => {
    vi.spyOn(openai, 'extractWithOpenAI').mockResolvedValueOnce({ age: 40 });
    vi.spyOn(supa, 'upsertUserProfile').mockResolvedValueOnce({ ...baseUser, age: 40, onboarding_stage: 'physical' } as any);

    const res = await handleOnboarding(baseUser as any, 'мне сорок лет');
    expect(res.updated.age).toBe(40);
  });
});
