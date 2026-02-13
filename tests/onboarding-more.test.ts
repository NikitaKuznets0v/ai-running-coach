import { describe, it, expect } from 'vitest';
import {
  extractAge,
  extractHeightWeight,
  extractLevel,
  extractPreferredDays,
  extractRestingHr,
  extractWeeklyRuns,
  extract5kPaceSeconds,
  extractLabTesting,
  extractRaceDetails
} from '../src/utils/parse.js';

describe('onboarding parsing - extra cases', () => {
  it('parses age from phrase', () => {
    expect(extractAge('мне 27 лет')).toBe(27);
  });

  it('parses weight/height in reversed order', () => {
    const r = extractHeightWeight('вес 65 рост 170');
    expect(r.height_cm).toBe(170);
    expect(r.weight_kg).toBe(65);
  });

  it('parses preferred days with abbreviations', () => {
    const r = extractPreferredDays('Пн, вт и чт');
    expect(r).toContain('пн');
  });

  it('parses weekly runs from digit', () => {
    expect(extractWeeklyRuns('3 раза в неделю')).toBe(3);
  });

  it('parses pace from min format', () => {
    expect(extract5kPaceSeconds('25 минут на 5к')).toBe(300);
  });

  it('parses lab testing negative', () => {
    const r = extractLabTesting('нет, не делал');
    expect(r.has_lab_testing).toBe(false);
  });

  it('parses race date in RU format', () => {
    const r = extractRaceDetails('забег 10к 12.05.2026');
    expect(r.race_date).toBe('2026-05-12');
  });

  it('parses advanced level synonyms', () => {
    expect(extractLevel('я опытный бегун')).toBe('advanced');
  });

  it('parses resting hr with number', () => {
    expect(extractRestingHr('пульс покоя 58')).toBe(58);
  });
});
