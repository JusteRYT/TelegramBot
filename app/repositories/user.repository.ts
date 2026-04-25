import { sqlite } from '../db/database';

export type UserRecord = {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  user_status: string;
  last_game_at: string | null;
  warnings_count: number;
  games_count: number;
  is_admin: number;
  created_at: string;
  updated_at: string;
};

export type WarningLogRecord = {
  id: number;
  user_id: number;
  username: string | null;
  telegram_id: number;
  reason: string;
  created_at: string;
};

export type BanLogRecord = {
  id: number;
  user_id: number;
  username: string | null;
  telegram_id: number;
  reason: string;
  created_at: string;
};

export class UserRepository {
  upsertByTelegram(payload: {
    telegramId: number;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isAdmin: boolean;
  }) {
    sqlite
      .prepare(
        `
        INSERT INTO users (telegram_id, username, first_name, last_name, is_admin)
        VALUES (@telegramId, @username, @firstName, @lastName, @isAdmin)
        ON CONFLICT(telegram_id) DO UPDATE SET
          username = excluded.username,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          is_admin = excluded.is_admin,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run({
        telegramId: payload.telegramId,
        username: payload.username ?? null,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        isAdmin: payload.isAdmin ? 1 : 0,
      });

    return this.findByTelegramId(payload.telegramId);
  }

  findByTelegramId(telegramId: number) {
    return sqlite
      .prepare('SELECT * FROM users WHERE telegram_id = ?')
      .get(telegramId) as UserRecord | undefined;
  }

  findById(id: number) {
    return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
  }

  findByUsername(username: string) {
    const clean = username.replace('@', '').trim().toLowerCase();
    if (!clean) {
      return undefined;
    }

    return sqlite
      .prepare('SELECT * FROM users WHERE lower(username) = ?')
      .get(clean) as UserRecord | undefined;
  }

  createManualUser(payload: {
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    status: string;
  }) {
    const normalized = payload.username.replace('@', '').trim();
    if (!normalized) {
      return null;
    }

    const existing = this.findByUsername(normalized);
    if (existing) {
      return existing;
    }

    const telegramId = this.syntheticTelegramId(normalized);
    sqlite
      .prepare(
        `
        INSERT INTO users (
          telegram_id, username, first_name, last_name, user_status, last_game_at,
          warnings_count, games_count, is_admin
        )
        VALUES (
          @telegramId, @username, @firstName, @lastName, @status, NULL,
          0, 0, 0
        )
      `,
      )
      .run({
        telegramId,
        username: normalized,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        status: payload.status,
      });

    return this.findByUsername(normalized) ?? null;
  }

  listAll() {
    return sqlite
      .prepare('SELECT * FROM users ORDER BY created_at DESC')
      .all() as UserRecord[];
  }

  updateById(payload: {
    id: number;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    userStatus?: string;
    lastGameAt?: string | null;
    warningsCount?: number;
    gamesCount?: number;
    isAdmin?: boolean;
  }) {
    const current = this.findById(payload.id);
    if (!current) {
      return false;
    }

    sqlite
      .prepare(
        `
        UPDATE users
        SET
          username = @username,
          first_name = @firstName,
          last_name = @lastName,
          user_status = @userStatus,
          last_game_at = @lastGameAt,
          warnings_count = @warningsCount,
          games_count = @gamesCount,
          is_admin = @isAdmin,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `,
      )
      .run({
        id: payload.id,
        username: payload.username === undefined ? current.username : payload.username,
        firstName: payload.firstName === undefined ? current.first_name : payload.firstName,
        lastName: payload.lastName === undefined ? current.last_name : payload.lastName,
        userStatus: payload.userStatus === undefined ? current.user_status : payload.userStatus,
        lastGameAt: payload.lastGameAt === undefined ? current.last_game_at : payload.lastGameAt,
        warningsCount: payload.warningsCount === undefined ? current.warnings_count : payload.warningsCount,
        gamesCount: payload.gamesCount === undefined ? current.games_count : payload.gamesCount,
        isAdmin: payload.isAdmin === undefined ? current.is_admin : payload.isAdmin ? 1 : 0,
      });

    return true;
  }

  ensureRegistered(telegramId: number) {
    const user = this.findByTelegramId(telegramId);
    if (!user) {
      return { ok: false as const, justRegistered: false };
    }

    if (user.user_status !== 'Не зарегистрирован') {
      return { ok: true as const, justRegistered: false };
    }

    sqlite
      .prepare(
        `
        UPDATE users
        SET user_status = 'Кандидат', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(user.id);

    return { ok: true as const, justRegistered: true };
  }

  changeStatusById(id: number, status: string) {
    const result = sqlite
      .prepare(
        `
        UPDATE users
        SET user_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(status, id);

    return result.changes > 0;
  }

  addWarning(userId: number, reason: string) {
    sqlite
      .prepare(
        `
        INSERT INTO warnings_log (user_id, reason)
        VALUES (?, ?)
      `,
      )
      .run(userId, reason);

    sqlite
      .prepare(
        `
        UPDATE users
        SET warnings_count = warnings_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(userId);
  }

  createWarningLog(payload: { userId: number; reason: string; createdAt?: string | null; incrementCounter?: boolean }) {
    sqlite
      .prepare(
        `
        INSERT INTO warnings_log (user_id, reason, created_at)
        VALUES (@userId, @reason, COALESCE(@createdAt, CURRENT_TIMESTAMP))
      `,
      )
      .run({
        userId: payload.userId,
        reason: payload.reason,
        createdAt: payload.createdAt ?? null,
      });

    if (payload.incrementCounter ?? true) {
      this.recalculateWarningsCount(payload.userId);
    }
  }

  logWarningHistory(userId: number, reason: string, createdAt?: string) {
    sqlite
      .prepare(
        `
        INSERT INTO warnings_log (user_id, reason, created_at)
        VALUES (@userId, @reason, @createdAt)
      `,
      )
      .run({
        userId,
        reason,
        createdAt: createdAt ?? new Date().toISOString(),
      });
  }

  addBan(userId: number, reason: string) {
    sqlite
      .prepare(
        `
        INSERT INTO bans_log (user_id, reason)
        VALUES (?, ?)
      `,
      )
      .run(userId, reason);
  }

  createBanLog(payload: { userId: number; reason: string; createdAt?: string | null }) {
    sqlite
      .prepare(
        `
        INSERT INTO bans_log (user_id, reason, created_at)
        VALUES (@userId, @reason, COALESCE(@createdAt, CURRENT_TIMESTAMP))
      `,
      )
      .run({
        userId: payload.userId,
        reason: payload.reason,
        createdAt: payload.createdAt ?? null,
      });
  }

  incrementGamesByUserId(userId: number) {
    sqlite
      .prepare(
        `
        UPDATE users
        SET games_count = games_count + 1, last_game_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(userId);
  }

  listByStatuses(statuses: string[]) {
    if (statuses.length === 0) {
      return [] as UserRecord[];
    }

    const placeholders = statuses.map(() => '?').join(', ');
    return sqlite
      .prepare(`SELECT * FROM users WHERE user_status IN (${placeholders}) ORDER BY games_count DESC, created_at DESC`)
      .all(...statuses) as UserRecord[];
  }

  getLatestBanReason(userId: number) {
    const row = sqlite
      .prepare(
        `
        SELECT reason
        FROM bans_log
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      )
      .get(userId) as { reason: string } | undefined;

    return row?.reason ?? null;
  }

  getWarnings(userId: number) {
    return sqlite
      .prepare(
        `
        SELECT reason, created_at
        FROM warnings_log
        WHERE user_id = ?
        ORDER BY id DESC
      `,
      )
      .all(userId) as Array<{ reason: string; created_at: string }>;
  }

  listWarningsDetailed() {
    return sqlite
      .prepare(
        `
        SELECT
          w.id,
          w.user_id,
          u.username,
          u.telegram_id,
          w.reason,
          w.created_at
        FROM warnings_log w
        JOIN users u ON u.id = w.user_id
        ORDER BY w.created_at DESC, w.id DESC
      `,
      )
      .all() as WarningLogRecord[];
  }

  listBansDetailed() {
    return sqlite
      .prepare(
        `
        SELECT
          b.id,
          b.user_id,
          u.username,
          u.telegram_id,
          b.reason,
          b.created_at
        FROM bans_log b
        JOIN users u ON u.id = b.user_id
        ORDER BY b.created_at DESC, b.id DESC
      `,
      )
      .all() as BanLogRecord[];
  }

  findWarningLogById(id: number) {
    return sqlite
      .prepare(
        `
        SELECT id, user_id, reason, created_at
        FROM warnings_log
        WHERE id = ?
      `,
      )
      .get(id) as { id: number; user_id: number; reason: string; created_at: string } | undefined;
  }

  updateWarningLogById(payload: { id: number; userId: number; reason: string; createdAt?: string | null }) {
    const existing = this.findWarningLogById(payload.id);
    if (!existing) {
      return false;
    }

    sqlite
      .prepare(
        `
        UPDATE warnings_log
        SET user_id = @userId, reason = @reason, created_at = COALESCE(@createdAt, created_at)
        WHERE id = @id
      `,
      )
      .run({
        id: payload.id,
        userId: payload.userId,
        reason: payload.reason,
        createdAt: payload.createdAt ?? null,
      });

    this.recalculateWarningsCount(existing.user_id);
    if (existing.user_id !== payload.userId) {
      this.recalculateWarningsCount(payload.userId);
    }

    return true;
  }

  deleteWarningLogById(id: number) {
    const existing = this.findWarningLogById(id);
    if (!existing) {
      return false;
    }

    sqlite.prepare('DELETE FROM warnings_log WHERE id = ?').run(id);
    this.recalculateWarningsCount(existing.user_id);
    return true;
  }

  findBanLogById(id: number) {
    return sqlite
      .prepare(
        `
        SELECT id, user_id, reason, created_at
        FROM bans_log
        WHERE id = ?
      `,
      )
      .get(id) as { id: number; user_id: number; reason: string; created_at: string } | undefined;
  }

  updateBanLogById(payload: { id: number; userId: number; reason: string; createdAt?: string | null }) {
    const existing = this.findBanLogById(payload.id);
    if (!existing) {
      return false;
    }

    sqlite
      .prepare(
        `
        UPDATE bans_log
        SET user_id = @userId, reason = @reason, created_at = COALESCE(@createdAt, created_at)
        WHERE id = @id
      `,
      )
      .run({
        id: payload.id,
        userId: payload.userId,
        reason: payload.reason,
        createdAt: payload.createdAt ?? null,
      });

    return true;
  }

  deleteBanLogById(id: number) {
    const existing = this.findBanLogById(id);
    if (!existing) {
      return false;
    }

    const result = sqlite.prepare('DELETE FROM bans_log WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listInactive(statuses: string[], weeks = 3) {
    if (statuses.length === 0) {
      return [] as Array<{ id: number; username: string }>;
    }

    const placeholders = statuses.map(() => '?').join(', ');
    const days = weeks * 7;

    return sqlite
      .prepare(
        `
        SELECT telegram_id as id, username
        FROM users
        WHERE user_status IN (${placeholders})
          AND telegram_id IS NOT NULL
          AND username IS NOT NULL
          AND datetime(COALESCE(last_game_at, created_at)) <= datetime('now', '-' || ? || ' days')
      `,
      )
      .all(...statuses, days) as Array<{ id: number; username: string }>;
  }

  listForLeaderboard(limit = 20) {
    return sqlite
      .prepare(
        `
        SELECT id, username, games_count
        FROM users
        WHERE user_status NOT IN ('Бан', 'Не зарегистрирован')
          AND games_count > 0
          AND username IS NOT NULL
        ORDER BY games_count DESC, updated_at ASC, id ASC
        LIMIT ?
      `,
      )
      .all(limit) as Array<{ id: number; username: string; games_count: number }>;
  }

  listGroupedByStatus() {
    const rows = sqlite
      .prepare('SELECT * FROM users ORDER BY id ASC')
      .all() as UserRecord[];
    const grouped: Record<string, UserRecord[]> = {};
    for (const row of rows) {
      if (!grouped[row.user_status]) {
        grouped[row.user_status] = [];
      }
      grouped[row.user_status].push(row);
    }

    return grouped;
  }

  deleteById(id: number) {
    sqlite.exec('BEGIN');
    try {
      const hasOwnedGames = sqlite
        .prepare('SELECT COUNT(*) as c FROM games WHERE created_by_user_id = ?')
        .get(id) as { c: number };

      if (hasOwnedGames.c > 0) {
        sqlite.exec('ROLLBACK');
        return { ok: false as const, reason: 'HAS_CREATED_GAMES' as const };
      }

      sqlite.prepare('DELETE FROM registrations WHERE user_id = ?').run(id);
      sqlite.prepare('DELETE FROM warnings_log WHERE user_id = ?').run(id);
      sqlite.prepare('DELETE FROM bans_log WHERE user_id = ?').run(id);
      const result = sqlite.prepare('DELETE FROM users WHERE id = ?').run(id);
      sqlite.exec('COMMIT');
      return result.changes > 0
        ? { ok: true as const }
        : { ok: false as const, reason: 'NOT_FOUND' as const };
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  private syntheticTelegramId(username: string) {
    let hash = 0;
    for (const char of username.toLowerCase()) {
      hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_000;
    }

    return 8_000_000_000 + hash;
  }

  private recalculateWarningsCount(userId: number) {
    sqlite
      .prepare(
        `
        UPDATE users
        SET warnings_count = (
          SELECT COUNT(*)
          FROM warnings_log
          WHERE user_id = @userId
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = @userId
      `,
      )
      .run({ userId });
  }
}
