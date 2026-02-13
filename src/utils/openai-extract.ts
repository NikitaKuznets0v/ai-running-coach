import { extractWithOpenAI } from '../services/openai.js';
import { EXTRACT_PROMPTS } from '../domain/extract-prompts.js';

export async function fallbackExtract(kind: keyof typeof EXTRACT_PROMPTS, message: string) {
  const systemPrompt = EXTRACT_PROMPTS[kind];
  const data = await extractWithOpenAI(systemPrompt, message);
  return data || {};
}
