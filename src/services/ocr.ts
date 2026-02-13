import { spawn } from 'node:child_process';

export async function runOcrFromBase64(imageBase64: string): Promise<string> {
  const data = imageBase64.split(',')[1] || imageBase64;
  const buf = Buffer.from(data, 'base64');

  return await new Promise((resolve, reject) => {
    const proc = spawn('tesseract', ['stdin', 'stdout', '-l', 'rus+eng'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let out = '';
    let err = '';

    proc.stdout.on('data', (chunk) => { out += String(chunk); });
    proc.stderr.on('data', (chunk) => { err += String(chunk); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(err || `tesseract exited with ${code}`));
        return;
      }
      resolve(out);
    });

    proc.stdin.write(buf);
    proc.stdin.end();
  });
}
