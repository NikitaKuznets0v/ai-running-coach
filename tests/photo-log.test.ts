import { describe, it, expect, vi } from 'vitest';
import * as telegram from '../src/utils/telegram-file.js';
import * as vision from '../src/ai/vision-parser.js';
import * as weekly from '../src/services/weekly-plan.js';
import * as trainings from '../src/services/trainings.js';
import { handlePhotoLog } from '../src/handlers/photo-log.js';

const user = { id: '9f41495e-84f5-4b11-a391-97057148fdc3', telegram_id: 1001 } as any;

const planRow = {
  id: 'p1',
  plan_data: {
    week_start: '2026-02-10',
    week_end: '2026-02-16',
    workouts: [
      { date: '2026-02-10', type: 'easy_run' }
    ]
  }
};

describe('photo log', () => {
  it('saves training from screenshot', async () => {
    vi.spyOn(telegram, 'getTelegramFileUrl').mockReturnValueOnce('https://example.com/file.jpg');
    vi.spyOn(telegram, 'fetchTelegramFileBase64').mockResolvedValueOnce('data:image/jpeg;base64,AAAA');
    vi.spyOn(vision, 'parseTrainingFromImage')
      .mockResolvedValueOnce({ date: '2026-02-10' } as any)
      .mockResolvedValueOnce({
        date: '2026-02-10',
        distance_km: 5,
        duration_seconds: 1800,
        avg_heart_rate: 140
      } as any);
    vi.spyOn(weekly, 'getActivePlan').mockResolvedValueOnce(planRow as any);
    vi.spyOn(trainings, 'getLatestScreenshot').mockResolvedValueOnce(null as any);
    vi.spyOn(trainings, 'insertTraining').mockResolvedValueOnce({} as any);

    const res = await handlePhotoLog(user, 'file/path.jpg');
    expect(res).toContain('скриншота');
  });
});
