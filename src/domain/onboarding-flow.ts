import type { OnboardingStep, UserProfile } from './types.js';
import {
  extractAge,
  extractHeightWeight,
  extractLabTesting,
  extractLevel,
  extractPreferredDays,
  extractRaceDetails,
  extractRestingHr,
  extractWeeklyRuns,
  extract5kPaceSeconds
} from '../utils/parse.js';

const q = (text: string) => text;

export const ONBOARDING_FLOW: Record<string, OnboardingStep> = {
  started: {
    stage: 'started',
    question: (u: UserProfile) => q(
      `Привет, ${u.first_name || 'друг'}! Я твой AI-тренер по бегу.\n\n` +
      'Я помогу тебе подготовиться к забегу — строю программу циклами до 12 недель на основе научных методик.\n\n' +
      'Как это работает:\n' +
      '1. Сейчас зададу несколько вопросов о тебе\n' +
      '2. Покажу стратегию подготовки\n' +
      '3. Составлю план на первую неделю\n\n' +
      'После этого можешь писать мне как обычному тренеру — задавать вопросы про бег, технику, питание, ' +
      'спрашивать, почему план построен именно так. Каждую неделю буду присылать итоги, корректировать нагрузку и подбадривать.\n\n' +
      'Начнём! Какой у тебя уровень подготовки?\n' +
      '- Новичок (бегаю меньше года)\n' +
      '- Любитель (бегаю 1-3 года)\n' +
      '- Продвинутый (бегаю более 3 лет)'
    ),
    extract: (message: string) => ({ level: extractLevel(message) || undefined }),
    next: 'profile'
  },
  profile: {
    stage: 'profile',
    question: q('Сколько тебе лет? Это нужно для корректных зон нагрузки.'),
    extract: (message: string) => ({ age: extractAge(message) || undefined }),
    next: 'physical'
  },
  physical: {
    stage: 'physical',
    question: q('Какой у тебя рост (см) и вес (кг)? Это влияет на расчёт тренировочной нагрузки.'),
    extract: (message: string) => extractHeightWeight(message),
    next: 'heart_rate'
  },
  heart_rate: {
    stage: 'heart_rate',
    question: q('Какой у тебя пульс в покое? Нужен для расчёта зон. Если не знаешь — напиши "не знаю".'),
    extract: (message: string) => ({ resting_hr: extractRestingHr(message) }),
    next: 'running_info'
  },
  running_info: {
    stage: 'running_info',
    question: q('За сколько пробегаешь 5 км? Это базовый показатель для расчёта темпов.'),
    extract: (message: string) => ({ current_5k_pace_seconds: extract5kPaceSeconds(message) || undefined }),
    next: 'lab_testing'
  },
  lab_testing: {
    stage: 'lab_testing',
    question: q('Делал ли ты лабораторные тесты (VO2max, ПАНО)? Если да — напиши результаты, это уточнит зоны.'),
    extract: (message: string) => extractLabTesting(message),
    next: 'training_freq'
  },
  training_freq: {
    stage: 'training_freq',
    question: q('Сколько дней в неделю готов тренироваться? (от 3 до 6)\nЭто нужно для построения расписания. Если есть предпочтения по дням — напиши их (например: Пн, Ср, Пт).'),
    extract: (message: string) => ({
      weekly_runs: extractWeeklyRuns(message) || undefined,
      preferred_training_days: extractPreferredDays(message)
    }),
    next: 'race_details'
  },
  race_details: {
    stage: 'race_details',
    question: q('Расскажи о забеге:\n- Какая дистанция? (5 км, 10 км, полумарафон, марафон или другая)\n- Когда забег? (дата)\n- Какое целевое время?\n\nВажно: план строится в 12-недельном цикле. Если до старта больше 12 недель — начнём ближе к дате.'),
    extract: (message: string) => extractRaceDetails(message),
    next: 'strategy_preview'
  },
  strategy_preview: {
    stage: 'strategy_preview',
    question: q('Отлично! Сейчас сформирую 12-недельную стратегию подготовки и первый недельный план.'),
    extract: () => ({}),
    next: 'completed'
  }
};
