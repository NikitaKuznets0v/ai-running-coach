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

describe('onboarding parsing', () => {
  it('parses level', () => {
    expect(extractLevel('Я новичок')).toBe('beginner');
    expect(extractLevel('любитель')).toBe('intermediate');
    expect(extractLevel('продвинутый')).toBe('advanced');
  });

  it('parses age', () => {
    expect(extractAge('мне 34')).toBe(34);
  });

  it('parses height and weight', () => {
    const r = extractHeightWeight('рост 178 вес 72');
    expect(r.height_cm).toBe(178);
    expect(r.weight_kg).toBe(72);
  });

  it('parses resting hr', () => {
    expect(extractRestingHr('пульс 52')).toBe(52);
    expect(extractRestingHr('не знаю')).toBeNull();
  });

  it('parses weekly runs and days', () => {
    expect(extractWeeklyRuns('готов 4 раза')).toBe(4);
    expect(extractPreferredDays('Пн, Ср, Пт')).toContain('пн');
  });

  it('parses 5k pace', () => {
    expect(extract5kPaceSeconds('5к за 30 мин')).toBe(360);
    expect(extract5kPaceSeconds('темп 6:00/км')).toBe(360);
  });

  it('parses lab testing', () => {
    const r = extractLabTesting('VO2 max 48, LTHR 168');
    expect(r.has_lab_testing).toBe(true);
    expect(r.vo2max).toBe(48);
    expect(r.lthr).toBe(168);
  });

  it('parses race details', () => {
    const r = extractRaceDetails('полумарафон 21.1, дата 2026-05-01, цель 1ч 40м');
    expect(r.race_distance).toBe('half');
    expect(r.race_distance_km).toBe(21.1);
    expect(r.race_date).toBe('2026-05-01');
    expect(r.target_time_seconds).toBe(6000);
  });
});
