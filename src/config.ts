import 'dotenv/config';

const must = (key: string): string => {
  const val = process.env[key];
  if (val) return val;
  if (process.env.NODE_ENV === 'test') {
    if (key === 'SUPABASE_URL') return 'http://localhost';
    return `test-${key}`;
  }
  throw new Error(`Missing env var: ${key}`);
};

export const CONFIG = {
  telegramToken: must('TELEGRAM_BOT_TOKEN'),
  supabaseUrl: must('SUPABASE_URL'),
  supabaseServiceKey: must('SUPABASE_SERVICE_ROLE_KEY'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  openaiVisionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
  tz: process.env.TZ || 'Europe/Moscow'
};
