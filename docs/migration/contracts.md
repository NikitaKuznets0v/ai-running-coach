# Контракт данных (Supabase)

Цель: зафиксировать стабильный контракт данных для миграции на TypeScript-бота.

## Общие правила

- Все даты в БД храним в `DATE` или `TIMESTAMPTZ` как в схеме.
- В сервисе даты в формате `YYYY-MM-DD`.
- `telegram_id` уникален, используем как ключ для upsert.
- Все записи создаются/обновляются через service_role ключ (RLS bypass).

## Таблица: `users`

Ключевое:
- `telegram_id` `BIGINT` UNIQUE NOT NULL
- `level` in `beginner|intermediate|advanced`
- `weekly_runs` 1..7
- `preferred_training_days` свободный текст (RU)
- Пульс: `resting_hr`, `max_hr`, `lthr` (nullable)
- `vo2max` nullable
- `has_lab_testing` boolean
- `onboarding_stage` фиксированный набор (см. schema.sql)

Минимальные обязательные поля при upsert:
- `telegram_id`, `first_name`, `level`, `weekly_runs`, `onboarding_stage`

Рекомендуемые при завершенном онбординге:
- `age`, `height_cm`, `weight_kg`, `current_5k_pace_seconds`, `race_distance`, `race_distance_km`, `race_date`, `target_time_seconds`

## Таблица: `training_strategies`

Обязательные:
- `user_id`, `goal_type`, `total_weeks`, `start_date`, `phases`

`phases` JSONB структура:
```
[
  {
    "name": "base",
    "display_name": "База",
    "start_week": 1,
    "end_week": 4,
    "duration_weeks": 4,
    "focus": "аэробная база",
    "target_weekly_km_min": 18,
    "target_weekly_km_max": 24,
    "key_workouts": ["easy_run", "long_run"],
    "intensity_distribution": "80/20"
  }
]
```

## Таблица: `weekly_plans`

Обязательные поля:
- `user_id`, `week_start`, `week_end`, `plan_data`

`plan_data` (совместимость):
- Должен поддерживаться минимум 2 формата:
  1. `{ "raw_plan": "..." }` — исторический формат из n8n
  2. `{ "workouts": [...], "total_km": number, "raw_plan": "..." }` — новый формат

Рекомендуемый формат `plan_data` (TS-бот):
```
{
  "week_start": "YYYY-MM-DD",
  "week_end": "YYYY-MM-DD",
  "total_km": 26.5,
  "workouts": [
    {
      "date": "YYYY-MM-DD",
      "day_ru": "понедельник",
      "type_ru": "Лёгкий бег",
      "description": "...",
      "distance_km": 6,
      "target_pace_min_km": "6:30",
      "treadmill_kmh": 9.2,
      "target_hr": "130-145",
      "rpe": 4
    }
  ],
  "raw_plan": "Читаемый текст плана",
  "meta": {
    "generator": "ts-bot",
    "version": "v1",
    "created_at": "TIMESTAMP"
  }
}
```

Совместимость:
- Читаем `raw_plan` если `workouts` отсутствуют.
- При наличии `workouts` используем их как источник истины.

## Таблица: `trainings`

Обязательные поля:
- `user_id`, `date`, `distance_km`, `duration_seconds`

Рекомендуемые поля:
- `avg_pace_seconds` рассчитывается триггером
- `avg_heart_rate`, `max_heart_rate`, `rpe`, `feeling`, `notes`

Идемпотентность:
- Уникальный индекс `(user_id, date, ROUND(distance_km))`.
- При повторной записи — возвращать friendly-ответ, без падения.

## Таблица: `chat_history`

Обязательные:
- `user_id`, `role`, `content`, `created_at`

`role` in `user|assistant|system`
`message_type` in `general|onboarding|planning|logging|feedback`

Минимальная политика:
- Писать только существенные сообщения (не писать дубли).
- Для дебага сохранять `telegram_message_id` если доступен.

## Таблица: `user_stats`

Заполнение не обязательно для MVP. Можно оставить на фоне или обновлять в weekly job.

