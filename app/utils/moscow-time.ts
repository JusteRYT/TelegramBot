const MSK_OFFSET_MINUTES = 3 * 60;

export function parseMoscowDateTime(value?: string | null) {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

  const utcMs = Date.UTC(year, month - 1, day, hours, minutes - MSK_OFFSET_MINUTES, seconds, 0);
  const date = new Date(utcMs);
  if (
    getMoscowPart(date, 'year') !== year ||
    getMoscowPart(date, 'month') !== month ||
    getMoscowPart(date, 'day') !== day ||
    getMoscowPart(date, 'hour') !== hours ||
    getMoscowPart(date, 'minute') !== minutes
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

  const year = String(getMoscowPart(date, 'year')).padStart(4, '0');
  const month = String(getMoscowPart(date, 'month')).padStart(2, '0');
  const day = String(getMoscowPart(date, 'day')).padStart(2, '0');
  const hours = String(getMoscowPart(date, 'hour')).padStart(2, '0');
  const minutes = String(getMoscowPart(date, 'minute')).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatMoscowDate(date: Date) {
  const day = String(getMoscowPart(date, 'day')).padStart(2, '0');
  const month = String(getMoscowPart(date, 'month')).padStart(2, '0');
  const year = getMoscowPart(date, 'year');
  return `${day}.${month}.${year}`;
}

export function formatMoscowTime(date: Date) {
  const hours = String(getMoscowPart(date, 'hour')).padStart(2, '0');
  const minutes = String(getMoscowPart(date, 'minute')).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getMoscowPart(date: Date, type: 'year' | 'month' | 'day' | 'hour' | 'minute') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return Number.parseInt(parts.find((item) => item.type === type)?.value ?? '0', 10);
}
