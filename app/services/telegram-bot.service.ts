import { Bot } from 'grammy';

import type { BotContextLike } from '../bot/types';
import { env } from '../config/env';
import { UserRepository } from '../repositories/user.repository';

import { AdminCommandService } from './admin-command.service';
import { AnnouncementService } from './announcement.service';
import { AuthService } from './auth.service';
import { BotSessionService } from './bot-session.service';
import { CallbackQueryService } from './callback-query.service';
import { CreateGameFlowService } from './create-game-flow.service';
import { PublicCommandService } from './public-command.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';

export class TelegramBotService {
  private readonly bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  private readonly users = new UserRepository();
  private readonly auth = new AuthService();
  private readonly sessions = new BotSessionService();
  private readonly announcements = new AnnouncementService(this.bot);
  private readonly createGameFlow = new CreateGameFlowService(this.sessions, this.announcements);
  private readonly publicCommands = new PublicCommandService();
  private readonly adminCommands = new AdminCommandService(
    this.sessions,
    this.announcements,
    this.createGameFlow,
  );
  private readonly callbackQueries = new CallbackQueryService(
    this.bot,
    this.publicCommands,
    this.adminCommands,
  );
  private readonly scheduler = new ReminderSchedulerService(this.bot);

  constructor() {
    this.configure();
    this.bot.catch((error) => {
      console.error('Telegram update handling failed:', error.error);
    });
  }

  async start() {
    if (env.TELEGRAM_BOT_TOKEN === 'replace_with_real_bot_token') {
      console.warn('Telegram bot token is still a placeholder. Bot polling skipped.');
      return;
    }

    this.scheduler.start();

    await this.bot.start({
      onStart: () => {
        console.log('Telegram bot started with long polling.');
      },
    });
  }

  private configure() {
    this.bot.use(async (ctx, next) => {
      const text = ctx.message && 'text' in ctx.message ? (ctx.message.text ?? '') : '';
      if (text.startsWith('/') && ctx.chat) {
        this.logIncomingCommand({
          userId: ctx.from?.id,
          chatId: ctx.chat.id,
          chatType: ctx.chat.type,
          threadId: ctx.message?.message_thread_id,
          text,
        });
      }

      await next();
    });

    this.bot.command('start', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user || !this.isPublicAllowed(ctx.chat.id, ctx.chat.type, ctx.message?.message_thread_id)) {
        return;
      }

      await this.publicCommands.handleStart(ctx as unknown as BotContextLike, ctx.match.trim() || undefined);
    });

    this.bot.command('help', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user) {
        return;
      }
      if (user.user_status === 'Бан') {
        await ctx.reply('🚫 Ваш доступ к боту ограничен.');
        return;
      }

      if (this.isAdminContext(ctx.chat.id, ctx.message?.message_thread_id)) {
        if (!this.hasAdminFlag(user)) {
          await ctx.reply('⛔ Команда доступна только администраторам.');
          return;
        }
        await this.adminCommands.handleHelp(ctx as unknown as BotContextLike);
      } else if (this.isPublicAllowed(ctx.chat.id, ctx.chat.type, ctx.message?.message_thread_id)) {
        await this.publicCommands.handleHelp(ctx as unknown as BotContextLike);
      } else if (ctx.chat.id === env.ADMIN_CHAT_ID) {
        await ctx.reply(
          `⚠️ Этот топик не назначен как admin.\n` +
            `Ожидаю: chat <code>${env.ADMIN_CHAT_ID}</code>, topic <code>${env.ADMIN_TOPIC_ID}</code>`,
          { parse_mode: 'HTML' },
        );
      } else {
        return;
      }
    });

    this.bot.command('guide', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user || !this.isPublicAllowed(ctx.chat.id, ctx.chat.type, ctx.message?.message_thread_id)) {
        return;
      }
      if (user.user_status === 'Бан') {
        await ctx.reply('🚫 Ваш доступ к боту ограничен.');
        return;
      }

      await this.publicCommands.handleGuide(ctx as unknown as BotContextLike);
    });

    this.bot.command('donate', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user || !this.isPublicAllowed(ctx.chat.id, ctx.chat.type, ctx.message?.message_thread_id)) {
        return;
      }
      if (user.user_status === 'Бан') {
        await ctx.reply('🚫 Ваш доступ к боту ограничен.');
        return;
      }

      await this.publicCommands.handleDonate(ctx as unknown as BotContextLike);
    });

    this.bot.command('gamelist', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user || !this.isPublicAllowed(ctx.chat.id, ctx.chat.type, ctx.message?.message_thread_id)) {
        return;
      }
      if (user.user_status === 'Бан') {
        await ctx.reply('🚫 Ваш доступ к боту ограничен.');
        return;
      }

      await this.publicCommands.handleGameList(ctx as unknown as BotContextLike);
    });

    this.bot.command('id', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user) {
        return;
      }

      await ctx.reply(
        `👤 User: <code>${ctx.from?.id ?? 'unknown'}</code>\n` +
          `📍 Chat: <code>${ctx.chat.id}</code>\n` +
          `🧵 Topic: <code>${ctx.message?.message_thread_id ?? 'Main'}</code>\n\n` +
          `⚙️ Profile: <code>${env.APP_PROFILE}</code>\n` +
          `🔐 is_admin: <code>${user.is_admin ? 'yes' : 'no'}</code>\n` +
          `🎯 Admin target: <code>${env.ADMIN_CHAT_ID}</code> / <code>${env.ADMIN_TOPIC_ID}</code>\n` +
          `🎯 Public target: <code>${env.MAIN_CHAT_ID}</code> / <code>${env.ANNOUNCEMENT_TOPIC_ID}</code>`,
        { parse_mode: 'HTML' },
      );
    });

    this.bot.command('all', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleAll(ctx as unknown as BotContextLike);
    });

    this.bot.command('create', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleCreate(ctx as unknown as BotContextLike);
    });

    this.bot.command('approve', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleApprove(ctx as unknown as BotContextLike, ctx.match.trim());
    });

    this.bot.command('sheets', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleSheets(ctx as unknown as BotContextLike, ctx.match.trim());
    });

    this.bot.command('edit', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleEdit(ctx as unknown as BotContextLike, ctx.match.trim());
    });

    this.bot.command('cancel', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleCancel(ctx as unknown as BotContextLike, ctx.match.trim());
    });

    this.bot.command('delete', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleDelete(ctx as unknown as BotContextLike, ctx.match.trim());
    });

    this.bot.command('start_now', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleStartNow(ctx as unknown as BotContextLike, ctx.match.trim());
    });

    this.bot.command('rank', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user || !this.isPublicAllowed(ctx.chat.id, ctx.chat.type, ctx.message?.message_thread_id)) {
        return;
      }
      if (user.user_status === 'Бан') {
        await ctx.reply('🚫 Ваш доступ к боту ограничен.');
        return;
      }

      await this.publicCommands.handleRank(ctx as unknown as BotContextLike);
    });

    this.bot.command('uinfo', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUserInfo(ctx as unknown as BotContextLike, this.extractMention(ctx.match));
    });

    this.bot.command('uwarn', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      const { mention, reason } = this.extractMentionAndReason(ctx.match);
      await this.adminCommands.handleUserWarn(ctx as unknown as BotContextLike, mention, reason);
    });

    this.bot.command('uban', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      const { mention, reason } = this.extractMentionAndReason(ctx.match);
      await this.adminCommands.handleUserBan(ctx as unknown as BotContextLike, mention, reason);
    });

    this.bot.command('uunban', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUsersUnban(ctx as unknown as BotContextLike, this.extractMentions(ctx.match));
    });

    this.bot.command('ureview', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUsersReview(ctx as unknown as BotContextLike, this.extractMentions(ctx.match));
    });

    this.bot.command('uapprove', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUsersApprove(ctx as unknown as BotContextLike, this.extractMentions(ctx.match));
    });

    this.bot.command('ugame', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUsersGame(ctx as unknown as BotContextLike, this.extractMentions(ctx.match));
    });

    this.bot.command('uall', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUserAll(ctx as unknown as BotContextLike);
    });

    this.bot.command('uhelp', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleHelp(ctx as unknown as BotContextLike);
    });

    this.bot.command('uadd', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUserAdd(ctx as unknown as BotContextLike, this.extractMentions(ctx.match));
    });

    this.bot.command('ulist', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      await this.adminCommands.handleUserList(ctx as unknown as BotContextLike, (ctx.match ?? '').trim());
    });

    this.bot.command('uremove', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!this.canUseAdminCommands(user, ctx.chat.id, ctx.message?.message_thread_id)) {
        return;
      }

      const { mention, reason } = this.extractMentionAndReason(ctx.match);
      await this.adminCommands.handleUserRemove(ctx as unknown as BotContextLike, mention, reason);
    });

    this.bot.on('callback_query:data', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user) {
        await ctx.answerCallbackQuery();
        return;
      }
      if (user.user_status === 'Бан') {
        await ctx.answerCallbackQuery({ text: '🚫 Доступ ограничен.', show_alert: true });
        return;
      }

      const callbackMessage = 'message' in ctx.callbackQuery ? ctx.callbackQuery.message : undefined;
      const callbackChatId = callbackMessage?.chat.id;
      const callbackThreadId =
        callbackMessage && 'message_thread_id' in callbackMessage
          ? callbackMessage.message_thread_id
          : undefined;

      await this.callbackQueries.handle(
        ctx.callbackQuery.data,
        ctx.from,
        ctx.callbackQuery.id,
        callbackChatId,
        callbackThreadId,
      );
    });

    this.bot.on('message', async (ctx) => {
      const user = this.syncUser(ctx.from);
      if (!user || !ctx.message) {
        return;
      }
      if (user.user_status === 'Бан' && !this.isAdminContext(ctx.chat.id, ctx.message.message_thread_id)) {
        return;
      }

      const text = 'text' in ctx.message ? ctx.message.text ?? '' : '';
      if (text.startsWith('/')) {
        return;
      }

      const state = this.sessions.get(ctx.from.id);
      if (!state) {
        return;
      }

      if (!this.hasAdminFlag(user)) {
        this.sessions.clear(ctx.from.id);
        return;
      }

      if ('threadId' in state && state.threadId !== null && state.threadId !== ctx.message.message_thread_id) {
        return;
      }

      await this.adminCommands.handleStateMessage(ctx as unknown as BotContextLike, state, user.id);
    });
  }

  private syncUser(
    user:
      | {
          id: number;
          username?: string;
          first_name: string;
          last_name?: string;
        }
      | undefined,
  ) {
    if (!user) {
      return null;
    }

    const existing = this.users.findByTelegramId(user.id);
    const isAdmin = Boolean(existing?.is_admin) || this.auth.isAdminTelegramId(user.id);

    return this.users.upsertByTelegram({
      telegramId: user.id,
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      isAdmin,
    });
  }

  private isAdminContext(chatId: number, threadId: number | undefined) {
    return chatId === env.ADMIN_CHAT_ID && threadId === env.ADMIN_TOPIC_ID;
  }

  private isPublicAllowed(chatId: number, chatType: string, threadId: number | undefined) {
    return chatType === 'private' || (chatId === env.MAIN_CHAT_ID && threadId === env.ANNOUNCEMENT_TOPIC_ID);
  }

  private isAllowedContext(chatId: number, chatType: string, threadId: number | undefined) {
    return this.isAdminContext(chatId, threadId) || this.isPublicAllowed(chatId, chatType, threadId);
  }

  private logIncomingCommand(payload: {
    userId: number | undefined;
    chatId: number;
    chatType: string;
    threadId: number | undefined;
    text: string;
  }) {
    if (env.NODE_ENV === 'production' && env.APP_PROFILE !== 'test') {
      return;
    }

    const adminContext = this.isAdminContext(payload.chatId, payload.threadId);
    const publicContext = this.isPublicAllowed(payload.chatId, payload.chatType, payload.threadId);
    const allowedContext = adminContext || publicContext;

    console.log(
      `[TG CMD] user=${payload.userId ?? 'unknown'} chat=${payload.chatId} topic=${payload.threadId ?? 'Main'} type=${payload.chatType} cmd="${payload.text}" allowed=${allowedContext} admin_ctx=${adminContext} public_ctx=${publicContext}`,
    );
  }

  private extractMention(raw: string | undefined) {
    const mention = (raw ?? '').trim().split(/\s+/).find((item) => item.startsWith('@')) ?? '';
    return mention;
  }

  private extractMentionAndReason(raw: string | undefined) {
    const text = (raw ?? '').trim();
    const parts = text.split(/\s+/).filter(Boolean);
    const mention = parts.find((item) => item.startsWith('@')) ?? '';
    const reason = parts
      .filter((item, index) => !(index === parts.indexOf(mention)))
      .join(' ')
      .trim();

    return { mention, reason };
  }

  private extractMentions(raw: string | undefined) {
    return (raw ?? '')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.startsWith('@'));
  }

  private hasAdminFlag(user: { is_admin: number } | null | undefined) {
    return Boolean(user?.is_admin);
  }

  private canUseAdminCommands(
    user: { is_admin: number } | null | undefined,
    chatId: number,
    threadId: number | undefined,
  ) {
    return this.hasAdminFlag(user) && this.isAdminContext(chatId, threadId);
  }
}
