# Миграция AI Running Coach: n8n -> TypeScript

## Зачем

Текущая архитектура (n8n workflow, 52+ ноды, 644 строки JS в JSON-строке) создаёт системные проблемы:

- **Хрупкость**: любое изменение формата/структуры ломает несколько мест сразу
- **Нет типов**: данные пользователя, тренировки, планы — всё `any`, ошибки ловятся только в проде
- **Нет тестов на логику**: E2E через webhook-симуляцию тестируют интеграцию, но не бизнес-логику
- **GPT принимает тренерские решения**: генерация планов через промпт → нестабильные форматы, странные тренировки, нет гарантий
- **Дебаг**: отладка 644 строк JS внутри JSON-строки через n8n UI — боль

За 2-3 недели работы над ботом так и не появилась стабильная минимальная версия.

---

## Концепция: детерминированный движок + AI-голос

### Вдохновение: Huawei Health (TruSport)

Приложение Huawei Здоровье строит тренировочные планы подготовки к забегам. Несмотря на маркетинг про "AI", внутри — **детерминированная логика**:

- Классическая 4-фазная периодизация (база → развитие → стабилизация → тейпер)
- Темповые зоны из текущего уровня бегуна (Running Ability Index)
- Еженедельная адаптация по compliance: выполнил больше → сложнее, меньше → легче
- Модель фитнес-усталость (Banister) для контроля перетренированности
- Разгрузочные недели каждые 3-4 цикла
- Максимальный горизонт плана — 12 недель (один макроцикл)

Это работает стабильно, потому что **математика считает, интерфейс показывает**. Никакой нейросети в цикле принятия тренерских решений.

### Наш подход: правила = мозг, GPT = голос

```
Было (n8n):
  Пользователь → GPT "придумай план" → надеемся на формат → сохраняем

Стало (TS):
  Пользователь → GPT парсит текст → движок правил → план (детерминированный) → GPT красиво рассказывает
```

**Разделение ответственности:**

| Задача | Кто делает | Почему |
|--------|-----------|--------|
| Рассчитать темповые зоны | **Движок** (формулы) | Математика, не нужен AI |
| Определить фазу подготовки | **Движок** (недели до забега) | Простая логика |
| Составить микс тренировок на неделю | **Движок** (шаблоны по фазе + уровню) | Периодизация |
| Адаптировать план по результатам | **Движок** (compliance score) | Детерминированные решения |
| Разгрузочная неделя | **Движок** (каждые 3-4 недели) | Классическая периодизация |
| Понять "я сегодня пробежал 8 км за 45 мин" | **GPT** | Свободный текст |
| Написать итоги недели человеческим языком | **GPT** | Персонализация, тон |
| Подбодрить / мотивировать | **GPT** | Эмпатия, стиль |
| Ответить на вопрос про бег | **GPT** | Свободная беседа |
| Объяснить, почему именно такой план | **GPT** | Перевод сухих цифр в понятный текст |

**Что это даёт:**
- **Стабильность**: одни и те же входные данные → всегда один и тот же план
- **Тестируемость**: движок правил покрывается unit-тестами на 100%
- **Дешевле**: GPT-вызовы маленькие ("перескажи этот JSON красиво")
- **Персонализация**: GPT подстраивается под стиль общения пользователя — кому-то сухо и по делу, кому-то с шутками, кому-то жёстко как тренер

---

## Целевая архитектура

```
VPS (Docker)
├── ai-running-coach-bot (Node.js / TypeScript)
│   ├── grammY          — Telegram bot framework
│   ├── supabase-js     — клиент к Supabase (PostgreSQL)
│   ├── openai SDK      — вызовы GPT-4o-mini (только парсинг + презентация)
│   ├── zod             — валидация всех данных (вход/выход)
│   ├── vitest          — тесты
│   └── node-cron       — cron-задачи (weekly summary)
│
├── Supabase (внешний, уже есть)
│   └── PostgreSQL с текущей схемой
│
└── OpenAI API (внешний)
```

### Что уходит
- n8n как платформа для бота (все 52+ ноды основного workflow)
- n8n как платформа для weekly summary
- JSON-файлы workflow (`.json`)
- `prepare-data-v6.js` (644 строки в JSON-строке)
- **GPT как генератор тренировочных планов** — заменяется детерминированным движком

### Что остаётся
- Supabase и текущая схема БД (`database/schema.sql`)
- 5 JSON-файлов базы знаний (`docs/coach-knowledge/`)
- Научная документация (`docs/scientific-foundation.md`)
- Telegram бот (тот же токен, тот же @username)

---

## Детерминированный движок (engine)

Ядро бота. Чистые функции, без side effects, без вызовов API. 100% покрытие тестами.

### 1. Темповые зоны (из текущего уровня бегуна)

На входе: `current_5k_pace_seconds` (например, 1500 = 5:00/км).
На выходе: 5 зон для тренировок.

```typescript
interface PaceZones {
  easy: { min: string; max: string };      // лёгкий бег (70-80% от ПАНО)
  tempo: { min: string; max: string };      // темповый / ПАНО
  threshold: { min: string; max: string };  // пороговый
  interval: { min: string; max: string };   // интервальный (VO2max)
  sprint: { min: string; max: string };     // ускорения
}

// Расчёт по формулам Daniels VDOT или аналогичным
function calculatePaceZones(fiveKPaceSeconds: number): PaceZones { ... }
```

Зоны пересчитываются при изменении `current_5k_pace` (пользователь пробежал новый тест).

### 2. Фазы подготовки (периодизация)

На входе: `race_date`, текущая дата, `level`.
На выходе: текущая фаза и её параметры.

```typescript
type Phase = 'base' | 'development' | 'stabilization' | 'taper';

interface PhaseConfig {
  phase: Phase;
  weekNumber: number;        // какая неделя внутри фазы
  totalWeeksInPhase: number;
  weeklyKmMultiplier: number; // относительно базового объёма
  workoutMix: WorkoutMix;     // пропорции типов тренировок
}

// Распределение по фазам (12-недельный цикл):
// Фаза 1 — База (недели 1-4):        лёгкие + аэробные, наращивание объёма
// Фаза 2 — Развитие (недели 5-8):    интервалы, темповые, рост VO2max
// Фаза 3 — Стабилизация (недели 9-10): ритмовый бег в целевом темпе
// Фаза 4 — Тейпер (недели 11-12):     снижение объёма, сохранение скорости

function getCurrentPhase(raceDate: string, now: Date, level: Level): PhaseConfig { ... }
```

Если до забега > 12 недель → бот предлагает разбить на два цикла.
Если до забега > 24 недель → "пока рано, начнём за 12 недель".

### 3. Генерация плана (шаблоны по фазе + уровню)

На входе: `PhaseConfig`, `PaceZones`, `preferred_training_days`, `weekly_runs`.
На выходе: массив `Workout[]` на неделю.

```typescript
// Шаблоны для каждой фазы и уровня
const PLAN_TEMPLATES: Record<Level, Record<Phase, WorkoutTemplate[]>> = {
  beginner: {
    base: [
      { type: 'easy', distancePercent: 0.3 },
      { type: 'easy', distancePercent: 0.3 },
      { type: 'long', distancePercent: 0.4 },
    ],
    development: [
      { type: 'intervals', distancePercent: 0.25 },
      { type: 'easy', distancePercent: 0.30 },
      { type: 'long', distancePercent: 0.45 },
    ],
    // ...
  },
  intermediate: { ... },
  advanced: { ... },
};

function buildWeeklyPlan(
  phase: PhaseConfig,
  zones: PaceZones,
  user: UserProfile,
  baseWeeklyKm: number,
): Workout[] { ... }
```

Каждая тренировка получает конкретные: дату, дистанцию (км), целевой темп (из зон), описание, RPE.

### 4. Адаптация (compliance → корректировка)

На входе: план прошлой недели, фактические тренировки.
На выходе: решение об изменении нагрузки.

```typescript
interface ComplianceReport {
  plannedKm: number;
  actualKm: number;
  compliancePercent: number;     // actualKm / plannedKm * 100
  completedWorkouts: number;
  plannedWorkouts: number;
  missedTypes: WorkoutType[];    // какие типы пропущены
}

interface AdaptationDecision {
  volumeAdjustment: number;      // -15% ... +10%
  reason: string;                // для GPT-презентации
  isRecoveryWeek: boolean;
}

function calculateAdaptation(
  compliance: ComplianceReport,
  weeksSinceRecovery: number,
): AdaptationDecision {
  // Правила:
  // compliance > 110%  → +5-10% объём
  // compliance 90-110% → без изменений
  // compliance 70-90%  → -5-10%
  // compliance < 70%   → -15%, убрать один интервал
  // каждые 3-4 недели  → разгрузочная (-30% объём)
}
```

### 5. Training Index (фитнес-усталость, упрощённый Banister)

```typescript
interface TrainingIndex {
  fitness: number;    // скользящее среднее нагрузки за 42 дня
  fatigue: number;    // скользящее среднее нагрузки за 7 дней
  form: number;       // fitness - fatigue
  status: 'fresh' | 'optimal' | 'tired' | 'overtrained';
}

// form > 5  → fresh (можно добавить нагрузку)
// form 0-5  → optimal (идеально)
// form -5-0 → tired (нормально в фазе развития)
// form < -5 → overtrained (снижаем нагрузку)
```

---

## Роль GPT (ai)

GPT **не принимает тренерских решений**. Он выполняет 4 функции:

### 1. Парсер (parser) — понимает свободный текст

```
Вход: "пробежал сегодня 8 км за 45 минут, пульс средний 148"
Выход: { distance_km: 8, duration_minutes: 45, avg_hr: 148, date: "2026-02-12" }
```

Маленький промпт, быстрый ответ, дешёвый вызов. Результат валидируется через zod.

### 2. Презентер (presenter) — превращает сухие данные в человеческий текст

```
Вход: {
  compliance: 87%,
  adjustment: -5%,
  phase: "развитие",
  next_week: [{ type: "intervals", distance: 6 }, ...],
  weeks_to_race: 8
}

Выход: "Никита, неделька была неплохая! Ты пробежал 28 из 32
запланированных км — 87%. Интервалы во вторник выполнил на отлично,
а длинную в субботу немного не добрал.

На следующей неделе чуть снижаю объём — 30 км. Фокус по-прежнему
на развитии VO2max, интервалы остаются.

Пн: отдых
Вт: интервалы 6×800м, темп 4:20-4:30
Чт: лёгкий бег 7 км, темп 6:00-6:30
Сб: длинная 14 км, темп 5:40-6:00

До полумарафона 8 недель, ты в фазе «развитие». Всё по плану!"
```

GPT не придумывает тренировки — пересказывает готовый план. Добавляет контекст, мотивацию, адаптирует тон под пользователя.

### 3. Мотиватор (motivator) — подбадривает, адаптируется под стиль

Бот запоминает стиль общения пользователя и подстраивается:
- Кому-то сухо и по делу ("План на неделю: ...")
- Кому-то с эмоциями ("Огонь! Ты сделал все интервалы!")
- Кому-то жёстко ("Пропустил длинную — на этой неделе не пропускаем")

### 4. Эксперт (Q&A) — отвечает на вопросы про бег

```
Пользователь: "а почему интервалы именно 800 метров?"

GPT (с контекстом из базы знаний + текущей фазы): "На твоём уровне
и в фазе развития VO2max, 800м — оптимальная дистанция. Достаточно,
чтобы провести 3-4 минуты в зоне VO2max, но не настолько длинные,
чтобы темп падал. Через пару недель перейдём к более длинным отрезкам."
```

---

## Ключевые принципы

### 1. Строгие типы домена

```typescript
interface UserProfile {
  id: string;
  telegram_id: number;
  first_name: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  resting_hr: number | null;
  max_hr: number | null;
  current_5k_pace_seconds: number | null;
  weekly_runs: number;
  preferred_training_days: string | null;
  race_distance: string | null;
  race_distance_km: number | null;
  race_date: string | null;
  target_time_seconds: number | null;
  has_lab_testing: boolean;
  vo2max: number | null;
  lthr: number | null;
  onboarding_stage: OnboardingStage;
}

interface Workout {
  date: string;           // YYYY-MM-DD
  day_ru: string;
  type: WorkoutType;      // 'easy' | 'long' | 'intervals' | 'tempo' | 'threshold' | 'rest'
  description: string;
  distance_km: number;
  target_pace: string;    // "5:30-6:00"
  target_hr: string | null;
  rpe: number;
}

interface WeeklyPlan {
  user_id: string;
  week_start: string;
  week_end: string;
  phase: Phase;
  workouts: Workout[];
  total_km: number;
  status: 'active' | 'completed';
}
```

### 2. Zod-валидация на границах (парсинг текста)

```typescript
// GPT парсит свободный текст → валидируем результат
const TrainingReportSchema = z.object({
  distance_km: z.number().positive().max(100),
  duration_minutes: z.number().positive().optional(),
  avg_pace_seconds: z.number().positive().optional(),
  avg_hr: z.number().min(40).max(220).optional(),
  max_hr: z.number().min(40).max(220).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

// При ошибке парсинга → переспрашиваем, а не crash
```

### 3. State machine для онбординга

```typescript
type OnboardingStage =
  | 'started'
  | 'profile'        // возраст
  | 'physical'       // рост/вес
  | 'heart_rate'     // пульс покоя
  | 'running_info'   // темп 5к
  | 'lab_testing'    // VO2max/ПАНО
  | 'training_freq'  // дней в неделю
  | 'race_details'   // дистанция/дата/цель
  | 'strategy_preview'
  | 'completed';
```

Вопросы hardcoded. GPT только парсит ответы ("сорок два года" → `age: 42`).

### 4. Regression-тесты (vitest)

```typescript
// Движок (30+ тестов, детерминированных)
describe('zones', () => {
  it('5:00/км 5K → easy zone 6:00-6:30', ...);
  it('4:00/км 5K → easy zone 5:00-5:20', ...);
  it('зоны пересчитываются при улучшении', ...);
});

describe('phases', () => {
  it('12 недель до забега → фаза base', ...);
  it('6 недель до забега → фаза development', ...);
  it('2 недели до забега → фаза taper', ...);
  it('>12 недель → предложить два цикла', ...);
});

describe('plan-builder', () => {
  it('beginner base → 3 тренировки (2 easy + 1 long)', ...);
  it('intermediate development → 4 тренировки (intervals + easy + tempo + long)', ...);
  it('уважает preferred_training_days', ...);
  it('mid-week → только оставшиеся дни', ...);
  it('план всегда в рамках total_km ±5%', ...);
});

describe('adaptation', () => {
  it('compliance 87% → -5% объём', ...);
  it('compliance 115% → +8% объём', ...);
  it('compliance 60% → -15%, убрать интервал', ...);
  it('4 недели подряд → разгрузочная', ...);
  it('training index < -5 → снижение независимо от compliance', ...);
});

// Парсинг (8+ тестов)
describe('parsing', () => {
  it('парсит "новичок" → level=beginner', ...);
  it('парсит "сорок два года" → age=42', ...);
  it('парсит "пробежал 8 км за 45 мин" → {distance: 8, duration: 45}', ...);
  it('парсит "запиши пульс 141" → training_update', ...);
});
```

---

## Структура проекта

```
ai-running-coach/
├── src/
│   ├── bot.ts                    # grammY bot, middleware, роутинг
│   ├── index.ts                  # Entry point
│   │
│   ├── engine/                   # ДЕТЕРМИНИРОВАННЫЙ, без GPT, без side effects
│   │   ├── zones.ts              # Расчёт темповых зон из 5K pace
│   │   ├── phases.ts             # Определение фазы (недели до забега)
│   │   ├── plan-builder.ts       # Генерация плана по фазе + уровню + дням
│   │   ├── adaptation.ts         # Compliance score → корректировка объёма
│   │   ├── training-index.ts     # Фитнес-усталость (упрощённый Banister)
│   │   └── templates/            # Шаблоны тренировок по фазам
│   │       ├── beginner.ts
│   │       ├── intermediate.ts
│   │       └── advanced.ts
│   │
│   ├── ai/                       # GPT — только текст, НЕ тренерские решения
│   │   ├── parser.ts             # "пробежал 8 км" → { distance: 8 }
│   │   ├── presenter.ts          # { plan } → красивое сообщение
│   │   ├── motivator.ts          # Мотивация, стиль, персонализация
│   │   └── qa.ts                 # Ответы на вопросы про бег
│   │
│   ├── handlers/
│   │   ├── onboarding.ts         # State machine онбординга
│   │   ├── plan.ts               # Запрос плана → engine → presenter
│   │   ├── training.ts           # parser → сохранение тренировки
│   │   ├── photo.ts              # Vision (фото тренировок, post-MVP)
│   │   ├── general.ts            # Q&A про бег
│   │   └── update.ts             # Обновление данных (пульс и т.д.)
│   │
│   ├── services/
│   │   ├── openai.ts             # Обёртка над OpenAI SDK
│   │   ├── supabase.ts           # Обёртка над supabase-js
│   │   └── weekly-summary.ts     # Cron: engine.adaptation → presenter → send
│   │
│   ├── domain/
│   │   ├── types.ts              # UserProfile, Workout, WeeklyPlan, Phase, ...
│   │   ├── schemas.ts            # Zod-схемы валидации
│   │   ├── onboarding-flow.ts    # Конфигурация шагов онбординга
│   │   └── intent.ts             # Роутинг интентов (regex + правила)
│   │
│   ├── utils/
│   │   ├── pace.ts               # Конвертации темпов
│   │   ├── dates.ts              # Работа с датами, неделями
│   │   └── format.ts             # Форматирование сообщений
│   │
│   └── config.ts                 # Env-переменные, константы
│
├── tests/
│   ├── engine/                   # 30+ тестов, 100% детерминированных
│   │   ├── zones.test.ts
│   │   ├── phases.test.ts
│   │   ├── plan-builder.test.ts
│   │   ├── adaptation.test.ts
│   │   └── training-index.test.ts
│   ├── parsing.test.ts           # Тесты на извлечение данных из текста
│   ├── onboarding.test.ts
│   ├── intent.test.ts
│   └── fixtures/                 # Тестовые данные
│       ├── users.ts
│       └── trainings.ts
│
├── knowledge/                    # JSON базы знаний (из docs/coach-knowledge/)
│   ├── core-rules.json
│   ├── level-parameters.json
│   ├── training-types.json
│   ├── pace-zones.json
│   └── goal-templates.json
│
├── database/                     # Существующая схема (без изменений)
│   ├── schema.sql
│   └── migrations/
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── README.md
```

---

## Как это работает: пользовательские сценарии

### Сценарий 1: Генерация первого плана

```
Пользователь: "Давай начнём тренировки"

1. handler/plan.ts определяет интент → plan_request
2. engine/phases.ts → race_date через 10 недель → фаза "base"
3. engine/zones.ts → 5K pace 6:00/км → зоны easy 7:00-7:30, ...
4. engine/plan-builder.ts → beginner + base + 3 дня/нед →
   [easy 5км, easy 6км, long 8км] = 19 км
5. services/supabase.ts → сохраняем plan в weekly_plans
6. ai/presenter.ts → GPT превращает план в текст:

"Отлично, начинаем! Ты сейчас в базовой фазе — строим фундамент
выносливости. На эту неделю 3 тренировки, 19 км:

Вт: Лёгкий бег 5 км, темп 7:00-7:30/км
Чт: Лёгкий бег 6 км, темп 7:00-7:30/км
Сб: Длинная 8 км, темп 7:00-7:30/км

Все три — в лёгком темпе, держи пульс до 145. Не гонись за скоростью,
сейчас главное — набегать объём. До полумарафона 10 недель."
```

### Сценарий 2: Еженедельный итог (cron, воскресенье 20:00)

```
1. services/weekly-summary.ts запускается по cron
2. supabase → достаём план и фактические тренировки за неделю
3. engine/adaptation.ts →
   { planned: 19 km, actual: 16 km, compliance: 84%, adjustment: -5% }
4. engine/training-index.ts →
   { fitness: 22, fatigue: 18, form: 4, status: "optimal" }
5. engine/plan-builder.ts → новый план с учётом adjustment →
   [intervals 5km, easy 5km, long 8km] = 18 km
6. supabase → сохраняем новый план
7. ai/presenter.ts → GPT формирует итоги + новый план в одном сообщении
8. Отправляем в Telegram
```

### Сценарий 3: Свободный диалог

```
Пользователь: "а можно в среду бежать вместо вторника?"

1. ai/parser.ts → интент: schedule_change, { from: "вт", to: "ср" }
2. handler/plan.ts → engine/plan-builder.ts пересчитывает даты
3. supabase → обновляем план
4. ai/presenter.ts → "Готово! Перенёс интервалы на среду.
   Теперь расписание: Ср, Пт, Вс."
```

---

## План миграции по этапам

### Этап 0: Контракт данных + cutover plan (1 день)

**Что делаем:**
- Фиксируем контракт данных для `users`, `trainings`, `weekly_plans`, `chat_history` (обязательные/nullable поля, форматы дат, enum-значения)
- Описываем совместимость со старым форматом `plan_data` в `weekly_plans`
- Готовим runbook переключения и rollback (шаги + проверки + критерии отката)
- Добавляем smoke-checklist из 5 критичных пользовательских сценариев после релиза

**Результат:** безопасная миграция с понятным контрактом и обратимым переключением.

---

#### Этап 0 — Статус и артефакты

**Статус:** `completed`

**Артефакты этапа 0 (добавить/заполнить):**

1. `docs/migration/contracts.md`
Контракт данных: таблицы, поля, типы, nullable, индексы, enum-значения, требования к `plan_data`. (заполнено)

2. `docs/migration/cutover-runbook.md`
Пошаговый cutover и rollback, включая `deleteWebhook`, запуск TS-бота, stop n8n, smoke-проверки. (заполнено)

3. `docs/migration/smoke-checklist.md`
5–7 сценариев для проверки после релиза: онбординг, генерация плана, update профиля, лог тренировки, weekly summary. (заполнено)

**Definition of Done (этап 0):**

- Контракт данных утвержден, отражает текущую схему Supabase.
- Описан формат `weekly_plans.plan_data` и совместимость со старым форматом.
- Есть пошаговый cutover и rollback с точными командами.
- Есть smoke-checklist, который можно выполнить за 10–15 минут.

### Этап 1: Scaffold + движок + онбординг (4-5 дней)

**Статус:** `completed`

**Что делаем:**
- Инициализация TS-проекта (grammY, supabase-js, openai, zod, vitest)
- Типы домена (`types.ts`, `schemas.ts`)
- `engine/zones.ts` — расчёт темповых зон + тесты
- `engine/phases.ts` — определение фазы + тесты
- State machine онбординга с hardcoded вопросами
- Минимальный GPT-парсинг (только извлечение полей из свободного текста)
- 15+ тестов (зоны, фазы, парсинг онбординга)

**Результат:** бот принимает /start, проводит онбординг, сохраняет профиль. Движок рассчитывает зоны и фазу.

**Проверка:** `vitest run` — все тесты зелёные. Ручной тест: пройти онбординг в Telegram.

**Выполнено:**
- Создан TS-скелет (`package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`)
- Добавлены базовые доменные типы и схемы
- Реализованы `engine/zones.ts` и `engine/phases.ts` с тестами
- Реализован onboarding state machine + парсер извлечений
- Добавлены базовые unit-тесты (onboarding + zones + phases)
- Добавлен OpenAI fallback-экстрактор для сложных ответов
- Расширен набор unit-тестов (15+ кейсов, включая fallback)

**Осталось в этапе 1:**
- Подключить реальные переменные окружения и проверить локальный запуск
- Прогнать `vitest run` локально (после `npm install`)

### Этап 2: Генерация планов (движок) + презентация (GPT) (3-4 дня)

**Статус:** `in progress`

**Что делаем:**
- `engine/plan-builder.ts` — генерация плана по фазе + уровню + дням
- `engine/templates/` — шаблоны тренировок для каждого уровня и фазы
- `ai/presenter.ts` — GPT превращает план в текст
- Intent routing (план/тренировка/обновление/вопрос)
- Mid-week / next-week логика
- Delete + create для идемпотентности
- 10+ тестов (plan-builder, шаблоны, intent routing)

**Результат:** "Давай план" → движок строит → GPT рассказывает. Стабильно, детерминированно.

**Выполнено:**
- Базовый `plan-builder` и шаблоны тренировок
- Рендер плана в детерминированный текст
- Intent routing для планов и конвертации
- Базовые тесты для intent routing и plan-builder

**Осталось:** нет

### Этап 3: Логирование тренировок + адаптация (3-4 дня)

**Статус:** `completed`

**Что делаем:**
- `ai/parser.ts` — GPT парсит свободный текст тренировок
- `engine/adaptation.ts` — compliance score → решение об изменении нагрузки
- `engine/training-index.ts` — фитнес-усталость (Banister)
- Обработчик обновлений ("запиши пульс 141")
- 8+ тестов (адаптация, training index, парсинг тренировок)

**Результат:** бот принимает тренировки текстом, считает compliance, адаптирует следующую неделю.

**Выполнено:**
- Добавлен парсер тренировок (regex + OpenAI fallback)
- Добавлены сервисы записи тренировок и выборки за период
- Добавлен расчёт compliance и базовая адаптация объёма
- Добавлен training index (42/7 дней)
- План умеет учитывать корректировку объёма на основе прошлой недели
- Добавлено обновление тренировок по сообщению ("пульс", "заметка", "самочувствие")
- Добавлен расчёт пропущенных типов (missedTypes)
- Добавлены unit-тесты для парсера, адаптации, training index

**Осталось:** нет

### Этап 4: Weekly summary + cron (2 дня)

**Статус:** `completed`

**Что делаем:**
- `node-cron` задача (воскресенье 20:00, явная TZ)
- Полный цикл: данные → engine.adaptation → engine.plan-builder → ai.presenter → Telegram
- `ai/motivator.ts` — тон, стиль, подбадривание
- 3+ теста на полный цикл (мок Supabase + GPT)

**Результат:** автоматические еженедельные итоги. Движок решает, GPT рассказывает.

**Выполнено:**
- Добавлен cron (воскресенье 20:00, TZ из env)
- Реализован weekly summary пайплайн (план → факт → адаптация → новый план)
- Добавлен мотивационный рендер итога + текст следующей недели
- Добавлены тесты на weekly summary job

### Этап 5: Q&A + свободный диалог (1-2 дня)

**Статус:** `in progress`

**Что делаем:**
- `ai/qa.ts` — GPT отвечает на вопросы про бег (с контекстом из базы знаний + текущего плана)
- Переносы тренировок, изменение расписания
- Объяснение "почему такой план"

**Результат:** пользователь может общаться с ботом, задавать вопросы, менять расписание.

**Выполнено:**
- Добавлен Q&A handler с fallback (без OpenAI) и подключением знаний
- Добавлены базовые ответы по типам тренировок и зонам темпа
- Добавлены тесты Q&A
- Добавлен обработчик переноса тренировки на другую дату/день
- Добавлено изменение расписания (preferred_training_days)
- Добавлено объяснение "почему такой план"

**Осталось:** нет

### Этап 6: Деплой на VPS (1 день)

**Статус:** `completed`

**Что делаем:**
- Multi-stage Dockerfile (`npm ci` + `npm run build` + runtime stage)
- docker-compose.yml
- Long polling режим (не нужен внешний URL/webhook)
- `deleteWebhook` при старте (переключение с n8n)
- Переменные окружения (.env), явная TZ
- Автозапуск через Docker restart policy
- Отключение n8n workflow

**Результат:** бот работает на VPS, n8n больше не нужен.

**Выполнено:**
- Добавлен Dockerfile (multi-stage build)
- Добавлен docker-compose.yml
- Добавлен `deleteWebhook` перед стартом

### Этап 7: Stabilization window (2-3 дня)

**Статус:** `in progress`

**Что делаем:**
- Мониторинг прод-логов и разбор инцидентов
- Точечные правки промптов/шаблонов без смены контракта
- Доведение regression-набора до 30+ стабильных сценариев
- Structured logs + correlation id (`telegram_update_id`)

**Результат:** подтверждённая стабильная минимальная версия на реальном трафике.

**Выполнено:**
- Добавлены structured logs (JSON) для входящих сообщений и ответов
- Добавлена обработка ошибок с логированием `update_id`
- Добавлены базовые тесты логгера
- Добавлен regression-набор основных сценариев

**Осталось:**
- Расширить regression-набор до 30+ сценариев

### Этап 8 (post-MVP): Vision + фото (2 дня)

**Статус:** `in progress`

**Что делаем:**
- Обработка фото через grammY (getFile + download)
- GPT-4o Vision для распознавания скриншотов тренировок
- Распознанные данные → `ai/parser.ts` → engine

**Результат:** фото тренировок распознаются. Отдельный релиз после стабилизации текстового ядра.

**Выполнено:**
- Добавлен vision-parser для распознавания тренировок со скриншота
- Добавлен обработчик фото и запись тренировок с source=screenshot
- Добавлены тесты vision-парсинга и фото-логирования

---

## Деплой

### Режим: Long Polling

Начинаем с long polling — проще, не нужен домен/SSL/webhook.

```typescript
// index.ts
await bot.api.deleteWebhook(); // важно при переключении с n8n
bot.start({
  onStart: () => console.log('Bot started (long polling)'),
});
```

### Docker

```dockerfile
# Stage 1: build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs/coach-knowledge ./docs/coach-knowledge
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
ENV TZ=Europe/Moscow
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      - NODE_ENV=production
      - TZ=Europe/Moscow
```

### VPS требования (для бота)

- CPU: 1 vCPU (достаточно)
- RAM: 256-512 MB
- Диск: 1 GB
- ОС: любой Linux с Docker

### Минимальная гигиена сервера (малый диск, VPS 10GB)

Если диск маленький (10GB) и ранее ставили n8n/Docker, важно освободить место до деплоя.
Безопасные шаги (VPN не трогают):

```bash
# Проверка заполнения
df -h

# Оценка крупных директорий
du -xhd1 / | sort -h
du -xhd2 /var | sort -h

# Логи journald (ограничить и почистить)
journalctl --disk-usage
journalctl --vacuum-size=50M

# Удалить архивные ротации логов
rm -f /var/log/*.gz /var/log/*.[0-9] /var/log/*/*.gz /var/log/*/*.[0-9]

# Очистка apt
apt-get -y autoremove --purge
apt-get clean

# Очистка Docker от старых контейнеров/образов n8n (если не нужен)
docker rm -f n8n || true
docker rmi n8nio/n8n:latest || true
docker system df
```

Цель: иметь минимум 2-3 GB свободно перед деплоем, иначе риск падений из-за переполнения диска.

---

## Что НЕ меняется

| Компонент | Статус |
|-----------|--------|
| Supabase и схема БД | Без изменений, тот же инстанс |
| Telegram бот (токен) | Тот же, переключаем на grammY |
| OpenAI API ключ | Тот же |
| База знаний (5 JSON) | Копируем в `knowledge/`, используем напрямую |
| Логика онбординга | Та же, но через state machine |

## Что кардинально меняется

| Было | Стало |
|------|-------|
| GPT генерирует тренировочные планы | Движок правил генерирует, GPT пересказывает |
| Нет валидации формата | Zod на каждой границе |
| `any` везде | Строгие типы домена |
| Адаптация через промпт | Детерминированные правила (compliance + Banister) |
| Темповые зоны "на глаз GPT" | Формулы из 5K pace (Daniels VDOT) |
| Нет периодизации | 4 фазы (база → развитие → стабилизация → тейпер) |

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| Регрессия при миграции | 30+ тестов покрывают все ключевые сценарии до переключения |
| Даунтайм при переключении | Long polling: `deleteWebhook` → стартуем TS-бот → отключаем n8n (секунды) |
| Движок даёт неадекватные планы | Шаблоны основаны на спортивной науке (Daniels, Pfitzinger); тесты на граничные кейсы |
| GPT-парсинг не понимает текст | Zod-валидация + переспрос при ошибке |
| VPS падает | Docker restart policy + health endpoint + мониторинг |

## Замечания по плану (после ревью)

1. **Telegram cutover описан неполно.**
Для long polling нужен явный `deleteWebhook`, иначе бот может стартовать некорректно.

2. **Нужен formal rollback.**
Если smoke-сценарии после релиза падают, должен быть готовый откат: остановить TS-бот, вернуть n8n entrypoint, перепроверить базовые сценарии.

3. **Нужна совместимость формата данных.**
`weekly_plans.plan_data` и формат сообщений в `chat_history` должны остаться совместимыми с текущими чтениями/отчётами.

4. **Cron без фиксированной TZ рискован.**
`node-cron` должен запускаться с явной таймзоной (`TZ` в окружении + явная зона в конфиге).

5. **Не хватает контрактных тестов к БД.**
Помимо unit/integration, нужны проверки вставки/обновления в реальных таблицах Supabase на тестовом контуре.

6. **Нужна идемпотентность на входящих update Telegram.**
Повторные доставки не должны дублировать записи тренировок/планов.

7. **Vision лучше вынести за пределы первого go-live.**
Для стабильного MVP безопаснее сначала запустить текстовое ядро, потом отдельным релизом включить фото.

8. **Dockerfile в примере нужно усилить.**
Нужен multi-stage build (`npm ci` + `npm run build` + runtime stage), иначе сборка не воспроизводима.

9. **Нужна базовая наблюдаемость.**
Structured logs, correlation id (`telegram_update_id`), health endpoint и алерты на ошибки OpenAI/Supabase.

10. **Оценка срока в 2 недели оптимистична.**
Реалистичнее: 2.5-3 недели с движком + стабилизацией, 3-3.5 с Vision.

---

## Итого

| Метрика | Сейчас (n8n) | После (TS) |
|---------|-------------|------------|
| Генерация планов | GPT (нестабильно) | Движок правил (детерминированно) |
| Роль GPT | Всё (план + текст + решения) | Только текст (парсинг + презентация + Q&A) |
| Строк логики | 644 в JSON-строке | ~2000 в типизированном TS |
| Тесты | 10 E2E (webhook) | 30+ unit + integration |
| Валидация | Нет | Zod на каждой границе |
| Типы | `any` везде | Строгие типы домена |
| Адаптация | GPT решает | Правила (compliance + Banister) |
| Периодизация | Нет | 4 фазы (как Huawei Health) |
| Дебаг | n8n UI | VSCode + логи + тесты |
| Деплой | Ручной PUT через API | `docker-compose up -d` |
| Время на фикс бага | 30 мин - 2 часа | 5-15 мин (тест → фикс → тест) |

**Общий срок: ~3 недели** (этапы 0-7, без Vision)
