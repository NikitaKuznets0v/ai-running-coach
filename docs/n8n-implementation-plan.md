# План Реализации AI Running Coach через N8N

**Дата:** 26 января 2026
**Версия:** 1.0
**Подход:** Быстрый MVP через n8n workflow

---

## 🎯 Что Нам Понадобится

### 1. N8N Платформа

#### ✅ Рекомендация: N8N Cloud (для старта)

**Бесплатный Tier:**
- 🆓 2,500 выполнений workflow/месяц
- ✅ Не нужен сервер
- ✅ Работает сразу из коробки
- 🔗 Регистрация: https://n8n.io/

**Если нужно больше:**
- 💰 Starter: $20/мес (5,000 выполнений)
- 💰 Pro: $50/мес (10,000 выполнений)

#### Альтернатива: Self-hosted (бесплатно)
```bash
# Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

**Требования:**
- VPS сервер (DigitalOcean, Hetzner ~$5-10/мес)
- Docker установлен
- Доступ к интернету для webhook

---

### 2. Внешние Сервисы (API Ключи)

#### **Обязательно:**

**A. Telegram Bot** (бесплатно)
- Зайти в Telegram, найти [@BotFather](https://t.me/botfather)
- Отправить `/newbot`
- Следовать инструкциям
- Получить Bot Token (выглядит как: `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`)

**B. OpenAI API** ($)
- Регистрация: https://platform.openai.com/
- Создать API ключ
- Пополнить баланс (минимум $5)
- **Ориентировочная стоимость для MVP:**
  - ~$20-50/месяц при 50-100 пользователях
  - GPT-4o mini: $0.15/$0.60 за 1M tokens (input/output)
  - GPT-4o: $5/$15 за 1M tokens

**ИЛИ**

**Anthropic Claude API** ($)
- Регистрация: https://console.anthropic.com/
- Создать API ключ
- **Стоимость:**
  - Claude 3.5 Sonnet: $3/$15 за 1M tokens
  - Claude 3.5 Haiku: $0.80/$4 за 1M tokens

**C. База Данных**

**Вариант 1: Supabase** (рекомендуется)
- 🆓 Бесплатный tier: 500MB, 2GB bandwidth
- PostgreSQL база
- Встроенная авторизация
- Регистрация: https://supabase.com/

**Вариант 2: N8N встроенная SQLite**
- 🆓 Полностью бесплатно
- Ограничена возможностями
- Подходит для начала

---

## 🏗️ Архитектура N8N Workflow

### Обнаруженные N8N Ноды:

#### **Telegram:**
1. **Telegram Trigger** (`nodes-base.telegramTrigger`)
   - Слушает входящие сообщения
   - Поддерживает: message, callback_query, inline_query
   - Webhook-based

2. **Telegram** (`nodes-base.telegram`)
   - Отправляет сообщения
   - Отправляет фото, документы, location
   - Управление чатами

#### **AI:**
1. **OpenAI Chat Model** (`nodes-langchain.lmChatOpenAi`)
   - GPT-4o, GPT-4o mini, GPT-3.5
   - Поддержка chat history
   - JSON response format

2. **Anthropic** (`nodes-langchain.lmChatAnthropic`)
   - Claude 3.5 Sonnet, Haiku
   - Поддержка chat history

#### **Database:**
1. **Supabase** (`nodes-base.supabase`)
   - CRUD операции
   - Query builder

2. **Postgres** (`nodes-base.postgres`)
   - SQL запросы
   - CRUD операции

3. **Postgres Chat Memory** (`nodes-langchain.memoryPostgresChat`)
   - Хранение истории диалогов для AI
   - Интеграция с LangChain

---

## 📐 MVP Workflow: Структура

### Workflow #1: Основной Чат-Бот

```
┌─────────────────────┐
│  Telegram Trigger   │ ← Получает сообщения от пользователей
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Supabase Query    │ ← Проверяет: есть ли пользователь в БД?
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
[Новый]      [Существующий]
     │           │
     ▼           │
┌─────────────┐  │
│  Create     │  │
│  User       │  │ ← Создает запись в БД
└──────┬──────┘  │
       │         │
       └────┬────┘
            │
            ▼
┌─────────────────────┐
│  Определить Стадию  │ ← Onboarding / Active / etc.
└──────────┬──────────┘
           │
     ┌─────┴────────────┬──────────────┐
     │                  │              │
     ▼                  ▼              ▼
[Onboarding]        [Active]      [Planning]
     │                  │              │
     ▼                  ▼              ▼
┌─────────────┐  ┌──────────────┐  ┌────────────┐
│   AI Chat   │  │   AI Chat    │  │  AI Plan   │
│ (Onboarding)│  │  (General)   │  │ Generator  │
└──────┬──────┘  └──────┬───────┘  └─────┬──────┘
       │                │                 │
       │                │                 │
       └────────────────┼─────────────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  Postgres Memory  │ ← Сохраняет историю
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  Save to Supabase │ ← Сохраняет данные
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  Telegram Send    │ ← Отправляет ответ
              └───────────────────┘
```

---

### Workflow #2: Генерация Недельного Плана

```
┌─────────────────────┐
│  Telegram Trigger   │ ← Команда "/plan" или "Составь план"
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Get User Data      │ ← Извлекает: уровень, цель, историю
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Get Last Plan      │ ← Проверяет: есть ли план на текущую неделю?
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
[План есть]  [Нет плана]
     │           │
     │           ▼
     │    ┌──────────────┐
     │    │  AI Generate │ ← AI генерирует план (JSON)
     │    │  Weekly Plan │
     │    └──────┬───────┘
     │           │
     │           ▼
     │    ┌──────────────┐
     │    │  Parse JSON  │ ← Парсинг и валидация
     │    └──────┬───────┘
     │           │
     │           ▼
     │    ┌──────────────┐
     │    │ Save to DB   │ ← Сохраняет план
     │    └──────┬───────┘
     │           │
     └───────┬───┘
             │
             ▼
   ┌───────────────────┐
   │  Format & Send    │ ← Отправляет красиво в Telegram
   └───────────────────┘
```

---

### Workflow #3: Логирование Тренировки

```
┌─────────────────────┐
│  Telegram Trigger   │ ← "Пробежал 5км за 30мин"
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Extract Data    │ ← NLP: извлекает дистанцию, время, темп
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Validate Data      │ ← Проверка корректности
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Save Training      │ ← Сохраняет в таблицу trainings
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Update Plan Status │ ← Отмечает тренировку как выполненную
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Feedback        │ ← AI анализирует и дает обратную связь
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Send Response      │ ← "Отлично! 👏"
└───────────────────────┘
```

---

## 🗄️ Схема Базы Данных (Supabase)

### Таблица: `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  language TEXT DEFAULT 'ru',

  -- Профиль
  gender TEXT, -- 'male', 'female'
  age INTEGER,
  weight_kg DECIMAL,

  -- Беговой профиль
  level TEXT, -- 'beginner', 'intermediate', 'advanced'
  goal TEXT, -- 'general', 'race', 'improvement'
  race_distance TEXT, -- '5k', '10k', 'half', 'marathon'
  race_date DATE,
  target_time INTERVAL,

  -- Зоны
  zone1_pace_min_per_km INTERVAL,
  zone2_pace_min_per_km INTERVAL,
  zone3_pace_min_per_km INTERVAL,
  zone4_pace_min_per_km INTERVAL,
  zone5_pace_min_per_km INTERVAL,

  -- Статус
  onboarding_stage TEXT, -- 'started', 'profile', 'test', 'completed'
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Таблица: `weekly_plans`
```sql
CREATE TABLE weekly_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  week_start DATE NOT NULL,
  week_end DATE NOT NULL,

  -- JSON с планом тренировок
  plan_data JSONB NOT NULL,
  /* Структура plan_data:
  {
    "monday": {
      "type": "easy_run",
      "distance_km": 5,
      "pace_min_per_km": "6:00",
      "notes": "Легкий темп",
      "completed": false
    },
    "tuesday": { "type": "rest" },
    "wednesday": { ... },
    ...
  }
  */

  status TEXT DEFAULT 'active', -- 'active', 'completed', 'abandoned'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Таблица: `trainings`
```sql
CREATE TABLE trainings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  weekly_plan_id UUID REFERENCES weekly_plans(id) ON DELETE SET NULL,

  date DATE NOT NULL,

  -- Данные тренировки
  type TEXT, -- 'easy_run', 'long_run', 'intervals', 'tempo', 'recovery'
  distance_km DECIMAL NOT NULL,
  duration_seconds INTEGER NOT NULL,
  pace_min_per_km INTERVAL,

  -- Самочувствие
  feeling TEXT, -- 'great', 'good', 'ok', 'tired', 'exhausted'
  rpe INTEGER, -- Rate of Perceived Exertion 1-10
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);
```

### Таблица: `chat_history`
```sql
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  role TEXT NOT NULL, -- 'user', 'assistant'
  content TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔑 System Prompts для AI

### 1. Onboarding Prompt
```
Ты - AI-тренер по бегу. Твоя задача: узнать о новом пользователе.

Задавай вопросы по очереди, естественно и дружелюбно:
1. Как давно бегаешь? (определить уровень: новичок/средний/продвинутый)
2. Какая у тебя цель? (просто бег/подготовка к забегу/улучшение результата)
3. Если забег: какая дистанция (5K/10K/полумарафон/марафон) и дата?
4. Какой твой текущий темп на 5км?
5. Пол, возраст, вес?

Не задавай все вопросы сразу. Веди диалог.
Используй эмодзи для дружелюбности 🏃
```

### 2. General Chat Prompt
```
Ты - персональный AI-тренер по бегу в Telegram.

Контекст пользователя:
- Уровень: {level}
- Цель: {goal}
- Текущий план: {current_plan}
- История тренировок: {recent_trainings}

Твоя роль:
- Отвечай на вопросы о беге и тренировках
- Давай мотивацию и поддержку
- Анализируй прогресс
- Объясняй рекомендации
- Адаптируй план при необходимости

Стиль: дружелюбный, но профессиональный. Используй эмодзи умеренно.
Важно: используй научный подход (см. scientific-foundation.md)
```

### 3. Plan Generation Prompt
```
Ты - эксперт по составлению беговых тренировочных планов.

Пользователь:
- Уровень: {level}
- Цель: {goal}
- Текущая неделя подготовки: {week_number}
- Зоны темпа: {zones}
- Последняя неделя: {last_week_summary}

Составь план на следующую неделю (JSON):

Обязательно соблюдай:
- Правило 80/20 (80% легких, 20% интенсивных)
- Минимум 1 день полного отдыха
- Никогда 2 тяжелых дня подряд
- Правило 10% (увеличение не более 10% от прошлой недели)

Формат ответа - ТОЛЬКО JSON:
{
  "monday": {"type": "easy_run", "distance_km": 5, "pace": "6:00-6:30", "notes": "Легкий темп"},
  "tuesday": {"type": "rest"},
  "wednesday": {"type": "intervals", "distance_km": 8, "workout": "5x1km @ 5:00 pace, 2 мин отдых", "notes": "VO2max интервалы"},
  ...
}
```

### 4. Training Extraction Prompt
```
Извлеки данные тренировки из сообщения пользователя.

Сообщение: "{user_message}"

Верни JSON:
{
  "distance_km": число,
  "duration": "HH:MM:SS",
  "feeling": "great/good/ok/tired/exhausted",
  "notes": "любые комментарии пользователя"
}

Если данных недостаточно - попроси уточнить.
```

---

## 📝 Пошаговый План Реализации

### Этап 1: Настройка (1 час)

**Что делаем:**
1. Регистрируемся на n8n.io (Cloud)
2. Создаем Telegram бота через @BotFather
3. Получаем OpenAI API ключ
4. Регистрируемся на Supabase

**Результат:** Все аккаунты и ключи готовы

---

### Этап 2: Настройка Базы Данных (30 мин)

**Что делаем:**
1. В Supabase → SQL Editor
2. Создаем таблицы (см. схему выше)
3. Копируем connection string

**Результат:** БД готова к использованию

---

### Этап 3: Простой Эхо-Бот (30 мин)

**Что делаем:**
1. В n8n создаем новый workflow
2. Добавляем ноду "Telegram Trigger"
3. Настраиваем с Bot Token
4. Добавляем ноду "Telegram" для ответа
5. Соединяем: trigger → send
6. Тестируем: пишем боту, получаем эхо

**Результат:** Базовое соединение работает

---

### Этап 4: Интеграция AI (1 час)

**Что делаем:**
1. Добавляем ноду "OpenAI Chat Model"
2. Настраиваем с API ключом
3. Добавляем System Prompt
4. Workflow: Telegram Trigger → OpenAI → Telegram Send
5. Тестируем диалог

**Результат:** Бот общается через AI

---

### Этап 5: Сохранение Пользователей (1 час)

**Что делаем:**
1. После Telegram Trigger добавляем "Supabase"
2. Операция: "Check if user exists"
3. IF node: пользователь есть? → да/нет
4. Если нет → Create user в Supabase
5. Тестируем

**Результат:** Пользователи сохраняются в БД

---

### Этап 6: Onboarding Flow (2-3 часа)

**Что делаем:**
1. Проверяем onboarding_stage пользователя
2. Если не завершен → используем Onboarding Prompt
3. Парсим ответы AI и обновляем профиль
4. Когда собраны все данные → меняем stage на 'completed'

**Результат:** Новые пользователи проходят onboarding

---

### Этап 7: Генерация Плана (3-4 часа)

**Что делаем:**
1. Создаем отдельный workflow для генерации
2. Триггер: команда "/plan" или фраза с "план"
3. Загружаем данные пользователя
4. Передаем в AI с Plan Generation Prompt
5. Парсим JSON
6. Сохраняем в weekly_plans
7. Форматируем и отправляем в Telegram

**Результат:** Бот генерирует недельные планы

---

### Этап 8: Логирование Тренировок (2-3 часа)

**Что делаем:**
1. Определяем когда пользователь сообщает о тренировке
2. Используем Training Extraction Prompt
3. Сохраняем в таблицу trainings
4. Обновляем plan_data (completed: true)
5. Даем обратную связь через AI

**Результат:** Пользователи могут логировать тренировки

---

### Этап 9: Память Контекста (2 часа)

**Что делаем:**
1. Добавляем "Postgres Chat Memory" ноду
2. Сохраняем все сообщения в chat_history
3. При каждом запросе загружаем последние 10-20 сообщений
4. Передаем в AI как контекст

**Результат:** Бот помнит историю диалога

---

### Этап 10: Тестирование (2-3 часа)

**Что делаем:**
1. Проходим полный flow: onboarding → план → тренировка
2. Тестируем разные сценарии
3. Находим и исправляем баги
4. Проверяем работу БД

**Результат:** MVP работает end-to-end

---

## 📊 Оценка Сроков

**Оптимистичная:** 15-20 часов чистой работы
**Реалистичная:** 25-30 часов (с учетом изучения n8n)
**Календарные дни:** 3-7 дней при part-time работе

---

## 💰 Оценка Стоимости (MVP, 50 пользователей)

### Обязательные расходы:
- **N8N Cloud Starter:** $20/мес (или бесплатно на Free tier)
- **OpenAI API:** ~$30-50/мес
- **Supabase:** $0 (Free tier достаточно для MVP)
- **Telegram:** $0

**Итого:** $30-70/мес (в зависимости от использования)

---

## ✅ Что Получим в Результате

**MVP будет уметь:**
- ✅ Принимать новых пользователей через onboarding
- ✅ Определять уровень и цель
- ✅ Генерировать персонализированные недельные планы
- ✅ Логировать выполненные тренировки
- ✅ Общаться естественным языком
- ✅ Помнить контекст диалога
- ✅ Давать обратную связь и мотивацию
- ✅ Сохранять все данные в БД

**НЕ будет (для v2.0):**
- ❌ Голосовые сообщения
- ❌ Распознавание скриншотов
- ❌ Английский язык
- ❌ Тренировки для зала
- ❌ Визуализация (Mini App)
- ❌ Монетизация

---

## 🚀 Следующие Шаги

1. **Создать аккаунты** (n8n, Telegram Bot, OpenAI, Supabase)
2. **Я помогу создать JSON конфигурации workflows**
3. **Вы импортируете их в n8n**
4. **Настраиваем credentials (API keys)**
5. **Тестируем и итерируем**

---

## 📞 Готовы Начать?

Скажите "да" и я начну создавать конкретные JSON конфигурации для каждого workflow!
