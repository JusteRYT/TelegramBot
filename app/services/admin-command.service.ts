import type {
  ApprovePlayersState,
  BotContextLike,
  EditChooseFieldState,
  EditInputValueState,
  SheetsPendingSelectionState,
  WizardState,
} from '../bot/types';

import { AnnouncementService } from './announcement.service';
import { BotSessionService } from './bot-session.service';
import { CreateGameFlowService } from './create-game-flow.service';
import { GameService } from './game.service';
import { UserModerationService } from './user-moderation.service';

export class AdminCommandService {
  constructor(
    private readonly sessions: BotSessionService,
    private readonly announcements: AnnouncementService,
    private readonly createFlow: CreateGameFlowService,
    private readonly games = new GameService(),
    private readonly moderation = new UserModerationService(),
  ) {}

  async handleHelp(ctx: BotContextLike) {
    await ctx.reply(
      "🧙‍♂️ <b>ПАНЕЛЬ МАСТЕРА (ADMIN)</b>\n\n" +
        "✨ <b>Управление играми:</b>\n" +
        "• <code>/create</code> — запустить мастер создания новой игры\n" +
        "• <code>/edit ID</code> — изменить любое поле\n" +
        "• <code>/all</code> — посмотреть краткий список всех активных игр\n\n" +
        "✅ <b>Работа с составом:</b>\n" +
        "• <code>/approve ID</code> — выбрать игроков из списка подавших заявки\n" +
        "• <code>/sheets ID</code> — отметить тех, кто сдал анкеты персонажей\n" +
        "• <code>/start_now ID</code> — мгновенно начать игру\n\n" +
        "⚠️ <b>Критическое:</b>\n" +
        "• <code>/cancel ID</code> — отменить игру\n" +
        "• <code>/delete ID</code> — полностью удалить игру и все сообщения\n\n" +
        "👮 <b>Модерация пользователей:</b>\n" +
        "• <code>/uinfo @user</code> — данные игрока\n" +
        "• <code>/uwarn @user причина</code> — предупреждение\n" +
        "• <code>/uban @user причина</code> — выдать бан\n" +
        "• <code>/uunban @user</code> — снять бан\n" +
        "• <code>/uadd @user</code> — добавить кандидата\n" +
        "• <code>/ureview @user</code> — статус «На проверке»\n" +
        "• <code>/uapprove @user</code> — статус «Одобрен»\n" +
        "• <code>/ugame @user</code> — +1 игра\n" +
        "• <code>/ulist статус</code> — список по группе\n" +
        "• <code>/uall</code> — список всех пользователей по статусам\n" +
        "• <code>/uremove @user причина</code> — удалить пользователя из базы\n\n" +
        "🛠 <b>Системное:</b>\n" +
        "• <code>/id</code> — узнать ID текущего чата и топика\n\n",
      { parse_mode: 'HTML' },
    );
  }

  async handleUserInfo(ctx: BotContextLike, mention: string) {
    const result = this.moderation.getInfoByMention(mention);
    if (!result.ok) {
      await ctx.reply('❌ Пользователь не найден. Укажите @username.');
      return;
    }

    const username = result.user.username ? `@${result.user.username}` : '—';
    const fullName = this.getDisplayName(result.user.first_name, result.user.last_name);
    const statusEmoji = this.getStatusEmoji(result.user.user_status);

    const warningsSummary =
      result.warnings.length > 0
        ? `\n\n📚 Последние предупреждения:\n${result.warnings.slice(0, 5).map((item, index) => `${index + 1}. ${item.reason}`).join('\n')}`
        : '';

    await ctx.reply(
      `📂 <b>Личное дело: ${username}</b>\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
        `🆔 ID: <code>${this.getDisplayTelegramId(result.user.telegram_id)}</code>\n` +
        `👤 Имя: ${fullName}\n` +
        `${statusEmoji} Статус: <b>${result.user.user_status}</b>\n` +
        `${result.user.user_status === 'Бан' ? `🚫 Причина бана: <i>${result.banReason ?? 'не указана'}</i>\n` : ''}` +
        `📅 В базе с: ${this.formatRussianDate(result.user.created_at)}\n` +
        `🎮 Последняя игра: ${this.formatRussianDate(result.user.last_game_at)}\n` +
        `🎲 Сыграно игр: <code>${result.user.games_count}</code>\n` +
        `⚠️ Предупреждения: <code>${result.user.warnings_count} / 2</code>` +
        warningsSummary,
      { parse_mode: 'HTML' },
    );
  }

  async handleUserAll(ctx: BotContextLike) {
    const grouped = this.moderation.listAllGrouped();
    const sections = [
      { key: 'Одобрен', emoji: '🟢' },
      { key: 'Бан', emoji: '🔴' },
      { key: 'На проверке', emoji: '🟡' },
      { key: 'Кандидат', emoji: '⚪️' },
    ];

    const blocks = sections
      .filter((section) => grouped[section.key]?.length)
      .map((section) => {
        const rows = grouped[section.key]
          .map((user, index) => {
            const username = user.username ? `@${user.username}` : `id:${user.telegram_id}`;
            const name = this.getDisplayName(user.first_name, user.last_name, 'не нажал(а) /start');
            return `  ${index + 1}. ${username} (${name})`;
          })
          .join('\n');

        return `${section.emoji} ${section.key} (${grouped[section.key].length}):\n${rows}`;
      });

    const text = blocks.length
      ? `📋 <b>Общий список участников</b>\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
        `${blocks.join('\n\n')}`
      : '📭 Пользователи не найдены.';

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  async handleUserWarn(ctx: BotContextLike, mention: string, reason: string) {
    if (!mention || !reason.trim()) {
      await ctx.reply('❌ <b>Ошибка:</b> используйте <code>/uwarn @username причина</code>', { parse_mode: 'HTML' });
      return;
    }

    const datedReason = `[${this.formatRussianDate(new Date().toISOString())}] ${reason.trim()}`;
    const result = this.moderation.warnByMention(mention, reason);
    if (!result.ok) {
      await ctx.reply('❌ Пользователь не найден.');
      return;
    }

    let text =
      `⚠️ <b>Вынесено предупреждение!</b>\n\n` +
      `👤 <b>Нарушитель:</b> @${result.user.username}\n` +
      `📊 <b>Счетчик:</b> <code>${result.user.warnings_count} / 2</code>\n` +
      `📝 <b>Причина:</b> <i>${datedReason}</i>`;

    if (result.autoBanned) {
      text += `\n\n🛑 <b>ЛИМИТ ПРЕВЫШЕН.</b> Пользователь автоматически отправлен в <b>БАН</b>.`;
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  async handleUserBan(ctx: BotContextLike, mention: string, reason: string) {
    if (!mention || !reason.trim()) {
      await ctx.reply('❌ <b>Ошибка:</b> используйте <code>/uban @username причина</code>', { parse_mode: 'HTML' });
      return;
    }

    const result = this.moderation.banByMention(mention, reason);
    if (!result.ok) {
      await ctx.reply('❌ Пользователь не найден.');
      return;
    }

    await ctx.reply(
      `🔴 <b>Пользователь забанен!</b>\n\n` +
      `👤 <b>Нарушитель:</b> @${result.user.username}\n` +
      `📝 <b>Причина:</b> <i>[${this.formatRussianDate(new Date().toISOString())}] ${reason.trim()}</i>`,
      { parse_mode: 'HTML' },
    );
  }

  async handleUserUnban(ctx: BotContextLike, mention: string) {
    await this.handleUsersStatusChange(ctx, [mention], 'Кандидат');
  }

  async handleUsersUnban(ctx: BotContextLike, mentions: string[]) {
    await this.handleUsersStatusChange(ctx, mentions, 'Кандидат');
  }

  async handleUserReview(ctx: BotContextLike, mention: string) {
    await this.handleUsersStatusChange(ctx, [mention], 'На проверке');
  }

  async handleUsersReview(ctx: BotContextLike, mentions: string[]) {
    await this.handleUsersStatusChange(ctx, mentions, 'На проверке');
  }

  async handleUserApprove(ctx: BotContextLike, mention: string) {
    await this.handleUsersStatusChange(ctx, [mention], 'Одобрен');
  }

  async handleUsersApprove(ctx: BotContextLike, mentions: string[]) {
    await this.handleUsersStatusChange(ctx, mentions, 'Одобрен');
  }

  async handleUserGame(ctx: BotContextLike, mention: string) {
    await this.handleUsersGame(ctx, [mention]);
  }

  async handleUsersGame(ctx: BotContextLike, mentions: string[]) {
    if (!mentions.length) {
      await ctx.reply('❌ <b>Ошибка:</b> укажите @username', { parse_mode: 'HTML' });
      return;
    }

    const lines: string[] = [];
    for (const mention of mentions) {
      const result = this.moderation.recordGameByMention(mention);
      lines.push(result.ok ? `🎮 ${mention}` : `❌ ${mention} (не найден)`);
    }

    await ctx.reply(
      `📆 <b>Даты игр обновлены:</b>\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n${lines.join('\n')}`,
      { parse_mode: 'HTML' },
    );
  }

  async handleUserHelp(ctx: BotContextLike) {
    await ctx.reply(
      `✨ <b>Система управления участниками</b>\n\n` +
      `👤 <b>Статусы:</b>\n` +
      `├ /uadd @ник — добавить кандидата\n` +
      `├ /ureview @ник — на проверку\n` +
      `└ /uapprove @ник — одобрить\n\n` +
      `🛡 <b>Модерация:</b>\n` +
      `├ /uwarn @ник причина — выдать пред\n` +
      `├ /uban @ник причина — заблокировать\n` +
      `├ /uremove @ник причина — удалить из базы\n` +
      `└ /uunban @ник — разбанить\n\n` +
      `📊 <b>Информация и списки:</b>\n` +
      `├ /uinfo @ник — личная карточка\n` +
      `├ /ulist статус — список по группе\n` +
      `├ /uall — все группы\n` +
      `└ /ugame @ник — обновить дату игры\n\n` +
      `<i>Доступные статусы для /ulist: Кандидат, На проверке, Одобрен, Бан</i>\n\n` +
      `<i>Для регистрации своего ID пользователь должен нажать /start в ЛС бота</i>`,
      { parse_mode: 'HTML' },
    );
  }

  async handleUserAdd(ctx: BotContextLike, mentions: string[]) {
    if (!mentions.length) {
      await ctx.reply('❌ <b>Ошибка:</b> укажите никнеймы через @', { parse_mode: 'HTML' });
      return;
    }

    const lines: string[] = [];
    for (const mention of mentions) {
      const result = this.moderation.addCandidate(mention);
      if (result.ok) {
        lines.push(result.created ? `📥 ${mention} добавлен` : `ℹ️ ${mention} уже в базе`);
      } else {
        lines.push(`❌ ${mention} (ошибка)`);
      }
    }

    await ctx.reply(`👥 <b>Обработка новых кандидатов:</b>\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n${lines.join('\n')}`, {
      parse_mode: 'HTML',
    });
  }

  async handleUserList(ctx: BotContextLike, statusInput: string) {
    const status = this.normalizeStatus(statusInput);
    const allowed = ['Кандидат', 'На проверке', 'Одобрен', 'Бан'];
    if (!status || !allowed.includes(status)) {
      await ctx.reply(
        `📂 <b>Справочник статусов</b>\n\n` +
          `Укажите один из доступных вариантов:\n` +
          `• <code>Кандидат</code>\n• <code>На проверке</code>\n• <code>Одобрен</code>\n• <code>Бан</code>\n\n` +
          `📝 Пример: <code>/ulist Одобрен</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const users = this.moderation.listByStatus(status);
    if (!users.length) {
      await ctx.reply(`💨 <b>Группа "${status}" пока пуста.</b>\nТут пока никого нет...`, { parse_mode: 'HTML' });
      return;
    }

    const icon = this.getStatusEmoji(status);
    const list = users
      .map((u, i) => {
        const fullName = this.getDisplayName(u.first_name, u.last_name, '👤');
        return `${this.toEmojiNumber(i + 1)} @${u.username} — <i>${fullName}</i>`;
      })
      .join('\n');

    await ctx.reply(
      `📂 <b>Реестр участников</b>\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
        `🏷 <b>Статус:</b> <code>${status}</code> ${icon}\n` +
        `👥 <b>Всего в группе:</b> <code>${users.length}</code>\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
        `${list}`,
      { parse_mode: 'HTML' },
    );
  }

  async handleUserRemove(ctx: BotContextLike, mention: string, reason: string) {
    if (!mention || !reason.trim()) {
      await ctx.reply('❌ <b>Ошибка:</b> используйте <code>/uremove @username причина</code>', { parse_mode: 'HTML' });
      return;
    }

    const result = this.moderation.removeByMention(mention, reason.trim());
    if (!result.ok) {
      if (result.reason === 'HAS_CREATED_GAMES') {
        await ctx.reply(`❌ Нельзя удалить ${mention}: пользователь создал игры.`);
        return;
      }
      await ctx.reply(`❌ Пользователь ${mention} не найден.`);
      return;
    }

    await ctx.reply(
      `🗑 <b>Пользователь удален!</b>\n\n` +
      `👤 <b>${mention}</b> стерт из базы.\n` +
      `📝 <b>Причина:</b> <i>${reason.trim()}</i>`,
      { parse_mode: 'HTML' },
    );
  }

  async handleAll(ctx: BotContextLike) {
    await ctx.reply(`📋 <b>Список игр:</b>\n\n${this.games.getAllGamesSummary()}`, { parse_mode: 'HTML' });
  }

  async handleId(ctx: BotContextLike) {
    await ctx.reply(
      `👤 User: <code>${ctx.from?.id ?? 'unknown'}</code>\n📍 Chat: <code>${ctx.chat.id}</code>\n🧵 Topic: <code>${ctx.message?.message_thread_id ?? 'Main'}</code>`,
      { parse_mode: 'HTML' },
    );
  }

  async handleCreate(ctx: BotContextLike) {
    await this.createFlow.start(ctx);
  }

  handleCreateTypeCallback(telegramUserId: number, type: 'DND' | 'MAFIA') {
    return this.createFlow.applyTypeSelection(telegramUserId, type);
  }

  async handleApprove(ctx: BotContextLike, gameIdText: string) {
    if (!ctx.from) {
      return;
    }

    const gameId = Number.parseInt(gameIdText, 10);
    if (Number.isNaN(gameId)) {
      await ctx.reply('⚠️ Укажите ID: <code>/approve 5</code>', { parse_mode: 'HTML' });
      return;
    }

    const players = this.games.getDisplayPlayers(gameId)?.map((item) => item.replace('✅', '').trim()) ?? null;
    const game = this.games.getById(gameId);

    if (!game || game.status !== 'OPEN') {
      await ctx.reply('❌ Набор закрыт или игра не найдена.');
      return;
    }

    if (!players || players.length === 0) {
      await ctx.reply('📭 Список пуст.');
      return;
    }

    const state: ApprovePlayersState = { flow: 'APPROVE_PLAYERS', gameId, players };
    this.sessions.set(ctx.from.id, state);
    await ctx.reply(
      `✅ <b>Выбор игроков (#${gameId})</b>\n\n${players.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\nВведите номера через пробел:`,
      { parse_mode: 'HTML' },
    );
  }

  async handleSheets(ctx: BotContextLike, gameIdText: string) {
    if (!ctx.from) {
      return;
    }

    const gameId = Number.parseInt(gameIdText, 10);
    if (Number.isNaN(gameId)) {
      await ctx.reply('⚠️ Укажите ID: <code>/sheets 4</code>', { parse_mode: 'HTML' });
      return;
    }

    const pendingPlayers = this.games.getPendingSheetPlayers(gameId);
    if (pendingPlayers === null) {
      await ctx.reply('❌ Игра не найдена.');
      return;
    }

    if (pendingPlayers.length === 0) {
      await ctx.reply('🎉 Все игроки этой игры уже сдали анкеты!');
      return;
    }

    const state: SheetsPendingSelectionState = { flow: 'SHEETS_PENDING_SELECTION', gameId, pendingPlayers };
    this.sessions.set(ctx.from.id, state);
    await ctx.reply(
      `📝 <b>Кто сдал анкеты (#${gameId})?</b>\n\n${pendingPlayers.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\nВведите номера через пробел:`,
      { parse_mode: 'HTML' },
    );
  }

  async handleEdit(ctx: BotContextLike, gameIdText: string) {
    if (!ctx.from) {
      return;
    }

    const gameId = Number.parseInt(gameIdText, 10);
    const game = Number.isNaN(gameId) ? null : this.games.getById(gameId);
    if (!game) {
      await ctx.reply('❌ Игра не найдена.');
      return;
    }

    const state: EditChooseFieldState = {
      flow: 'EDIT_CHOOSE_FIELD',
      gameId,
      threadId: ctx.message?.message_thread_id ?? null,
    };

    this.sessions.set(ctx.from.id, state);
    await this.sendEditFieldSelection(ctx, gameId);
  }

  async handleCancel(ctx: BotContextLike, gameIdText: string) {
    const gameId = Number.parseInt(gameIdText, 10);
    const ok = !Number.isNaN(gameId) && this.games.cancelGame(gameId);
    if (ok) {
      await this.announcements.refreshGame(gameId, '⚠️ <b>Игра отменена мастером.</b>');
    }
    await ctx.reply(ok ? '❌ Игра отменена.' : '❌ Ошибка ID.');
  }

  async handleDelete(ctx: BotContextLike, gameIdText: string) {
    try {
      const gameId = Number.parseInt(gameIdText, 10);
      if (Number.isNaN(gameId)) {
        await ctx.reply('❌ Ошибка ID.');
        return;
      }

      const game = this.games.getById(gameId);
      if (!game) {
        await ctx.reply('❌ Ошибка ID.');
        return;
      }

      if (game.announcement_message_id) {
        await this.announcements.deleteAnnouncementMessage(game.announcement_message_id);
      }

      const ok = this.games.deleteGame(gameId);
      await ctx.reply(ok ? '✅ Удалено.' : '❌ Ошибка ID.');
    } catch (error) {
      console.error('Failed to delete game:', error);
      await ctx.reply('❌ Не удалось удалить игру. Проверьте связанные записи.');
    }
  }

  async handleStartNow(ctx: BotContextLike, gameIdText: string) {
    const gameId = Number.parseInt(gameIdText, 10);
    const ok = !Number.isNaN(gameId) && this.games.startGameNow(gameId);
    if (ok) {
      await this.announcements.refreshGame(gameId);
      await this.announcements.sendStartedNow(gameId);
    }
    await ctx.reply(ok ? '🚀 Поехали!' : '❌ Ошибка ID.');
  }

  async handleStateMessage(ctx: BotContextLike, state: WizardState, userId: number) {
    switch (state.flow) {
      case 'CREATE':
        await this.createFlow.handle(ctx, state, userId);
        return;
      case 'APPROVE_PLAYERS':
        await this.handleApproveInput(ctx, state);
        return;
      case 'SHEETS_PENDING_SELECTION':
        await this.handleSheetsInput(ctx, state);
        return;
      case 'EDIT_INPUT_VALUE':
        await this.handleEditInput(ctx, state);
        return;
      default:
        return;
    }
  }

  async handleEditFieldCallback(telegramUserId: number, gameId: number, field: EditInputValueState['targetField']) {
    const existing = this.sessions.get(telegramUserId);
    if (!existing || existing.flow !== 'EDIT_CHOOSE_FIELD' || existing.gameId !== gameId) {
      return { ok: false as const, text: '⚠️ Сессия истекла. Используйте /edit снова.', alert: true };
    }

    this.sessions.set(telegramUserId, {
      flow: 'EDIT_INPUT_VALUE',
      gameId,
      threadId: existing.threadId,
      targetField: field,
    });

    const game = this.games.getById(gameId);
    const currentValue = this.describeFieldValue(gameId, field);
    let text = `📝 <b>Редактирование: ${this.getFieldLabel(field)}</b>\nТекущее значение: <code>${currentValue}</code>\n\n`;

    if (field === 'image_file_id') {
      text += '🖼 <b>Пришлите новое ФОТО для игры.</b>\nПожалуйста, отправляйте именно как фотографию, а не файл.';
    } else if (field === 'datetime') {
      text += '💡 <b>Как вводить:</b>\n• <code>19:00</code>\n• <code>25.03 20:00</code>';
    } else {
      text += 'Введите новое значение:';
    }

    return { ok: true as const, prompt: text, game };
  }

  private async handleApproveInput(ctx: BotContextLike, state: ApprovePlayersState) {
    if (!ctx.from || !ctx.message?.text) {
      return;
    }

    const indices = ctx.message.text
      .split(/\s+/)
      .map((item) => Number.parseInt(item, 10) - 1)
      .filter((item) => !Number.isNaN(item) && item >= 0 && item < state.players.length);

    if (indices.length === 0) {
      await ctx.reply('⚠️ Введите корректные номера (например: 1 2).');
      return;
    }

    const success = this.games.approveSelectedPlayers(state.gameId, indices);
    if (success) {
      await this.announcements.refreshGame(state.gameId);
      this.sessions.clear(ctx.from.id);
      await ctx.reply('✅ Группа утверждена, анонс обновлен.');
    }
  }

  private async handleSheetsInput(ctx: BotContextLike, state: SheetsPendingSelectionState) {
    if (!ctx.from || !ctx.message?.text) {
      return;
    }

    const indices = ctx.message.text
      .split(/\s+/)
      .map((item) => Number.parseInt(item, 10) - 1)
      .filter((item) => !Number.isNaN(item) && item >= 0 && item < state.pendingPlayers.length);

    if (indices.length === 0) {
      await ctx.reply('⚠️ Введите корректные номера из списка выше.');
      return;
    }

    const selected = indices.map((index) => state.pendingPlayers[index]);
    const result = this.games.markSheetsSubmitted(state.gameId, selected);
    this.sessions.clear(ctx.from.id);
    await ctx.reply(result);
  }

  private async handleEditInput(ctx: BotContextLike, state: EditInputValueState) {
    if (!ctx.from) {
      return;
    }

    const game = this.games.getById(state.gameId);
    if (!game) {
      await ctx.reply('❌ Ошибка: Игра не найдена в базе.');
      this.sessions.clear(ctx.from.id);
      return;
    }

    const text = ctx.message?.text?.trim() ?? '';
    const photo = ctx.message?.photo?.at(-1)?.file_id;
    let displayFieldName = this.getFieldSuccessLabel(state.targetField);

    switch (state.targetField) {
      case 'title':
        this.games.updateGameField({ gameId: state.gameId, title: text });
        break;
      case 'gm_name':
        this.games.updateGameField({ gameId: state.gameId, gmName: text });
        break;
      case 'description':
        this.games.updateGameField({ gameId: state.gameId, description: text });
        break;
      case 'image_file_id':
        if (!photo) {
          await ctx.reply('❌ Ошибка! Чтобы обновить картинку, пришлите <b>ФОТО</b> (не файл).', { parse_mode: 'HTML' });
          return;
        }
        this.games.updateGameField({ gameId: state.gameId, imageFileId: photo });
        displayFieldName = 'Изображение';
        break;
      case 'registration_limit': {
        const digits = text.replace(/\D/g, '');
        if (!digits) {
          await ctx.reply('❌ Введите число мест.');
          return;
        }
        const count = Number.parseInt(digits, 10);
        this.games.updateGameField({
          gameId: state.gameId,
          registrationLimit: count,
          participantSlotsText: `Нужно ${count} чел.`,
        });
        break;
      }
      case 'registered_players_text':
        this.games.updateGameField({
          gameId: state.gameId,
          registeredPlayersText: text
            .split(/[,;\n]+/)
            .map((item) => item.trim())
            .filter(Boolean)
            .join(','),
        });
        break;
      case 'datetime': {
        const value = this.parseEditDateTime(game.starts_at, text);
        if (!value) {
          await ctx.reply('❌ Ошибка! Используйте формат:\nДД.ММ ЧЧ:ММ или просто ЧЧ:ММ');
          return;
        }
        this.games.updateGameField({ gameId: state.gameId, startsAt: value });
        displayFieldName = 'Дата и время';
        break;
      }
    }

    await this.announcements.refreshGame(state.gameId);
    this.sessions.clear(ctx.from.id);
    await ctx.reply(`✅ <b>Поле "${displayFieldName}" обновлено!</b>\nАнонс в канале актуализирован.`, {
      parse_mode: 'HTML',
    });
  }

  private async sendEditFieldSelection(ctx: BotContextLike, gameId: number) {
    const game = this.games.getById(gameId);
    if (!game) {
      return;
    }

    const keyboard = [
      [{ text: '📝 Название', callback_data: `edit_field_title_${gameId}` }],
      [{ text: '🧙‍♂️ Мастер (ГМ)', callback_data: `edit_field_gm_name_${gameId}` }],
      [{ text: '📅 Дата и время', callback_data: `edit_field_datetime_${gameId}` }],
      [{ text: '📜 Описание', callback_data: `edit_field_description_${gameId}` }],
      [{ text: '🖼 Изменить картинку', callback_data: `edit_field_image_file_id_${gameId}` }],
      ...(game.status !== 'FULL' ? [[{ text: '👥 Кол-во мест', callback_data: `edit_field_registration_limit_${gameId}` }]] : []),
      [{ text: '⚔️ Список игроков', callback_data: `edit_field_registered_players_text_${gameId}` }],
    ];

    const dateTime = new Date(game.starts_at);
    const formatted = `${String(dateTime.getDate()).padStart(2, '0')}.${String(dateTime.getMonth() + 1).padStart(2, '0')}.${dateTime.getFullYear()} ${String(dateTime.getHours()).padStart(2, '0')}:${String(dateTime.getMinutes()).padStart(2, '0')}`;

    await ctx.reply(
      `🛠 <b>Редактирование игры #${game.id}</b>\n` +
        `────────────────────\n` +
        `🔹 <b>Название:</b> <code>${game.title}</code>\n` +
        `🔹 <b>Мастер:</b> <code>${game.gm_name ?? 'пусто'}</code>\n` +
        `🔹 <b>Дата/Время:</b> <code>${formatted}</code>\n` +
        `🔹 <b>Места:</b> <code>${game.participant_slots_text ?? 'пусто'}</code>\n` +
        `🔹 <b>Игроки:</b> <code>${game.registered_players_text || 'пусто'}</code>\n` +
        `────────────────────\n` +
        `Что именно вы хотите изменить?`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      },
    );
  }

  private describeFieldValue(gameId: number, field: EditInputValueState['targetField']) {
    const game = this.games.getById(gameId);
    if (!game) {
      return 'пусто';
    }

    switch (field) {
      case 'title':
        return game.title;
      case 'gm_name':
        return game.gm_name ?? 'пусто';
      case 'description':
        return game.description ?? 'пусто';
      case 'image_file_id':
        return 'Текущее фото';
      case 'registration_limit':
        return game.participant_slots_text ?? 'пусто';
      case 'registered_players_text':
        return game.registered_players_text || 'пусто';
      case 'datetime': {
        const date = new Date(game.starts_at);
        return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
    }
  }

  private getFieldLabel(field: EditInputValueState['targetField']) {
    const labels: Record<EditInputValueState['targetField'], string> = {
      title: 'Название',
      gm_name: 'гм',
      datetime: 'datetime',
      description: 'описание',
      image_file_id: 'картинка_file_id',
      registration_limit: 'участники',
      registered_players_text: 'зарегистрированные',
    };

    return labels[field];
  }

  private getFieldSuccessLabel(field: EditInputValueState['targetField']) {
    const labels: Record<EditInputValueState['targetField'], string> = {
      title: 'Название',
      gm_name: 'ГМ',
      datetime: 'Дата и время',
      description: 'Описание',
      image_file_id: 'Изображение',
      registration_limit: 'Кол-во мест',
      registered_players_text: 'Список игроков',
    };

    return labels[field];
  }

  private parseEditDateTime(currentStartsAt: string, input: string) {
    const current = new Date(currentStartsAt);

    if (/^\d{1,2}[:.]\d{2}$/.test(input)) {
      const [hours, minutes] = input.replace('.', ':').split(':').map((item) => Number.parseInt(item, 10));
      current.setHours(hours, minutes, 0, 0);
      return current.toISOString();
    }

    if (/^\d{1,2}\.\d{1,2}\s+\d{1,2}[:.]\d{2}$/.test(input)) {
      const [datePart, timePart] = input.split(/\s+/);
      const [day, month] = datePart.split('.').map((item) => Number.parseInt(item, 10));
      const [hours, minutes] = timePart.replace('.', ':').split(':').map((item) => Number.parseInt(item, 10));
      return new Date(current.getFullYear(), month - 1, day, hours, minutes, 0, 0).toISOString();
    }

    return null;
  }

  private getStatusEmoji(status: string) {
    const emojis: Record<string, string> = {
      'Одобрен': '🟢',
      'Бан': '🔴',
      'На проверке': '🟡',
      'Кандидат': '⚪️',
      'Не зарегистрирован': '⚫️',
    };

    return emojis[status] ?? '⚪️';
  }

  private getDisplayName(firstName: string | null, lastName: string | null, fallback = '—') {
    const name = [firstName ?? '', lastName ?? ''].join(' ').trim();
    return name || fallback;
  }

  private formatRussianDate(value: string | null) {
    if (!value) {
      return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    const mskDate = new Date(date.getTime() + 3 * 60 * 60 * 1000);

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

    const day = mskDate.getUTCDate();
    const month = months[mskDate.getUTCMonth()];
    const year = mskDate.getUTCFullYear();
    const hours = String(mskDate.getUTCHours()).padStart(2, '0');
    const minutes = String(mskDate.getUTCMinutes()).padStart(2, '0');

    return `${day} ${month} ${year}г. ${hours}:${minutes} по мск`;
  }

  private normalizeStatus(value: string) {
    const raw = value.trim();
    const aliases: Record<string, string> = {
      candidate: 'Кандидат',
      'на проверке': 'На проверке',
      review: 'На проверке',
      approved: 'Одобрен',
      ban: 'Бан',
      banned: 'Бан',
      кандидат: 'Кандидат',
      одобрен: 'Одобрен',
      бан: 'Бан',
    };

    return aliases[raw.toLowerCase()] ?? raw;
  }

  private toEmojiNumber(num: number) {
    const emojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    return String(num)
      .split('')
      .map((digit) => emojis[Number.parseInt(digit, 10)] ?? digit)
      .join('');
  }

  private getDisplayTelegramId(telegramId: number) {
    return telegramId >= 8_000_000_000 ? 'Неизвестен (пусть нажмет /start)' : String(telegramId);
  }

  private async handleUsersStatusChange(
    ctx: BotContextLike,
    mentions: string[],
    status: 'Кандидат' | 'На проверке' | 'Одобрен',
  ) {
    const validMentions = mentions.filter(Boolean);
    if (!validMentions.length) {
      await ctx.reply('❌ <b>Ошибка:</b> не указаны @username 🤷‍♂️', { parse_mode: 'HTML' });
      return;
    }

    const icon = this.getStatusEmoji(status);

    if (validMentions.length === 1) {
      const result = this.moderation.changeStatusByMention(validMentions[0], status);
      if (!result.ok) {
        await ctx.reply(`❌ <b>Ошибка:</b> пользователь <b>${validMentions[0]}</b> не найден в базе 🔎`, { parse_mode: 'HTML' });
        return;
      }

      await ctx.reply(
        `✅ <b>Статус обновлен!</b>\n\n` +
          `👤 <b>${validMentions[0]}</b> переведен в группу: <code>${status}</code> ${icon}`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const lines: string[] = [];
    for (const mention of validMentions) {
      const result = this.moderation.changeStatusByMention(mention, status);
      lines.push(result.ok ? `✅ ${mention}` : `❌ ${mention} (не найден)`);
    }

    await ctx.reply(
      `🎭 <b>Массовое обновление:</b> <code>${status}</code> ${icon}\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
        `${lines.join('\n')}\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
        `✨ Операция завершена!`,
      { parse_mode: 'HTML' },
    );
  }
}
