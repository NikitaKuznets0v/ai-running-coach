import { describe, it, expect, vi } from 'vitest';
import * as telegram from '../src/utils/telegram-file.js';
import * as vision from '../src/ai/vision-parser.js';
import * as trainings from '../src/services/trainings.js';
import { handlePhotoLog } from '../src/handlers/photo-log.js';

const user = { id: 'u1', telegram_id: 1001 } as any;

describe('photo log merge', () => {
  it('merges second screenshot within window', async () => {
    vi.spyOn(telegram, 'getTelegramFileUrl').mockReturnValueOnce('https://example.com/file.jpg');
    vi.spyOn(telegram, 'fetchTelegramFileBase64').mockResolvedValueOnce('data:image/jpeg;base64,AAAA');
    vi.spyOn(vision, 'parseTrainingFromImage')
      .mockResolvedValueOnce({ date: '2026-02-13', distance_km: 5, duration_seconds: 1800 } as any);

    vi.spyOn(trainings, 'getLatestScreenshot').mockResolvedValueOnce({
      id: 't1',
      created_at: new Date().toISOString(),
      screenshot_count: 1
    } as any);
    vi.spyOn(trainings, 'updateTraining').mockResolvedValueOnce({} as any);

    const res = await handlePhotoLog(user, 'file/path.jpg');
    expect(res).toContain('Дополнено');
  });
});
