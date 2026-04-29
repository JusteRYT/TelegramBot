import { Bot } from 'grammy';

import { env } from '../config/env';
import { formatMoscowDate, formatMoscowTime } from '../utils/moscow-time';

import { AnnouncementService } from './announcement.service';
import { ExternalValidationService } from './external-validation.service';
import { GameService } from './game.service';
import { LeaderboardService } from './leaderboard.service';

export class ReminderSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private lastRunKeys = new Set<string>();

  constructor(
    private readonly bot: Bot,
    private readonly announcements = new AnnouncementService(bot),
    private readonly games = new GameService(),
    private readonly externalValidation = new ExternalValidationService(),
    private readonly leaderboard = new LeaderboardService(),
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        console.error('Scheduler tick failed:', error);
      });
    }, 60_000);

    void this.tick().catch((error) => {
      console.error('Initial scheduler tick failed:', error);
    });
  }

  async runOnce() {
    await this.tick();
  }

  private async tick() {
    await this.processGameReminders();
    await this.processSheetReminders();
    await this.processInactivityReminders();
    await this.processLeaderboardRefresh();
  }

  private async processGameReminders() {
    const games = this.games.listAllDetailed().filter((game) => ['OPEN', 'FULL'].includes(game.status));
    const now = new Date();

    for (const game of games) {
      const startsAt = new Date(game.starts_at);
      const diffMinutes = Math.round((startsAt.getTime() - now.getTime()) / (1000 * 60));
      const diffHours = diffMinutes / 60;

      if (diffHours <= 24 && diffHours > 1 && !game.reminder_24h_sent_at) {
        await this.sendGameReminder(game.id, 24, diffMinutes);
        this.games.updateGameField({ gameId: game.id, reminder24hSentAt: new Date().toISOString() });
      }

      if (diffHours <= 1 && diffHours > 0 && !game.reminder_1h_sent_at) {
        await this.sendGameReminder(game.id, 1, diffMinutes);
        this.games.updateGameField({ gameId: game.id, reminder1hSentAt: new Date().toISOString() });
      }

      if (diffHours <= 0 && game.status !== 'DONE' && game.status !== 'CANCELLED') {
        const ok = this.games.startGameNow(game.id);
        if (ok) {
          await this.announcements.refreshGame(game.id);
          await this.announcements.sendStartedNow(game.id);
          const players = this.games
            .getDisplayPlayers(game.id)
            ?.map((item) => item.replace('✅', '').trim())
            .filter(Boolean) ?? [];
          const tags = [game.gm_name ?? '', ...players].filter(Boolean);
          await this.externalValidation.notifyGameStarted(tags);
        }
      }
    }
  }

  private async processSheetReminders() {
    const now = this.toMoscowDate(new Date());
    const runKey = `sheet-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const targetHour = now.getHours();

    if (![10, 20].includes(targetHour) || now.getMinutes() > 5 || this.lastRunKeys.has(runKey)) {
      return;
    }

    this.lastRunKeys.add(runKey);
    const games = this.games.listAllDetailed().filter((game) => ['OPEN', 'FULL'].includes(game.status) && game.type === 'DND');

    for (const game of games) {
      const pendingPlayers = this.games.getPendingSheetPlayers(game.id) ?? [];
      if (pendingPlayers.length === 0) {
        continue;
      }

      const gameLink = game.announcement_message_id
        ? `${this.channelBaseUrl()}/${game.announcement_message_id}`
        : null;

      for (const username of pendingPlayers) {
        const clean = username.replace('@', '').trim().toLowerCase();
        const player = game.registrations.find((item) => (item.username ?? '').toLowerCase() === clean);
        if (!player) {
          continue;
        }

        const text =
          `📝 <b>Напоминание об анкете!</b>\n\n` +
          `Вы записаны на игру: ${gameLink ? `<a href="${gameLink}"><b>"${game.title}"</b></a>` : `<b>"${game.title}"</b>`}\n` +
          `Для участия мастеру необходима ваша анкета персонажа.\n\n` +
          `👉 Пожалуйста, отправьте её ГМу: ${game.gm_name ?? 'мастеру'}\n\n` +
          `<i>Если вы уже отправили — мастер скоро отметит вас в системе.</i>`;

        await this.bot.api.sendMessage(player.telegram_id, text, { parse_mode: 'HTML' });
      }
    }
  }

  private async processInactivityReminders() {
    const now = this.toMoscowDate(new Date());
    const runKey = `inactive-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;

    if (now.getDay() !== 6 || now.getHours() !== 12 || now.getMinutes() > 5 || this.lastRunKeys.has(runKey)) {
      return;
    }

    this.lastRunKeys.add(runKey);
    const inactiveUsers = await this.externalValidation.getInactiveUsers();
    for (const user of inactiveUsers) {
      const text =
        `<b>Внимание, @${user.username}!</b> 👋\n\n` +
        `Мы заметили, что ты не проявлял активность в играх <b>более 3-х недель</b>. 🗓\n\n` +
        `Напоминаем, что наше сообщество ценит активных игроков. Согласно правилам, при длительном отсутствии записей на игры администрация может принять решение об <b>исключении из группы и блокировке (бан)</b> за неактивность. 🚫⚔️\n\n` +
        `Мы очень не хотим тебя терять! Заглядывай в канал с анонсами и записывайся на ближайшую игру, чтобы подтвердить свой статус игрока. 🎲✨`;

      await this.bot.api.sendMessage(user.id, text, { parse_mode: 'HTML' });
    }
  }

  private async processLeaderboardRefresh() {
    if (!env.LEADERBOARD_CHAT_ID || !env.LEADERBOARD_MSG_ID) {
      return;
    }

    const now = this.toMoscowDate(new Date());
    const slot = Math.floor(now.getMinutes() / 10);
    const runKey = `leaderboard-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${slot}`;

    if (this.lastRunKeys.has(runKey)) {
      return;
    }

    this.lastRunKeys.add(runKey);
    try {
      await this.leaderboard.refreshMessage(this.bot);
    } catch (error) {
      console.error('Leaderboard refresh failed:', error);
    }
  }

  private async sendGameReminder(gameId: number, triggerType: 24 | 1, diffMinutes: number) {
    const game = this.games.getById(gameId);
    if (!game) {
      return;
    }

    const text =
      `${triggerType === 24 ? '⏳' : '🔔'} <b>ВНИМАНИЕ, ГЕРОИ!</b> ${triggerType === 24 ? '⏳' : '🔔'}\n\n` +
      `До начала <b>«${game.title}»</b> осталось: ⏳ <b>${this.formatRelativeTime(diffMinutes)}</b>\n\n` +
      `📅 <b>Дата:</b> <code>${this.formatDate(new Date(game.starts_at))}</code>\n` +
      `⏰ <b>Время:</b> <code>${this.formatTime(new Date(game.starts_at))}</code>\n` +
      `⚔️ <b>Готовность:</b>\n${this.games.getDisplayPlayers(game.id)?.join(' ') || '<i>Пусто...</i>'}`;

    const detailed = this.games.listAllDetailed().find((item) => item.id === gameId);
    if (!detailed) {
      return;
    }

    const recipients = detailed.registrations.filter((item) => item.status !== 'CANCELLED');
    for (const registration of recipients) {
      try {
        await this.bot.api.sendMessage(registration.telegram_id, text, { parse_mode: 'HTML' });
      } catch (error) {
        console.warn(`Failed to send reminder to telegram_id=${registration.telegram_id}:`, error);
      }
    }
  }

  private formatRelativeTime(totalMinutes: number) {
    if (totalMinutes <= 0) {
      return 'вот-вот начнется!';
    }

    if (totalMinutes < 60) {
      return `${totalMinutes} мин.`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours} ч.` : `${hours} ч. ${minutes} мин.`;
  }

  private formatDate(date: Date) {
    return formatMoscowDate(date);
  }

  private formatTime(date: Date) {
    return formatMoscowTime(date);
  }

  private channelBaseUrl() {
    const cleanId = String(env.MAIN_CHAT_ID).replace('-100', '');
    return `https://t.me/c/${cleanId}`;
  }

  private toMoscowDate(date: Date) {
    const moscow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: string) => Number.parseInt(moscow.find((item) => item.type === type)?.value ?? '0', 10);
    return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  }
}
