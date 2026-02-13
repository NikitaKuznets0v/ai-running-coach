import { describe, it, expect } from 'vitest';
import { answerQuestion } from '../src/ai/qa.js';
import { CONFIG } from '../src/config.js';

process.env.OPENAI_API_KEY = '';
(CONFIG as any).openaiApiKey = '';

describe('qa fallback', () => {
  it('answers training type question without OpenAI', async () => {
    const res = await answerQuestion('Что такое темповая тренировка?');
    expect(res.toLowerCase()).toContain('темпов');
  });

  it('answers pace zone question without OpenAI', async () => {
    const res = await answerQuestion('какие зоны темпа?');
    expect(res.toLowerCase()).toContain('зоны темпа');
  });
});
