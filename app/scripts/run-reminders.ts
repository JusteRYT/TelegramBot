import { Bot } from 'grammy';

import { env } from '../config/env';
import { initializeDatabase } from '../db/database';
import { ReminderSchedulerService } from '../services/reminder-scheduler.service';

async function main() {
  initializeDatabase();

  if (env.TELEGRAM_BOT_TOKEN === 'replace_with_real_bot_token') {
    console.warn('Telegram token placeholder. Reminders skipped.');
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const scheduler = new ReminderSchedulerService(bot);
  await scheduler.runOnce();
  console.log('Reminder tick completed.');
}

void main().catch((error) => {
  console.error('Reminder tick failed:', error);
  process.exitCode = 1;
});
