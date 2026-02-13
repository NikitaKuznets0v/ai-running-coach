import { Bot } from 'grammy';
import { CONFIG } from './config.js';
import { getUserByTelegramId, upsertUserProfile, appendChatHistory } from './services/supabase.js';
import { handleOnboarding } from './handlers/onboarding.js';
import { detectIntent } from './domain/intent.js';
import { handlePlanRequest, handlePlanConvert } from './handlers/plan.js';
import { handleTrainingLog } from './handlers/training-log.js';
import { handleGeneral } from './handlers/general.js';
import { handlePlanAdjust } from './handlers/plan-adjust.js';
import { handleScheduleChange } from './handlers/schedule.js';
import { handlePlanExplain } from './handlers/plan-explain.js';
import { logInfo, logError } from './utils/logger.js';
import { handlePhotoLog } from './handlers/photo-log.js';

export const bot = new Bot(CONFIG.telegramToken);

bot.on('message:text', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const text = ctx.message.text || '';
  const updateId = ctx.update.update_id;
  logInfo('incoming_message', { update_id: updateId, telegram_id: telegramId });

  await ctx.api.sendChatAction(telegramId, 'typing');
  const existing = await getUserByTelegramId(telegramId);

  const user = existing || await upsertUserProfile({
    telegram_id: telegramId,
    first_name: ctx.from?.first_name || null,
    last_name: ctx.from?.last_name || null,
    username: ctx.from?.username || null,
    language: ctx.from?.language_code || 'ru',
    onboarding_stage: 'started'
  });

  await appendChatHistory({
    user_id: user.id,
    role: 'user',
    content: text,
    message_type: user.onboarding_stage !== 'completed' ? 'onboarding' : 'general',
    telegram_message_id: ctx.message.message_id
  });

  if (user.onboarding_stage !== 'completed') {
    const { reply } = await handleOnboarding(user, text);
    await ctx.reply(reply);
    await appendChatHistory({
      user_id: user.id,
      role: 'assistant',
      content: reply,
      message_type: 'onboarding'
    });
    return;
  }

  const intent = detectIntent(text);
  let reply = 'Пока я понимаю только план и онбординг. Следующие функции будут добавлены.';

  try {
    if (intent === 'plan_request') {
      reply = await handlePlanRequest(user, text);
    } else if (intent === 'plan_convert') {
      reply = await handlePlanConvert(user);
    } else if (intent === 'training_log') {
      reply = await handleTrainingLog(user, text);
    } else {
      const adjust = await handlePlanAdjust(user, text);
      if (adjust) {
        reply = adjust;
      } else {
        const schedule = await handleScheduleChange(user, text);
        if (schedule) {
          reply = schedule;
        } else {
          const explain = await handlePlanExplain(user, text);
          reply = explain || await handleGeneral(user, text);
        }
      }
    }
  } catch (err: any) {
    logError('handler_error', { update_id: updateId, telegram_id: telegramId, error: String(err?.message || err) });
    reply = 'Произошла ошибка. Попробуй ещё раз позже.';
  }

  await ctx.reply(reply);
  await appendChatHistory({
    user_id: user.id,
    role: 'assistant',
    content: reply,
    message_type: intent === 'plan_request' ? 'planning' : intent === 'training_log' ? 'logging' : 'general'
  });

  logInfo('reply_sent', { update_id: updateId, telegram_id: telegramId, intent });
});

bot.on('message:photo', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const updateId = ctx.update.update_id;
  logInfo('incoming_photo', { update_id: updateId, telegram_id: telegramId });

  try {
    const existing = await getUserByTelegramId(telegramId);
    if (!existing) {
      await ctx.reply('Сначала пройди онбординг через /start.');
      return;
    }

    const photos = ctx.message.photo || [];
    const fileId = photos[photos.length - 1]?.file_id;
    if (!fileId) {
      await ctx.reply('Не вижу фото. Пришли скрин ещё раз.');
      return;
    }

    await ctx.api.sendChatAction(telegramId, 'typing');
    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) {
      await ctx.reply('Не удалось получить файл. Попробуй ещё раз.');
      return;
    }

    const caption = ctx.message.caption || undefined;
    const reply = await handlePhotoLog(existing, file.file_path, caption);
    await ctx.reply(reply);
    await appendChatHistory({
      user_id: existing.id,
      role: 'assistant',
      content: reply,
      message_type: 'logging',
      telegram_message_id: ctx.message.message_id
    });
  } catch (err: any) {
    logError('photo_handler_error', { update_id: updateId, telegram_id: telegramId, error: String(err?.message || err) });
    await ctx.reply('Ошибка при обработке скриншота. Попробуй ещё раз.');
  }
});
