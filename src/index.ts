import { bot } from './bot.js';
import { startWeeklySummaryCron } from './jobs/weekly-summary.js';

await bot.api.deleteWebhook();
bot.start({
  onStart: () => {
    console.log('AI Running Coach bot started (long polling)');
  }
});

startWeeklySummaryCron(bot);
