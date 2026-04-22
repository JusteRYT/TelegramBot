import { initializeDatabase, sqlite } from '../db/database';

type LegacyUser = {
  telegramId: string;
  username: string;
  firstName: string;
  lastName: string;
  status: 'Кандидат' | 'На проверке' | 'Одобрен' | 'Бан';
  createdAt: string;
  lastGameAt: string;
  warningsCount: number;
  gamesCount: number;
};

type LegacyWarning = {
  createdAt: string;
  username: string;
  reason: string;
};

type LegacyBan = {
  createdAt: string;
  username: string;
  reason: string;
};

const users: LegacyUser[] = [
  { telegramId: '1751226254', username: 'okaberintarou5', firstName: 'OkabeRin', lastName: '', status: 'Одобрен', createdAt: '21.03.2026 19:30:16', lastGameAt: '11.04.2026', warningsCount: 0, gamesCount: 7 },
  { telegramId: '', username: 'S0NTIP', firstName: '', lastName: '', status: 'Бан', createdAt: '21.03.2026 20:37:21', lastGameAt: '-', warningsCount: 0, gamesCount: 0 },
  { telegramId: '', username: 'KOT', firstName: '', lastName: '', status: 'Бан', createdAt: '21.03.2026 20:37:24', lastGameAt: '-', warningsCount: 0, gamesCount: 0 },
  { telegramId: '672485596', username: 'fffemm', firstName: 'Фем', lastName: '', status: 'На проверке', createdAt: '21.03.2026 20:41:23', lastGameAt: '21.03.2026', warningsCount: 0, gamesCount: 1 },
  { telegramId: '6287446049', username: 'Kukumru', firstName: 'Kukumru', lastName: '', status: 'На проверке', createdAt: '21.03.2026 20:41:56', lastGameAt: '10.04.2026', warningsCount: 0, gamesCount: 3 },
  { telegramId: '968945508', username: 'Teman305', firstName: 'Артём', lastName: 'Каргин', status: 'Одобрен', createdAt: '21.03.2026 20:43:03', lastGameAt: '15.04.2026', warningsCount: 0, gamesCount: 6 },
  { telegramId: '5176586278', username: 'AKULENOK_arrr', firstName: 'AKULENOK', lastName: '', status: 'Одобрен', createdAt: '21.03.2026 20:43:09', lastGameAt: '15.04.2026', warningsCount: 0, gamesCount: 8 },
  { telegramId: '6424925053', username: 'Penisglot_This_Is_Gooot', firstName: 'J E S T E R', lastName: '', status: 'Бан', createdAt: '21.03.2026 23:06:45', lastGameAt: '03.04.2026', warningsCount: 1, gamesCount: 0 },
  { telegramId: '1032482269', username: 'why_not_lili', firstName: 'Лилия', lastName: 'Качалкова', status: 'Бан', createdAt: '22.03.2026 2:00:34', lastGameAt: '-', warningsCount: 1, gamesCount: 0 },
  { telegramId: '502302735', username: 'JusteR_YT', firstName: 'Сергей', lastName: 'Вашкевич', status: 'Одобрен', createdAt: '31.03.2026 15:12:48', lastGameAt: '11.04.2026 15:02:27', warningsCount: 0, gamesCount: 7 },
  { telegramId: '8318084156', username: 'Angelochka_18', firstName: '♡and_ross_y♡', lastName: '', status: 'Бан', createdAt: '22.03.2026 22:19:17', lastGameAt: '-', warningsCount: 1, gamesCount: 0 },
  { telegramId: '6828238282', username: 'waflya7', firstName: 'Oleg', lastName: 'Asaltukov', status: 'Одобрен', createdAt: '24.03.2026 2:36:42', lastGameAt: '15.04.2026', warningsCount: 0, gamesCount: 3 },
  { telegramId: '5290830914', username: 'ZumerZ7', firstName: '∆ZumerZ∆', lastName: '', status: 'Кандидат', createdAt: '25.03.2026 0:35:19', lastGameAt: '15.04.2026', warningsCount: 1, gamesCount: 0 },
  { telegramId: '293050784', username: 'Bitriniti', firstName: 'Ae the Faceless', lastName: '', status: 'На проверке', createdAt: '25.03.2026 8:03:01', lastGameAt: '15.04.2026', warningsCount: 0, gamesCount: 2 },
  { telegramId: '', username: 'Vrchatty', firstName: '', lastName: '', status: 'Бан', createdAt: '25.03.2026 10:41:43', lastGameAt: '-', warningsCount: 0, gamesCount: 0 },
  { telegramId: '808010812', username: 'Muerts', firstName: 'Muer', lastName: '', status: 'На проверке', createdAt: '03.04.2026 6:06:13', lastGameAt: '15.04.2026', warningsCount: 0, gamesCount: 2 },
  { telegramId: '5248324569', username: 'people22055', firstName: 'pepel23', lastName: '', status: 'Кандидат', createdAt: '03.04.2026 15:37:04', lastGameAt: '03.04.2026', warningsCount: 0, gamesCount: 0 },
  { telegramId: '1885023063', username: 'SadHappyBear', firstName: 'BeeHaHa', lastName: '', status: 'Кандидат', createdAt: '21.04.2026 20:35:52', lastGameAt: '-', warningsCount: 0, gamesCount: 0 },
];

const warnings: LegacyWarning[] = [
  { createdAt: '22.03.2026 0:14:01', username: 'Penisglot_This_Is_Gooot', reason: '22.03.2026 Написал персонажа слишком поздно и по этой причине не участвовал в игре.' },
  { createdAt: '22.03.2026 12:27:01', username: 'why_not_lili', reason: '14.03.2026 Без уважительной причины не пришла на игру' },
  { createdAt: '28.03.2026 10:09:37', username: 'Angelochka_18', reason: 'Не написала анкету в срок, хотя времени было достаточно. Или хотя бы не предупредила что не сможет играть' },
  { createdAt: '15.04.2026 18:11:29', username: 'ZumerZ7', reason: '[15 апреля 2026г. 18:11 по мск] Не пришёл на игру, на сообщения не отвечал и в врчате был не в сети' },
];

const bans: LegacyBan[] = [
  { createdAt: '04.04.2026 12:07:37', username: 'Penisglot_This_Is_Gooot', reason: '04.04.2026 Причина: Неадекватность, оскорбление администрации, нарушение атмосферы в сообществе' },
  { createdAt: '18.04.2026 22:58:25', username: 'Angelochka_18', reason: '[18 апреля 2026г. 22:58 по мск] Заявила что не сможет играть на наших партиях и она не на одной не учавствовала' },
];

function toIsoFromLegacyMsk(value: string) {
  const raw = value.trim();
  if (!raw || raw === '-') {
    return null;
  }

  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const hours = Number.parseInt(match[4] ?? '0', 10);
  const minutes = Number.parseInt(match[5] ?? '0', 10);
  const seconds = Number.parseInt(match[6] ?? '0', 10);

  return new Date(Date.UTC(year, month - 1, day, hours - 3, minutes, seconds)).toISOString();
}

function syntheticTelegramId(username: string) {
  let hash = 0;
  for (const char of username.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_000;
  }

  return 8_000_000_000 + hash;
}

function resolveTelegramId(value: string, username: string) {
  const normalized = value.trim();
  if (!normalized) {
    return syntheticTelegramId(username);
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? syntheticTelegramId(username) : parsed;
}

function main() {
  initializeDatabase();

  sqlite.exec('BEGIN');
  try {
    const upsertUser = sqlite.prepare(`
      INSERT INTO users (
        telegram_id, username, first_name, last_name, user_status, last_game_at, warnings_count, games_count, is_admin, created_at, updated_at
      )
      VALUES (
        @telegramId, @username, @firstName, @lastName, @status, @lastGameAt, @warningsCount, @gamesCount, @isAdmin, @createdAt, @updatedAt
      )
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        user_status = excluded.user_status,
        last_game_at = excluded.last_game_at,
        warnings_count = excluded.warnings_count,
        games_count = excluded.games_count,
        is_admin = excluded.is_admin,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `);

    const findUserIdByUsername = sqlite.prepare(
      `SELECT id FROM users WHERE lower(username) = lower(?) LIMIT 1`,
    );

    const insertWarning = sqlite.prepare(`
      INSERT INTO warnings_log (user_id, reason, created_at)
      SELECT @userId, @reason, @createdAt
      WHERE NOT EXISTS (
        SELECT 1 FROM warnings_log WHERE user_id = @userId AND reason = @reason AND created_at = @createdAt
      )
    `);

    const insertBan = sqlite.prepare(`
      INSERT INTO bans_log (user_id, reason, created_at)
      SELECT @userId, @reason, @createdAt
      WHERE NOT EXISTS (
        SELECT 1 FROM bans_log WHERE user_id = @userId AND reason = @reason AND created_at = @createdAt
      )
    `);

    for (const user of users) {
      upsertUser.run({
        telegramId: resolveTelegramId(user.telegramId, user.username),
        username: user.username.trim() || null,
        firstName: user.firstName.trim() || null,
        lastName: user.lastName.trim() || null,
        status: user.status,
        lastGameAt: toIsoFromLegacyMsk(user.lastGameAt),
        warningsCount: user.warningsCount,
        gamesCount: user.gamesCount,
        isAdmin: user.username.toLowerCase() === 'juster_yt' ? 1 : 0,
        createdAt: toIsoFromLegacyMsk(user.createdAt) ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    for (const item of warnings) {
      const row = findUserIdByUsername.get(item.username) as { id: number } | undefined;
      if (!row) {
        continue;
      }

      insertWarning.run({
        userId: row.id,
        reason: item.reason,
        createdAt: toIsoFromLegacyMsk(item.createdAt) ?? new Date().toISOString(),
      });
    }

    for (const item of bans) {
      const row = findUserIdByUsername.get(item.username) as { id: number } | undefined;
      if (!row) {
        continue;
      }

      insertBan.run({
        userId: row.id,
        reason: item.reason,
        createdAt: toIsoFromLegacyMsk(item.createdAt) ?? new Date().toISOString(),
      });
    }

    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }

  const totalUsers = sqlite.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const totalWarnings = sqlite.prepare('SELECT COUNT(*) as count FROM warnings_log').get() as { count: number };
  const totalBans = sqlite.prepare('SELECT COUNT(*) as count FROM bans_log').get() as { count: number };
  console.log(`Legacy import complete. users=${totalUsers.count}, warnings=${totalWarnings.count}, bans=${totalBans.count}`);
}

main();
