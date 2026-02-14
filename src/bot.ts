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
import { transcribeVoice } from './services/openai.js';
import { parseLabTestDocument } from './services/lab-test-parser.js';

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

    const caption = ctx.message.caption || '';

    // Check if this is a lab test photo (by caption keywords or onboarding stage)
    const isLabTest = /тест|vo2max|пано|lthr|зон[аы]|порог|аэробн|анаэробн|лаборатор/i.test(caption)
                      || existing.onboarding_stage === 'lab_testing';

    if (isLabTest) {
      // Parse as lab test document
      const fileUrl = `https://api.telegram.org/file/bot${CONFIG.telegramToken}/${file.file_path}`;
      logInfo('parsing_lab_test_photo', { update_id: updateId, telegram_id: telegramId });

      const labData = await parseLabTestDocument(fileUrl);
      logInfo('lab_test_parsed', { update_id: updateId, telegram_id: telegramId, data: labData });

      // Update user profile with lab test data
      const updateData: any = {
        telegram_id: telegramId,
        has_lab_testing: true
      };

      if (labData.vo2max) updateData.vo2max = labData.vo2max;
      if (labData.lthr) updateData.lthr = labData.lthr;
      if (labData.hr_zone1_max) updateData.hr_zone1_max = labData.hr_zone1_max;
      if (labData.hr_zone2_max) updateData.hr_zone2_max = labData.hr_zone2_max;
      if (labData.hr_zone3_max) updateData.hr_zone3_max = labData.hr_zone3_max;
      if (labData.hr_zone4_max) updateData.hr_zone4_max = labData.hr_zone4_max;
      if (labData.hr_zone5_max) updateData.hr_zone5_max = labData.hr_zone5_max;

      const updated = await upsertUserProfile(updateData);

      // Format response
      let reply = '✅ Данные лабораторного теста успешно распознаны!\n\n';
      if (labData.vo2max) reply += `• VO2max: ${labData.vo2max} мл/кг/мин\n`;
      if (labData.lthr) reply += `• LTHR (ПАНО): ${labData.lthr} уд/мин\n`;
      if (labData.lt1_hr) reply += `• LT1 (аэробный порог): ${labData.lt1_hr} уд/мин\n`;

      if (labData.hr_zone1_max || labData.hr_zone2_max || labData.hr_zone3_max) {
        reply += `\n📊 Пульсовые зоны:\n`;
        if (labData.hr_zone1_max) reply += `• Z1 (восстановление): до ${labData.hr_zone1_max} уд/мин\n`;
        if (labData.hr_zone2_max) reply += `• Z2 (аэробная): до ${labData.hr_zone2_max} уд/мин\n`;
        if (labData.hr_zone3_max) reply += `• Z3 (темповая): до ${labData.hr_zone3_max} уд/мин\n`;
        if (labData.hr_zone4_max) reply += `• Z4 (пороговая): до ${labData.hr_zone4_max} уд/мин\n`;
        if (labData.hr_zone5_max) reply += `• Z5 (VO2max): до ${labData.hr_zone5_max} уд/мин\n`;
      }

      await ctx.reply(reply);

      // If during onboarding, continue with next question
      if (existing.onboarding_stage === 'lab_testing') {
        const { reply: nextReply } = await handleOnboarding(updated, 'да, есть данные');
        await ctx.reply(nextReply);
        await appendChatHistory({
          user_id: updated.id,
          role: 'assistant',
          content: reply + '\n\n' + nextReply,
          message_type: 'onboarding',
          telegram_message_id: ctx.message.message_id
        });
      } else {
        // Outside onboarding - just save and confirm
        await ctx.reply('✨ Данные сохранены! Они будут учтены при построении следующих тренировочных планов.\n\nЕсли хочешь пересчитать текущий план с учётом новых пульсовых зон, напиши "пересчитай план".');
        await appendChatHistory({
          user_id: updated.id,
          role: 'assistant',
          content: reply + '\n\n✨ Данные сохранены и будут использоваться для следующих планов.',
          message_type: 'logging',
          telegram_message_id: ctx.message.message_id
        });
      }
    } else {
      // Parse as training log
      const reply = await handlePhotoLog(existing, file.file_path, caption || undefined);
      await ctx.reply(reply);
      await appendChatHistory({
        user_id: existing.id,
        role: 'assistant',
        content: reply,
        message_type: 'logging',
        telegram_message_id: ctx.message.message_id
      });
    }
  } catch (err: any) {
    logError('photo_handler_error', { update_id: updateId, telegram_id: telegramId, error: String(err?.message || err) });
    await ctx.reply('Ошибка при обработке скриншота. Попробуй ещё раз.');
  }
});

bot.on('message:voice', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const updateId = ctx.update.update_id;
  logInfo('incoming_voice', { update_id: updateId, telegram_id: telegramId });

  await ctx.api.sendChatAction(telegramId, 'typing');

  try {
    const voice = ctx.message.voice;
    if (!voice) {
      await ctx.reply('Не вижу голосовое. Попробуй ещё раз.');
      return;
    }

    const file = await ctx.api.getFile(voice.file_id);
    if (!file.file_path) {
      await ctx.reply('Не удалось получить файл. Попробуй ещё раз.');
      return;
    }

    // Download voice file from Telegram
    const fileUrl = `https://api.telegram.org/file/bot${CONFIG.telegramToken}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      await ctx.reply('Ошибка при скачивании голосового. Попробуй ещё раз.');
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const blob = new Blob([buffer], { type: 'audio/ogg' });
    const voiceFile = new File([blob], 'voice.ogg', { type: 'audio/ogg' });

    // Transcribe with Whisper API
    logInfo('transcribing_voice', { update_id: updateId, telegram_id: telegramId });
    const text = await transcribeVoice(voiceFile, 'voice.ogg');
    logInfo('transcription_done', { update_id: updateId, telegram_id: telegramId, text });

    if (!text || text.trim().length === 0) {
      await ctx.reply('Не удалось распознать голос. Попробуй ещё раз.');
      return;
    }

    // Process transcribed text as regular message
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
      content: `[Голосовое]: ${text}`,
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

    await ctx.reply(reply);
    await appendChatHistory({
      user_id: user.id,
      role: 'assistant',
      content: reply,
      message_type: intent === 'plan_request' ? 'planning' : intent === 'training_log' ? 'logging' : 'general'
    });

    logInfo('voice_reply_sent', { update_id: updateId, telegram_id: telegramId, intent });
  } catch (err: any) {
    logError('voice_handler_error', { update_id: updateId, telegram_id: telegramId, error: String(err?.message || err) });
    await ctx.reply('Ошибка при обработке голосового. Попробуй ещё раз.');
  }
});

bot.on('message:document', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const updateId = ctx.update.update_id;
  logInfo('incoming_document', { update_id: updateId, telegram_id: telegramId });

  try {
    const existing = await getUserByTelegramId(telegramId);
    if (!existing) {
      await ctx.reply('Сначала пройди онбординг через /start.');
      return;
    }

    const document = ctx.message.document;
    if (!document) {
      await ctx.reply('Не вижу документ. Попробуй ещё раз.');
      return;
    }

    // Check if it's an image or PDF
    const mimeType = document.mime_type || '';
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      await ctx.reply('Пожалуйста, отправь изображение (JPG, PNG) или PDF файл с результатами лабораторного теста.');
      return;
    }

    await ctx.api.sendChatAction(telegramId, 'typing');

    const file = await ctx.api.getFile(document.file_id);
    if (!file.file_path) {
      await ctx.reply('Не удалось получить файл. Попробуй ещё раз.');
      return;
    }

    // Download file from Telegram
    const fileUrl = `https://api.telegram.org/file/bot${CONFIG.telegramToken}/${file.file_path}`;

    logInfo('parsing_lab_test', { update_id: updateId, telegram_id: telegramId, mime_type: mimeType });

    // Parse lab test data using Vision API
    const labData = await parseLabTestDocument(fileUrl);
    logInfo('lab_test_parsed', { update_id: updateId, telegram_id: telegramId, data: labData });

    // Update user profile with lab test data
    const updateData: any = {
      telegram_id: telegramId,
      has_lab_testing: true
    };

    if (labData.vo2max) updateData.vo2max = labData.vo2max;
    if (labData.lthr) updateData.lthr = labData.lthr;
    if (labData.hr_zone1_max) updateData.hr_zone1_max = labData.hr_zone1_max;
    if (labData.hr_zone2_max) updateData.hr_zone2_max = labData.hr_zone2_max;
    if (labData.hr_zone3_max) updateData.hr_zone3_max = labData.hr_zone3_max;
    if (labData.hr_zone4_max) updateData.hr_zone4_max = labData.hr_zone4_max;
    if (labData.hr_zone5_max) updateData.hr_zone5_max = labData.hr_zone5_max;

    const updated = await upsertUserProfile(updateData);

    // Format response
    let reply = '✅ Данные лабораторного теста успешно распознаны!\n\n';
    if (labData.vo2max) reply += `• VO2max: ${labData.vo2max} мл/кг/мин\n`;
    if (labData.lthr) reply += `• LTHR (ПАНО): ${labData.lthr} уд/мин\n`;
    if (labData.lt1_hr) reply += `• LT1 (аэробный порог): ${labData.lt1_hr} уд/мин\n`;

    if (labData.hr_zone1_max || labData.hr_zone2_max || labData.hr_zone3_max) {
      reply += `\n📊 Пульсовые зоны:\n`;
      if (labData.hr_zone1_max) reply += `• Z1 (восстановление): до ${labData.hr_zone1_max} уд/мин\n`;
      if (labData.hr_zone2_max) reply += `• Z2 (аэробная): до ${labData.hr_zone2_max} уд/мин\n`;
      if (labData.hr_zone3_max) reply += `• Z3 (темповая): до ${labData.hr_zone3_max} уд/мин\n`;
      if (labData.hr_zone4_max) reply += `• Z4 (пороговая): до ${labData.hr_zone4_max} уд/мин\n`;
      if (labData.hr_zone5_max) reply += `• Z5 (VO2max): до ${labData.hr_zone5_max} уд/мин\n`;
    }

    await ctx.reply(reply);

    // If during onboarding, continue with next question
    if (existing.onboarding_stage === 'lab_testing') {
      const { reply: nextReply } = await handleOnboarding(updated, 'да, есть данные');
      await ctx.reply(nextReply);
      await appendChatHistory({
        user_id: updated.id,
        role: 'assistant',
        content: reply + '\n\n' + nextReply,
        message_type: 'onboarding',
        telegram_message_id: ctx.message.message_id
      });
    } else {
      // Outside onboarding - just save and confirm
      await ctx.reply('✨ Данные сохранены! Они будут учтены при построении следующих тренировочных планов.\n\nЕсли хочешь пересчитать текущий план с учётом новых пульсовых зон, напиши "пересчитай план".');
      await appendChatHistory({
        user_id: updated.id,
        role: 'assistant',
        content: reply + '\n\n✨ Данные сохранены и будут использоваться для следующих планов.',
        message_type: 'logging',
        telegram_message_id: ctx.message.message_id
      });
    }

  } catch (err: any) {
    logError('document_handler_error', { update_id: updateId, telegram_id: telegramId, error: String(err?.message || err) });
    await ctx.reply('Ошибка при обработке документа. Попробуй ещё раз или напиши данные текстом:\n• VO2max\n• LTHR (пульс на ПАНО)\n• HR зоны');
  }
});
