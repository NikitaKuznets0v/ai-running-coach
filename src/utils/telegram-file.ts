import { CONFIG } from '../config.js';

export function getTelegramFileUrl(filePath: string): string {
  return `https://api.telegram.org/file/bot${CONFIG.telegramToken}/${filePath}`;
}

export async function fetchTelegramFileBase64(filePath: string): Promise<string> {
  const url = getTelegramFileUrl(filePath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}
