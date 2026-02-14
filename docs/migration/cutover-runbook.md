# Cutover / Rollback Runbook

Цель: безопасно переключить бота с n8n на TS-бот.

## Предусловия

- TS-бот собран и готов к старту
- .env заполнен
- smoke-checklist определен
- есть доступ к серверу и Supabase

## Cutover (пошагово)

1. Остановить вход через webhook (если есть)

```
# Telegram: отключить webhook, чтобы Long Polling заработал корректно
curl -s "https://api.telegram.org/bot<TELEGRAM_TOKEN>/deleteWebhook"
```

2. Запустить TS-бота (long polling)

```
# systemd / docker / pm2 — в зависимости от выбранной схемы
```

3. Остановить n8n workflows бота

- Деактивировать основной workflow в n8n
- Деактивировать weekly summary workflow в n8n

4. Выполнить smoke-checklist (10–15 минут)

5. Мониторинг 1–2 часа

- Проверить ошибки OpenAI/Supabase
- Проверить отсутствие дублей в `trainings` и `weekly_plans`

## Rollback (если smoke fails)

1. Остановить TS-бота
2. Включить n8n workflows (основной + weekly summary)
3. Если n8n использует webhook, вернуть его:

```
curl -s "https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<WEBHOOK_URL>"
```

4. Повторить 3 базовых сценария (онбординг, план, лог тренировки)

## Критерии rollback

- Бот не отвечает 2+ минут подряд
- Ошибки записи в `weekly_plans` или `trainings`
- План с невалидной структурой (нет км, смешение км/мин, нет дат)

