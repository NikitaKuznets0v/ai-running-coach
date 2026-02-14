import OpenAI from 'openai';
import { CONFIG } from '../config.js';
import type { Uploadable } from 'openai/uploads.js';

const client = new OpenAI({ apiKey: CONFIG.openaiApiKey });

export async function extractWithOpenAI(systemPrompt: string, userMessage: string) {
  if (!CONFIG.openaiApiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    response_format: { type: 'json_object' }
  });

  const content = res.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function transcribeVoice(audioFile: Uploadable, filename: string): Promise<string> {
  if (!CONFIG.openaiApiKey) throw new Error('OPENAI_API_KEY not set');

  const transcription = await client.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'ru',
    prompt: 'Транскрибация голосового сообщения пользователя боту о беге и тренировках.'
  });

  return transcription.text;
}
