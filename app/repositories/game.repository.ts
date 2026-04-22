import { sqlite } from '../db/database';

export type GameRecord = {
  id: number;
  type: string;
  title: string;
  description: string | null;
  starts_at: string;
  gm_name: string | null;
  registration_limit: number | null;
  participant_slots_text: string | null;
  registered_players_text: string;
  status: string;
  image_file_id: string | null;
  announcement_chat_id: number | null;
  announcement_thread_id: number | null;
  announcement_message_id: number | null;
  reminder_24h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  submitted_sheet_users: string;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
};

export class GameRepository {
  create(payload: {
    type: string;
    title: string;
    description?: string | null;
    startsAt: string;
    gmName?: string | null;
    registrationLimit?: number | null;
    participantSlotsText?: string | null;
    registeredPlayersText?: string;
    imageFileId?: string | null;
    announcementChatId?: number | null;
    announcementThreadId?: number | null;
    announcementMessageId?: number | null;
    status?: 'OPEN' | 'FULL' | 'CANCELLED' | 'DONE';
    createdByUserId: number;
  }) {
    const result = sqlite
      .prepare(
        `
        INSERT INTO games (
          type, title, description, starts_at, gm_name, registration_limit, image_file_id,
          participant_slots_text, registered_players_text,
          announcement_chat_id, announcement_thread_id, announcement_message_id, status, created_by_user_id
        )
        VALUES (
          @type, @title, @description, @startsAt, @gmName, @registrationLimit, @imageFileId,
          @participantSlotsText, @registeredPlayersText,
          @announcementChatId, @announcementThreadId, @announcementMessageId, @status, @createdByUserId
        )
      `,
      )
      .run({
        type: payload.type,
        title: payload.title,
        description: payload.description ?? null,
        startsAt: payload.startsAt,
        gmName: payload.gmName ?? null,
        registrationLimit: payload.registrationLimit ?? null,
        participantSlotsText: payload.participantSlotsText ?? null,
        registeredPlayersText: payload.registeredPlayersText ?? '',
        imageFileId: payload.imageFileId ?? null,
        announcementChatId: payload.announcementChatId ?? null,
        announcementThreadId: payload.announcementThreadId ?? null,
        announcementMessageId: payload.announcementMessageId ?? null,
        status: toDbGameStatus(payload.status ?? 'OPEN'),
        createdByUserId: payload.createdByUserId,
      });

    return this.findById(Number(result.lastInsertRowid));
  }

  findById(id: number) {
    const row = sqlite.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRecord | undefined;
    return row ? mapGameRecordFromDb(row) : undefined;
  }

  listUpcoming() {
    return sqlite
      .prepare(
        `
        SELECT * FROM games
        WHERE status IN ('OPEN', 'FULL', 'Идет набор', 'Группа собрана')
        ORDER BY starts_at ASC
      `,
      )
      .all()
      .map((row) => mapGameRecordFromDb(row as GameRecord)) as GameRecord[];
  }

  listAll() {
    return sqlite
      .prepare('SELECT * FROM games ORDER BY starts_at ASC')
      .all()
      .map((row) => mapGameRecordFromDb(row as GameRecord)) as GameRecord[];
  }

  setStatus(id: number, status: 'OPEN' | 'FULL' | 'CANCELLED' | 'DONE') {
    sqlite
      .prepare(
        `
        UPDATE games
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(toDbGameStatus(status), id);
  }

  updateAnnouncementData(payload: {
    id: number;
    announcementChatId: number;
    announcementThreadId: number | null;
    announcementMessageId: number;
  }) {
    sqlite
      .prepare(
        `
        UPDATE games
        SET
          announcement_chat_id = @announcementChatId,
          announcement_thread_id = @announcementThreadId,
          announcement_message_id = @announcementMessageId,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `,
      )
      .run(payload);
  }

  clearAnnouncementData(id: number) {
    sqlite
      .prepare(
        `
        UPDATE games
        SET
          announcement_chat_id = NULL,
          announcement_thread_id = NULL,
          announcement_message_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(id);
  }

  updateGameFields(payload: {
    id: number;
    type?: string;
    title?: string;
    description?: string | null;
    startsAt?: string;
    gmName?: string | null;
    registrationLimit?: number | null;
    participantSlotsText?: string | null;
    registeredPlayersText?: string;
    status?: string;
    imageFileId?: string | null;
    reminder24hSentAt?: string | null;
    reminder1hSentAt?: string | null;
    submittedSheetUsers?: string;
  }) {
    const current = this.findById(payload.id);
    if (!current) {
      return;
    }

    sqlite
      .prepare(
        `
        UPDATE games
        SET
          type = @type,
          title = @title,
          description = @description,
          starts_at = @startsAt,
          gm_name = @gmName,
          registration_limit = @registrationLimit,
          participant_slots_text = @participantSlotsText,
          registered_players_text = @registeredPlayersText,
          status = @status,
          image_file_id = @imageFileId,
          reminder_24h_sent_at = @reminder24hSentAt,
          reminder_1h_sent_at = @reminder1hSentAt,
          submitted_sheet_users = @submittedSheetUsers,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `,
      )
      .run({
        id: payload.id,
        type: payload.type === undefined ? current.type : payload.type,
        title: payload.title === undefined ? current.title : payload.title,
        description: payload.description === undefined ? current.description : payload.description,
        startsAt: payload.startsAt === undefined ? current.starts_at : payload.startsAt,
        gmName: payload.gmName === undefined ? current.gm_name : payload.gmName,
        registrationLimit: payload.registrationLimit === undefined ? current.registration_limit : payload.registrationLimit,
        participantSlotsText:
          payload.participantSlotsText === undefined ? current.participant_slots_text : payload.participantSlotsText,
        registeredPlayersText:
          payload.registeredPlayersText === undefined ? current.registered_players_text : payload.registeredPlayersText,
        status: payload.status === undefined ? toDbGameStatus(current.status) : toDbGameStatus(payload.status),
        imageFileId: payload.imageFileId === undefined ? current.image_file_id : payload.imageFileId,
        reminder24hSentAt: payload.reminder24hSentAt === undefined ? current.reminder_24h_sent_at : payload.reminder24hSentAt,
        reminder1hSentAt: payload.reminder1hSentAt === undefined ? current.reminder_1h_sent_at : payload.reminder1hSentAt,
        submittedSheetUsers:
          payload.submittedSheetUsers === undefined ? current.submitted_sheet_users : payload.submittedSheetUsers,
      });
  }

  deleteById(id: number) {
    sqlite.exec('BEGIN');
    try {
      sqlite.prepare('DELETE FROM registrations WHERE game_id = ?').run(id);
      const result = sqlite.prepare('DELETE FROM games WHERE id = ?').run(id);
      sqlite.exec('COMMIT');
      return result.changes > 0;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

function mapGameRecordFromDb(row: GameRecord): GameRecord {
  return {
    ...row,
    status: fromDbGameStatus(row.status),
  };
}

function toDbGameStatus(status: string) {
  const mapping: Record<string, string> = {
    OPEN: 'Идет набор',
    FULL: 'Группа собрана',
    DONE: 'Игра завершена',
    CANCELLED: 'Отменена',
    CLOSED: 'Группа собрана',
    ARCHIVED: 'Игра завершена',
  };

  return mapping[status] ?? status;
}

function fromDbGameStatus(status: string) {
  const reverse: Record<string, string> = {
    'Идет набор': 'OPEN',
    'Группа собрана': 'FULL',
    'Игра завершена': 'DONE',
    'Отменена': 'CANCELLED',
    CLOSED: 'FULL',
    ARCHIVED: 'DONE',
  };

  return reverse[status] ?? status;
}
