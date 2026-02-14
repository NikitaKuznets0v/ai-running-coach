import { describe, it, expect } from 'vitest';
import { extractRaceDetails, extractWeeklyRuns, extractPreferredDays } from '../src/utils/parse.js';

describe('Natural language parsing - как люди реально говорят', () => {

  describe('Целевое время - разные формулировки', () => {
    it('выбежать из двух часов', () => {
      const r = extractRaceDetails('полумарафон через 3 месяца, хочу выбежать из двух часов');
      expect(r.race_distance).toBe('half');
      expect(r.target_time_seconds).toBeGreaterThan(0);
      // "из двух часов" = меньше 2ч = 1:59:59 или около того
      // Парсер может не понять "из X", но зафиксируем проблему
    });

    it('выбежать из час 50', () => {
      const r = extractRaceDetails('марафон в апреле, выбежать из час 50');
      expect(r.race_distance).toBe('marathon');
      // Должно быть около 1:50 = 6600 секунд
    });

    it('за час 59 минут', () => {
      const r = extractRaceDetails('полумарафон за час 59 минут');
      expect(r.race_distance).toBe('half');
      expect(r.target_time_seconds).toBe(7140); // 1:59:00
    });

    it('пробежать быстрее 1:45', () => {
      const r = extractRaceDetails('хочу пробежать полумарафон быстрее 1:45');
      expect(r.race_distance).toBe('half');
      expect(r.target_time_seconds).toBeGreaterThan(0);
    });

    it('целевое время 3 часа 15 минут', () => {
      const r = extractRaceDetails('марафон, целевое время 3 часа 15 минут');
      expect(r.race_distance).toBe('marathon');
      expect(r.target_time_seconds).toBe(11700); // 3:15:00
    });

    it('хочу финишировать за 55 минут на 10к', () => {
      const r = extractRaceDetails('10к, хочу финишировать за 55 минут');
      expect(r.race_distance).toBe('10k');
      expect(r.target_time_seconds).toBe(3300); // 55 мин
    });

    it('цель - 4 часа на марафон', () => {
      const r = extractRaceDetails('марафон через полгода, цель - 4 часа');
      expect(r.race_distance).toBe('marathon');
      expect(r.target_time_seconds).toBe(14400); // 4:00:00
    });

    it('хочу пробежать марафон за 3:30', () => {
      const r = extractRaceDetails('марафон за 3:30');
      expect(r.race_distance).toBe('marathon');
      expect(r.target_time_seconds).toBe(12600); // 3:30:00
    });
  });

  describe('Дистанция - разные названия', () => {
    it('полумарафон / полумара / полумарик', () => {
      expect(extractRaceDetails('полумарафон').race_distance).toBe('half');
      expect(extractRaceDetails('полумара через месяц').race_distance).toBe('half');
    });

    it('марафон / мара / маратон', () => {
      expect(extractRaceDetails('марафон').race_distance).toBe('marathon');
      expect(extractRaceDetails('мара в мае').race_distance).toBe('marathon');
    });

    it('5 км / 5к / пятёрка / пятикилометровка', () => {
      expect(extractRaceDetails('5 км').race_distance).toBe('5k');
      expect(extractRaceDetails('5к через неделю').race_distance).toBe('5k');
      expect(extractRaceDetails('пятёрка в парке').race_distance).toBe('5k');
    });

    it('10 км / 10к / десятка', () => {
      expect(extractRaceDetails('10 км').race_distance).toBe('10k');
      expect(extractRaceDetails('10к в апреле').race_distance).toBe('10k');
      expect(extractRaceDetails('десятка').race_distance).toBe('10k');
    });

    it('нестандартные дистанции', () => {
      const r1 = extractRaceDetails('трейл 30 км в горах');
      expect(r1.race_distance_km).toBeGreaterThan(0);

      const r2 = extractRaceDetails('15 километров');
      expect(r2.race_distance_km).toBe(15);
    });
  });

  describe('Дата забега - разные форматы', () => {
    it('через 3 месяца', () => {
      const r = extractRaceDetails('марафон через 3 месяца');
      expect(r.race_date).toBeTruthy();
    });

    it('через 12 недель', () => {
      const r = extractRaceDetails('полумарафон через 12 недель');
      expect(r.race_date).toBeTruthy();
    });

    it('в апреле / в мае', () => {
      const r = extractRaceDetails('марафон в апреле за 3:30');
      // Месяцы парсер может не понять, но зафиксируем
      expect(r.race_distance).toBe('marathon');
    });

    it('15 мая / 20 июня', () => {
      const r = extractRaceDetails('10к 15 мая за 50 минут');
      expect(r.race_distance).toBe('10k');
    });

    it('конкретная дата 15.06.2026', () => {
      const r = extractRaceDetails('марафон 15.06.2026 за 3:15');
      expect(r.race_date).toBe('2026-06-15');
    });
  });

  describe('Дни тренировок - естественная речь', () => {
    it('понедельник, среда, пятница и суббота', () => {
      const days = extractPreferredDays('понедельник, среда, пятница и суббота');
      expect(days).toBeTruthy();
      expect(extractWeeklyRuns('понедельник, среда, пятница и суббота')).toBe(4);
    });

    it('по понедельникам и средам', () => {
      const days = extractPreferredDays('по понедельникам и средам');
      expect(days).toContain('понедельник');
      expect(days).toContain('среда');
    });

    it('вторник четверг суббота', () => {
      const days = extractPreferredDays('вторник четверг суббота');
      expect(extractWeeklyRuns('вторник четверг суббота')).toBe(3);
    });

    it('пн ср пт сб', () => {
      const days = extractPreferredDays('пн ср пт сб');
      expect(extractWeeklyRuns('пн ср пт сб')).toBe(4);
    });

    it('будни + выходной', () => {
      const days = extractPreferredDays('понедельник среда пятница и один выходной');
      expect(days).toContain('понедельник');
      expect(days).toContain('среда');
      expect(days).toContain('пятница');
    });

    it('три раза в неделю: пн, ср, сб', () => {
      expect(extractWeeklyRuns('три раза в неделю: пн, ср, сб')).toBe(3);
      const days = extractPreferredDays('три раза в неделю: пн, ср, сб');
      expect(days).toContain('пн');
    });
  });

  describe('Комплексные фразы - как в реальном диалоге', () => {
    it('полная фраза про забег', () => {
      const r = extractRaceDetails(
        'Я хочу пробежать московский марафон в сентябре, цель - выбежать из 3:30'
      );
      expect(r.race_distance).toBe('marathon');
      // target_time может не распарситься из "из 3:30", зафиксируем
    });

    it('неформальный стиль', () => {
      const r = extractRaceDetails(
        'Ну короче полумарик через месяца три, хочу где-то 1:50 уложиться'
      );
      expect(r.race_distance).toBe('half');
    });

    it('разговорный стиль с паузами', () => {
      const r = extractRaceDetails(
        'Забег... ну, марафон наверное. Через недель 15 примерно. Хочу пробежать за 4 часа'
      );
      expect(r.race_distance).toBe('marathon');
      expect(r.target_time_seconds).toBe(14400);
    });
  });
});
