import { sqlite } from '../db/database';

export type RegistrationRecord = {
  id: number;
  game_id: number;
  user_id: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export class RegistrationRepository {
  createOrRestore(gameId: number, userId: number, status: 'CONFIRMED' | 'WAITLIST') {
    sqlite
      .prepare(
        `
        INSERT INTO registrations (game_id, user_id, status)
        VALUES (@gameId, @userId, @status)
        ON CONFLICT(game_id, user_id) DO UPDATE SET
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run({ gameId, userId, status: toDbRegistrationStatus(status) });

    return this.findByGameAndUser(gameId, userId);
  }

  cancel(gameId: number, userId: number) {
    const result = sqlite
      .prepare(
        `
        UPDATE registrations
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE game_id = ? AND user_id = ? AND status != ?
      `,
      )
      .run(toDbRegistrationStatus('CANCELLED'), gameId, userId, toDbRegistrationStatus('CANCELLED'));

    return result.changes > 0;
  }

  cancelAllForGame(gameId: number) {
    sqlite
      .prepare(
        `
        UPDATE registrations
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE game_id = ?
      `,
      )
      .run(toDbRegistrationStatus('CANCELLED'), gameId);
  }

  setStatusByIds(ids: number[], status: 'CONFIRMED' | 'WAITLIST' | 'CANCELLED') {
    if (ids.length === 0) {
      return;
    }

    const placeholders = ids.map(() => '?').join(', ');
    sqlite
      .prepare(
        `
        UPDATE registrations
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `,
      )
      .run(toDbRegistrationStatus(status), ...ids);
  }

  findByGameAndUser(gameId: number, userId: number) {
    const row = sqlite
      .prepare('SELECT * FROM registrations WHERE game_id = ? AND user_id = ?')
      .get(gameId, userId) as RegistrationRecord | undefined;

    return row ? mapRegistrationRecordFromDb(row) : undefined;
  }

  findById(id: number) {
    const row = sqlite
      .prepare('SELECT * FROM registrations WHERE id = ?')
      .get(id) as RegistrationRecord | undefined;

    return row ? mapRegistrationRecordFromDb(row) : undefined;
  }

  countActiveByGame(gameId: number) {
    const row = sqlite
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM registrations
        WHERE game_id = ? AND status IN ('CONFIRMED', 'WAITLIST', 'Подтвержден', 'Лист ожидания')
      `,
      )
      .get(gameId) as { count: number };

    return row.count;
  }

  countConfirmedByGame(gameId: number) {
    const row = sqlite
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM registrations
        WHERE game_id = ? AND status IN ('CONFIRMED', 'Подтвержден')
      `,
      )
      .get(gameId) as { count: number };

    return row.count;
  }

  listByGame(gameId: number) {
    return sqlite
      .prepare(
        `
        SELECT
          r.*,
          u.telegram_id,
          u.username,
          u.first_name,
          u.last_name
        FROM registrations r
        JOIN users u ON u.id = r.user_id
        WHERE r.game_id = ?
        ORDER BY r.created_at ASC
      `,
      )
      .all(gameId)
      .map((row) => mapRegistrationWithUserFromDb(row as RegistrationRecord & {
        telegram_id: number;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
      })) as Array<
        RegistrationRecord & {
          telegram_id: number;
          username: string | null;
          first_name: string | null;
          last_name: string | null;
        }
      >;
  }

  listAllDetailed() {
    return sqlite
      .prepare(
        `
        SELECT
          r.id,
          r.status,
          r.created_at,
          g.id as game_id,
          g.title as game_title,
          u.telegram_id,
          u.username,
          u.first_name
        FROM registrations r
        JOIN games g ON g.id = r.game_id
        JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC
      `,
      )
      .all()
      .map((row) => mapDetailedRegistrationFromDb(row as {
        id: number;
        status: string;
        created_at: string;
        game_id: number;
        game_title: string;
        telegram_id: number;
        username: string | null;
        first_name: string | null;
      })) as Array<{
        id: number;
        status: string;
        created_at: string;
        game_id: number;
        game_title: string;
        telegram_id: number;
        username: string | null;
        first_name: string | null;
      }>;
  }

  updateStatusById(id: number, status: 'CONFIRMED' | 'WAITLIST' | 'CANCELLED') {
    const result = sqlite
      .prepare(
        `
        UPDATE registrations
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(toDbRegistrationStatus(status), id);

    return result.changes > 0;
  }

  deleteById(id: number) {
    const result = sqlite.prepare('DELETE FROM registrations WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

function toDbRegistrationStatus(status: string) {
  const mapping: Record<string, string> = {
    CONFIRMED: 'Подтвержден',
    WAITLIST: 'Лист ожидания',
    CANCELLED: 'Отменен',
  };

  return mapping[status] ?? status;
}

function fromDbRegistrationStatus(status: string) {
  const reverse: Record<string, string> = {
    'Подтвержден': 'CONFIRMED',
    'Лист ожидания': 'WAITLIST',
    'Отменен': 'CANCELLED',
  };

  return reverse[status] ?? status;
}

function mapRegistrationRecordFromDb(row: RegistrationRecord): RegistrationRecord {
  return {
    ...row,
    status: fromDbRegistrationStatus(row.status),
  };
}

function mapRegistrationWithUserFromDb(
  row: RegistrationRecord & {
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
  },
) {
  return {
    ...row,
    status: fromDbRegistrationStatus(row.status),
  };
}

function mapDetailedRegistrationFromDb(
  row: {
    id: number;
    status: string;
    created_at: string;
    game_id: number;
    game_title: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
  },
) {
  return {
    ...row,
    status: fromDbRegistrationStatus(row.status),
  };
}
