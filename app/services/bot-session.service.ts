import { SessionRepository } from '../repositories/session.repository';
import type { WizardState } from '../bot/types';

export class BotSessionService {
  constructor(private readonly sessions = new SessionRepository()) {}

  get(telegramId: number) {
    return this.sessions.get<WizardState>(this.key(telegramId));
  }

  set(telegramId: number, state: WizardState) {
    this.sessions.set(this.key(telegramId), state);
  }

  clear(telegramId: number) {
    this.sessions.delete(this.key(telegramId));
  }

  private key(telegramId: number) {
    return `state_${telegramId}`;
  }
}
