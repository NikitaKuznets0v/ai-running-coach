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

  const systemPrompt = `You are a specialist in analyzing running lab test results. Extract the following data from the document image.

LOOK FOR these key terms (in Russian or English):
- VO2max / МПК - in ml/kg/min
- ПАНО / LT2 / Anaerobic Threshold - heart rate in bpm
- Аэробный порог / LT1 / Aerobic Threshold - heart rate in bpm
- ЧСС / HR / Heart Rate zones (Z1, Z2, Z3, Z4, Z5)
- Темп / Pace at different thresholds

SEARCH CAREFULLY through all text, tables, graphs, and numbers in the image.

Return data as JSON:
{
  "vo2max": number or null (ml/kg/min),
  "lt1_hr": number or null (bpm at aerobic threshold),
  "lt2_hr": number or null (bpm at anaerobic threshold/ПАНО),
  "vo2max_hr": number or null (bpm at VO2max),
  "hr_zone1_max": number or null (upper limit of Zone 1),
  "hr_zone2_max": number or null (upper limit of Zone 2),
  "hr_zone3_max": number or null (upper limit of Zone 3),
  "hr_zone4_max": number or null (upper limit of Zone 4),
  "hr_zone5_max": number or null (upper limit of Zone 5),
  "lt1_pace_min_km": "M:SS" or null (pace at LT1),
  "lt2_pace_min_km": "M:SS" or null (pace at LT2),
  "vo2max_pace_min_km": "M:SS" or null (pace at VO2max)
}

IMPORTANT:
- Look at ALL text in the image, including small print, tables, and legends
- If a value is not found, return null (NOT a string "null")
- HR zones: return the UPPER boundary of each zone
- Be thorough - scan the entire image for data`;

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
