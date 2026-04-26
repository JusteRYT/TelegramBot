import { getWelcomeMessage, guideContent, guideKeyboard, guideTemplate, startKeyboard } from '../content/guide';
import { env } from '../config/env';
import type { BotContextLike } from '../bot/types';

import { ExternalValidationService } from './external-validation.service';
import { GameService } from './game.service';

export class PublicCommandService {
  constructor(
    private readonly games = new GameService(),
    private readonly externalValidation = new ExternalValidationService(),
  ) {}

  async handleStart(ctx: BotContextLike, startPayload?: string) {
    if (!ctx.from?.username) {
      await ctx.reply(
        '⚠️ <b>Внимание:</b> Для работы с ботом у вас должен быть установлен <b>Username</b> в настройках Telegram.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const status = await this.externalValidation.getUserStatus({
      username: ctx.from.username,
      userId: ctx.from.id,
    });

    const registrationResult = !status.exists
      ? this.externalValidation.registerLocalUser(ctx.from.id)
      : { ok: true as const, justRegistered: false };

    if (status.isBanned) {
      await ctx.reply(
        `🚫 <b>Доступ ограничен</b>\n\n` +
          `К сожалению, ваш аккаунт был заблокирован в системе <b>VRode_DnD_20</b>.\n\n` +
          `<b>Что это значит?</b>\n` +
          `• Вы не можете вступить в наше сообщество.\n` +
          `• Вам закрыт доступ к регистрации на игры (D&D, Мафия).\n` +
          `• Ваши заявки будут отклоняться автоматически.\n\n` +
          `<b>Почему это могло произойти?</b>\n` +
          `Обычно бан выдается за систематическое нарушение правил, неподобающее поведение или получение максимального количества предупреждений (2/2).\n\n` +
          `<i>Если вы считаете, что произошла ошибка, свяжитесь с администратором.</i>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (startPayload === 'guide') {
      await this.handleGuide(ctx);
      return;
    }

    if (startPayload === 'rank') {
      await this.handleRank(ctx);
      return;
    }

    if (registrationResult.ok && registrationResult.justRegistered) {
      await ctx.reply(
        `✅ <b>Регистрация в системе выполнена.</b>\n` +
          `Теперь вы можете записываться на игры и пользоваться всеми функциями бота.`,
        { parse_mode: 'HTML' },
      );

      const displayName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ').trim();
      const adminNotice =
        `🆕 <b>Новая регистрация в боте!</b>\n\n` +
        `👤 <b>Пользователь:</b> @${ctx.from.username}\n` +
        `🆔 <b>Telegram ID:</b> <code>${ctx.from.id}</code>\n` +
        `🏷 <b>Имя в ТГ:</b> ${displayName || '<i>не указано</i>'}\n` +
        `📅 <b>Дата:</b> ${this.formatRussianDate(new Date())}\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
        `📍 Статус: <code>Кандидат</code>`;

      const api = (ctx as unknown as { api?: { sendMessage: Function } }).api;
      if (api?.sendMessage && env.ADMIN_CHAT_ID) {
        await api.sendMessage(env.ADMIN_CHAT_ID, adminNotice, {
          parse_mode: 'HTML',
          message_thread_id: env.ADMIN_TOPIC_ID || undefined,
        });
      }
    }

    await ctx.reply(getWelcomeMessage(ctx.from.first_name || 'искатель приключений'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: startKeyboard },
    });
  }

  async handleGuide(ctx: BotContextLike) {
    if (ctx.chat.type !== 'private') {
      await ctx.reply('📚 Справочник доступен только в личных сообщениях.', {
        reply_markup: {
          inline_keyboard: [[{ text: '📖 Открыть справочник в ЛС', url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=guide` }]],
        },
      });
      return;
    }

    await ctx.reply('📚 <b>Справочник искателя приключений</b>\n\nВыберите интересующий раздел:', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: guideKeyboard },
    });
  }

  async handleDonate(ctx: BotContextLike) {
    if (ctx.chat.type !== 'private') {
      await ctx.reply('💎 <b>Меню донатов</b> доступно только в личных сообщениях.', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '☕ Поддержать проект в ЛС', url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}` }]],
        },
      });
      return;
    }

    await ctx.reply('💎 <b>Поддержка проекта</b>\n\nКому из мастеров вы хотите отправить чаевые?', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '☕ @AKULENOK_arrr', callback_data: 'donate_select_akulenok' }]],
      },
    });
  }

  async handleHelp(ctx: BotContextLike) {
    await ctx.reply(
      "🎮 <b>СПРАВОЧНИК ИГРОКА</b>\n\n" +
        "📅 <code>/gamelist</code> — расписание ближайших игр\n" +
        "📖 <code>/guide</code> — правила, лор и помощь\n" +
        "🚀 <code>/start</code> — проверка работы бота\n\n" +
        "🏅 <b>ЛИЧНЫЙ ПРОГРЕСС:</b>\n" +
        "📊 <code>/rank</code> — твой ранг, опыт и прогресс до нового уровня\n" +
        "🪙 <code>/donate</code> — поддержать мастеров монетой\n\n" +
        "💡 <b>Как записаться?</b>\n" +
        "В анонсе игры нажми кнопку <b>«⚔️ Записаться»</b>.\n\n" +
        "<i>Проблемы с регистрацией? Напиши администратору.</i>",
      { parse_mode: 'HTML' },
    );
  }

  async handleGameList(ctx: BotContextLike) {
    await ctx.reply(this.games.formatUpcomingList(), { parse_mode: 'HTML' });
  }

  async handleRank(ctx: BotContextLike) {
    if (!ctx.from?.username) {
      await ctx.reply('❌ Не удалось определить ваш username.');
      return;
    }

    if (ctx.chat.type !== 'private') {
      await ctx.reply('📊 Ваш ранг и прогресс можно посмотреть только в личных сообщениях.', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🏆 Посмотреть мой ранг', url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=rank` }]],
        },
      });
      return;
    }

    const stats = await this.externalValidation.getUserStatus({
      username: ctx.from.username,
      userId: ctx.from.id,
    });

    if (!stats.exists) {
      await ctx.reply('❌ Вы не найдены в базе. Пожалуйста, убедитесь, что вы авторизованы в системе управления.');
      return;
    }

    const gamesCount = stats.gamesCount ?? 0;
    const rank = this.getRank(gamesCount);

    await ctx.reply(
      `👤 <b>ИГРОК:</b> @${ctx.from.username}\n\n` +
        `🏆 <b>Ранг:</b> ${rank.emoji} ${rank.name}\n` +
        `🎮 <b>Игр пройдено:</b> <code>${gamesCount}</code>\n\n` +
        `${this.getProgress(gamesCount)}`,
      { parse_mode: 'HTML' },
    );
  }

  getGuideResponse(data: string) {
    return data === 'guide_template'
      ? `📋 <b>Шаблон анкеты:</b>\n\n${guideTemplate}`
      : guideContent[data] ?? 'Информация уточняется...';
  }

  private getRank(gamesCount: number) {
    const ranks = [
      { name: 'Новичок', emoji: '🐣', minGames: 0 },
      { name: 'Странник', emoji: '🥾', minGames: 3 },
      { name: 'Искатель', emoji: '🔍', minGames: 6 },
      { name: 'Авантюрист', emoji: '🗺', minGames: 10 },
      { name: 'Боец', emoji: '⚔️', minGames: 15 },
      { name: 'Наемник', emoji: '💰', minGames: 21 },
      { name: 'Страж', emoji: '🛡', minGames: 28 },
      { name: 'Охотник', emoji: '🏹', minGames: 36 },
      { name: 'Рыцарь', emoji: '🐴', minGames: 45 },
      { name: 'Ветеран', emoji: '🎖', minGames: 55 },
      { name: 'Мастер', emoji: '📜', minGames: 66 },
      { name: 'Герой', emoji: '🌟', minGames: 78 },
      { name: 'Воитель', emoji: '🔥', minGames: 91 },
      { name: 'Завоеватель', emoji: '🦅', minGames: 105 },
      { name: 'Легенда', emoji: '👑', minGames: 120 },
    ];

    return [...ranks].reverse().find((rank) => gamesCount >= rank.minGames) ?? ranks[0];
  }

  private getProgress(gamesCount: number) {
    const ranks = [
      { name: 'Новичок', minGames: 0 },
      { name: 'Странник', minGames: 3 },
      { name: 'Искатель', minGames: 6 },
      { name: 'Авантюрист', minGames: 10 },
      { name: 'Боец', minGames: 15 },
      { name: 'Наемник', minGames: 21 },
      { name: 'Страж', minGames: 28 },
      { name: 'Охотник', minGames: 36 },
      { name: 'Рыцарь', minGames: 45 },
      { name: 'Ветеран', minGames: 55 },
      { name: 'Мастер', minGames: 66 },
      { name: 'Герой', minGames: 78 },
      { name: 'Воитель', minGames: 91 },
      { name: 'Завоеватель', minGames: 105 },
      { name: 'Легенда', minGames: 120 },
    ];

    const next = ranks.find((rank) => rank.minGames > gamesCount);
    if (!next) {
      return `✨ <b>Легендарный уровень</b>\n🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦 <b>100%</b>`;
    }

    const current = this.getRank(gamesCount);
    const range = Math.max(1, next.minGames - current.minGames);
    const progress = Math.max(0, gamesCount - current.minGames);
    const percent = Math.floor((progress / range) * 100);
    const bar = this.buildProgressBar(percent);
    const left = Math.max(0, next.minGames - gamesCount);

    return `📈 <b>Прогресс до ранга ${next.name}:</b>\n${bar} <b>${percent}%</b>\nДо следующего ранга: <code>${left}</code> игр`;
  }

  private buildProgressBar(percent: number) {
    const size = 10;
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped * size) / 100);
    const empty = size - filled;
    return `${'🟦'.repeat(filled)}${'⬜️'.repeat(empty)}`;
  }

  private formatRussianDate(date: Date) {
    const months = [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ];

    const msk = new Date(date.getTime() + 3 * 60 * 60 * 1000);
    const day = msk.getUTCDate();
    const month = months[msk.getUTCMonth()];
    const year = msk.getUTCFullYear();
    const hours = String(msk.getUTCHours()).padStart(2, '0');
    const minutes = String(msk.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}г. ${hours}:${minutes} по мск`;
  }
}
