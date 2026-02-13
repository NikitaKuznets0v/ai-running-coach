import { describe, it, expect, vi } from 'vitest';
import { logInfo, logError } from '../src/utils/logger.js';

describe('logger', () => {
  it('prints info', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logInfo('test', { id: 1 });
    expect(spy).toHaveBeenCalled();
  });

  it('prints error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('oops', { id: 2 });
    expect(spy).toHaveBeenCalled();
  });
});
