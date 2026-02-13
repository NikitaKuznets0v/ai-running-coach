import { describe, it, expect } from 'vitest';
import { detectIntent } from '../src/domain/intent.js';

describe('intent routing', () => {
  it('detects plan request', () => {
    expect(detectIntent('с понедельника')).toBe('plan_request');
    expect(detectIntent('эту неделю')).toBe('plan_request');
  });

  it('detects plan convert', () => {
    expect(detectIntent('переведи план в минуты')).toBe('plan_convert');
  });

  it('detects training log', () => {
    expect(detectIntent('пробежал 5 км за 30 минут')).toBe('training_log');
  });
});
