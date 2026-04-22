import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { env } from '../config/env';

function main() {
  const sourcePath = path.resolve(env.DATABASE_PATH);
  const backupDir = path.resolve(env.BACKUP_DIR);
  const retentionDays = Math.max(1, env.BACKUP_RETENTION_DAYS);

  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = formatTimestamp(new Date());
  const profile = env.APP_PROFILE === 'default' ? 'prod' : env.APP_PROFILE;
  const backupFileName = `backup-${profile}-${timestamp}.db`;
  const backupPath = path.join(backupDir, backupFileName);

  const db = new DatabaseSync(sourcePath);
  try {
    const sqlTargetPath = backupPath.replaceAll('\\', '/').replaceAll("'", "''");
    db.exec(`VACUUM INTO '${sqlTargetPath}';`);
  } finally {
    db.close();
  }

  const deleted = cleanupOldBackups(backupDir, retentionDays);
  console.log(
    `Backup created: ${backupPath}. Retention: ${retentionDays} day(s). Deleted old backups: ${deleted}.`,
  );
}

function cleanupOldBackups(dir: string, retentionDays: number) {
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deleted = 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.db')) {
      continue;
    }

    const filePath = path.join(dir, entry.name);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs <= maxAgeMs) {
      continue;
    }

    fs.unlinkSync(filePath);
    deleted += 1;
  }

  return deleted;
}

function formatTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

main();
