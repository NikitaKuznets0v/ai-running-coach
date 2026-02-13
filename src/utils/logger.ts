export function logInfo(message: string, meta: Record<string, any> = {}) {
  const payload = { level: 'info', message, ...meta };
  console.log(JSON.stringify(payload));
}

export function logError(message: string, meta: Record<string, any> = {}) {
  const payload = { level: 'error', message, ...meta };
  console.error(JSON.stringify(payload));
}
