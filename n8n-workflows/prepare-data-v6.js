// ============================================================
// Prepare Data v6 — AI Running Coach
// n8n Function node: builds system prompts with embedded coach knowledge
// ============================================================

const data = items[0].json;
const message = data.message_text;
const stage = data.onboarding_stage || 'started';
const firstName = data.first_name || 'друг';

let systemPrompt = '';
let nextStage = stage;
let isPlanGeneration = false;
let hardcodedResponse = null;

// ============================================================
// GLOBAL CONSTANTS
// ============================================================

const JSON_FORMAT = 'Ответь JSON: {"extracted": {...}, "response": "текст"}. НЕ используй * _ ` [ ]. В response используй \\n для переноса строк — разбивай ответ на абзацы и пункты. Когда упоминаешь темп бега, ВСЕГДА добавляй скорость для дорожки в скобках, например: 6:00/км (10.0 км/ч).';

const daysRu = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const today = new Date();
const dateContext = '\nСЕГОДНЯ: ' + daysRu[today.getDay()] + ', ' + today.toISOString().split('T')[0] + '\n';

// ============================================================
// HELPER: formatPace — seconds to "M:SS"
// ============================================================

const formatPace = (sec) => {
  if (!sec) return 'н/д';
  return Math.floor(sec / 60) + ':' + (sec % 60).toString().padStart(2, '0');
};

// ============================================================
// HELPER: paceToSpeed — seconds/km to km/h
// ============================================================

const paceToSpeed = (sec) => {
  if (!sec || sec <= 0) return 'н/д';
  return (3600 / sec).toFixed(1);
};

// ============================================================
// EMBEDDED COACH KNOWLEDGE — 5 JSON files as JS constants
// ============================================================

const CORE_RULES = {
  intensity_distribution: {
    rule: "80/20",
    low_intensity_percent: 80,
    high_intensity_percent: 20,
    description: "80% тренировок на низкой интенсивности (зоны 1-2), 20% на высокой (зона 5). Минимум времени в 'серой зоне' (зоны 3-4)."
  },
  weekly_progression: {
    max_volume_increase_percent: 10,
    description: "Нельзя увеличивать недельный километраж более чем на 10%",
    exceptions: "Для пожилых, после травм или новичков — может быть меньше 10%"
  },
  recovery_rules: {
    min_rest_days_per_week: 1,
    hard_easy_principle: true,
    description: "Минимум 1 полный день отдыха в неделю. Никогда 2 тяжёлых дня подряд — всегда чередовать.",
    deload_week: {
      frequency: "каждая 4-я неделя",
      volume_reduction_percent: 50,
      description: "Разгрузочная неделя с половиной обычной нагрузки"
    }
  },
  workout_sequencing: {
    after_hard_workout: ["rest", "easy_run", "recovery"],
    after_long_run: ["rest", "easy_run"],
    never_consecutive: ["intervals", "tempo", "long_run"],
    description: "После тяжёлой тренировки — только отдых или лёгкий бег. Нельзя ставить 2 интенсивных подряд."
  },
  intensity_sessions_limits: {
    beginner: { max_per_week: 0, description: "Новичкам — только лёгкие пробежки и длинные" },
    intermediate: { max_per_week: 1, description: "Любителям — максимум 1 интенсивная тренировка в неделю" },
    advanced: { max_per_week: 2, description: "Продвинутым — максимум 2 интенсивных тренировки в неделю" }
  },
  long_run_rules: {
    max_percent_of_weekly_volume: 30,
    description: "Длинная пробежка не должна превышать 30% недельного объёма",
    pace: "На 30-90 секунд медленнее целевого гоночного темпа"
  },
  recovery_run_rules: {
    max_duration_minutes: 40,
    pace: "Очень лёгкий, зоны 1-2, RPE 3-4/10",
    golden_rule: "Нельзя бежать слишком медленно в восстановительный день, только слишком быстро"
  },
  bmi_safety_rules: {
    calculation: "BMI = weight_kg / (height_m)^2",
    thresholds: {
      very_high_risk: { bmi_min: 35, restrictions: "ТОЛЬКО ходьба и очень лёгкий бег. Никаких интенсивных тренировок", allowed_types: ["rest", "easy_run"], max_weekly_km: 15, max_intensity_per_week: 0 },
      high_risk: { bmi_min: 30, bmi_max: 35, restrictions: "Акцент на лёгкие тренировки, минимум нагрузки на суставы", allowed_types: ["rest", "easy_run", "long_run"], max_intensity_per_week: 0 },
      moderate_risk: { bmi_min: 25, bmi_max: 30, restrictions: "Осторожно с интервалами, постепенное увеличение нагрузки", max_intensity_per_week: 1 },
      normal: { bmi_max: 25, restrictions: "Нет особых ограничений" }
    }
  },
  maf_heart_rate: {
    formula: "180 - возраст",
    adjustments: { recovering_from_illness: "-10", inconsistent_training: "-5", consistent_2_years: "+5" },
    usage: "Большинство тренировок должно проходить с пульсом ниже MAF"
  }
};

const LEVEL_PARAMS = {
  beginner: {
    name_ru: "Новичок",
    description: "Бегает меньше года, каждая пробежка — достижение",
    volume: { weekly_runs: { min: 2, max: 3 }, weekly_km: { min: 10, max: 20 }, long_run_max_km: 8 },
    intensity: { high_intensity_sessions_per_week: 0, allowed_workout_types: ["easy_run", "long_run", "rest", "walk_run"] },
    structure: { template: "2 лёгких пробежки + 1 длинная (или 2 лёгких при 2 днях)", mandatory_rest_days: 2, cross_training_days: 1 },
    progression: { weekly_increase_percent: 5, focus: "Построение базовой выносливости и привычки бегать" },
    pace_adjustment: { easy_run: "+60-90 сек к текущему темпу на 5К", long_run: "+90-120 сек к текущему темпу на 5К" }
  },
  intermediate: {
    name_ru: "Любитель",
    description: "Бегает 1-3 года, стабильные тренировки, завершил несколько забегов",
    volume: { weekly_runs: { min: 3, max: 5 }, weekly_km: { min: 25, max: 40 }, long_run_max_km: 15 },
    intensity: { high_intensity_sessions_per_week: 1, allowed_workout_types: ["easy_run", "long_run", "tempo", "fartlek", "rest"] },
    structure: { template: "2-3 лёгких + 1 длинная + 1 темповая/фартлек", mandatory_rest_days: 1, deload_every_weeks: 4 },
    progression: { weekly_increase_percent: 10, focus: "Разнообразие тренировок, увеличение километража" },
    pace_adjustment: { easy_run: "+45-60 сек к текущему темпу на 5К", long_run: "+60-90 сек к текущему темпу на 5К", tempo: "текущий темп на 5К или чуть медленнее" }
  },
  advanced: {
    name_ru: "Продвинутый",
    description: "Бегает более 3 лет, высокий километраж, каждая тренировка имеет цель",
    volume: { weekly_runs: { min: 5, max: 6 }, weekly_km: { min: 50, max: 80 }, long_run_max_km: 25 },
    intensity: { high_intensity_sessions_per_week: 2, allowed_workout_types: ["easy_run", "long_run", "tempo", "intervals", "fartlek", "recovery", "rest"] },
    structure: { template: "2-3 лёгких + 1 длинная + 1 темповая + 1 интервальная", mandatory_rest_days: 1, deload_every_weeks: 4 },
    progression: { weekly_increase_percent: 10, focus: "Производительность, личные рекорды, специфичность к дистанции" },
    pace_adjustment: { easy_run: "+30-45 сек к текущему темпу на 5К", long_run: "+45-60 сек к текущему темпу на 5К", tempo: "-5-10 сек к текущему темпу на 5К", intervals: "-15-20 сек к текущему темпу на 5К" }
  }
};

const TRAINING_TYPES = {
  rest: { name_ru: "Отдых", intensity_zone: 0, purpose: "Полное восстановление, адаптация к тренировочному стрессу" },
  easy_run: { name_ru: "Лёгкий бег", intensity_zone: [1, 2], rpe: [3, 5], hr_percent_max: [60, 70], purpose: "Построение аэробной базы, активное восстановление", duration_minutes: { min: 30, max: 60 }, pace_description: "Можешь свободно разговаривать. Если не можешь — слишком быстро.", common_mistakes: ["Бег слишком быстро — должен быть ДЕЙСТВИТЕЛЬНО лёгким"] },
  recovery: { name_ru: "Восстановительный бег", intensity_zone: 1, rpe: [2, 3], hr_percent_max: [50, 60], purpose: "Активное восстановление после тяжёлой тренировки", duration_minutes: { min: 20, max: 40 }, pace_description: "Очень-очень медленно. Буквально трусца.", golden_rule: "Нельзя бежать слишком медленно, только слишком быстро" },
  long_run: { name_ru: "Длинная пробежка", intensity_zone: [1, 2], rpe: [4, 6], hr_percent_max: [65, 75], purpose: "Развитие выносливости, улучшение жирового метаболизма, ментальная подготовка", duration_minutes: { min: 60, max: 180 }, pace_description: "Комфортный темп, на 30-90 сек медленнее целевого гоночного", rules: { max_percent_weekly_volume: 30, required_rest_after: true }, level_specifics: { beginner: { max_km: 8, max_minutes: 60 }, intermediate: { max_km: 15, max_minutes: 120 }, advanced: { max_km: 25, max_minutes: 180 } } },
  tempo: { name_ru: "Темповая тренировка", intensity_zone: [3, 4], rpe: [6, 7], hr_percent_max: [80, 88], purpose: "Повышение лактатного порога, улучшение способности держать темп", duration_minutes: { min: 40, max: 70 }, tempo_block_minutes: { min: 15, max: 40 }, pace_description: "Комфортно-тяжело. Можешь говорить короткими фразами.", structure: "Разминка 10-15 мин + темповый блок + заминка 10 мин", restrictions: { not_for_beginners: true, min_level: "intermediate" } },
  intervals: { name_ru: "Интервальная тренировка", intensity_zone: 5, rpe: [8, 10], hr_percent_max: [90, 100], purpose: "Улучшение VO2max, развитие скорости", duration_minutes: { min: 45, max: 70 }, examples: ["12 x 400м с 200м восстановления", "5 x 1000м с 2-3 мин отдыха", "4 x 1 миля с 3 мин отдыха"], pace_description: "Очень тяжело. Не можешь говорить.", structure: "Разминка 15 мин + интервалы + заминка 10 мин", restrictions: { not_for_beginners: true, min_level: "advanced", max_per_week: 1, required_rest_after: true } },
  fartlek: { name_ru: "Фартлек", intensity_zone: [2, 4], rpe: [5, 8], purpose: "Развитие чувства темпа, игровой формат интенсивности", duration_minutes: { min: 30, max: 50 }, description: "Игра со скоростью. Ускорения по ощущениям без строгой структуры.", examples: ["30 сек быстро / 90 сек легко — повторить 8-10 раз", "1 мин быстро / 2 мин легко"], restrictions: { not_for_beginners: true, min_level: "intermediate" } },
  walk_run: { name_ru: "Ходьба/Бег", intensity_zone: 1, rpe: [2, 4], purpose: "Безопасное введение в бег для новичков", description: "Чередование интервалов бега и ходьбы", examples: ["1 мин бег / 2 мин ходьба — повторить 10 раз", "2 мин бег / 1 мин ходьба", "5 мин бег / 1 мин ходьба"], restrictions: { only_for_beginners: true, max_level: "beginner" } }
};

const PACE_ZONES = {
  calculation_base: {
    primary_metric: "current_5k_pace_seconds",
    fallback_if_unknown: { beginner: 420, intermediate: 360, advanced: 300 }
  },
  pace_zones: {
    zone1_recovery: { name_ru: "Восстановительная", adjustment_seconds_min: 90, adjustment_seconds_max: 120, hr_percent: [50, 60], rpe: [2, 3] },
    zone2_easy: { name_ru: "Лёгкая/Аэробная", adjustment_seconds_min: 60, adjustment_seconds_max: 90, hr_percent: [60, 70], rpe: [3, 5] },
    zone3_tempo: { name_ru: "Темповая/Пороговая", adjustment_seconds_min: -5, adjustment_seconds_max: 15, hr_percent: [80, 88], rpe: [6, 7] },
    zone4_threshold: { name_ru: "Пороговая/VO2max", adjustment_seconds_min: -10, adjustment_seconds_max: -5, hr_percent: [88, 92], rpe: [7, 8] },
    zone5_intervals: { name_ru: "Интервальная", adjustment_seconds_min: -20, adjustment_seconds_max: -10, hr_percent: [92, 100], rpe: [9, 10] }
  },
  workout_pace_mapping: {
    recovery: "zone1_recovery",
    easy_run: "zone2_easy",
    long_run: "zone2_easy",
    tempo: "zone3_tempo",
    fartlek_easy: "zone2_easy",
    fartlek_fast: "zone3_tempo",
    intervals: "zone5_intervals"
  }
};

const GOAL_TEMPLATES = {
  general: {
    name_ru: "Поддержание формы / Здоровье",
    focus: "Регулярность, удовольствие от бега, общая физическая форма",
    intensity_distribution: { easy_percent: 90, moderate_percent: 10, hard_percent: 0 },
    weekly_structure: {
      beginner: { days: 3, template: [{ day: "tuesday", type: "easy_run", description: "Лёгкий бег 20-30 мин" }, { day: "thursday", type: "easy_run", description: "Лёгкий бег 20-30 мин" }, { day: "saturday", type: "long_run", description: "Длинная 40-60 мин в комфортном темпе" }] },
      intermediate: { days: 4, template: [{ day: "monday", type: "easy_run", description: "Лёгкий бег 30-40 мин" }, { day: "wednesday", type: "easy_run", description: "Лёгкий бег 30-40 мин" }, { day: "friday", type: "fartlek", description: "Фартлек 35 мин с лёгкими ускорениями" }, { day: "sunday", type: "long_run", description: "Длинная 60-75 мин" }] },
      advanced: { days: 5, template: [{ day: "monday", type: "easy_run", description: "Лёгкий бег 40-50 мин" }, { day: "tuesday", type: "tempo", description: "Темповая: разминка + 20 мин темпо + заминка" }, { day: "thursday", type: "easy_run", description: "Лёгкий бег 40 мин" }, { day: "saturday", type: "long_run", description: "Длинная 75-90 мин" }, { day: "sunday", type: "recovery", description: "Восстановительный 30 мин" }] }
    }
  },
  race: {
    name_ru: "Подготовка к забегу",
    focus: "Специфичная подготовка к целевой дистанции",
    intensity_distribution: { easy_percent: 80, moderate_percent: 10, hard_percent: 10 },
    weekly_structure: {
      beginner: { days: 3, template: [{ day: "tuesday", type: "easy_run", description: "Лёгкий бег с небольшими ускорениями в конце" }, { day: "thursday", type: "easy_run", description: "Лёгкий бег в целевом гоночном темпе (последние 10 мин)" }, { day: "saturday", type: "long_run", description: "Длинная — ключевая тренировка недели" }], notes: "Для новичков главное — добежать дистанцию, не гнаться за временем" },
      intermediate: { days: 4, template: [{ day: "tuesday", type: "tempo", description: "Темповая на целевом гоночном темпе" }, { day: "thursday", type: "easy_run", description: "Лёгкий бег 40 мин" }, { day: "saturday", type: "long_run", description: "Длинная с финишем в гоночном темпе" }, { day: "sunday", type: "recovery", description: "Восстановительный 25-30 мин" }] },
      advanced: { days: 5, template: [{ day: "tuesday", type: "intervals", description: "Интервалы на VO2max темпе" }, { day: "wednesday", type: "recovery", description: "Восстановительный 30 мин" }, { day: "thursday", type: "tempo", description: "Темповая на пороговом темпе" }, { day: "saturday", type: "long_run", description: "Длинная с блоками в гоночном темпе" }, { day: "sunday", type: "easy_run", description: "Лёгкий бег 40-50 мин" }] }
    }
  },
  improvement: {
    name_ru: "Улучшение результатов",
    focus: "Прогресс в скорости и выносливости, личные рекорды",
    intensity_distribution: { easy_percent: 80, moderate_percent: 10, hard_percent: 10 },
    weekly_structure: {
      beginner: { days: 3, template: [{ day: "tuesday", type: "easy_run", description: "Лёгкий бег с 4-6 короткими ускорениями (страйдами)" }, { day: "thursday", type: "fartlek", description: "Фартлек: 30 сек быстро / 90 сек легко x 6-8" }, { day: "saturday", type: "long_run", description: "Длинная с прогрессией (последние 15 мин быстрее)" }], notes: "Для новичков улучшение приходит просто от регулярности" },
      intermediate: { days: 4, template: [{ day: "tuesday", type: "tempo", description: "Темповая: 3x10 мин на пороге с 3 мин отдыха" }, { day: "thursday", type: "easy_run", description: "Лёгкий бег 45 мин со страйдами" }, { day: "saturday", type: "long_run", description: "Длинная 70-90 мин" }, { day: "sunday", type: "recovery", description: "Восстановительный 30 мин" }] },
      advanced: { days: 5, template: [{ day: "tuesday", type: "intervals", description: "Интервалы: 5x1000м на 5К темпе, отдых 2-3 мин" }, { day: "wednesday", type: "recovery", description: "Восстановительный 30-35 мин" }, { day: "thursday", type: "tempo", description: "Темповая: 25-30 мин на пороговом темпе" }, { day: "saturday", type: "long_run", description: "Длинная 90-120 мин с прогрессией" }, { day: "sunday", type: "easy_run", description: "Лёгкий бег 45-50 мин" }] }
    }
  }
};

// ============================================================
// PERSONALIZED HR ZONES CALCULATION
// ============================================================

let maxHR = data.max_hr || null;
let mafHR = null;
let bmi = null;
let bmiCategory = null;

if (data.age) {
  if (!maxHR) {
    maxHR = 220 - data.age;
  }
  mafHR = 180 - data.age;
}

if (data.height_cm && data.weight_kg) {
  const heightM = data.height_cm / 100;
  bmi = data.weight_kg / (heightM * heightM);
  bmi = Math.round(bmi * 10) / 10;
  if (bmi >= 35) bmiCategory = 'very_high_risk';
  else if (bmi >= 30) bmiCategory = 'high_risk';
  else if (bmi >= 25) bmiCategory = 'moderate_risk';
  else bmiCategory = 'normal';
}

// ============================================================
// FUNCTION: calculatePaceZones — actual pace zones from 5K pace
// ============================================================

function calculatePaceZones(pace5kSec, level) {
  const base = pace5kSec || PACE_ZONES.calculation_base.fallback_if_unknown[level || 'intermediate'];
  const zones = PACE_ZONES.pace_zones;
  const result = {};
  for (const zoneKey in zones) {
    const z = zones[zoneKey];
    const paceMin = base + z.adjustment_seconds_min;
    const paceMax = base + z.adjustment_seconds_max;
    const slowPace = Math.max(paceMin, paceMax);
    const fastPace = Math.min(paceMin, paceMax);
    result[zoneKey] = {
      name_ru: z.name_ru,
      pace_range: formatPace(fastPace) + '-' + formatPace(slowPace) + ' мин/км',
      speed_range: paceToSpeed(slowPace) + '-' + paceToSpeed(fastPace) + ' км/ч',
      hr_percent: z.hr_percent,
      rpe: z.rpe
    };
  }
  return result;
}

// ============================================================
// FUNCTION: buildKnowledgeContext
// ============================================================

function buildKnowledgeContext(level, goal, pace5kSec) {
  const lvl = LEVEL_PARAMS[level] || LEVEL_PARAMS['intermediate'];
  const goalTpl = GOAL_TEMPLATES[goal] || GOAL_TEMPLATES['race'];
  const allowedTypes = lvl.intensity.allowed_workout_types;

  // Filter training types to only allowed for this level
  let trainingTypesText = 'ДОПУСТИМЫЕ ТИПЫ ТРЕНИРОВОК для уровня ' + lvl.name_ru + ':\n';
  allowedTypes.forEach(typeKey => {
    const t = TRAINING_TYPES[typeKey];
    if (t) {
      trainingTypesText += '- ' + t.name_ru + ' (' + typeKey + '): ' + t.purpose;
      if (t.duration_minutes) trainingTypesText += ', ' + t.duration_minutes.min + '-' + t.duration_minutes.max + ' мин';
      if (t.pace_description) trainingTypesText += '. Темп: ' + t.pace_description;
      trainingTypesText += '\n';
    }
  });

  // Calculate pace zones
  const paceZones = calculatePaceZones(pace5kSec, level);
  let paceZonesText = 'ТРЕНИРОВОЧНЫЕ ТЕМПЫ (от текущего 5К: ' + formatPace(pace5kSec || PACE_ZONES.calculation_base.fallback_if_unknown[level || 'intermediate']) + '/км):\n';
  for (const zk in paceZones) {
    const pz = paceZones[zk];
    paceZonesText += '- ' + pz.name_ru + ': ' + pz.pace_range + ' (' + pz.speed_range + '), RPE ' + (pz.rpe ? pz.rpe.join('-') : 'н/д') + '\n';
  }

  // Level params summary
  let levelText = 'УРОВЕНЬ: ' + lvl.name_ru + '\n';
  levelText += '- Объём: ' + lvl.volume.weekly_km.min + '-' + lvl.volume.weekly_km.max + ' км/нед, ' + lvl.volume.weekly_runs.min + '-' + lvl.volume.weekly_runs.max + ' тренировок\n';
  levelText += '- Длинная макс: ' + lvl.volume.long_run_max_km + ' км\n';
  levelText += '- Интенсивных в неделю: ' + lvl.intensity.high_intensity_sessions_per_week + '\n';
  levelText += '- Структура: ' + lvl.structure.template + '\n';
  levelText += '- Прогрессия: макс +' + lvl.progression.weekly_increase_percent + '%/нед\n';

  // Goal template summary
  const goalStructure = goalTpl.weekly_structure[level] || goalTpl.weekly_structure['intermediate'];
  let goalText = 'ЦЕЛЬ: ' + goalTpl.name_ru + ' — ' + goalTpl.focus + '\n';
  goalText += 'Распределение: ' + goalTpl.intensity_distribution.easy_percent + '% лёгкие / ' + goalTpl.intensity_distribution.moderate_percent + '% средние / ' + goalTpl.intensity_distribution.hard_percent + '% тяжёлые\n';
  goalText += 'ШАБЛОН НЕДЕЛИ (' + goalStructure.days + ' дней):\n';
  goalStructure.template.forEach(d => {
    goalText += '- ' + d.day + ': ' + d.type + ' — ' + d.description + '\n';
  });
  if (goalStructure.notes) goalText += 'Примечание: ' + goalStructure.notes + '\n';

  // Core rules summary
  let rulesText = 'ЖЕЛЕЗНЫЕ ПРАВИЛА (НЕЛЬЗЯ НАРУШАТЬ):\n';
  rulesText += '1. Правило 80/20: ' + CORE_RULES.intensity_distribution.description + '\n';
  rulesText += '2. Прогрессия: ' + CORE_RULES.weekly_progression.description + '\n';
  rulesText += '3. Восстановление: ' + CORE_RULES.recovery_rules.description + '\n';
  rulesText += '4. Разгрузка: ' + CORE_RULES.recovery_rules.deload_week.description + ' (' + CORE_RULES.recovery_rules.deload_week.frequency + ')\n';
  rulesText += '5. Последовательность: ' + CORE_RULES.workout_sequencing.description + '\n';
  rulesText += '6. Интенсивные для ' + lvl.name_ru + ': макс ' + CORE_RULES.intensity_sessions_limits[level || 'intermediate'].max_per_week + '/нед\n';
  rulesText += '7. Длинная: макс ' + CORE_RULES.long_run_rules.max_percent_of_weekly_volume + '% недельного объёма\n';
  rulesText += '8. Восстановительный бег: макс ' + CORE_RULES.recovery_run_rules.max_duration_minutes + ' мин, ' + CORE_RULES.recovery_run_rules.golden_rule + '\n';

  // BMI safety
  if (bmi && bmiCategory && bmiCategory !== 'normal') {
    const bmiRule = CORE_RULES.bmi_safety_rules.thresholds[bmiCategory];
    rulesText += '9. BMI ОГРАНИЧЕНИЯ (BMI=' + bmi + '): ' + bmiRule.restrictions + '\n';
    if (bmiRule.allowed_types) rulesText += '   Допустимые типы: ' + bmiRule.allowed_types.join(', ') + '\n';
    if (bmiRule.max_weekly_km) rulesText += '   Макс км/нед: ' + bmiRule.max_weekly_km + '\n';
  }

  return rulesText + '\n' + levelText + '\n' + trainingTypesText + '\n' + paceZonesText + '\n' + goalText;
}

// ============================================================
// CONTEXT BUILDERS (trainings, plan, strategy)
// ============================================================

// Trainings context
let trainingsContext = '';
const trainings = data.recent_trainings || [];
if (trainings.length > 0) {
  trainingsContext = '\n\nУ ПОЛЬЗОВАТЕЛЯ ЕСТЬ ' + trainings.length + ' ЗАПИСАННЫХ ТРЕНИРОВОК:\n';
  trainings.slice(0, 10).forEach(t => {
    trainingsContext += '- ' + t.date + ': ' + (t.distance_km || '?') + ' км';
    if (t.duration_seconds) trainingsContext += ', ' + Math.round(t.duration_seconds / 60) + ' мин';
    if (t.avg_pace_seconds) trainingsContext += ', темп ' + formatPace(t.avg_pace_seconds) + '/км (' + paceToSpeed(t.avg_pace_seconds) + ' км/ч)';
    if (t.avg_heart_rate) trainingsContext += ', пульс ' + t.avg_heart_rate;
    if (t.type) trainingsContext += ' (' + t.type + ')';
    trainingsContext += '\n';
  });
} else {
  trainingsContext = '\n\nТренировок пока не записано.\n';
}

// Plan context
let planContext = '';
if (data.active_plan && data.active_plan.plan_data) {
  try {
    const pd = typeof data.active_plan.plan_data === 'string' ? JSON.parse(data.active_plan.plan_data) : data.active_plan.plan_data;
    planContext = '\nАКТИВНЫЙ ПЛАН: ' + (pd.raw_plan || JSON.stringify(pd)).substring(0, 500);
  } catch (e) {
    planContext = '';
  }
}

// Strategy context
let strategyContext = '';
let currentPhase = null;
let weeksSinceStart = 0;
if (data.active_strategy && data.active_strategy.phases) {
  try {
    const strategy = data.active_strategy;
    const phases = typeof strategy.phases === 'string' ? JSON.parse(strategy.phases) : strategy.phases;
    const startDate = new Date(strategy.start_date);
    const now = new Date();
    weeksSinceStart = Math.max(1, Math.ceil((now - startDate) / (7 * 24 * 60 * 60 * 1000)));

    for (const phase of phases) {
      if (weeksSinceStart >= phase.start_week && weeksSinceStart <= phase.end_week) {
        currentPhase = phase;
        break;
      }
    }

    strategyContext = '\n\nСТРАТЕГИЯ ПОДГОТОВКИ:';
    strategyContext += '\n- Цель: ' + (strategy.race_distance || '') + (strategy.race_date ? ' (' + strategy.race_date + ')' : '');
    strategyContext += '\n- Всего недель: ' + strategy.total_weeks + ', текущая неделя: ' + weeksSinceStart;
    if (currentPhase) {
      strategyContext += '\n- Текущая фаза: ' + currentPhase.display_name + ' (нед. ' + currentPhase.start_week + '-' + currentPhase.end_week + ')';
      strategyContext += '\n- Фокус: ' + currentPhase.focus;
      strategyContext += '\n- Объём: ' + currentPhase.target_weekly_km_min + '-' + currentPhase.target_weekly_km_max + ' км/нед';
      strategyContext += '\n- Ключевые тренировки: ' + (currentPhase.key_workouts || []).join(', ');
    }
    strategyContext += '\n- Все фазы: ';
    phases.forEach(p => {
      const isCurrent = (currentPhase && p.name === currentPhase.name) ? ' [ТЕКУЩАЯ]' : '';
      strategyContext += p.display_name + ' (нед.' + p.start_week + '-' + p.end_week + ')' + isCurrent + ', ';
    });
    strategyContext += '\n';
  } catch (e) {
    strategyContext = '';
  }
}

// HR context for general use
let hrContext = '';
if (maxHR) hrContext += '\nМаксимальный пульс: ' + maxHR + ' уд/мин (220 - возраст)';
if (mafHR) hrContext += '\nMAF пульс (аэробный потолок): ' + mafHR + ' уд/мин (180 - возраст)';
if (data.resting_hr) hrContext += '\nПульс покоя: ' + data.resting_hr + ' уд/мин';
if (data.lthr) hrContext += '\nЛактатный порог (LTHR): ' + data.lthr + ' уд/мин';
if (data.vo2max) hrContext += '\nVO2max: ' + data.vo2max + ' мл/кг/мин';
if (hrContext) hrContext = '\n\nПУЛЬСОВЫЕ ДАННЫЕ:' + hrContext + '\n';

// ============================================================
// HARDCODED ONBOARDING QUESTIONS
// ============================================================

const ONBOARDING_QUESTIONS = {
  started: 'Привет, ' + firstName + '! Я твой AI-тренер по бегу.\n\nЯ умею:\n- Составлять стратегию подготовки к забегу\n- Генерировать недельные планы тренировок\n- Анализировать фото тренировок (скриншоты из часов/приложений)\n- Отслеживать прогресс и давать советы\n\nДля начала скажи, какой у тебя уровень подготовки:\n- Новичок (бегаю меньше года)\n- Любитель (бегаю 1-3 года)\n- Продвинутый (бегаю более 3 лет)',
  profile: 'Сколько тебе лет?',
  physical: 'Какой у тебя рост (см) и вес (кг)?',
  heart_rate: 'Какой у тебя пульс в покое? Если не знаешь — напиши "не знаю".',
  running_info: 'За сколько пробегаешь 5 км? (примерное время)',
  lab_testing: 'Делал ли ты лабораторные тесты (VO2max, ПАНО)? Если да — напиши результаты.',
  training_freq: 'Сколько дней в неделю готов тренироваться? (от 3 до 6)\nЕсли есть предпочтения по дням — напиши их тоже (например: Пн, Ср, Пт и выходной).',
  race_details: 'Расскажи о забеге:\n- Какая дистанция? (5 км, 10 км, полумарафон, марафон или другая)\n- Когда забег? (дата)\n- Какое целевое время?'
};

// ============================================================
// ONBOARDING STAGE MAP
// ============================================================

const NEXT_STAGES = {
  started: 'profile',
  profile: 'physical',
  physical: 'heart_rate',
  heart_rate: 'running_info',
  running_info: 'lab_testing',
  lab_testing: 'training_freq',
  training_freq: 'race_details',
  race_details: 'strategy_preview',
  strategy_preview: 'completed'
};

// ============================================================
// MAIN LOGIC
// ============================================================

if (stage !== 'completed') {

  nextStage = NEXT_STAGES[stage] || stage;

  if (stage === 'started') {
    // User just typed /start — no GPT parsing needed
    hardcodedResponse = ONBOARDING_QUESTIONS['started'];
    systemPrompt = 'Return {"extracted": {}}. ' + JSON_FORMAT;

  } else if (stage === 'strategy_preview') {
    // Strategy generation — full GPT response, no hardcoded text
    hardcodedResponse = null;

    const profileInfo = 'Данные пользователя: '
      + (data.level ? 'уровень=' + data.level + ', ' : '')
      + (data.age ? 'возраст=' + data.age + ', ' : '')
      + (data.height_cm ? 'рост=' + data.height_cm + 'см, ' : '')
      + (data.weight_kg ? 'вес=' + data.weight_kg + 'кг, ' : '')
      + (data.current_5k_pace_seconds ? 'темп 5К=' + formatPace(data.current_5k_pace_seconds) + '/км, ' : '')
      + (data.weekly_runs ? 'тренировок/нед=' + data.weekly_runs + ', ' : '')
      + (data.race_distance ? 'дистанция=' + data.race_distance + (data.race_distance_km ? ' (' + data.race_distance_km + ' км)' : '') + ', ' : '')
      + (data.race_date ? 'дата=' + data.race_date + ', ' : '')
      + (data.target_time_seconds ? 'цель=' + formatPace(Math.floor(data.target_time_seconds / (data.race_distance_km || 21.1))) + '/км (' + Math.floor(data.target_time_seconds / 60) + ' мин), ' : '');

    // Include CORE_RULES and LEVEL_PARAMS in strategy generation
    const knowledgeForStrategy = buildKnowledgeContext(data.level, data.goal || 'race', data.current_5k_pace_seconds);

    systemPrompt = profileInfo + '\n\n'
      + knowledgeForStrategy + '\n\n'
      + 'ИСПОЛЬЗУЙ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ И ПРАВИЛА ВЫШЕ. Если в сообщении есть новые данные — используй их.\n\n'
      + 'СГЕНЕРИРУЙ СТРАТЕГИЮ ПОДГОТОВКИ К ЗАБЕГУ.\n\n'
      + 'ИНСТРУКЦИИ:\n'
      + '1. Рассчитай количество недель от сегодня (' + today.toISOString().split('T')[0] + ') до даты забега\n'
      + '2. Раздели подготовку на 4 фазы:\n'
      + '   - base (Базовый период): ~30% недель\n'
      + '   - development (Развитие): ~30% недель\n'
      + '   - specialization (Специализация): ~25% недель\n'
      + '   - taper (Подводка): ~15% недель (мин 1, макс 3)\n'
      + '3. Для каждой фазы рассчитай: start_week, end_week, duration_weeks, focus, target_weekly_km_min, target_weekly_km_max, key_workouts, intensity_distribution\n'
      + '4. СТРОГО СОБЛЮДАЙ ЖЕЛЕЗНЫЕ ПРАВИЛА из контекста выше\n'
      + '5. Используй ТОЛЬКО допустимые типы тренировок для уровня ' + (LEVEL_PARAMS[data.level] ? LEVEL_PARAMS[data.level].name_ru : 'Любитель') + '\n\n'
      + 'ФОРМАТ ОТВЕТА В response (СТРОГО СОБЛЮДАЙ):\n'
      + 'Покажи ТОЛЬКО высокоуровневый обзор стратегии по фазам.\n'
      + 'НЕ ПОКАЗЫВАЙ детальный план на неделю! НЕ расписывай тренировки по дням!\n'
      + 'Формат ответа:\n\n'
      + 'Стратегия подготовки к (дистанция) (дата забега)\n'
      + 'Всего N недель подготовки\n\n'
      + 'Фаза 1: Название (недели X-Y, Z недель)\n'
      + 'Фокус: описание в 1 предложении\n'
      + 'Объём: XX-YY км/нед\n'
      + 'Ключевые тренировки: перечислить кратко\n\n'
      + 'Фаза 2: ...\n'
      + '(и так далее для каждой фазы)\n\n'
      + 'В самом конце напиши: Начинаем? Если стратегия подходит, скажи и я составлю план на первую неделю!\n\n'
      + 'НЕ используй символы форматирования. Используй простые тире для списков.\n\n'
      + JSON_FORMAT + '\n'
      + 'extracted: { race_distance: "' + (data.race_distance || 'half') + '", race_distance_km: ' + (data.race_distance_km || 21.1) + ', race_date: "' + (data.race_date || new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) + '", target_time_seconds: ' + (data.target_time_seconds || 6300) + ', strategy_generated: true, total_weeks: число, strategy_summary: "краткое описание", phases: [{name, display_name, start_week, end_week, duration_weeks, focus, target_weekly_km_min, target_weekly_km_max, key_workouts: ["тренировка1", "тренировка2"], intensity_distribution: "80/20 или подобное"}] }';

  } else {
    // All other onboarding stages: GPT is for PARSING only, question is hardcoded
    const nextQ = ONBOARDING_QUESTIONS[stage];
    if (nextQ) {
      hardcodedResponse = nextQ;
    }

    // Build parsing-only system prompts
    const parsingPrompts = {
      profile: 'Extract level from user message. MAPPING: "новичок"/"newbie"/"beginner" = "beginner", "любитель"/"intermediate"/"amateur" = "intermediate", "продвинутый"/"advanced"/"pro" = "advanced". Return ONLY JSON: {"extracted": {"level": "beginner" or "intermediate" or "advanced"}, "response": "ok"}. User said: "' + message + '"',
      physical: 'Extract age (number) from user message. Return ONLY JSON: {"extracted": {"age": number}, "response": "ok"}. User said: "' + message + '"',
      heart_rate: 'Extract height_cm (number) and weight_kg (number) from user message. Return ONLY JSON: {"extracted": {"height_cm": number, "weight_kg": number}, "response": "ok"}. User said: "' + message + '"',
      running_info: 'Extract resting_hr from user message. If user does not know their resting HR, set null. Do NOT re-ask. Return ONLY JSON: {"extracted": {"resting_hr": number_or_null}, "response": "ok"}. User said: "' + message + '"',
      lab_testing: 'Extract current_5k_pace_seconds from user message. User tells their 5K time or pace. Convert to pace per km in seconds (e.g., 25 minutes for 5K = 300 sec/km). Return ONLY JSON: {"extracted": {"current_5k_pace_seconds": number}, "response": "ok"}. User said: "' + message + '"',
      training_freq: 'Extract has_lab_testing (boolean), vo2max (number or null), lthr (number or null) from user message. Return ONLY JSON: {"extracted": {"has_lab_testing": bool, "vo2max": number_or_null, "lthr": number_or_null}, "response": "ok"}. User said: "' + message + '"',
      race_details: 'Extract weekly_runs (number 3-6) from user message. Also extract preferred_training_days if user mentioned specific days (e.g. "Пн, Ср, Пт, выходной" → "понедельник, среда, пятница, один из выходных"). Keep in Russian, free text. If no days mentioned, set null. Also extract race info if provided: race_distance ("5k","10k","half","marathon", or custom like "30k"), race_distance_km (number), race_date (YYYY-MM-DD), target_time_seconds (number). For distances: 5k=5, 10k=10, half=21.1, marathon=42.2. For target time: convert to total seconds. Return ONLY JSON: {"extracted": {"weekly_runs": number, "preferred_training_days": string_or_null, "race_distance": string_or_null, "race_distance_km": number_or_null, "race_date": "YYYY-MM-DD"_or_null, "target_time_seconds": number_or_null}, "response": "ok"}. User said: "' + message + '"'
    };

    systemPrompt = parsingPrompts[stage] || ('Return {"extracted": {}, "response": "ok"}. ' + JSON_FORMAT);
  }

} else {

  // ============================================================
  // COMPLETED ONBOARDING — Intent Routing
  // ============================================================

  const userLevel = data.level || 'intermediate';
  const userGoal = data.goal || 'race';
  const pace5k = data.current_5k_pace_seconds;

  // Strategy question detection
  const isStrategyQuestion = /стратег|фаз[аыуеи]|период|этап подготовки|план подготовки|как.*иду|долгосроч|подготов.*забег/i.test(message);

  // Negative patterns: user wants to log/update data, NOT generate a plan
  const isDataUpdate = /запиши|обнови|добавь|учти|измени|поправь/i.test(message);

  // Plan generation detection (narrowed regex, no "тренировк" and "недел")
  const isPlanRequest = /план|состав|давай|начн|готов/i.test(message);

  if (isStrategyQuestion && data.active_strategy) {
    // ---- STRATEGY QUESTION ----
    const knowledgeCtx = buildKnowledgeContext(userLevel, userGoal, pace5k);

    systemPrompt = 'Ты AI-тренер по бегу для ' + firstName + '. НЕ здоровайся.' + dateContext
      + hrContext
      + '\n' + knowledgeCtx
      + strategyContext + trainingsContext + planContext
      + '\n\nПользователь спрашивает о стратегии: "' + message + '"'
      + '\n\nОтветь подробно о текущей фазе (неделя ' + weeksSinceStart + ' из ' + (data.active_strategy.total_weeks || '?') + '), прогрессе и что впереди.'
      + '\n\n' + JSON_FORMAT;

  } else if (isPlanRequest && !isDataUpdate) {
    // ---- PLAN GENERATION ----
    isPlanGeneration = true;

    const fullKnowledge = buildKnowledgeContext(userLevel, userGoal, pace5k);
    const lvlParams = LEVEL_PARAMS[userLevel] || LEVEL_PARAMS['intermediate'];
    const allowedTypes = lvlParams.intensity.allowed_workout_types;

    // Get goal template for current level
    const goalTpl = GOAL_TEMPLATES[userGoal] || GOAL_TEMPLATES['race'];
    const weeklyTemplate = goalTpl.weekly_structure[userLevel] || goalTpl.weekly_structure['intermediate'];

    let templateText = 'ШАБЛОН НЕДЕЛИ (ИСПОЛЬЗУЙ КАК БАЗОВУЮ СТРУКТУРУ):\n';
    weeklyTemplate.template.forEach(d => {
      templateText += '- ' + d.day + ': ' + d.type + ' — ' + d.description + '\n';
    });

    systemPrompt = 'AI-тренер для ' + firstName + '.' + dateContext
      + hrContext
      + '\n' + fullKnowledge
      + '\n' + templateText
      + strategyContext + trainingsContext + planContext
      + '\n\nСоставь план на неделю. СТРОГО ' + (data.weekly_runs || 3) + ' тренировочных дней, остальные дни — отдых. НЕ добавляй лишних тренировок!'
      + (data.preferred_training_days ? '\nПРЕДПОЧТИТЕЛЬНЫЕ ДНИ ТРЕНИРОВОК: ' + data.preferred_training_days + '. Планируй тренировки ИМЕННО в эти дни.' : '')
      + (currentPhase ? '\n\nВАЖНО: План должен соответствовать ТЕКУЩЕЙ ФАЗЕ: ' + currentPhase.display_name + '. Фокус: ' + currentPhase.focus + '. Объём: ' + currentPhase.target_weekly_km_min + '-' + currentPhase.target_weekly_km_max + ' км.' : '')
      + '\n\nUSE THE TEMPLATE ABOVE as the base structure. Адаптируй его под текущую фазу и прогресс.'
      + '\nDO NOT use training types not listed in ДОПУСТИМЫЕ ТИПЫ: ' + allowedTypes.join(', ') + '.'
      + '\n\nДля каждой тренировки указывай:\n- Тип и описание\n- Дистанцию в км\n- Целевой темп (мин/км) И скорость (км/ч)\n- Целевой пульс (если известен maxHR)\n- RPE (1-10)'
      + '\n\n' + JSON_FORMAT + ' extracted: {plan_generated: true, total_km: число}';

  } else {
    // ---- GENERAL CHAT ----
    // Include rules + relevant training types + pace zones for context
    const lvlParams = LEVEL_PARAMS[userLevel] || LEVEL_PARAMS['intermediate'];
    const allowedTypes = lvlParams.intensity.allowed_workout_types;

    let trainingTypesShort = '\nДОПУСТИМЫЕ ТРЕНИРОВКИ для уровня ' + lvlParams.name_ru + ':\n';
    allowedTypes.forEach(typeKey => {
      const t = TRAINING_TYPES[typeKey];
      if (t) {
        trainingTypesShort += '- ' + t.name_ru + ': ' + t.purpose + '\n';
      }
    });

    const paceZones = calculatePaceZones(pace5k, userLevel);
    let paceShort = '\nТЕМПОВЫЕ ЗОНЫ (5К: ' + formatPace(pace5k || PACE_ZONES.calculation_base.fallback_if_unknown[userLevel]) + '/км):\n';
    for (const zk in paceZones) {
      const pz = paceZones[zk];
      paceShort += '- ' + pz.name_ru + ': ' + pz.pace_range + ' (' + pz.speed_range + ')\n';
    }

    let rulesShort = '\nПРАВИЛА:\n';
    rulesShort += '- 80/20: ' + CORE_RULES.intensity_distribution.description + '\n';
    rulesShort += '- Прогрессия: макс +' + CORE_RULES.weekly_progression.max_volume_increase_percent + '% км/нед\n';
    rulesShort += '- Восстановление: ' + CORE_RULES.recovery_rules.description + '\n';
    rulesShort += '- Интенсивных: макс ' + CORE_RULES.intensity_sessions_limits[userLevel].max_per_week + '/нед\n';

    if (bmi && bmiCategory && bmiCategory !== 'normal') {
      const bmiRule = CORE_RULES.bmi_safety_rules.thresholds[bmiCategory];
      rulesShort += '- BMI=' + bmi + ': ' + bmiRule.restrictions + '\n';
    }

    systemPrompt = 'Ты AI-тренер по бегу для ' + firstName + '. НЕ здоровайся.' + dateContext
      + hrContext
      + rulesShort
      + trainingTypesShort
      + paceShort
      + strategyContext + trainingsContext + planContext
      + '\n\nПользователь спрашивает: "' + message + '"'
      + '\n\nПРАВИЛА ОТВЕТА:\n1. Используй ДАННЫЕ ТРЕНИРОВОК и ПЛАН выше'
      + '\n2. Если есть стратегия — учитывай текущую фазу'
      + '\n3. Будь конкретным: указывай цифры, темп, пульсовые зоны'
      + '\n4. Когда описываешь тренировку, ОБЯЗАТЕЛЬНО указывай темп И скорость для дорожки. Пример: темп 6:00/км (скорость 10.0 км/ч на дорожке). Формула: скорость = 60 / (минуты + секунды/60)'
      + '\n5. Форматируй красиво: разбивай на пункты, используй структуру'
      + '\n6. ВАЖНО: определяй день по дате из СЕГОДНЯ выше. Завтра = следующий день после сегодня.'
      + '\n\n' + JSON_FORMAT;
  }
}

// ============================================================
// OUTPUT
// ============================================================

return [{
  json: {
    user_id: data.user_id,
    chat_id: data.chat_id,
    message_text: message,
    message_id: data.message_id,
    system_prompt: systemPrompt,
    onboarding_stage: stage,
    next_stage: nextStage,
    is_plan_generation: isPlanGeneration,
    weekly_runs: data.weekly_runs,
    hardcoded_response: hardcodedResponse
  }
}];
