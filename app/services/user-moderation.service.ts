import { UserRepository } from '../repositories/user.repository';

const MAX_WARNINGS = 2;

export class UserModerationService {
  constructor(private readonly users = new UserRepository()) {}

  registerByTelegram(telegramId: number) {
    return this.users.ensureRegistered(telegramId);
  }

  resolveByMention(mention: string) {
    return this.users.findByUsername(mention);
  }

  warnByMention(mention: string, reason: string) {
    const user = this.resolveByMention(mention);
    if (!user) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    this.users.addWarning(user.id, reason || 'Причина не указана');
    const updated = this.users.findById(user.id);
    if (!updated) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    if (updated.warnings_count >= MAX_WARNINGS && updated.user_status !== 'Бан') {
      this.users.changeStatusById(user.id, 'Бан');
      this.users.addBan(user.id, `Автобан: ${updated.warnings_count}/${MAX_WARNINGS} предупреждений`);
      return { ok: true as const, user: { ...updated, user_status: 'Бан' }, autoBanned: true };
    }

    return { ok: true as const, user: updated, autoBanned: false };
  }

  changeStatusByMention(mention: string, status: 'Кандидат' | 'На проверке' | 'Одобрен' | 'Бан') {
    const user = this.resolveByMention(mention);
    if (!user) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    this.users.changeStatusById(user.id, status);
    return { ok: true as const, user: this.users.findById(user.id)! };
  }

  banByMention(mention: string, reason: string) {
    const user = this.resolveByMention(mention);
    if (!user) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    this.users.changeStatusById(user.id, 'Бан');
    this.users.addBan(user.id, reason || 'Причина не указана');
    return { ok: true as const, user: this.users.findById(user.id)! };
  }

  addCandidate(mention: string) {
    const clean = mention.replace('@', '').trim();
    if (!clean) {
      return { ok: false as const, reason: 'INVALID' };
    }

    const existing = this.users.findByUsername(clean);
    if (existing) {
      this.users.changeStatusById(existing.id, 'Кандидат');
      return { ok: true as const, user: this.users.findById(existing.id)!, created: false as const };
    }

    const created = this.users.createManualUser({
      username: clean,
      status: 'Кандидат',
    });

    if (!created) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    return { ok: true as const, user: created, created: true as const };
  }

  recordGameByMention(mention: string) {
    const user = this.resolveByMention(mention);
    if (!user) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    this.users.incrementGamesByUserId(user.id);
    return { ok: true as const, user: this.users.findById(user.id)! };
  }

  getInfoByMention(mention: string) {
    const user = this.resolveByMention(mention);
    if (!user) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    const warnings = this.users.getWarnings(user.id);
    const banReason = this.users.getLatestBanReason(user.id);
    return { ok: true as const, user, warnings, banReason };
  }

  listByStatus(status: string) {
    return this.users.listByStatuses([status]);
  }

  listAllGrouped() {
    return this.users.listGroupedByStatus();
  }

  removeByMention(mention: string, reason: string) {
    const user = this.resolveByMention(mention);
    if (!user) {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }

    this.users.logWarningHistory(user.id, `❌ УДАЛЕН: ${reason || 'без причины'}`);
    return this.users.deleteById(user.id);
  }
}
