import Fastify from 'fastify';
import formBody from '@fastify/formbody';

import { env } from './config/env';
import { initializeDatabase } from './db/database';
import { registerAdminRoutes } from './routes/admin.routes';
import { TelegramBotService } from './services/telegram-bot.service';

async function bootstrap() {
  initializeDatabase();

  const app = Fastify({
    logger: env.NODE_ENV !== 'production',
  });

  await app.register(formBody);

  app.get('/health', async () => ({
    status: 'ok',
    database: 'sqlite',
    timestamp: new Date().toISOString(),
  }));

  await registerAdminRoutes(app);

  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });

  console.log(
    `HTTP server started on http://${env.HOST}:${env.PORT} (profile=${env.APP_PROFILE}, db=${env.DATABASE_PATH})`,
  );
  console.log(
    `Telegram targets: MAIN_CHAT_ID=${env.MAIN_CHAT_ID}, ANNOUNCEMENT_TOPIC_ID=${env.ANNOUNCEMENT_TOPIC_ID}, ADMIN_CHAT_ID=${env.ADMIN_CHAT_ID}, ADMIN_TOPIC_ID=${env.ADMIN_TOPIC_ID}`,
  );

  const bot = new TelegramBotService();
  void bot.start().catch((error) => {
    app.log.error(error, 'Failed to start Telegram bot');
  });
}

void bootstrap();
