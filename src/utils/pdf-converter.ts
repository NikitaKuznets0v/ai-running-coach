import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Converts first page of PDF to PNG image
 * Returns base64 data URL for OpenAI Vision API
 */
export async function convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-convert-'));
  const pdfPath = path.join(tempDir, 'input.pdf');
  const outputPrefix = path.join(tempDir, 'output');

  try {
    // Write PDF to temp file
    await fs.writeFile(pdfPath, pdfBuffer);

    // Convert first page to PNG using pdftoppm
    // -png: output format PNG
    // -f 1 -l 1: only first page
    // -singlefile: don't add page number to filename
    // -r 300: 300 DPI for better quality (default is 150)
    await execAsync(`pdftoppm -png -f 1 -l 1 -r 300 -singlefile "${pdfPath}" "${outputPrefix}"`);

    // Read generated PNG
    const imagePath = `${outputPrefix}.png`;
    const imageBuffer = await fs.readFile(imagePath);

    // Convert to base64 data URL
    const base64 = imageBuffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to cleanup temp dir:', err);
    }
  }
}
