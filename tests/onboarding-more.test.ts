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
  extractRaceDetails,
  extractStartDate
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

  // Relative date parsing
  it('parses "через 12 недель" as race date', () => {
    const r = extractRaceDetails('полумарафон через 12 недель за час пятьдесят');
    expect(r.race_distance).toBe('half');
    expect(r.race_date).toBeTruthy();
    expect(r.target_time_seconds).toBe(6600); // 1h 50m
  });

  it('parses target time "1:50"', () => {
    const r = extractRaceDetails('марафон 15.06.2026 за 1:50');
    expect(r.target_time_seconds).toBe(6600);
  });

  it('parses target time "2ч 30м"', () => {
    const r = extractRaceDetails('марафон 15.06.2026 за 2ч 30м');
    expect(r.target_time_seconds).toBe(9000);
  });

  // Start date parsing
  it('parses "завтра" as start date', () => {
    const r = extractStartDate('завтра');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(r).toBe(expected);
  });

  it('parses "со следующей недели" as start date (next Monday)', () => {
    const r = extractStartDate('со следующей недели');
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getDay()).toBe(1); // Monday
  });

  it('parses "с понедельника" as start date', () => {
    const r = extractStartDate('с понедельника');
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getDay()).toBe(1);
  });

  it('parses specific date as start date', () => {
    expect(extractStartDate('15.03.2026')).toBe('2026-03-15');
  });

  it('returns null for unrecognized start date', () => {
    expect(extractStartDate('не знаю')).toBeNull();
  });
});
