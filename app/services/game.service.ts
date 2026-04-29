import { env } from '../config/env';
import { GameRepository, type GameRecord } from '../repositories/game.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { formatMoscowDate, formatMoscowTime, parseMoscowDateTime } from '../utils/moscow-time';

const supportedTypes = new Set(['DND', 'MAFIA', 'OTHER']);
const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export class GameService {
  constructor(
    private readonly games = new GameRepository(),
    private readonly registrations = new RegistrationRepository(),
  ) {}

  createGame(payload: {
    type: string;
    title: string;
    description?: string | null;
    startsAtInput: string;
    gmName?: string | null;
    registrationLimit?: number;
    imageFileId?: string | null;
    participantSlotsText?: string | null;
    registeredPlayersText?: string;
    status?: 'OPEN' | 'FULL' | 'CANCELLED' | 'DONE';
    createdByUserId: number;
  }) {
    const type = payload.type.toUpperCase();
    if (!supportedTypes.has(type)) {
      return { ok: false as const, reason: 'INVALID_TYPE' };
    }

    const startsAt = parseMoscowDateTime(payload.startsAtInput);
    if (!startsAt) {
      return { ok: false as const, reason: 'INVALID_DATE' };
    }

    if (payload.registrationLimit !== undefined && payload.registrationLimit <= 0) {
      return { ok: false as const, reason: 'INVALID_LIMIT' };
    }

    const game = this.games.create({
      type,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      startsAt,
      gmName: payload.gmName ?? null,
      registrationLimit: payload.registrationLimit,
      participantSlotsText: payload.participantSlotsText ?? this.buildParticipantSlotsText(payload.registrationLimit),
      registeredPlayersText: payload.registeredPlayersText ?? '',
      imageFileId: payload.imageFileId ?? null,
      status: payload.status ?? 'OPEN',
      createdByUserId: payload.createdByUserId,
    });

    return { ok: true as const, game };
  }

  listUpcomingDetailed() {
    return this.games.listUpcoming().map((game) => ({
      ...game,
      confirmedCount: this.extractDisplayPlayers(game).length,
    }));
  }

  listAllDetailed() {
    return this.games.listAll().map((game) => ({
      ...game,
      confirmedCount: this.extractDisplayPlayers(game).length,
      registrations: this.registrations.listByGame(game.id),
    }));
  }

  refreshStatus(gameId: number) {
    const game = this.games.findById(gameId);
    if (!game) {
      return;
    }

    if (!game.registration_limit) {
      this.games.setStatus(game.id, 'OPEN');
      return;
    }

    const confirmedCount = this.registrations.countConfirmedByGame(game.id);
    this.games.setStatus(game.id, confirmedCount >= game.registration_limit ? 'FULL' : 'OPEN');
  }

  syncRegisteredPlayersText(gameId: number) {
    const game = this.games.findById(gameId);
    if (!game) {
      return;
    }

    const activePlayers = this.registrations
      .listByGame(gameId)
      .filter((item) => item.status !== 'CANCELLED')
      .map((item) => this.toDisplayUsername(item));

    this.games.updateGameFields({
      id: gameId,
      registeredPlayersText: activePlayers.join(','),
    });
  }

  getById(id: number) {
    return this.games.findById(id);
  }

  getDetailedById(id: number) {
    return this.listAllDetailed().find((game) => game.id === id) ?? null;
  }

  getDisplayPlayers(gameId: number) {
    const game = this.games.findById(gameId);
    return game ? this.extractDisplayPlayers(game) : null;
  }

  saveAnnouncementMessage(gameId: number, messageId: number) {
    this.games.updateAnnouncementData({
      id: gameId,
      announcementChatId: env.MAIN_CHAT_ID,
      announcementThreadId: env.ANNOUNCEMENT_TOPIC_ID || null,
      announcementMessageId: messageId,
    });
  }

  clearAnnouncementMessage(gameId: number) {
    this.games.clearAnnouncementData(gameId);
  }

  formatAnnouncement(game: GameRecord) {
    const date = new Date(game.starts_at);
    const players = this.extractDisplayPlayers(game);
    const list = players.length
      ? players
          .map((item, index) => `${numberEmojis[index] ?? `${index + 1}.`} ${item}`)
          .join('\n')
      : '<i>Места пока вакантны</i>';

    const section = this.getParticipantsSection(game, list);

    return `🎮 <b>ПРИКЛЮЧЕНИЕ: ${game.title}</b>\n\n` +
      `📅 <b>Дата:</b> <code>${this.formatDate(date)}</code>\n` +
      `⏰ <b>Время:</b> <code>${this.formatTime(date)}</code> (МСК)\n` +
      `🧙‍♂️ <b>Мастер:</b> ${game.gm_name ?? '<i>Не указан</i>'}\n\n` +
      `${section}\n\n` +
      `📜 <b>О приключении:</b>\n<i>${game.description ?? 'Описание уточняется...'}</i>\n\n` +
      `📌 <b>Статус:</b> ${this.getStatusLabel(game.status)}`;
  }

  formatUpcomingList() {
    const now = new Date();
    const horizon = new Date();
    horizon.setDate(now.getDate() + 10);

    const items = this.games
      .listAll()
      .filter((game) => ['OPEN', 'FULL'].includes(game.status))
      .filter((game) => {
        const date = new Date(game.starts_at);
        return date >= now && date <= horizon;
      })
      .map((game) => this.formatUpcomingSnippet(game));

    if (items.length === 0) {
      return '🗓 <b>На ближайшие 10 дней игр не запланировано.</b>\nЗагляните позже!';
    }

    return `🗓 <b>Расписание игр на 10 дней:</b>\n\n${items.join('\n\n')}`;
  }

  getAllGamesSummary() {
    const active = this.games.listAll().filter((game) => ['OPEN', 'FULL'].includes(game.status));
    if (active.length === 0) {
      return '📭 Запланированных игр нет.';
    }

    return active
      .map((game) => `🔹 <b>ID: ${game.id}</b> — ${game.title}\n📅 ${this.formatDate(new Date(game.starts_at))} | ${this.getSummaryStatusLabel(game.status)}\n───`)
      .join('\n');
  }

  approveSelectedPlayers(gameId: number, selectedIndices: number[]) {
    const game = this.games.findById(gameId);
    if (!game) {
      return false;
    }

    const sourcePlayers = this.extractDisplayPlayers(game).map((item) => item.replace('✅', '').trim());
    const approvedPlayers = sourcePlayers.filter((_, index) => selectedIndices.includes(index));

    if (approvedPlayers.length === 0) {
      return false;
    }

    const registrations = this.registrations.listByGame(gameId).filter((item) => item.status !== 'CANCELLED');
    const approved = registrations.filter((_, index) => selectedIndices.includes(index));

    this.registrations.cancelAllForGame(gameId);
    this.registrations.setStatusByIds(approved.map((item) => item.id), 'CONFIRMED');

    this.games.updateGameFields({
      id: gameId,
      status: 'FULL',
      registeredPlayersText: approvedPlayers.map((item) => `${item} ✅`).join(','),
    });

    return true;
  }

  cancelGame(gameId: number) {
    const game = this.games.findById(gameId);
    if (!game) {
      return false;
    }

    this.games.updateGameFields({ id: gameId, status: 'CANCELLED' });
    return true;
  }

  startGameNow(gameId: number) {
    const game = this.games.findById(gameId);
    if (!game) {
      return false;
    }

    this.games.updateGameFields({ id: gameId, status: 'DONE' });
    return true;
  }

  deleteGame(gameId: number) {
    return this.games.deleteById(gameId);
  }

  updateGameField(payload: {
    gameId: number;
    type?: string;
    title?: string;
    description?: string | null;
    startsAt?: string;
    gmName?: string | null;
    registrationLimit?: number | null;
    participantSlotsText?: string | null;
    registeredPlayersText?: string;
    imageFileId?: string | null;
    reminder24hSentAt?: string | null;
    reminder1hSentAt?: string | null;
    submittedSheetUsers?: string;
    status?: string;
  }) {
    this.games.updateGameFields({
      id: payload.gameId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      startsAt: payload.startsAt,
      gmName: payload.gmName,
      registrationLimit: payload.registrationLimit,
      participantSlotsText: payload.participantSlotsText,
      registeredPlayersText: payload.registeredPlayersText,
      imageFileId: payload.imageFileId,
      reminder24hSentAt: payload.reminder24hSentAt,
      reminder1hSentAt: payload.reminder1hSentAt,
      submittedSheetUsers: payload.submittedSheetUsers,
      status: payload.status,
    });
  }

  getPendingSheetPlayers(gameId: number) {
    const game = this.games.findById(gameId);
    if (!game) {
      return null;
    }

    const allPlayers = this.extractDisplayPlayers(game).map((item) => item.replace('✅', '').trim());
    const submitted = game.submitted_sheet_users
      .split(',')
      .map((item) => item.trim().replace('@', '').toLowerCase())
      .filter(Boolean);

    return allPlayers.filter((item) => {
      const normalized = item.replace('@', '').toLowerCase();
      return normalized && !submitted.includes(normalized);
    });
  }

  markSheetsSubmitted(gameId: number, usernames: string[]) {
    const game = this.games.findById(gameId);
    if (!game) {
      return '❌ Игра не найдена.';
    }

    const currentList = game.submitted_sheet_users
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const updated = new Set([
      ...currentList,
      ...usernames.map((item) => item.replace('@', '').toLowerCase().trim()),
    ]);

    this.games.updateGameFields({
      id: gameId,
      submittedSheetUsers: Array.from(updated).join(','),
    });

    const formattedPlayers = usernames.map((username, index) => `${index + 1}. ${username}`).join('\n');
    return (
      `✅ <b>Анкеты отмечены</b>\n\n` +
      `🎮 Игра: <b>${game.title}</b> (#${gameId})\n` +
      `👥 Отмечены как сдавшие:\n${formattedPlayers}`
    );
  }

  private formatUpcomingSnippet(game: GameRecord) {
    const date = new Date(game.starts_at);
    const count = this.extractDisplayPlayers(game).length;
    const seatsInfo = game.status === 'OPEN'
      ? `\n👥 <b>Места:</b> ${count}/${this.extractParticipantLimit(game) ?? '∞'}`
      : '';
    const linkSection =
      game.announcement_message_id && env.MAIN_CHAT_ID
        ? `\n👉 <a href="${this.channelBaseUrl()}/${game.announcement_message_id}?topic=${env.ANNOUNCEMENT_TOPIC_ID}">${game.status === 'OPEN' ? 'Записаться на игру' : 'Посмотреть пост'}</a>`
        : '';

    return [
      `🔹 <b>${game.title}</b>`,
      `📅 ${this.formatDate(date)} г. ${this.formatTime(date)} по МСК${seatsInfo}`,
      `🎭 Мастер: ${game.gm_name ?? 'не указан'}${linkSection}`,
      `──────────────────`,
    ].join('\n');
  }

  private getParticipantsSection(game: GameRecord, list: string) {
    if (game.status === 'CANCELLED') {
      return '🚫 <b>Экспедиция не состоится.</b>';
    }

    if (game.status === 'OPEN') {
      return `👥 <b>Мест:</b> ${game.participant_slots_text ?? game.registration_limit ?? '—'}\n📝 <b>Заявки:</b>\n${list}`;
    }

    return `⚔️ <b>Состав отряда:</b>\n${list}`;
  }

  private getStatusLabel(status: string) {
    const labels: Record<string, string> = {
      OPEN: '🔵 Идет набор героев',
      FULL: '🟢 Группа сформирована',
      DONE: '🏁 Приключение завершено',
      CANCELLED: '❌ Игра отменена',
    };

    return labels[status] ?? '⚪️ Статус неизвестен';
  }

  private getSummaryStatusLabel(status: string) {
    const labels: Record<string, string> = {
      OPEN: 'Идет набор',
      FULL: 'Группа собрана',
      DONE: 'Игра завершена',
      CANCELLED: 'Отменена',
    };

    return labels[status] ?? 'Статус неизвестен';
  }

  private formatDate(value: Date) {
    return formatMoscowDate(value);
  }

  private formatTime(value: Date) {
    return formatMoscowTime(value);
  }

  private channelBaseUrl() {
    const cleanId = String(env.MAIN_CHAT_ID).replace('-100', '');
    return `https://t.me/c/${cleanId}`;
  }

  private extractDisplayPlayers(game: GameRecord) {
    if (game.registered_players_text?.trim()) {
      return game.registered_players_text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return this.registrations
      .listByGame(game.id)
      .filter((item) => item.status !== 'CANCELLED')
      .map((item) => this.toDisplayUsername(item));
  }

  private toDisplayUsername(item: {
    username: string | null;
    first_name: string | null;
    telegram_id: number;
  }) {
    return item.username ? `@${item.username}` : item.first_name ?? String(item.telegram_id);
  }

  private buildParticipantSlotsText(registrationLimit?: number | null) {
    if (!registrationLimit) {
      return null;
    }

    return `Нужно ${registrationLimit} чел.`;
  }

  private extractParticipantLimit(game: GameRecord) {
    if (game.registration_limit) {
      return game.registration_limit;
    }

    const match = String(game.participant_slots_text ?? '').match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : null;
  }
}
