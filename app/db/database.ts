import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { env } from '../config/env';

const resolvedPath = path.resolve(env.DATABASE_PATH);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const sqlite = new DatabaseSync(resolvedPath);
sqlite.exec(`PRAGMA journal_mode = WAL;`);

export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      user_status TEXT NOT NULL DEFAULT 'Не зарегистрирован',
      last_game_at TEXT,
      warnings_count INTEGER NOT NULL DEFAULT 0,
      games_count INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      starts_at TEXT NOT NULL,
      gm_name TEXT,
      registration_limit INTEGER,
      participant_slots_text TEXT,
      registered_players_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'OPEN',
      image_file_id TEXT,
      announcement_chat_id INTEGER,
      announcement_thread_id INTEGER,
      announcement_message_id INTEGER,
      reminder_24h_sent_at TEXT,
      reminder_1h_sent_at TEXT,
      submitted_sheet_users TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(game_id, user_id),
      FOREIGN KEY(game_id) REFERENCES games(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS warnings_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bans_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_games_starts_at ON games(starts_at);
    CREATE INDEX IF NOT EXISTS idx_registrations_game_id ON registrations(game_id);
    CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON registrations(user_id);
    CREATE INDEX IF NOT EXISTS idx_warnings_log_user_id ON warnings_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_bans_log_user_id ON bans_log(user_id);
  `);

  ensureColumn('games', 'gm_name', "TEXT");
  ensureColumn('games', 'participant_slots_text', "TEXT");
  ensureColumn('games', 'registered_players_text', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('games', 'image_file_id', "TEXT");
  ensureColumn('games', 'announcement_chat_id', "INTEGER");
  ensureColumn('games', 'announcement_thread_id', "INTEGER");
  ensureColumn('games', 'announcement_message_id', "INTEGER");
  ensureColumn('games', 'reminder_24h_sent_at', "TEXT");
  ensureColumn('games', 'reminder_1h_sent_at', "TEXT");
  ensureColumn('games', 'submitted_sheet_users', "TEXT NOT NULL DEFAULT ''");

  ensureColumn('users', 'user_status', "TEXT NOT NULL DEFAULT 'Кандидат'");
  ensureColumn('users', 'last_game_at', "TEXT");
  ensureColumn('users', 'warnings_count', "INTEGER NOT NULL DEFAULT 0");
  ensureColumn('users', 'games_count', "INTEGER NOT NULL DEFAULT 0");

  normalizeLegacyStatuses();
}

function ensureColumn(tableName: string, columnName: string, columnDefinition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

function normalizeLegacyStatuses() {
  sqlite.exec(`
    UPDATE games SET status = 'Идет набор' WHERE status = 'OPEN';
    UPDATE games SET status = 'Группа собрана' WHERE status IN ('FULL', 'CLOSED');
    UPDATE games SET status = 'Игра завершена' WHERE status IN ('DONE', 'ARCHIVED');
    UPDATE games SET status = 'Отменена' WHERE status = 'CANCELLED';

    UPDATE registrations SET status = 'Подтвержден' WHERE status = 'CONFIRMED';
    UPDATE registrations SET status = 'Лист ожидания' WHERE status = 'WAITLIST';
    UPDATE registrations SET status = 'Отменен' WHERE status = 'CANCELLED';
  `);
}
