# E2E Тестирование AI Running Coach

**Версия:** 1.0 (9 февраля 2026)

Документ описывает систему автоматического тестирования бота: архитектуру, подход, тестовые сценарии и инструкцию по запуску.

---

## Общий подход

Тесты построены на **webhook-симуляции** — отдельный n8n workflow отправляет HTTP POST запросы на webhook основного workflow, имитируя сообщения от Telegram. Это позволяет тестировать всю цепочку обработки без реального Telegram-аккаунта.

### Почему webhook, а не Telegram API?

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| Реальные сообщения через Telegram | Тестирует всё, включая Telegram API | Нужен отдельный аккаунт, медленно, нестабильно |
| Mock-объекты / unit-тесты | Быстро, изолированно | n8n не поддерживает unit-тесты нативно |
| **Webhook-симуляция** | Тестирует всю цепочку, быстро, стабильно | Не тестирует Telegram Trigger напрямую |

Мы выбрали webhook-симуляцию как оптимальный баланс между покрытием и простотой.

---

## Архитектура

### Два workflow

| Workflow | ID | Назначение |
|----------|----|------------|
| AI Running Coach - Main Chatbot v6 | `7Ar459SadzSXgUEv` | Основной бот (52 ноды) |
| AI Running Coach - E2E Tests | `LcpS2EPl22QXEosL` | Тестовый workflow (18 нод) |

### Точка входа для тестов

В основной workflow добавлена нода **Test Webhook** (`n8n-nodes-base.webhook`):
- Path: `/webhook/e2e-test-entry`
- Method: POST
- Принимает JSON в формате Telegram Update
- Подключена к той же ноде **Extract Message**, что и Telegram Trigger

```
Telegram Trigger ──┐
                   ├──→ Extract Message → Check User → Prepare Data → ...
Test Webhook ──────┘
```

Нода **Extract Message** поддерживает оба формата входных данных:
```javascript
// Telegram Trigger: items[0].json.message
// Webhook: items[0].json.body.message
const msg = items[0].json.message || (items[0].json.body && items[0].json.body.message);
```

### Формат Telegram Update (симуляция)

Тестовый workflow отправляет JSON, имитирующий Telegram Update:

```json
{
  "update_id": 999001,
  "message": {
    "message_id": 1,
    "from": {
      "id": 900000001,
      "is_bot": false,
      "first_name": "Тест",
      "username": "test_runner_900000001"
    },
    "chat": {
      "id": 900000001,
      "type": "private"
    },
    "date": 1739100000,
    "text": "Новичок"
  }
}
```

### Фейковые telegram_id

Каждая тестовая персона использует уникальный `telegram_id` из диапазона **900000001 — 900000010**. Это гарантирует:
- Изоляцию от реальных пользователей
- Независимость тестов друг от друга
- Простую очистку данных после тестов (`DELETE FROM users WHERE telegram_id BETWEEN 900000001 AND 900000010`)

---

## Тестовый workflow: структура нод

```
Manual Trigger
  → Generate Test Personas (Function: 10 персон)
  → Loop Over Personas (SplitInBatches, по 1)
    → Prepare Messages (Function: развернуть массив сообщений)
    → Loop Over Messages (SplitInBatches, по 1)
      → Send to Webhook (HTTP POST → /webhook/e2e-test-entry)
      → Wait 5s Between Messages
      → Continue Inner Loop (Function)
      → [возврат в Loop Over Messages]
    → Wait 15s After Onboarding (дать стратегии сгенериться)
    → Restore Persona Data (Function)
    → Get Test User (Supabase: SELECT FROM users)
    → Prepare Strategy Query (Function)
    → Get Test Strategy (Supabase: SELECT FROM training_strategies)
    → Compare Results (Function: сравнить expected vs actual)
    → Collect Result (Function: сохранить в workflow static data)
    → Back to Outer Loop (Function)
    → [возврат в Loop Over Personas]
  → Generate Report (Function: агрегация результатов)
  → Send Report via Telegram (в chat_id: 144636366)
```

### Ключевые паттерны n8n в тестах

1. **Двойной SplitInBatches**: внешний цикл по персонам, внутренний по сообщениям
2. **Workflow Static Data**: `$getWorkflowStaticData('global')` для накопления результатов между итерациями
3. **Wait-ноды**: 5 сек между сообщениями (дать workflow обработать), 15 сек после онбординга (дать стратегии сгенериться)
4. **continueOnFail**: на Send to Webhook, чтобы не падать при ошибках
5. **alwaysOutputData**: на Supabase-нодах, чтобы отсутствие записи не ломало цепочку

---

## Тестовые персоны (10 штук)

### 1. Новичок_Чёткий (900000001)
- **Что тестирует**: базовый парсинг чётких ответов, уровень beginner
- **Ожидания**: level=beginner, age=28, height=175, weight=72, pace_5k=420s, weekly_runs=3, race=5k

### 2. Любитель_Чёткий (900000002)
- **Что тестирует**: парсинг intermediate, пульс покоя, темп в формате "5:30 на км"
- **Ожидания**: level=intermediate, age=35, height=180, weight=78, resting_hr=62, pace_5k=330s, weekly_runs=4

### 3. Продвинутый_С_Тестами (900000003)
- **Что тестирует**: advanced уровень, лабораторные тесты (VO2max, ПАНО), полумарафон
- **Ожидания**: level=advanced, age=32, height=178, weight=68, resting_hr=48, pace_5k=270s, has_lab_testing=true, weekly_runs=5

### 4. Естественный_Язык (900000004)
- **Что тестирует**: парсинг свободного текста ("ну я так, начинающий бегун"), возраст прописью ("сорок два"), нестандартные формулировки
- **Ожидания**: level=beginner, age=42, height=165, weight=80

### 5. Короткие_Ответы (900000005)
- **Что тестирует**: минимальные ответы ("29", "182/75", "58", "нет")
- **Ожидания**: level=intermediate, age=29, height=182, weight=75, weekly_runs=4

### 6. Болтливый_Новичок (900000006)
- **Что тестирует**: длинные ответы с лишней информацией, возраст 55+, вес 90+ кг, цель "похудеть"
- **Ожидания**: level=beginner, age=55, height=170, weight=90

### 7. Полумарафон_Любитель (900000007)
- **Что тестирует**: цель "полумарафон", конкретная дата забега, целевое время
- **Ожидания**: level=intermediate, age=38, weekly_runs=4, race_distance=half_marathon

### 8. Марафон_Продвинутый (900000008)
- **Что тестирует**: марафон, высокая частота тренировок (6 дней), "sub-3" как целевое время
- **Ожидания**: level=advanced, age=30, weekly_runs=6, race_distance=marathon

### 9. Для_Здоровья (900000009)
- **Что тестирует**: цель "general" (без забега), "не знаю" в ответах, темп без конкретных цифр
- **Ожидания**: level=beginner, age=45, weekly_runs=3, goal=general

### 10. Улучшение_Результатов (900000010)
- **Что тестирует**: цель "improvement" (не забег, а улучшение личников)
- **Ожидания**: level=intermediate, age=33, weekly_runs=5, goal=improvement

---

## Что проверяется

### Проверки для каждой персоны

Нода **Compare Results** сравнивает ожидаемые значения (`expected`) с фактическими данными из таблицы `users` в Supabase:

| Поле | Описание |
|------|----------|
| `level` | Уровень подготовки (beginner/intermediate/advanced) |
| `age` | Возраст |
| `height_cm` | Рост в см |
| `weight_kg` | Вес в кг |
| `resting_hr` | Пульс покоя (может быть null) |
| `current_5k_pace_seconds` | Темп на 5 км в секундах |
| `has_lab_testing` | Наличие лабораторных тестов |
| `weekly_runs` | Количество тренировок в неделю |
| `goal` | Цель (race/improvement/general) |
| `race_distance` | Дистанция забега |

Дополнительно проверяется наличие стратегии в таблице `training_strategies`.

### Формат отчёта

```
=== E2E Test Report ===
Total: 10 | Passed: 8 | Failed: 2
========================

PASS | Новичок_Чёткий (id: 900000001)
  Checks: 7/7 | Strategy: YES

FAIL | Естественный_Язык (id: 900000004)
  Checks: 2/4 | Strategy: YES
  Failures: age: expected=42 actual=null; height_cm: expected=165 actual=null

========================
2 TEST(S) FAILED
```

Отчёт отправляется в Telegram (chat_id: 144636366).

---

## Как запустить тесты

### Предварительные условия

1. Основной workflow (`7Ar459SadzSXgUEv`) активирован
2. Тестовый workflow (`LcpS2EPl22QXEosL`) существует в n8n
3. Webhook `/webhook/e2e-test-entry` зарегистрирован (проверить: если workflow деактивировался/активировался после деплоя)

### Запуск

1. Открыть n8n: `https://n8n.kube.kontur.host`
2. Перейти в workflow **"AI Running Coach - E2E Tests"**
3. Нажать кнопку **"Execute Workflow"** (Manual Trigger)
4. Ожидание: ~10-15 минут (10 персон x 9 сообщений x 5 сек + генерация стратегий)
5. Результат придёт в Telegram

### Запуск через API (не работает для Manual Trigger)

На данный момент n8n API не поддерживает запуск workflows с Manual Trigger через `POST /api/v1/executions`. Запуск возможен только из UI.

### Очистка тестовых данных

После тестов тестовые пользователи остаются в БД. Для очистки:

```sql
-- Удалить тестовых пользователей и каскадно все связанные данные
DELETE FROM users WHERE telegram_id BETWEEN 900000001 AND 900000010;
```

Или через Supabase Dashboard → SQL Editor.

---

## Известные ограничения

1. **Manual Trigger only** — нельзя запустить тесты по расписанию или через API без смены триггера на Webhook/Cron
2. **Нет тестов для фото** — webhook-симуляция не поддерживает binary data (фото), поэтому GPT-4o Vision не тестируется
3. **Нет тестов для недельных планов** — онбординг + стратегия тестируются, но генерация недельного плана (требует `is_plan_generation`) не включена
4. **Timing-зависимость** — если n8n перегружен или OpenAI отвечает медленно, 5 сек между сообщениями может быть недостаточно
5. **Нет автоочистки** — тестовые данные не удаляются автоматически после прогона
6. **Loose comparison** — проверка использует `==` вместо `===`, что может скрывать проблемы с типами (строка "28" == число 28)

---

## Баги, найденные при тестировании

### Баг 1: Extract Message падает для Webhook-входа
- **Симптом**: `Cannot read properties of undefined (reading 'photo')`
- **Причина**: Webhook оборачивает данные в `body`, а Telegram Trigger — нет
- **Исправление**: Добавлена проверка обоих форматов: `json.message || json.body.message`

### Баг 2: Escape-символ `\!` в JSON
- **Симптом**: `Expecting Unicode escape sequence \uXXXX`
- **Причина**: Python при обработке JSON добавил `\` перед `!` в коде `if (!msg)`
- **Исправление**: Явное удаление лишнего backslash в скрипте обновления

### Баг 3: Show Typing падает для фейковых chat_id
- **Симптом**: `Bad request - please check your parameters`
- **Причина**: Telegram API отклоняет sendChatAction для несуществующих chat_id
- **Исправление**: Добавлен `onError: 'continueRegularOutput'` на ноды Show Typing, Send Photo Response, Send Not Recognized, Download Photo

### Баг 4: Вопросы онбординга сдвинуты на один шаг
- **Симптом**: На этапе `profile` (возраст) приходит вопрос про рост/вес (этап `physical`)
- **Причина**: Использовался `ONBOARDING_QUESTIONS[nextStage]` вместо `ONBOARDING_QUESTIONS[stage]`
- **Исправление**: Заменено на `ONBOARDING_QUESTIONS[stage]` — имя вопроса совпадает с именем этапа

### Баг 5: Webhook 404 после деплоя
- **Симптом**: `Webhook not registered` при POST на `/webhook/e2e-test-entry`
- **Причина**: n8n не регистрирует новые webhook-пути до перезапуска webhook listener
- **Исправление**: Деактивация → ожидание 2 сек → активация workflow после каждого PUT

---

## Расширение тестов

### Добавить новую персону

1. В ноде **Generate Test Personas** добавить объект в массив `personas`:
```javascript
{
  test_id: 900000011,  // следующий свободный ID
  name: "Название_Теста",
  expected: { level: "beginner", age: 30, ... },
  messages: [
    "/start",
    "Новичок",
    // ... 9 сообщений онбординга
  ]
}
```

2. Обновить SQL-запрос очистки: `WHERE telegram_id BETWEEN 900000001 AND 900000011`

### Добавить тест недельного плана

Потребуется расширить внутренний цикл:
1. После онбординга отправить 10-е сообщение: "Составь план на неделю"
2. Добавить проверку таблицы `weekly_plans`
3. Добавить проверку структуры плана (количество дней, типы тренировок)

### Добавить тест фото

Потребуется другой подход — webhook не поддерживает binary data. Варианты:
- Отправить реальное фото через Telegram API (нужен тестовый аккаунт)
- Мокнуть GPT-4o Vision ответ в отдельном тестовом workflow
