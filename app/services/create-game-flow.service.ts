import type { BotContextLike, CreateWizardState } from '../bot/types';

import { AnnouncementService } from './announcement.service';
import { BotSessionService } from './bot-session.service';
import { GameService } from './game.service';

export class CreateGameFlowService {
  constructor(
    private readonly sessions: BotSessionService,
    private readonly announcements: AnnouncementService,
    private readonly games = new GameService(),
  ) {}

  async start(ctx: BotContextLike) {
    if (!ctx.from) {
      return;
    }

    this.sessions.set(ctx.from.id, {
      flow: 'CREATE',
      step: 'CHOOSE_GAME_TYPE',
      threadId: ctx.message?.message_thread_id ?? null,
      gameData: {},
    });

    await ctx.reply(
      '🆕 <b>Создание анонса</b>\n\nВыберите тип игры:',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🐉 D&D', callback_data: 'create_type_dnd' },
              { text: '🕴️ Мафия', callback_data: 'create_type_mafia' },
            ],
          ],
        },
      },
    );
  }

  async handle(ctx: BotContextLike, state: CreateWizardState, createdByUserId: number) {
    if (!ctx.from || !ctx.message) {
      return;
    }

    const text = ctx.message.text?.trim() ?? '';
    if (text.startsWith('/')) {
      this.sessions.clear(ctx.from.id);
      await ctx.reply('⚠️ Прервано. Начните заново через /create.');
      return;
    }

    if (state.step === 'CHOOSE_GAME_TYPE') {
      await this.handleTypeSelection(ctx, state);
      return;
    }

    if (state.gameType === 'DND') {
      await this.handleDnd(ctx, state, createdByUserId);
      return;
    }

    if (state.gameType === 'MAFIA') {
      await this.handleMafia(ctx, state, createdByUserId);
    }
  }

  private async handleTypeSelection(ctx: BotContextLike, state: CreateWizardState) {
    const text = ctx.message?.text?.trim();
    if (!ctx.from) {
      return;
    }

    const normalized = this.normalizeTypeInput(text);

    if (normalized === 'DND') {
      state.gameType = 'DND';
      state.gameData.type = 'DND';
      state.step = 'TITLE';
      this.sessions.set(ctx.from.id, state);
      await this.replyStep(ctx, '🐉 <b>Создание D&D</b>\n\nВведите название приключения:');
      return;
    }

    if (normalized === 'MAFIA') {
      state.gameType = 'MAFIA';
      state.gameData.type = 'MAFIA';
      state.step = 'TITLE';
      this.sessions.set(ctx.from.id, state);
      await this.replyStep(ctx, "🕴️ <b>Создание Мафии</b>\n\nШаг 1: Введите тематику вечера (или просто 'Мафия'):");
      return;
    }

    await this.replyStep(ctx, '⚠️ Отправьте 1 (D&D) или 2 (Мафия). Можно также написать: dnd / мафия.');
  }

  private async handleDnd(ctx: BotContextLike, state: CreateWizardState, createdByUserId: number) {
    if (!ctx.from) {
      return;
    }

    const text = ctx.message?.text?.trim() ?? '';

    switch (state.step) {
      case 'TITLE':
        state.gameData.title = text;
        state.step = 'GM_CHOICE';
        await this.next(ctx, state, '🧙‍♂️ <b>Шаг 2: Игровой мастер</b>\n\nКто ведет игру? Введите @username или имя.\n(Если ведете вы, просто напишите <code>я</code>)');
        return;
      case 'GM_CHOICE':
        state.gameData.gmName = text.toLowerCase() === 'я' ? `@${ctx.from?.username || ctx.from?.first_name}` : text;
        state.step = 'TYPE';
        this.sessions.set(ctx.from.id, state);
        await ctx.reply(
          '🧩 <b>Шаг 3: Тип игры</b>\n\nВыберите формат партии:',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔓 Открытая (набор игроков)', callback_data: 'create_mode_open' }],
                [{ text: '🔒 Закрытая (готовый состав)', callback_data: 'create_mode_closed' }],
              ],
            },
          },
        );
        return;
      case 'TYPE':
        if (text === '1') {
          state.gameData.openRegistration = true;
          state.step = 'PARTICIPANTS';
          await this.next(ctx, state, '👥 <b>Шаг 4: Вместимость</b>\nСколько мест доступно? (1-5):');
          return;
        }
        if (text === '2') {
          state.gameData.openRegistration = false;
          state.step = 'PARTICIPANTS';
          await this.next(ctx, state, '👥 <b>Шаг 4: Состав</b>\nПеречислите игроков через запятую:');
          return;
        }
        await this.replyStep(ctx, '🤔 Введите 1 или 2.');
        return;
      case 'PARTICIPANTS':
        if (state.gameData.openRegistration) {
          if (!/^[1-5]$/.test(text)) {
            await this.replyStep(ctx, '❌ Число от 1 до 5:');
            return;
          }
          state.gameData.registrationLimit = Number.parseInt(text, 10);
        } else {
          const players = text.split(/[\s,\n]+/).filter((item) => item.length > 1);
          state.gameData.prefilledPlayers = players;
          state.gameData.registrationLimit = players.length;
        }
        state.step = 'DATE';
        await this.next(ctx, state, '📅 <b>Шаг 5: Дата</b>\nКогда играем? (ДД.ММ):');
        return;
      case 'DATE':
        if (!this.parseDateInput(text)) {
          await this.replyStep(ctx, '❌ Некорректная дата. Формат: ДД.ММ (напр. 25.12)');
          return;
        }
        state.gameData.date = this.normalizeDateInput(text);
        state.step = 'TIME';
        await this.next(ctx, state, '⏰ <b>Шаг 6: Время</b>\nВо сколько старт? (напр. 19:00):');
        return;
      case 'TIME':
        if (!this.parseTimeInput(text)) {
          await this.replyStep(ctx, '❌ Некорректное время. Используйте формат ЧЧ:ММ (например 19:00)');
          return;
        }
        state.gameData.time = this.normalizeTimeInput(text);
        state.step = 'IMAGE';
        await this.next(ctx, state, '🖼 <b>Шаг 7: Атмосфера</b>\nПришлите <b>картинку</b> или напишите <b>-</b>');
        return;
      case 'IMAGE':
        if (ctx.message?.photo?.length) {
          state.gameData.imageFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (text === '-') {
          state.gameData.imageFileId = '';
        } else {
          await this.replyStep(ctx, "🖼 Жду фото или '-':");
          return;
        }
        state.step = 'DESC';
        await this.next(ctx, state, '📝 <b>Шаг 8: Описание</b>\nО чем сюжет?');
        return;
      case 'DESC':
        state.gameData.description = text;
        await this.finalize(ctx, state, createdByUserId, '✨ <b>Анонс D&D опубликован!</b>');
        return;
    }
  }

  private async handleMafia(ctx: BotContextLike, state: CreateWizardState, createdByUserId: number) {
    const text = ctx.message?.text?.trim() ?? '';

    switch (state.step) {
      case 'TITLE':
        state.gameData.title = text;
        state.gameData.gmName = `@${ctx.from?.username || ctx.from?.first_name}`;
        state.step = 'DATE';
        await this.next(ctx, state, '📅 <b>Шаг 2: Дата</b>\nКогда собираемся? (ДД.ММ):');
        return;
      case 'DATE':
        if (!this.parseDateInput(text)) {
          await this.replyStep(ctx, '❌ Некорректная дата. Формат: ДД.ММ (напр. 25.12)');
          return;
        }
        state.gameData.date = this.normalizeDateInput(text);
        state.step = 'TIME';
        await this.next(ctx, state, '⏰ <b>Шаг 3: Время</b>\nВо сколько старт? (напр. 19:00):');
        return;
      case 'TIME':
        if (!this.parseTimeInput(text)) {
          await this.replyStep(ctx, '❌ Некорректное время. Используйте формат ЧЧ:ММ (например 19:00)');
          return;
        }
        state.gameData.time = this.normalizeTimeInput(text);
        state.step = 'PARTICIPANTS';
        await this.next(ctx, state, '👥 <b>Шаг 4: Вместимость</b>\nСколько мест доступно? (например: 10):');
        return;
      case 'PARTICIPANTS':
        if (!/^\d+$/.test(text)) {
          await this.replyStep(ctx, '❌ Введите число (например 10):');
          return;
        }
        state.gameData.registrationLimit = Number.parseInt(text, 10);
        state.step = 'IMAGE';
        await this.next(ctx, state, '🖼 <b>Шаг 5: Картинка</b>\nПришлите фото для анонса или напишите <b>-</b>');
        return;
      case 'IMAGE':
        if (ctx.message?.photo?.length) {
          state.gameData.imageFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (text === '-') {
          state.gameData.imageFileId = '';
        } else {
          await this.replyStep(ctx, "🖼 Жду фото или '-':");
          return;
        }
        state.step = 'DESC';
        await this.next(ctx, state, '📝 <b>Шаг 6: Описание</b>\nНапишите кратко правила или дресс-код:');
        return;
      case 'DESC':
        state.gameData.description = text;
        await this.finalize(ctx, state, createdByUserId, '✨ <b>Анонс Мафии опубликован!</b>');
        return;
    }
  }

  private async finalize(ctx: BotContextLike, state: CreateWizardState, createdByUserId: number, successMessage: string) {
    if (!ctx.from || !state.gameData.title || !state.gameData.date || !state.gameData.time) {
      return;
    }

    const startsAtInput = this.toStartsAtInput(state.gameData.date, state.gameData.time);
    if (!startsAtInput) {
      await ctx.reply('❌ Не удалось распознать дату/время. Проверьте формат и попробуйте /create заново.', {
        parse_mode: 'HTML',
      });
      this.sessions.clear(ctx.from.id);
      return;
    }
    const result = this.games.createGame({
      type: state.gameData.type ?? 'DND',
      title: state.gameData.title,
      description: state.gameData.description ?? '',
      startsAtInput,
      gmName: state.gameData.gmName ?? null,
      registrationLimit: state.gameData.registrationLimit,
      imageFileId: state.gameData.imageFileId ?? null,
      participantSlotsText: state.gameData.openRegistration === false
        ? 'Состав сформирован'
        : state.gameData.registrationLimit
          ? `Нужно ${state.gameData.registrationLimit} чел.`
          : null,
      registeredPlayersText: state.gameData.prefilledPlayers?.join(',') ?? '',
      status: state.gameData.openRegistration === false ? 'FULL' : 'OPEN',
      createdByUserId,
    });

    this.sessions.clear(ctx.from.id);

    if (!result.ok || !result.game) {
      await ctx.reply('❌ <b>Ошибка:</b> Не удалось сохранить игру.', { parse_mode: 'HTML' });
      return;
    }

    await this.announcements.publishGame(result.game.id);
    await ctx.reply(successMessage, { parse_mode: 'HTML' });
  }

  private async next(ctx: BotContextLike, state: CreateWizardState, prompt: string) {
    if (!ctx.from) {
      return;
    }

    this.sessions.set(ctx.from.id, state);
    await this.replyStep(ctx, prompt);
  }

  private async replyStep(ctx: BotContextLike, text: string) {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: {
        force_reply: true,
      },
    });
  }

  private normalizeTypeInput(input: string | undefined) {
    const raw = (input ?? '').trim().toLowerCase();
    const compact = raw.replace(/\s+/g, '');

    if (['1', 'dnd', 'd&d', 'днд', '🐉dnd', '🐉d&d'].includes(compact)) {
      return 'DND' as const;
    }

    if (['2', 'мафия', 'mafia', '🕴️мафия', '🕴️mafia'].includes(compact)) {
      return 'MAFIA' as const;
    }

    return null;
  }

  applyTypeSelection(telegramUserId: number, type: 'DND' | 'MAFIA') {
    const state = this.sessions.get(telegramUserId);
    if (!state || state.flow !== 'CREATE' || state.step !== 'CHOOSE_GAME_TYPE') {
      return { ok: false as const };
    }

    state.gameType = type;
    state.gameData.type = type;
    state.step = 'TITLE';
    this.sessions.set(telegramUserId, state);

    if (type === 'DND') {
      return {
        ok: true as const,
        prompt: '🐉 <b>Создание D&D</b>\n\nВведите название приключения:',
      };
    }

    return {
      ok: true as const,
      prompt: "🕴️ <b>Создание Мафии</b>\n\nШаг 1: Введите тематику вечера (или просто 'Мафия'):",
    };
  }

  applyRegistrationModeSelection(telegramUserId: number, mode: 'OPEN' | 'CLOSED') {
    const state = this.sessions.get(telegramUserId);
    if (!state || state.flow !== 'CREATE' || state.step !== 'TYPE' || state.gameType !== 'DND') {
      return { ok: false as const };
    }

    if (mode === 'OPEN') {
      state.gameData.openRegistration = true;
      state.step = 'PARTICIPANTS';
      this.sessions.set(telegramUserId, state);
      return {
        ok: true as const,
        prompt: '👥 <b>Шаг 4: Вместимость</b>\nСколько мест доступно? (1-5):',
      };
    }

    state.gameData.openRegistration = false;
    state.step = 'PARTICIPANTS';
    this.sessions.set(telegramUserId, state);
    return {
      ok: true as const,
      prompt: '👥 <b>Шаг 4: Состав</b>\nПеречислите игроков через запятую:',
    };
  }

  private toStartsAtInput(dateInput: string, timeInput: string) {
    const parsedDate = this.parseDateInput(dateInput);
    const parsedTime = this.parseTimeInput(timeInput);
    if (!parsedDate || !parsedTime) {
      return null;
    }

    const { day, month } = parsedDate;
    const { hours, minutes } = parsedTime;
    const year = new Date().getFullYear();
    const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hours ||
      date.getMinutes() !== minutes
    ) {
      return null;
    }

    return date.toISOString().replace('T', ' ').slice(0, 16);
  }

  private parseDateInput(input: string) {
    const match = input.trim().match(/^(\d{1,2})\.(\d{1,2})$/);
    if (!match) {
      return null;
    }

    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const year = new Date().getFullYear();
    const probe = new Date(year, month - 1, day);
    if (probe.getMonth() !== month - 1 || probe.getDate() !== day) {
      return null;
    }

    return { day, month };
  }

  private parseTimeInput(input: string) {
    const match = input.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!match) {
      return null;
    }

    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return { hours, minutes };
  }

  private normalizeDateInput(input: string) {
    const parsed = this.parseDateInput(input);
    if (!parsed) {
      return input.trim();
    }

    return `${String(parsed.day).padStart(2, '0')}.${String(parsed.month).padStart(2, '0')}`;
  }

  private normalizeTimeInput(input: string) {
    const parsed = this.parseTimeInput(input);
    if (!parsed) {
      return input.trim();
    }

    return `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
  }
}
