import { Bot } from 'grammy';

import { env } from '../config/env';
import { UserRepository } from '../repositories/user.repository';

import { PublicCommandService } from './public-command.service';
import { RegistrationService } from './registration.service';
import { AnnouncementService } from './announcement.service';
import { AdminCommandService } from './admin-command.service';
import { PlayerAccessService } from './player-access.service';
import { GameService } from './game.service';

export class CallbackQueryService {
  constructor(
    private readonly bot: Bot,
    private readonly publicCommands: PublicCommandService,
    private readonly adminCommands: AdminCommandService,
    private readonly registrations = new RegistrationService(),
    private readonly announcements = new AnnouncementService(bot),
    private readonly playerAccess = new PlayerAccessService(),
    private readonly users = new UserRepository(),
    private readonly games = new GameService(),
  ) {}

  async handle(
    data: string,
    from: { id: number },
    callbackQueryId: string,
    chatId?: number,
    threadId?: number,
  ) {
    if (data.startsWith('reg_toggle_')) {
      const gameId = Number.parseInt(data.replace('reg_toggle_', ''), 10);
      await this.handleRegistrationToggle(gameId, from.id, callbackQueryId);
      return;
    }

    if (data === 'create_type_dnd' || data === 'create_type_mafia') {
      const type = data === 'create_type_dnd' ? 'DND' : 'MAFIA';
      const result = this.adminCommands.handleCreateTypeCallback(from.id, type);
      if (!result.ok) {
        await this.bot.api.answerCallbackQuery(callbackQueryId, {
          text: 'Сессия истекла. Начните заново: /create',
          show_alert: true,
        });
        return;
      }

      await this.bot.api.sendMessage(chatId ?? env.ADMIN_CHAT_ID, result.prompt, {
        parse_mode: 'HTML',
        message_thread_id: (threadId ?? env.ADMIN_TOPIC_ID) || undefined,
        reply_markup: { force_reply: true },
      });
      await this.bot.api.answerCallbackQuery(callbackQueryId, { text: 'Тип выбран ✅' });
      return;
    }

    if (data === 'create_mode_open' || data === 'create_mode_closed') {
      const mode = data === 'create_mode_open' ? 'OPEN' : 'CLOSED';
      const result = this.adminCommands.handleCreateModeCallback(from.id, mode);
      if (!result.ok) {
        await this.bot.api.answerCallbackQuery(callbackQueryId, {
          text: 'Сессия истекла. Начните заново: /create',
          show_alert: true,
        });
        return;
      }

      await this.bot.api.sendMessage(chatId ?? env.ADMIN_CHAT_ID, result.prompt, {
        parse_mode: 'HTML',
        message_thread_id: (threadId ?? env.ADMIN_TOPIC_ID) || undefined,
        reply_markup: { force_reply: true },
      });
      await this.bot.api.answerCallbackQuery(callbackQueryId, { text: 'Режим выбран ✅' });
      return;
    }

    if (data.startsWith('guide_')) {
      await this.bot.api.sendMessage(from.id, this.publicCommands.getGuideResponse(data), {
        parse_mode: 'HTML',
      });
      await this.bot.api.answerCallbackQuery(callbackQueryId, {
        text: 'Отправил информацию в личные сообщения 📥',
      });
      return;
    }

    if (data === 'donate_select_akulenok') {
      await this.bot.api.sendMessage(
        from.id,
        `🎉 <b>Спасибо за желание поддержать @AKULENOK_arrr!</b>\n\n` +
          `Ваш донат пойдет на кубики и миниатюры 🎲\n\n` +
          `💳 Перевод по номеру карты:\n<code>2202 2036 6461 2761</code>\n` +
          `🏦 Банк: <b>Сбер</b>\n\n` +
          `<i>💡 Нажмите на номер карты, чтобы быстро скопировать его.</i>`,
        { parse_mode: 'HTML' },
      );
      await this.bot.api.answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data.startsWith('reg_')) {
      const gameId = Number.parseInt(data.replace('reg_', ''), 10);
      await this.handleRegistrationJoin(gameId, from.id, callbackQueryId);
      return;
    }

    if (data.startsWith('unreg_')) {
      const gameId = Number.parseInt(data.replace('unreg_', ''), 10);
      const user = this.users.findByTelegramId(from.id);
      if (!user) {
        await this.bot.api.answerCallbackQuery(callbackQueryId, {
          text: 'Профиль не найден. Напишите /start и повторите.',
          show_alert: true,
        });
        return;
      }

      const result = this.registrations.unregister(gameId, user.id);
      await this.bot.api.answerCallbackQuery(callbackQueryId, {
        text: result.ok ? 'Вы вышли из состава.' : 'Вы не были записаны.',
        show_alert: !result.ok,
      });
      if (result.ok) {
        await this.announcements.refreshGame(gameId);
      }
      return;
    }

    if (data.startsWith('edit_field_')) {
      const parts = data.split('_');
      const gameId = Number.parseInt(parts.pop() ?? '', 10);
      const field = parts.slice(2).join('_') as Parameters<AdminCommandService['handleEditFieldCallback']>[2];
      const result = await this.adminCommands.handleEditFieldCallback(from.id, gameId, field);

      if (!result.ok) {
        await this.bot.api.answerCallbackQuery(callbackQueryId, {
          text: result.text,
          show_alert: result.alert,
        });
        return;
      }

      await this.bot.api.sendMessage(env.ADMIN_CHAT_ID, result.prompt, {
        parse_mode: 'HTML',
        message_thread_id: env.ADMIN_TOPIC_ID || undefined,
      });
      await this.bot.api.answerCallbackQuery(callbackQueryId, { text: 'Ожидаю ввод...' });
    }
  }

  private async handleRegistrationToggle(gameId: number, telegramUserId: number, callbackQueryId: string) {
    const user = this.users.findByTelegramId(telegramUserId);
    if (!user) {
      await this.bot.api.answerCallbackQuery(callbackQueryId, {
        text: 'Профиль не найден. Напишите /start и повторите.',
        show_alert: true,
      });
      return;
    }

    if (this.registrations.hasActiveRegistration(gameId, user.id)) {
      const result = this.registrations.unregister(gameId, user.id);
      await this.bot.api.answerCallbackQuery(callbackQueryId, {
        text: result.ok ? 'Вы покинули запись на игру.' : 'Вы не были записаны.',
        show_alert: !result.ok,
      });
      if (result.ok) {
        await this.announcements.refreshGame(gameId);
      }
      return;
    }

    await this.handleRegistrationJoin(gameId, telegramUserId, callbackQueryId);
  }

  private async handleRegistrationJoin(gameId: number, telegramUserId: number, callbackQueryId: string) {
    const user = this.users.findByTelegramId(telegramUserId);
    if (!user) {
      await this.bot.api.answerCallbackQuery(callbackQueryId, {
        text: 'Профиль не найден. Напишите /start и повторите.',
        show_alert: true,
      });
      return;
    }

    const access = await this.playerAccess.canRegister(telegramUserId);
    if (!access.ok) {
      if (access.reason === 'NOT_REGISTERED') {
        const instruction = this.playerAccess.buildAuthInstruction();
        await this.bot.api.sendMessage(telegramUserId, instruction.text, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🚀 Запустить регистрацию', url: instruction.url }]],
          },
        });
        await this.bot.api.answerCallbackQuery(callbackQueryId, {
          text: '⚠️ Инструкция отправлена вам в личные сообщения!',
          show_alert: true,
        });
        return;
      }

      await this.bot.api.answerCallbackQuery(callbackQueryId, {
        text: '🚫 Вам не доступна регистрация на игры.',
        show_alert: true,
      });
      return;
    }

    const result = this.registrations.register(gameId, user.id);
    await this.bot.api.answerCallbackQuery(callbackQueryId, {
      text: result.ok
        ? result.registration?.status === 'WAITLIST'
          ? 'Заявка отправлена. Вы в листе ожидания до подтверждения мастером.'
          : 'Вы успешно записаны!'
        : {
            GAME_NOT_FOUND: 'Игра не найдена.',
            REGISTRATION_CLOSED: 'Набор закрыт.',
            ALREADY_REGISTERED: 'Вы уже записаны!',
          }[result.reason] ?? 'Ошибка',
      show_alert: !result.ok,
    });
    if (result.ok) {
      await this.announcements.refreshGame(gameId);
      await this.notifyGmAboutRegistration(gameId, user.id, telegramUserId, result.registration?.status);
    }
  }

  private async notifyGmAboutRegistration(
    gameId: number,
    userId: number,
    telegramUserId: number,
    registrationStatus?: string,
  ) {
    const game = this.games.getById(gameId);
    if (!game) {
      return;
    }

    const player = this.users.findById(userId);
    const playerTag = player?.username ? `@${player.username}` : `id:${telegramUserId}`;
    const playerName = [player?.first_name ?? '', player?.last_name ?? ''].join(' ').trim();
    const registrationLabel = registrationStatus === 'WAITLIST' ? 'Лист ожидания' : 'Подтвержден';

    const recipients = new Set<number>();
    const createdBy = this.users.findById(game.created_by_user_id);
    if (createdBy?.telegram_id) {
      recipients.add(createdBy.telegram_id);
    }

    const gmMention = (game.gm_name ?? '').trim();
    if (gmMention.startsWith('@')) {
      const gm = this.users.findByUsername(gmMention);
      if (gm?.telegram_id) {
        recipients.add(gm.telegram_id);
      }
    }

    if (recipients.size === 0) {
      return;
    }

    const text =
      `🔔 <b>Новая регистрация на игру</b>\n\n` +
      `🎮 <b>Игра:</b> ${game.title}\n` +
      `👤 <b>Игрок:</b> ${playerTag}${playerName ? ` (${playerName})` : ''}\n` +
      `📌 <b>Статус:</b> ${registrationLabel}`;

    for (const recipientTelegramId of recipients) {
      if (recipientTelegramId === telegramUserId) {
        continue;
      }

      try {
        await this.bot.api.sendMessage(recipientTelegramId, text, { parse_mode: 'HTML' });
      } catch (error) {
        console.warn(`Failed to notify GM about registration for game #${gameId}:`, error);
      }
    }
  }
}
