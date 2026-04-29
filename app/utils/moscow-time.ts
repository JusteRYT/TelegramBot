const MSK_OFFSET_MINUTES = 3 * 60;

// Project convention: game starts_at stores Moscow wall-clock time in ISO-like UTC fields.
// Example: "2026-04-29T18:00:00.000Z" means 18:00 MSK for users, not 21:00 MSK.
export function parseMoscowDateTime(value?: string | null) {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hours = Number.parseInt(match[4], 10);
  const minutes = Number.parseInt(match[5], 10);
  const seconds = Number.parseInt(match[6] ?? '0', 10);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds, 0);
  const date = new Date(utcMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hours ||
    date.getUTCMinutes() !== minutes
  ) {
    return null;
  }

  return date.toISOString();
}

export function toMoscowDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatMoscowDate(date: Date) {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

export function formatMoscowTime(date: Date) {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function storedMoscowDateTimeToInstant(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes() - MSK_OFFSET_MINUTES,
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
