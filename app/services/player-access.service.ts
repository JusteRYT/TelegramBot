import { env } from '../config/env';
import { UserRepository } from '../repositories/user.repository';

import { ExternalValidationService } from './external-validation.service';

export class PlayerAccessService {
  constructor(
    private readonly externalValidation = new ExternalValidationService(),
    private readonly users = new UserRepository(),
  ) {}

  async canRegister(telegramUserId: number) {
    const user = this.users.findByTelegramId(telegramUserId);
    const status = await this.externalValidation.getUserStatus({
      userId: telegramUserId,
      username: user?.username ?? null,
    });

    if (!status.exists) {
      return { ok: false as const, reason: 'NOT_REGISTERED' };
    }

    if (status.isBanned) {
      return { ok: false as const, reason: 'BANNED' };
    }

    return { ok: true as const, status };
  }

  buildAuthInstruction() {
    const botName = (env.TELEGRAM_BOT_USERNAME || env.TELEGRAM_CANDIDATE_BOT_USERNAME).replace('@', '');
    return {
      text:
        '⚠️ <b>Вы не зарегистрированы в системе!</b>\n\n' +
        'Для участия запустите регистрацию в этом боте через /start.',
      url: `https://t.me/${botName}?start=guide`,
    };
  }
}
