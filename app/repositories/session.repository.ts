import { sqlite } from '../db/database';

export class SessionRepository {
  get<T>(key: string): T | null {
    const row = sqlite
      .prepare('SELECT payload FROM sessions WHERE key = ?')
      .get(key) as { payload: string } | undefined;

    return row ? (JSON.parse(row.payload) as T) : null;
  }

  set<T>(key: string, payload: T) {
    sqlite
      .prepare(
        `
        INSERT INTO sessions (key, payload)
        VALUES (@key, @payload)
        ON CONFLICT(key) DO UPDATE SET
          payload = excluded.payload,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run({
        key,
        payload: JSON.stringify(payload),
      });
  }

  delete(key: string) {
    sqlite.prepare('DELETE FROM sessions WHERE key = ?').run(key);
  }
}
