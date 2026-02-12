# Архитектура AI Running Coach

**Версия:** 3.0 (v6 — Knowledge + Hardcoded Onboarding, 9 февраля 2026)

Этот документ описывает всю логику бота. Используйте его для понимания системы, дебага и будущей миграции с n8n на код (Node.js/Python).

---

## Стек

- **Оркестрация:** n8n (self-hosted, n8n.kube.kontur.host)
- **AI:** OpenAI GPT-4o-mini (текст), GPT-4o (фото)
- **БД:** Supabase PostgreSQL
- **Мессенджер:** Telegram Bot API
- **Схема БД:** `database/schema.sql` (v2.0)
- **База знаний:** 5 JSON-файлов в `docs/coach-knowledge/` (встроены в Prepare Data)

---

## Изменения в v6 (относительно v5)

| Что изменилось | Описание |
|---|---|
| **Prepare Data** | Полный переписан (~644 строк). Встроены 5 JSON-файлов знаний тренера. Онбординг-вопросы захардкожены. Интент-роутинг исправлен. |
| **Extract Response** | Поддержка `hardcoded_response` — при онбординге используется готовый текст вместо GPT |
| **GPT-4o Vision** | Теперь включает caption фото в промпт (раньше caption терялся) |
| **Save Plan** | Добавлено поле `week_end` (week_start + 6 дней) |
| **Send Telegram** | Добавлен `continueOnFail` — не падает при ошибках отправки |
| **Test Webhook** | Новая нода — альтернативный вход для E2E тестов |

---

## База знаний тренера (встроена в Prepare Data)

5 JSON-файлов из `docs/coach-knowledge/`, вшитых как JS-константы:

| Файл | Константа | Назначение |
|---|---|---|
| `core-rules.json` | `CORE_RULES` | Железные правила: 80/20, +10% объёма/нед, hard-easy, разгрузка, BMI |
| `level-parameters.json` | `LEVEL_PARAMS` | Параметры уровней: объём км, макс интенсивность, допустимые типы |
| `training-types.json` | `TRAINING_TYPES` | 8 типов тренировок с зонами, RPE, длительностью, ограничениями |
| `pace-zones.json` | `PACE_ZONES` | 5 зон темпа от результата на 5К (Jack Daniels) |
| `goal-templates.json` | `GOAL_TEMPLATES` | Недельные шаблоны для 3 целей × 3 уровней |

### Как знания используются

| Ситуация | Какие файлы подставляются |
|---|---|
| Генерация стратегии (`strategy_preview`) | CORE_RULES + LEVEL_PARAMS |
| Генерация недельного плана | Все 5: правила + параметры + шаблоны + типы + темпы |
| Общие вопросы (`completed`) | CORE_RULES + TRAINING_TYPES + PACE_ZONES |
| Онбординг | Не используются (только парсинг ответов) |

### Функция buildKnowledgeContext(level, goal, pace5kSec)

Формирует компактный текст для GPT, включающий:
- Правила (нарушать нельзя): интенсивность, прогрессия, отдых
- Параметры уровня: объём, допустимые типы тренировок, ограничения
- Шаблон недели для цели+уровня
- Рассчитанные темпы из 5К (с зонами пульса если известен возраст)
- Типы тренировок с зонами, RPE, длительностью

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

**v6:** Теперь caption фото включается в промпт: `"Распознай тренировку. Комментарий пользователя: {caption}"` — позволяет учитывать данные типа "средний пульс 141", отправленные подписью к фото.

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

## Ключевая логика: Prepare Data (~644 строк, v6)

Полностью переписана в v6. Формирует system prompt для AI + содержит встроенную базу знаний тренера.

### Структура кода Prepare Data

```
Строки 1-140:    Константы знаний (CORE_RULES, LEVEL_PARAMS, TRAINING_TYPES, PACE_ZONES, GOAL_TEMPLATES)
Строки 141-220:  Захардкоженные вопросы онбординга (ONBOARDING_QUESTIONS)
Строки 221-300:  Функции расчёта (calculatePaceZones, buildKnowledgeContext, formatPace)
Строки 301-644:  Основная логика (формирование промптов по стадиям)
```

### Глобальные переменные

- **`JSON_FORMAT`** — инструкция для AI: формат JSON-ответа + правила форматирования. Добавляется ко ВСЕМ промптам.
- **`dateContext`** — текущий день недели и дата. Добавляется после онбординга.
- **`ONBOARDING_QUESTIONS`** — словарь захардкоженных вопросов для каждой стадии онбординга.
- **5 констант знаний** — CORE_RULES, LEVEL_PARAMS, TRAINING_TYPES, PACE_ZONES, GOAL_TEMPLATES.

### Онбординг (9 стадий) — v6: Hardcoded

Вопросы захардкожены, GPT используется ТОЛЬКО для парсинга ответов. Поле `hardcoded_response` содержит текст следующего вопроса → Extract Response использует его вместо ответа GPT.

| Стадия | Захардкоженный вопрос | GPT парсит |
|---|---|---|
| `started` | Приветствие + описание бота + вопрос об уровне | — (пустой JSON) |
| `profile` | "Сколько тебе лет?" | level (с маппингом: новичок→beginner, любитель→intermediate, продвинутый→advanced) |
| `physical` | "Какой у тебя рост (см) и вес (кг)?" | age |
| `heart_rate` | "Какой у тебя пульс в покое?" | height_cm, weight_kg |
| `running_info` | "За сколько пробегаешь 5 км?" | resting_hr (nullable) |
| `lab_testing` | "Делал ли лабораторные тесты?" | current_5k_pace_seconds |
| `training_freq` | "Сколько дней в неделю? + предпочтения по дням" | has_lab_testing, vo2max, lthr |
| `race_details` | "Дистанция, дата, целевое время" | weekly_runs, preferred_training_days (nullable) |
| `strategy_preview` | GPT генерирует стратегию (с базой знаний) | race_distance, goal, target_time → phases[] |

### Завершённый онбординг (completed) — v6: с базой знаний

Четыре типа обработки (порядок проверки важен):

1. **Запрос обновления** (regex: `запиши|обнови|добавь|учти|измени|поправь|пульс.*запис`):
   - v6 FIX: НЕ генерирует план (в v5 ошибочно генерировал при совпадении "тренировк")
   - Обрабатывает как обновление данных тренировки

2. **Вопрос о стратегии** (regex: `стратег|фаз|период|этап подготовки|план подготовки|как.*иду|долгосроч`):
   - Показывает текущую фазу, прогресс, что впереди

3. **Генерация плана** (regex: `план|состав|давай|начн|готов|недел` — только если НЕ запрос обновления):
   - v6: Подставляет ПОЛНУЮ базу знаний (`buildKnowledgeContext`)
   - Рассчитанные темпы, шаблоны, правила, ограничения уровня
   - Если есть `preferred_training_days` — планирует тренировки в указанные дни

4. **Общий чат** (всё остальное):
   - v6: Подставляет базовые знания (правила + типы + темпы)
   - Персонализированные зоны пульса (maxHR = 220 - возраст, MAF = 180 - возраст)

### Контексты, подставляемые в промпт

- **dateContext** — текущий день недели + дата
- **trainingsContext** — последние 10 тренировок
- **planContext** — активный недельный план (первые 500 символов)
- **strategyContext** — текущая фаза стратегии
- **knowledgeContext** (v6) — из `buildKnowledgeContext()`: правила, параметры уровня, шаблоны, темпы, типы тренировок

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

**v6:** Если `prepareData.hardcoded_response` существует — использует его как responseText (вместо ответа GPT). При этом всё ещё пытается распарсить GPT-ответ для `extracted` данных.

---

## Таблицы БД

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `users` | Профили | telegram_id, onboarding_stage, race_distance, race_distance_km, preferred_training_days |
| `training_strategies` | Стратегии | phases (JSONB), total_weeks, status |
| `weekly_plans` | Недельные планы | plan_data (JSONB), week_start, week_end (v6), status |
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

## E2E Тестирование (v6)

**Файл workflow:** `n8n-workflows/workflow-e2e-tests.json` (18 нод)
**Скрипт добавления вебхука:** `n8n-workflows/add-test-webhook.py`

### Подход
Тестовый workflow отправляет HTTP POST на webhook-ноду основного workflow, имитируя Telegram payload. Используются фейковые telegram_id (900000001+).

### Тестовый вход в основной workflow
Нода `Test Webhook` (id: `test-webhook`, path: `e2e-test-entry`) — альтернативный вход, подключённый к Extract Message параллельно с Telegram Trigger. URL: `https://n8n.kube.kontur.host/webhook/e2e-test-entry`

Добавляется скриптом `add-test-webhook.py`, который:
1. Читает `workflow-main-chatbot-v6.json`
2. Добавляет Webhook ноду (position [240,600], ниже TelegramTrigger)
3. Добавляет connection Test Webhook -> Extract Message
4. Сохраняет файл + API payload (`workflow-v6-with-webhook-payload.json`)

### Архитектура теста (18 нод)
```
Manual Trigger → Generate Test Personas (Function: 10 персон)
  → Loop Over Personas (SplitInBatches, batchSize=1)
    → Prepare Messages (Function: разворачивает messages[] в items)
    → Loop Over Messages (SplitInBatches, batchSize=1)
      → Send to Webhook (HTTP POST с Telegram payload)
      → Wait 5s Between Messages
      → Continue Inner Loop (Function: передаёт данные назад)
      → [loop back to inner SplitInBatches]
    → (done, output 1) Wait 15s After Onboarding
    → Restore Persona Data (Function: восстанавливает данные персоны)
    → Get Test User (Supabase: users by telegram_id)
    → Prepare Strategy Query (Function: собирает user_id + expected)
    → Get Test Strategy (Supabase: training_strategies by user_id)
    → Compare Results (Function: expected vs actual, loose comparison)
    → Collect Result (Function: сохраняет в workflow static data)
    → Back to Outer Loop (Function)
    → [loop back to outer SplitInBatches]
  → (done, output 1) Generate Report (Function: агрегация всех результатов)
  → Send Report via Telegram (chat_id: 144636366)
```

### 10 тестовых персон
| # | ID | Описание | Уровень | Цель |
|---|---|---|---|---|
| 1 | 900000001 | Новичок, чёткие ответы | beginner | race (5K) |
| 2 | 900000002 | Любитель, чёткие ответы | intermediate | improvement |
| 3 | 900000003 | Продвинутый, с лаб. тестами | advanced | race (HM) |
| 4 | 900000004 | Естественный язык | beginner | general |
| 5 | 900000005 | Короткие ответы | intermediate | race (10K) |
| 6 | 900000006 | Болтливый новичок | beginner | general |
| 7 | 900000007 | Полумарафон любитель | intermediate | race (HM) |
| 8 | 900000008 | Марафон продвинутый | advanced | race (marathon) |
| 9 | 900000009 | Для здоровья | beginner | general |
| 10 | 900000010 | Улучшение результатов | intermediate | improvement |

### Проверки (Compare Results)
- Каждое поле из `expected` проверяется против реального значения в Supabase
- Используется loose comparison (`==`) для совместимости типов (string/number)
- Результат: PASS/FAIL по каждому полю + детали несовпадений
- Проверяемые поля: level, age, height_cm, weight_kg, weekly_runs, goal, race_distance, resting_hr, current_5k_pace_seconds, has_lab_testing
- Наличие training_strategy (для race/improvement целей)

### Формат отчёта (Telegram)
```
=== E2E Test Report ===
Total: 10 | Passed: 8 | Failed: 2
========================

PASS | Новичок_Чёткий (id: 900000001)
  Checks: 11/11 | Strategy: YES

FAIL | Естественный_Язык (id: 900000004)
  Checks: 3/4 | Strategy: NO
  Failures: age: expected=42 actual=null

========================
2 TEST(S) FAILED
```

### Запуск
1. Добавить webhook: `python3 n8n-workflows/add-test-webhook.py`
2. Деплой через API: `curl -X PUT .../api/v1/workflows/7Ar459SadzSXgUEv -H 'X-N8N-API-KEY: <key>' -d @workflow-v6-with-webhook-payload.json`
3. Импортировать `workflow-e2e-tests.json` в n8n
4. Запустить тестовый workflow вручную (Manual Trigger)
5. Результат придёт в Telegram (chat_id: 144636366)

### Ограничения
- Send Telegram падает для фейковых chat_id → `continueOnFail` на Send Telegram ноде основного workflow
- Cleanup тестовых пользователей — вручную или отдельным скриптом (telegram_id >= 900000000)
- При повторном запуске — upsert перезаписывает users, но chat_history накапливается
- Timeout: 3600 секунд (10 персон x 9 сообщений x 5с + 15с задержки ~ 10 минут)

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
