import { Bot } from 'grammy';

import { env } from '../config/env';
import { UserRepository } from '../repositories/user.repository';

type Rank = {
  name: string;
  emoji: string;
  minGames: number;
};

const ranks: Rank[] = [
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

export class LeaderboardService {
  constructor(private readonly users = new UserRepository()) {}

  async refreshMessage(bot: Bot) {
    if (!env.LEADERBOARD_CHAT_ID || !env.LEADERBOARD_MSG_ID) {
      return;
    }

    const text = this.buildText();
    await bot.api.editMessageText(env.LEADERBOARD_CHAT_ID, env.LEADERBOARD_MSG_ID, text, {
      parse_mode: 'HTML',
    });
  }

  buildText() {
    const rows = this.users.listForLeaderboard(20);
    const lines = rows.map((row, index) => {
      const rank = this.getRank(row.games_count);
      const place = this.getPlaceBadge(index + 1);
      const username = `@${row.username ?? 'unknown'}`.slice(0, 13);
      return `${place}${rank.emoji} ${username} — ${rank.name} • ${row.games_count}`;
    });

    const table = lines.length
      ? lines.join('\n')
      : '<i>Пока нет данных для таблицы лидеров.</i>';

    return (
      `⚔️ <b>ЗАЛ ВЕЛИКИХ ПОБЕД 🏆</b>\n\n` +
      `${table}\n\n` +
      `📈 Чтобы узнать свой прогресс, напиши боту в ЛС: /rank\n\n` +
      `🕒 Обновлено: ${this.formatMoscowDate(new Date())}`
    );
  }

  private getRank(gamesCount: number) {
    return [...ranks].reverse().find((rank) => gamesCount >= rank.minGames) ?? ranks[0];
  }

  private getPlaceBadge(place: number) {
    if (place === 1) return '🥇';
    if (place === 2) return '🥈';
    if (place === 3) return '🥉';
    return `${this.toEmojiNumber(place)} `;
  }

  private toEmojiNumber(num: number) {
    const digits = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    return String(num)
      .split('')
      .map((digit) => digits[Number.parseInt(digit, 10)] ?? digit)
      .join('');
  }

  private formatMoscowDate(date: Date) {
    const msk = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    return `${msk} МСК`;
  }

}
