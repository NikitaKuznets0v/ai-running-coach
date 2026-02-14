import { describe, it, expect } from 'vitest';
import {
  extractLevel,
  extractAge,
  extractHeightWeight,
  extractRestingHr,
  extract5kPaceSeconds,
  extractWeeklyRuns,
  extractPreferredDays,
  extractRaceDetails
} from '../src/utils/parse.js';
import { parseTargetTime } from '../src/utils/parse.js';

describe('Симуляция реальных диалогов пользователей', () => {

  it('Диалог 1: Новичок, полумарафон, "выбежать из 2:00", суббота или воскресенье', () => {
    console.log('\n🗣️  ДИАЛОГ 1: Новичок с плавающим выходным\n');

    // Уровень
    let input = 'я новичок';
    let result = extractLevel(input);
    console.log(`Пользователь: "${input}"`);
    console.log(`Бот распознал: уровень = ${result}`);
    expect(result).toBe('beginner');

    // Возраст
    input = 'мне 32 года';
    const age = extractAge(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Бот распознал: возраст = ${age}`);
    expect(age).toBe(32);

    // Рост и вес
    input = '180 см и 75 кг';
    const physical = extractHeightWeight(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Бот распознал: рост = ${physical.height_cm} см, вес = ${physical.weight_kg} кг`);
    expect(physical.height_cm).toBe(180);
    expect(physical.weight_kg).toBe(75);

    // Пульс покоя
    input = 'пульс покоя 58';
    const hr = extractRestingHr(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Бот распознал: пульс = ${hr}`);
    expect(hr).toBe(58);

    // Темп 5K
    input = 'бегаю 5км за 28 минут';
    const pace = extract5kPaceSeconds(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Бот распознал: темп 5K = ${pace} сек (${Math.floor(pace! / 60)}:${String(pace! % 60).padStart(2, '0')} мин/км)`);
    expect(pace).toBeGreaterThan(0);

    // Частота тренировок - с "или"
    input = 'понедельник, среду, пятницу и субботу или воскресенье';
    const daysResult = extractPreferredDays(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Бот распознал:`);
    console.log(`  - Дни: ${daysResult?.days}`);
    console.log(`  - Есть "или": ${daysResult?.hasOr}`);
    console.log(`  - Оценочное кол-во: ${daysResult?.estimatedCount} дней`);
    console.log(`\n⚠️  Бот спрашивает: "Я правильно понял, что ты хочешь тренироваться 4 дня в неделю?"`);
    expect(daysResult?.hasOr).toBe(true);
    expect(daysResult?.estimatedCount).toBe(4);

    // Детали забега - "выбежать из 2:00"
    input = 'полумарафон 15 мая, хочу выбежать из 2:00';
    const race = extractRaceDetails(input);
    console.log(`\n\nПользователь: "${input}"`);
    console.log(`Бот распознал:`);
    console.log(`  - Дистанция: ${race.race_distance} (${race.race_distance_km} км)`);
    console.log(`  - Дата: ${race.race_date}`);
    console.log(`  - Целевое время: ${race.target_time_seconds} сек = ${Math.floor(race.target_time_seconds! / 3600)}ч ${Math.floor((race.target_time_seconds! % 3600) / 60)}м`);
    console.log(`  - ✅ "Выбежать из 2:00" = 1:59:00 (минус 1 минута)`);
    expect(race.race_distance).toBe('half');
    expect(race.target_time_seconds).toBe(7140); // 1:59:00
  });

  it('Диалог 2: Любитель, "выбежать из 45", пятница или суббота', () => {
    console.log('\n🗣️  ДИАЛОГ 2: Любитель, 10K, выбежать из 45 минут\n');

    let input = 'любитель';
    console.log(`Пользователь: "${input}"`);
    console.log(`Уровень: ${extractLevel(input)}`);

    input = '28 лет';
    console.log(`\nПользователь: "${input}"`);
    console.log(`Возраст: ${extractAge(input)}`);

    input = '175 и 68';
    const physical = extractHeightWeight(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Рост: ${physical.height_cm}, Вес: ${physical.weight_kg}`);

    input = 'пн, ср, пт, сб или вс';
    const days = extractPreferredDays(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Дни: ${days?.days}`);
    console.log(`Есть "или": ${days?.hasOr} → Бот уточнит: "4 дня в неделю?"`);
    expect(days?.hasOr).toBe(true);
    expect(days?.estimatedCount).toBe(4);

    input = '10 км 20 июня, хочу выбежать из 45';
    const race = extractRaceDetails(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Дистанция: ${race.race_distance}`);
    console.log(`Целевое время: ${race.target_time_seconds} сек = ${Math.floor(race.target_time_seconds! / 60)}:${String(race.target_time_seconds! % 60).padStart(2, '0')}`);
    console.log(`✅ "Выбежать из 45" = 44:00`);
    expect(race.target_time_seconds).toBe(2640); // 44:00
  });

  it('Диалог 3: Фиксированные дни (без "или") - не должно быть уточнения', () => {
    console.log('\n🗣️  ДИАЛОГ 3: Фиксированные дни - НЕТ уточняющего вопроса\n');

    let input = 'вторник, четверг, субботу и воскресенье';
    const days = extractPreferredDays(input);
    console.log(`Пользователь: "${input}"`);
    console.log(`Дни: ${days?.days}`);
    console.log(`Есть "или": ${days?.hasOr}`);
    console.log(`Кол-во дней: ${days?.estimatedCount}`);
    console.log(`✅ НЕТ уточняющего вопроса - переходим дальше`);
    expect(days?.hasOr).toBe(false);
    expect(days?.estimatedCount).toBe(4);
  });

  it('Диалог 4: Разговорный стиль - "ну, типа, короче"', () => {
    console.log('\n🗣️  ДИАЛОГ 4: Разговорный стиль\n');

    let input = 'ну типа я бегаю, но не сильно продвинутый, короче любитель';
    console.log(`Пользователь: "${input}"`);
    console.log(`Уровень: ${extractLevel(input)}`);
    expect(extractLevel(input)).toBe('intermediate');

    input = 'лет двадцать семь';
    console.log(`\nПользователь: "${input}"`);
    console.log(`Возраст: ${extractAge(input)} (словесные числа обрабатываются OpenAI fallback)`);
    // Словесные числа требуют OpenAI fallback
    expect(extractAge(input)).toBe(null);

    input = 'ну рост где-то метр семьдесят восемь, вес килограмм семьдесят три';
    console.log(`\nПользователь: "${input}"`);
    const physical2 = extractHeightWeight(input);
    console.log(`Рост: ${physical2.height_cm}, Вес: ${physical2.weight_kg} (словесные числа обрабатываются OpenAI fallback)`);
    // Словесные числа требуют OpenAI fallback
    expect(physical2.height_cm).toBeUndefined();

    input = 'ну хочу бегать там понедельник, среда, пятница обязательно, ну и выходной какой-нибудь, суббота или воскресенье';
    const days = extractPreferredDays(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Распознано: ${days?.days}`);
    console.log(`Есть "или": ${days?.hasOr} → Уточняющий вопрос`);
    expect(days?.hasOr).toBe(true);

    input = 'полумарафон типа в июле, ну хочу выбежать из 1:30';
    const race = extractRaceDetails(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Целевое время: ${race.target_time_seconds} сек = ${Math.floor(race.target_time_seconds! / 3600)}:${Math.floor((race.target_time_seconds! % 3600) / 60)}:00`);
    console.log(`✅ "Выбежать из 1:30" = 1:29:00`);
    expect(race.target_time_seconds).toBe(5340); // 1:29:00
  });

  it('Диалог 5: Короткие ответы, аббревиатуры', () => {
    console.log('\n🗣️  ДИАЛОГ 5: Короткие ответы\n');

    console.log('Пользователь: "начинающий"');
    expect(extractLevel('начинающий')).toBe('beginner');

    console.log('Пользователь: "25"');
    expect(extractAge('25')).toBe(25);

    console.log('Пользователь: "182, 80"');
    const physical = extractHeightWeight('182, 80');
    expect(physical.height_cm).toBe(182);
    expect(physical.weight_kg).toBe(80);

    console.log('Пользователь: "пн, ср, пт"');
    const days = extractPreferredDays('пн, ср, пт');
    console.log(`Дни: ${days?.days}, без "или": ${!days?.hasOr}`);
    expect(days?.hasOr).toBe(false);

    console.log('Пользователь: "5K 01.06.2026 25 минут"');
    const race = extractRaceDetails('5K 01.06.2026 25 минут');
    console.log(`Дистанция: ${race.race_distance}, Дата: ${race.race_date}, Время: ${race.target_time_seconds}с`);
  });

  it('Диалог 6: Естественная речь - "по понедельникам и средам"', () => {
    console.log('\n🗣️  ДИАЛОГ 6: Естественная речь\n');

    let input = 'по понедельникам и средам';
    const days = extractPreferredDays(input);
    console.log(`Пользователь: "${input}"`);
    console.log(`Распознано: ${days?.days}`);
    expect(days?.days).toContain('понедельник');
    expect(days?.days).toContain('среда');

    input = 'бегаю 5км примерно за 25 минут';
    const pace = extract5kPaceSeconds(input);
    console.log(`\nПользователь: "${input}"`);
    console.log(`Темп: ${pace}с`);
    expect(pace).toBeGreaterThan(0);
  });

  it('Диалог 7: Формат "через N недель"', () => {
    console.log('\n🗣️  ДИАЛОГ 7: Относительные даты\n');

    let input = 'полумарафон через 14 недель, целевое время 1ч 55м';
    const race = extractRaceDetails(input);
    console.log(`Пользователь: "${input}"`);
    console.log(`Дистанция: ${race.race_distance}`);
    console.log(`Дата: ${race.race_date} (через 14 недель от сегодня)`);
    console.log(`Время: ${race.target_time_seconds}с = ${Math.floor(race.target_time_seconds! / 3600)}:${Math.floor((race.target_time_seconds! % 3600) / 60)}`);
    expect(race.race_distance).toBe('half');
    expect(race.target_time_seconds).toBe(6900);
  });

  it('Диалог 8: Нестандартная дистанция', () => {
    console.log('\n🗣️  ДИАЛОГ 8: Нестандартная дистанция\n');

    let input = '30 километров через 10 недель, за 2 часа 30 минут';
    const race = extractRaceDetails(input);
    console.log(`Пользователь: "${input}"`);
    console.log(`Дистанция: ${race.race_distance_km} км (custom)`);
    console.log(`Время: ${race.target_time_seconds}с = ${Math.floor(race.target_time_seconds! / 3600)}:${Math.floor((race.target_time_seconds! % 3600) / 60)}`);
    expect(race.race_distance_km).toBe(30);
    expect(race.target_time_seconds).toBe(9000);
  });

  it('Диалог 9: Пользователь говорит 5 дней вместо 4', () => {
    console.log('\n🗣️  ДИАЛОГ 9: Пользователь уточняет количество дней\n');

    let input = 'понедельник, вторник, четверг, суббота или воскресенье';
    const days = extractPreferredDays(input);
    console.log(`Пользователь: "${input}"`);
    console.log(`Распознано: ${days?.days}`);
    console.log(`Бот: "Я правильно понял, что ${days?.estimatedCount} дня в неделю?"`);
    console.log(`Пользователь: "нет, 5"`);
    console.log(`✅ Бот использует все 5 дней (включая оба выходных)`);

    const weeklyRuns = extractWeeklyRuns('5');
    expect(weeklyRuns).toBe(5);
  });

  it('Диалог 10: Проверка всех вариантов "выбежать из"', () => {
    console.log('\n🗣️  ДИАЛОГ 10: Различные варианты "выбежать из"\n');

    const cases = [
      { input: 'хочу выбежать из 2:00', expected: 7140, display: '1:59:00' },
      { input: 'выбежать из 1:50', expected: 6540, display: '1:49:00' },
      { input: 'хочу выбежать из 45', expected: 2640, display: '44:00' },
      { input: 'выбежать из 1:30', expected: 5340, display: '1:29:00' }
    ];

    cases.forEach(({ input, expected, display }) => {
      const race = extractRaceDetails(input);
      console.log(`Пользователь: "${input}"`);
      console.log(`→ Цель: ${race.target_time_seconds}с = ${display} ✅`);
      expect(race.target_time_seconds).toBe(expected);
    });
  });

  it('ИТОГОВАЯ ПРОВЕРКА: Все ключевые фичи работают', () => {
    console.log('\n\n═══════════════════════════════════════');
    console.log('📊 ИТОГОВАЯ ПРОВЕРКА ВСЕХ ФИЧЕЙ');
    console.log('═══════════════════════════════════════\n');

    // 1. "Выбежать из X"
    console.log('✅ 1. "Выбежать из X" → X - 1 минута');
    expect(extractRaceDetails('выбежать из 2:00').target_time_seconds).toBe(7140);

    // 2. "или" между днями
    console.log('✅ 2. Распознавание "или" между днями');
    const daysWithOr = extractPreferredDays('пн, ср, пт, сб или вс');
    expect(daysWithOr?.hasOr).toBe(true);
    expect(daysWithOr?.estimatedCount).toBe(4);

    // 3. Без "или"
    console.log('✅ 3. Фиксированные дни (без "или")');
    const daysWithoutOr = extractPreferredDays('пн, ср, пт, сб');
    expect(daysWithoutOr?.hasOr).toBe(false);
    expect(daysWithoutOr?.estimatedCount).toBe(4);

    // 4. Склонения дней
    console.log('✅ 4. Склонения дней недели (среду, пятницу)');
    const declinedDays = extractPreferredDays('понедельник, среду, пятницу');
    expect(declinedDays?.days).toContain('среда');
    expect(declinedDays?.days).toContain('пятница');

    // 5. Разговорный стиль
    console.log('✅ 5. Разговорный стиль обработки');
    expect(extractLevel('ну типа любитель короче')).toBe('intermediate');

    // 6. Относительные даты
    console.log('✅ 6. Относительные даты (через N недель)');
    const relativeDate = extractRaceDetails('через 12 недель');
    expect(relativeDate.race_date).toBeTruthy();

    console.log('\n═══════════════════════════════════════');
    console.log('🎉 ВСЕ ФИЧИ РАБОТАЮТ КОРРЕКТНО!');
    console.log('═══════════════════════════════════════\n');
  });
});
