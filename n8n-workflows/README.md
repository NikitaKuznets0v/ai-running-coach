# N8N Workflows - AI Running Coach

**Версия:** 1.5
**Дата:** 8 февраля 2026

---

## Единственный workflow:

### `workflow-main-chatbot-v5.json` (44 ноды)

Основной и единственный workflow бота. Содержит ВСЮ логику:

- Приём сообщений из Telegram (текст + фото)
- Онбординг пользователей (9 стадий)
- Генерация стратегии подготовки (периодизация по фазам)
- Генерация недельных планов
- Распознавание фото тренировок (GPT-4o Vision)
- Объединение данных из 2 скриншотов
- Защита от дубликатов тренировок
- Сохранение всех данных в Supabase

### Требуемые Credentials в n8n:

- Telegram Bot API
- OpenAI API (GPT-4o-mini + GPT-4o Vision)
- Supabase API

### Сервер:

- n8n: `https://n8n.kube.kontur.host`
- Workflow ID: `7Ar459SadzSXgUEv`

---

## Удалённые workflows (февраль 2026):

- `workflow-plan-generator.json` — логика перенесена в main chatbot
- `workflow-training-logger.json` — логика перенесена в main chatbot
