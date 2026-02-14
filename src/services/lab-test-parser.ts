import OpenAI from 'openai';
import { CONFIG } from '../config.js';
import { convertPdfToImage } from '../utils/pdf-converter.js';

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

export async function parseLabTestDocument(fileUrl: string): Promise<LabTestData> {
  if (!CONFIG.openaiApiKey) throw new Error('OPENAI_API_KEY not set');

  // Check if file is PDF or image
  const isPdf = fileUrl.toLowerCase().endsWith('.pdf') || fileUrl.includes('.pdf?');

  let imageUrl = fileUrl;

  // If PDF, convert to image first
  if (isPdf) {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Failed to download PDF');

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    imageUrl = await convertPdfToImage(pdfBuffer);
  }

  const systemPrompt = `You are an expert in analyzing ProLabSport and similar running lab test reports. Your task is to extract physiological data from the document image with MAXIMUM accuracy.

**CRITICAL: Read EVERY number, table, graph label, and text block in the image. Do NOT skip any section.**

=== KEY TERMS TO SEARCH FOR ===

1. VO2max / МПК (Maximum Oxygen Consumption):
   - Look for: "VO2max", "МПК", "ml/kg/min", "мл/кг/мин"
   - Typical range: 35-80 ml/kg/min
   - Often in a summary table or header section

2. ANAEROBIC THRESHOLD (ПАНО / LT2):
   - Look for: "ПАНО", "Анаэробный порог", "LT2", "Lactate Threshold 2", "AnT"
   - Heart rate usually labeled: "ЧСС на ПАНО", "HR at AnT", "пульс на анаэробном пороге"
   - Typical range: 140-180 bpm

3. AEROBIC THRESHOLD (AeT / LT1):
   - Look for: "Аэробный порог", "АэП", "LT1", "AeT", "Lactate Threshold 1"
   - Heart rate: "ЧСС на АэП", "HR at AeT"
   - Typical range: 120-160 bpm

4. HEART RATE ZONES (Пульсовые зоны):
   - Look for tables with: "Зона 1", "Зона 2", "Z1", "Z2", "Zone 1", "Zone 2"
   - Russian labels: "Восстановление", "Аэробная", "Темповая", "Пороговая", "МПК"
   - English labels: "Recovery", "Aerobic", "Tempo", "Threshold", "VO2max"
   - Extract the UPPER boundary (maximum HR) for each zone

5. PACE VALUES (Темп бега):
   - Look for: "темп", "pace", "мин/км", "min/km", "скорость"
   - Format: "5:30", "4:45", etc. (minutes:seconds per km)
   - May be listed for LT1, LT2, and VO2max intensity levels

=== SEARCH STRATEGY ===
1. Scan header/title section for VO2max and summary metrics
2. Look for tables with zone breakdowns (usually has 5 rows for Z1-Z5)
3. Check graph labels and axis values for threshold markers
4. Search footer and side notes for additional parameters
5. Look for ANY number followed by "уд/мин", "bpm", "ml/kg/min"

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown, no explanations):
{
  "vo2max": number or null,
  "lt1_hr": number or null,
  "lt2_hr": number or null,
  "vo2max_hr": number or null,
  "hr_zone1_max": number or null,
  "hr_zone2_max": number or null,
  "hr_zone3_max": number or null,
  "hr_zone4_max": number or null,
  "hr_zone5_max": number or null,
  "lt1_pace_min_km": "M:SS" or null,
  "lt2_pace_min_km": "M:SS" or null,
  "vo2max_pace_min_km": "M:SS" or null
}

**VALIDATION RULES:**
- HR values: 50-220 bpm (anything outside is likely wrong)
- VO2max: 20-90 ml/kg/min
- HR zones must be in ascending order: Z1 < Z2 < Z3 < Z4 < Z5
- If you find a value but are uncertain, include it anyway
- Return null ONLY if the value is truly absent from the image`;

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

  // Log raw response for debugging
  console.log('[lab-test-parser] Raw Vision API response:', content);

  const data = JSON.parse(content) as LabTestData;

  // Set lthr from lt2_hr if not explicitly set
  if (data.lt2_hr && !data.lthr) {
    data.lthr = data.lt2_hr;
  }

  return data;
}
