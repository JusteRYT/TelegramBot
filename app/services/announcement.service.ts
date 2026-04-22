import { Bot, InlineKeyboard } from 'grammy';

import { env } from '../config/env';

import { GameService } from './game.service';

export class AnnouncementService {
  constructor(
    private readonly bot: Bot,
    private readonly games = new GameService(),
  ) {}

  async publishGame(gameId: number) {
    const game = this.games.getById(gameId);
    if (!game) {
      return null;
    }

    const sent = game.image_file_id
      ? await this.bot.api.sendPhoto(env.MAIN_CHAT_ID, game.image_file_id, {
          caption: this.games.formatAnnouncement(game),
          parse_mode: 'HTML',
          message_thread_id: env.ANNOUNCEMENT_TOPIC_ID || undefined,
          reply_markup: this.getRegistrationKeyboard(game.id, game.status),
        })
      : await this.bot.api.sendMessage(env.MAIN_CHAT_ID, this.games.formatAnnouncement(game), {
          parse_mode: 'HTML',
          message_thread_id: env.ANNOUNCEMENT_TOPIC_ID || undefined,
          reply_markup: this.getRegistrationKeyboard(game.id, game.status),
        });

    this.games.saveAnnouncementMessage(game.id, sent.message_id);
    await this.notifyGeneralChatAboutNewGame(game.id, sent.message_id);
    return sent;
  }

  async refreshGame(gameId: number, extraText = '') {
    const game = this.games.getById(gameId);
    if (!game?.announcement_message_id) {
      return;
    }

    const text = `${this.games.formatAnnouncement(game)}${extraText ? `\n\n${extraText}` : ''}`;
    const replyMarkup = this.getRegistrationKeyboard(game.id, game.status);

    try {
      if (game.image_file_id) {
        await this.bot.api.editMessageMedia(
          env.MAIN_CHAT_ID,
          game.announcement_message_id,
          {
            type: 'photo',
            media: game.image_file_id,
            caption: text,
            parse_mode: 'HTML',
          },
          { reply_markup: replyMarkup },
        );
        return;
      }

      await this.bot.api.editMessageText(env.MAIN_CHAT_ID, game.announcement_message_id, text, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
    } catch (error) {
      if (this.isMessageNotFoundError(error)) {
        this.games.clearAnnouncementMessage(gameId);
        await this.publishGame(gameId);
        return;
      }

      throw error;
    }
  }

  async deleteGame(gameId: number) {
    const game = this.games.getById(gameId);
    if (game?.announcement_message_id) {
      await this.deleteAnnouncementMessage(game.announcement_message_id);
    }
  }

  async deleteAnnouncementMessage(messageId: number) {
    try {
      await this.bot.api.deleteMessage(env.MAIN_CHAT_ID, messageId);
    } catch (error) {
      console.error(`Failed to delete announcement message ${messageId}:`, error);
    }
  }

  private isMessageNotFoundError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'description' in error &&
      typeof (error as { description?: unknown }).description === 'string' &&
      (error as { description: string }).description.toLowerCase().includes('message to edit not found')
    );
  }

  async sendStartedNow(gameId: number) {
    const game = this.games.getById(gameId);
    if (!game) {
      return;
    }

    const players = this.games
      .getDisplayPlayers(gameId)
      ?.map((item) => item.replace('✅', '').trim())
      .join(' ') || '<i>Тишина в таверне...</i>';

    const text =
      `⚔️ <b>ПОРА В ПУТЬ, ГЕРОИ!</b> ⚔️\n\n` +
      `Приключение <b>«${game.title}»</b> начинается прямо сейчас!\n\n` +
      `🧙‍♂️ <b>Мастер:</b> ${game.gm_name ?? '<i>Не указан</i>'}\n` +
      `👥 <b>Отряд:</b> ${players}\n\n` +
      `<i>Проверьте снаряжение и да пребудет с вами крит удача!</i>`;

    await this.bot.api.sendMessage(env.MAIN_CHAT_ID, text, {
      parse_mode: 'HTML',
      message_thread_id: env.ANNOUNCEMENT_TOPIC_ID || undefined,
    });
  }

  private getRegistrationKeyboard(gameId: number, status: string) {
    if (status !== 'OPEN') {
      return undefined;
    }

    return new InlineKeyboard().text('⚔️ Регистрация / Покинуть', `reg_toggle_${gameId}`);
  }

  private async notifyGeneralChatAboutNewGame(gameId: number, announcementMessageId: number) {
    if (!env.GENERAL_CHAT_ID) {
      return;
    }

    const game = this.games.getById(gameId);
    if (!game) {
      return;
    }

    const link = this.buildTopicMessageLink(announcementMessageId);
    const text =
      `🔥 <b>Новый анонс игры опубликован!</b>\n\n` +
      `🎮 <b>${game.title}</b>\n` +
      `🧙‍♂️ Мастер: ${game.gm_name ?? '<i>не указан</i>'}\n` +
      `📅 Дата: <code>${this.formatDate(new Date(game.starts_at))}</code>\n` +
      `⏰ Время: <code>${this.formatTime(new Date(game.starts_at))}</code> (МСК)\n\n` +
      `👉 <a href="${link}"><b>Перейти к посту и записаться</b></a>`;

    try {
      await this.bot.api.sendMessage(env.GENERAL_CHAT_ID, text, { parse_mode: 'HTML' });
    } catch (error) {
      console.warn('Failed to send general chat game announcement:', error);
    }
  }

  private buildTopicMessageLink(messageId: number) {
    const cleanId = String(env.MAIN_CHAT_ID).replace('-100', '');
    const base = `https://t.me/c/${cleanId}/${messageId}`;
    return env.ANNOUNCEMENT_TOPIC_ID ? `${base}?thread=${env.ANNOUNCEMENT_TOPIC_ID}` : base;
  }

  private formatDate(value: Date) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${day}.${month}.${year}`;
  }

  private formatTime(value: Date) {
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
