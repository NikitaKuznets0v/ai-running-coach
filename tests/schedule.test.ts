import { describe, it, expect, vi } from 'vitest';
import { handleScheduleChange } from '../src/handlers/schedule.js';
import * as supa from '../src/services/supabase.js';

const user = { id: 'u1', telegram_id: 1001 } as any;

describe('schedule change', () => {
  it('updates preferred days', async () => {
    vi.spyOn(supa, 'upsertUserProfile').mockResolvedValueOnce({} as any);
    const res = await handleScheduleChange(user, 'хочу тренироваться в пн, ср, пт');
    expect(res).toContain('понедельник');
  });
});
