import dotenv from 'dotenv';

import { z } from 'zod';

const profileArg = process.argv.find((item) => item.startsWith('--profile='));
const runtimeProfile = (process.env.APP_PROFILE ?? profileArg?.split('=')[1] ?? 'default').trim();

if (runtimeProfile === 'default') {
  dotenv.config();
} else {
  dotenv.config({ path: `.env.${runtimeProfile}`, override: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ALLOWED_ADMIN_IDS: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default(''),
  TELEGRAM_GROUP_INVITE_URL: z.string().default(''),
  TELEGRAM_CANDIDATE_BOT_USERNAME: z.string().default(''),
  TELEGRAM_CANDIDATE_BOT_API_URL: z.string().default(''),
  MAIN_CHAT_ID: z.coerce.number().default(0),
  GENERAL_CHAT_ID: z.coerce.number().default(0),
  ANNOUNCEMENT_TOPIC_ID: z.coerce.number().default(0),
  LEADERBOARD_CHAT_ID: z.coerce.number().default(0),
  LEADERBOARD_THREAD_ID: z.coerce.number().default(0),
  LEADERBOARD_MSG_ID: z.coerce.number().default(0),
  ADMIN_CHAT_ID: z.coerce.number().default(0),
  ADMIN_TOPIC_ID: z.coerce.number().default(0),
  DATABASE_PATH: z.string().min(1).default('./data/app.db'),
  BACKUP_DIR: z.string().min(1).default('./backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1),
  BOT_CONTROL_MODE: z.string().default(''),
  BOT_CONTROL_SERVICE_NAME: z.string().default('telegram-bot'),
  BOT_CONTROL_CMD_STATUS: z.string().default(''),
  BOT_CONTROL_CMD_START: z.string().default(''),
  BOT_CONTROL_CMD_STOP: z.string().default(''),
  BOT_CONTROL_CMD_RESTART: z.string().default(''),
  BOT_CONTROL_CMD_UPDATE: z.string().default(''),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  APP_PROFILE: runtimeProfile,
  telegramAdminIds: parsed.TELEGRAM_ALLOWED_ADMIN_IDS.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => !Number.isNaN(item)),
};
