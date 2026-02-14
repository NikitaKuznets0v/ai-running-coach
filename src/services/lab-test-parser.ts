import OpenAI from 'openai';
import { CONFIG } from '../config.js';
import { convertPdfToImage, extractPdfText } from '../utils/pdf-converter.js';

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
  let pdfText: string | null = null;

  // If PDF, extract text AND convert to image
  if (isPdf) {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Failed to download PDF');

    const pdfBuffer = Buffer.from(await response.arrayBuffer());

    // Extract text from PDF (this is the key improvement!)
    pdfText = await extractPdfText(pdfBuffer);
    console.log('[lab-test-parser] Extracted PDF text length:', pdfText.length);

    // Also convert to image for visual context
    imageUrl = await convertPdfToImage(pdfBuffer);
  }

  // Simplified prompt - we provide structured text + image
  const systemPrompt = `Extract running lab test data from the document.

Return JSON with these fields (use null if not found):
{
  "vo2max": number (ml/kg/min),
  "lt1_hr": number (bpm at aerobic threshold / АэП),
  "lt2_hr": number (bpm at anaerobic threshold / ПАНО),
  "vo2max_hr": number (bpm at VO2max),
  "hr_zone1_max": number (upper limit of Zone 1),
  "hr_zone2_max": number (upper limit of Zone 2),
  "hr_zone3_max": number (upper limit of Zone 3),
  "hr_zone4_max": number (upper limit of Zone 4),
  "hr_zone5_max": number (upper limit of Zone 5),
  "lt1_pace_min_km": "M:SS" (pace at LT1/АэП),
  "lt2_pace_min_km": "M:SS" (pace at LT2/ПАНО),
  "vo2max_pace_min_km": "M:SS" (pace at VO2max)
}`;

  // Build user message: include PDF text if available
  const userMessage: Array<any> = [];

  if (pdfText) {
    userMessage.push({
      type: 'text',
      text: `Here is the extracted text from the document:\n\n${pdfText}\n\n---\n\nAlso reviewing the visual layout:`
    });
  } else {
    userMessage.push({
      type: 'text',
      text: 'Analyze this lab test document and extract the data:'
    });
  }

  userMessage.push({
    type: 'image_url',
    image_url: { url: imageUrl }
  });

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userMessage
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
