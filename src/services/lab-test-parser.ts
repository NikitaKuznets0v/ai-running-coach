import OpenAI from 'openai';
import { CONFIG } from '../config.js';

const client = new OpenAI({ apiKey: CONFIG.openaiApiKey });

export interface LabTestData {
  vo2max?: number;
  lthr?: number;  // LTHR = HR at LT2 (anaerobic threshold / ПАНО)
  lt1_hr?: number;
  lt2_hr?: number;
  vo2max_hr?: number;
  hr_zone1_max?: number;
  hr_zone2_max?: number;
  hr_zone3_max?: number;
  hr_zone4_max?: number;
  hr_zone5_max?: number;
  lt1_pace_min_km?: string;  // e.g., "5:53"
  lt2_pace_min_km?: string;  // e.g., "5:08"
  vo2max_pace_min_km?: string; // e.g., "4:33"
}

export async function parseLabTestDocument(imageUrl: string): Promise<LabTestData> {
  if (!CONFIG.openaiApiKey) throw new Error('OPENAI_API_KEY not set');

  const systemPrompt = `Ты — специалист по анализу результатов лабораторных беговых тестов.

Извлеки следующие данные из документа (если они есть):

1. **VO2max** (мл/кг/мин) - максимальное потребление кислорода
2. **ЧСС на LT1** (аэробный порог) - уд/мин
3. **ЧСС на LT2** (анаэробный порог / ПАНО) - уд/мин
4. **ЧСС на VO2max** - уд/мин
5. **HR зоны** (Z1-Z5) - диапазоны пульса:
   - Z1: до X уд/мин
   - Z2: от A до B уд/мин
   - Z3: от C до D уд/мин
   - Z4: от E до F уд/мин
   - Z5: от G и более
6. **Темпы на порогах**:
   - LT1 pace (мин/км)
   - LT2 pace (мин/км)
   - VO2max pace (мин/км)

Верни данные в формате JSON:
{
  "vo2max": число или null,
  "lt1_hr": число или null,
  "lt2_hr": число или null (это и есть LTHR),
  "vo2max_hr": число или null,
  "hr_zone1_max": число или null,
  "hr_zone2_max": число или null,
  "hr_zone3_max": число или null,
  "hr_zone4_max": число или null,
  "hr_zone5_max": число или null,
  "lt1_pace_min_km": "M:SS" или null,
  "lt2_pace_min_km": "M:SS" или null,
  "vo2max_pace_min_km": "M:SS" или null
}

**Важно:**
- Если какого-то значения нет в документе, верни null
- ЧСС указывай целыми числами (уд/мин)
- VO2max указывай с точностью до 1 знака после запятой
- Для HR зон используй ВЕРХНЮЮ границу каждой зоны
- Темпы верни в формате "M:SS" (например, "5:53")`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Проанализируй этот документ с результатами лабораторного тестирования и извлеки данные:'
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0
  });

  const content = response.choices[0]?.message?.content || '{}';
  const data = JSON.parse(content) as LabTestData;

  // Set lthr from lt2_hr if not explicitly set
  if (data.lt2_hr && !data.lthr) {
    data.lthr = data.lt2_hr;
  }

  return data;
}
