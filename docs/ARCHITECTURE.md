# Архитектура AI Running Coach

**Версия:** 2.0-beta (9 февраля 2026)

Этот документ описывает всю логику бота. Используйте его для понимания системы, дебага и будущей миграции с n8n на код (Node.js/Python).

---

## Стек

- **Оркестрация:** n8n (self-hosted, n8n.kube.kontur.host)
- **AI:** OpenAI GPT-4o-mini (текст), GPT-4o (фото)
- **БД:** Supabase PostgreSQL
- **Мессенджер:** Telegram Bot API
- **Схема БД:** `database/schema.sql` (v2.0)

---

## Потоки обработки сообщений

### Общий вход (все сообщения)

```
Telegram → Extract Message → Get User (Supabase) → Check User → Show Typing → Route
```

**Extract Message** — из Telegram-объекта достаёт: telegram_id, chat_id, message_text, message_type (text/photo), photo_file_id.

**Check User** — если пользователь найден в БД, собирает полный профиль (все поля users + message данные). Если не найден — помечает userExists=false.

---

### Путь 1: Фото тренировки

Условие: `message_type === 'photo' AND onboarding_stage === 'completed'`

```
Download Photo (Telegram API)
  → Binary to Base64 (Move Binary Data, keepAsBase64: true)
    → Prepare Vision Data (формирует запрос к OpenAI)
      → GPT-4o Vision (HTTP POST api.openai.com)
        → Parse Vision Response
          → Training Recognized?
            [yes] → Merge Check (есть ли тренировка за последние 3 мин?)
              [merge] → Update Training → Get Week Trainings (Merge) → Get Photo Strategy (Merge) → Format Merge Response (+ прогресс) → "Данные объединены! На этой неделе: X/Y тренировок, Z км (цель: A-B км)"
              [new]   → Save Photo Training → Get Week Trainings (Photo) → Get Photo Strategy → Format Photo Response (+ прогресс) → "Тренировка записана! На этой неделе: X/Y тренировок, Z км (цель: A-B км)"
            [no]  → "Не удалось распознать"
```

**Vision промпт:** "Распознай тренировку с фото. Верни JSON: {recognized, data: {distance_km, duration_seconds, avg_pace_seconds, avg_heart_rate, type}, response}"

**Логика мерджа:** Если у пользователя есть тренировка с source='screenshot' и screenshot_count < 2, созданная менее 3 минут назад — объединяем данные (заполняем пустые поля, для distance_km берём более точное значение).

**Прогресс за неделю:** После сохранения/мерджа тренировки бот показывает прогресс: количество тренировок (X из weekly_runs) и общий километраж за неделю. Если есть активная стратегия — добавляет цель по км из текущей фазы (target_weekly_km_min-max).

---

### Путь 2: Новый пользователь

Условие: `userExists === false`

```
Create User (Supabase INSERT users)
  → Get User Again
    → Prepare New User Data
      → (далее как существующий пользователь)
```

---

### Путь 3: Существующий пользователь (текст)

```
Get Active Plan (Supabase: weekly_plans, status='active')
  → Get Recent Trainings (Supabase: trainings, последние 10)
    → Get Strategy (Supabase: training_strategies, status='active')
      → Merge Context (собирает всё в один объект)
        → Prepare Data (главная логика — формирует промпт)
          → Call OpenAI (GPT-4o-mini)
            → Extract Response (парсит JSON ответ)
              → Send to Telegram
                → Save Chat History
                → [если онбординг] → Build Update Data → Update User Profile
                → [если план] → Save Plan
                → [если стратегия] → Save Strategy
```

---

## Ключевая логика: Prepare Data (~180 строк)

Это самая важная нода — формирует system prompt для AI в зависимости от стадии пользователя.

### Глобальные переменные (в начале Prepare Data)

- **`JSON_FORMAT`** — инструкция для AI: формат JSON-ответа + правила форматирования (использовать `\n` для переносов строк) + инструкция указывать скорость для дорожки рядом с темпом (например: `6:00/км (10.0 км/ч)`). Добавляется ко ВСЕМ промптам.
- **`dateContext`** — текущий день недели и дата (динамически вычисляется через `new Date()`). Пример: `\nСЕГОДНЯ: понедельник, 2026-02-09\n`. Добавляется ко всем промптам после онбординга.

### Онбординг (9 стадий)

| Стадия | Что спрашивает | Что извлекает |
|---|---|---|
| `started` | Описание функций бота + уровень (новичок/любитель/продвинутый) | — |
| `profile` | Возраст | level |
| `physical` | Рост и вес | age |
| `heart_rate` | Пульс покоя | height_cm, weight_kg |
| `running_info` | Темп на 5 км (если пульс неизвестен — null, не переспрашивает) | resting_hr (nullable) |
| `lab_testing` | Есть ли VO2max тест? | current_5k_pace_seconds |
| `training_freq` | Дней в неделю (3-6) | has_lab_testing, vo2max, lthr |
| `race_details` | Дистанция, дата, цель | weekly_runs, race_distance, race_date, target_time_seconds |
| `strategy_preview` | Генерирует стратегию по фазам | phases[], total_weeks, strategy_generated |

### Завершённый онбординг (completed)

Три типа промптов:

1. **Вопрос о стратегии** (regex: `стратег|фаз|период|этап подготовки|план подготовки|как.*иду|долгосроч`):
   - Показывает текущую фазу, прогресс, что впереди

2. **Генерация плана** (regex: `план|состав|давай|начн|готов|тренировк|недел`):
   - Составляет план на неделю СТРОГО по `weekly_runs` (количество тренировочных дней)
   - Включает контекст: тренировки, план, стратегия

3. **Общий чат** (всё остальное):
   - Отвечает с учётом контекста тренировок и стратегии

### Контексты, подставляемые в промпт

- **dateContext** — текущий день недели + дата (`СЕГОДНЯ: понедельник, 2026-02-09`)
- **trainingsContext** — последние 10 тренировок (дата, дистанция, темп, пульс)
- **planContext** — активный недельный план (первые 500 символов)
- **strategyContext** — текущая фаза стратегии (название, фокус, объём, ключевые тренировки)

---

## Формат ответа AI

Все промпты требуют JSON (через `JSON_FORMAT`):
```json
{"extracted": {...}, "response": "текст для пользователя"}
```

**Правила в JSON_FORMAT (применяются ко ВСЕМ промптам):**
- Не использовать markdown-разметку (`* _ [ ]`)
- Использовать `\n` для переносов строк, разбивать на абзацы и пункты
- При упоминании темпа бега — всегда добавлять скорость для дорожки в скобках: `6:00/км (10.0 км/ч)`

**Extract Response** — парсит JSON, достаёт `extracted` (данные для БД) и `response` (текст для Telegram). Убирает markdown-разметку: `#` заголовки, `**bold**`, `*italic*`, `_`, `` ` ``, `[]`.

---

## Таблицы БД

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `users` | Профили | telegram_id, onboarding_stage, race_distance, race_distance_km |
| `training_strategies` | Стратегии | phases (JSONB), total_weeks, status |
| `weekly_plans` | Недельные планы | plan_data (JSONB), week_start, status |
| `trainings` | Записи тренировок | distance_km, duration_seconds, source, screenshot_count |
| `chat_history` | История диалогов | role (user/assistant), content, message_type |
| `user_stats` | Агрегированная статистика | Не используется (на будущее) |

Полная схема: `database/schema.sql` (v2.0)

---

## Credentials

| Сервис | ID в n8n | Назначение |
|---|---|---|
| Supabase | CJ3Z1MvRt6BxblaB | Все операции с БД |
| Telegram | SLNhx6dJUSPFBV35 | Приём/отправка сообщений |
| OpenAI | koikxNcf4ds6vKgZ | GPT-4o-mini (текст), GPT-4o (фото) |

---

## Scheduled Workflow: Weekly Summary

**Файл:** `n8n-workflows/workflow-weekly-summary.json` (12 нод)
**Workflow ID:** L6btLLT88hsIW9Eh
**Расписание:** каждое воскресенье в 20:00 МСК

```
Schedule Trigger (Sunday 20:00)
  → Get Active Users (onboarding_stage='completed', is_active=true)
    → SplitInBatches (1 пользователь за итерацию)
      → Get Week Trainings (trainings за текущую неделю)
        → Summarize Week (агрегация: км, темп, пульс, кол-во)
          → Get Strategy (активная стратегия)
            → Build Summary Prompt (формирует промпт для AI)
              → Call OpenAI (GPT-4o-mini: оценка + план)
                → Parse Response (собирает финальное сообщение)
                  → Deactivate Old Plan (status → 'completed')
                    → Save New Plan (новая запись weekly_plans)
                      → Send Summary (Telegram)
                        → [loop → SplitInBatches]
```

**Формат сообщения:**
```
Итоги недели:
Тренировок: 3 из 4
Дистанция: 28.5 км (цель: 25-30 км)
Средний темп: 5:45/км

[AI оценка: 2-3 предложения]

План на следующую неделю (10-16.02):
Пн: Лёгкий бег 6 км
Ср: Темповый 8 км
Пт: Лёгкий 5 км
Вс: Длинная 12 км

Общий объём: ~31 км
```

---

## Миграция с n8n на код

При переходе на Node.js/Python, заменить:

| n8n нода | Замена в коде |
|---|---|
| TelegramTrigger | `telegraf` (Node.js) или `python-telegram-bot` — webhook |
| Supabase nodes | `@supabase/supabase-js` или `supabase-py` — прямые запросы |
| Call OpenAI | `openai` SDK — chat.completions.create() |
| Function nodes | Обычные функции в файлах |
| IF nodes | Обычные if/else |
| HTTP Request (Vision) | openai SDK с image_url в messages |

**Порядок миграции:**
1. Создать Telegram бот на webhooks (Express/FastAPI)
2. Перенести Check User → Prepare Data → Call OpenAI → Extract Response как основной pipeline
3. Добавить photo pipeline (base64 → Vision API)
4. Перенести все промпты из Prepare Data в отдельные файлы
5. Подключить Supabase напрямую
6. Добавить тесты

**Оценка:** 2-3 дня, потому что вся логика уже написана на JavaScript в Function nodes.
