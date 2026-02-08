# Архитектура AI Running Coach

**Версия:** 1.5 (8 февраля 2026)

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
              [merge] → Update Training → "Данные объединены!"
              [new]   → Save Photo Training → "Тренировка записана!"
            [no]  → "Не удалось распознать"
```

**Vision промпт:** "Распознай тренировку с фото. Верни JSON: {recognized, data: {distance_km, duration_seconds, avg_pace_seconds, avg_heart_rate, type}, response}"

**Логика мерджа:** Если у пользователя есть тренировка с source='screenshot' и screenshot_count < 2, созданная менее 3 минут назад — объединяем данные (заполняем пустые поля, для distance_km берём более точное значение).

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

## Ключевая логика: Prepare Data (174 строки)

Это самая важная нода — формирует system prompt для AI в зависимости от стадии пользователя.

### Онбординг (9 стадий)

| Стадия | Что спрашивает | Что извлекает |
|---|---|---|
| `started` | Уровень (новичок/любитель/продвинутый) | — |
| `profile` | Возраст | level |
| `physical` | Рост и вес | age |
| `heart_rate` | Пульс покоя | height_cm, weight_kg |
| `running_info` | Темп на 5 км | resting_hr |
| `lab_testing` | Есть ли VO2max тест? | current_5k_pace_seconds |
| `training_freq` | Дней в неделю (3-6) | has_lab_testing, vo2max, lthr |
| `race_details` | Дистанция, дата, цель | weekly_runs, race_distance, race_date, target_time_seconds |
| `strategy_preview` | Генерирует стратегию по фазам | phases[], total_weeks, strategy_generated |

### Завершённый онбординг (completed)

Три типа промптов:

1. **Вопрос о стратегии** (regex: `стратег|фаз|период|этап подготовки|план подготовки|как.*иду|долгосроч`):
   - Показывает текущую фазу, прогресс, что впереди

2. **Генерация плана** (regex: `план|состав|давай|начн|готов|тренировк|недел`):
   - Составляет план на неделю с учётом текущей фазы стратегии
   - Включает контекст: тренировки, план, стратегия

3. **Общий чат** (всё остальное):
   - Отвечает с учётом контекста тренировок и стратегии

### Контексты, подставляемые в промпт

- **trainingsContext** — последние 10 тренировок (дата, дистанция, темп, пульс)
- **planContext** — активный недельный план (первые 500 символов)
- **strategyContext** — текущая фаза стратегии (название, фокус, объём, ключевые тренировки)

---

## Формат ответа AI

Все промпты требуют JSON:
```json
{"extracted": {...}, "response": "текст для пользователя"}
```

**Extract Response** — парсит JSON, достаёт `extracted` (данные для БД) и `response` (текст для Telegram). Убирает markdown-разметку (`**bold**` → `bold`).

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
