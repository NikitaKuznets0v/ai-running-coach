import OpenAI from 'openai';
import { CONFIG } from '../config.js';

const client = new OpenAI({ apiKey: CONFIG.openaiApiKey });

export async function extractWithOpenAIVision(systemPrompt: string, imageUrl: string) {
  if (!CONFIG.openaiApiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await client.chat.completions.create({
    model: CONFIG.openaiVisionModel || 'gpt-4o-2024-08-06',
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Распознай цифры на скриншоте тренировки и извлеки значения.' },
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'high' }
          }
        ]
      }
    ],
    max_tokens: 300,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'training_screenshot',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            distance_km: { type: ['number', 'null'] },
            duration_seconds: { type: ['number', 'null'] },
            duration_minutes: { type: ['number', 'null'] },
            duration_mmss: { type: ['string', 'null'] },
            avg_heart_rate: { type: ['number', 'null'] },
            max_heart_rate: { type: ['number', 'null'] },
            pace_mmss: { type: ['string', 'null'] },
            splits: {
              type: ['array', 'null'],
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  index: { type: 'number' },
                  pace_mmss: { type: 'string' }
                },
                required: ['index', 'pace_mmss']
              }
            }
          },
          required: ['distance_km', 'duration_seconds', 'duration_minutes', 'duration_mmss', 'avg_heart_rate', 'max_heart_rate', 'pace_mmss', 'splits']
        }
      }
    }
  });

  const content = res.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}
