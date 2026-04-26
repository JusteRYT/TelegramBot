import { GameRepository } from '../repositories/game.repository';
import { RegistrationRepository } from '../repositories/registration.repository';

import { GameService } from './game.service';

export class RegistrationService {
  constructor(
    private readonly games = new GameRepository(),
    private readonly registrations = new RegistrationRepository(),
    private readonly gameService = new GameService(),
  ) {}

  register(gameId: number, userId: number) {
    const game = this.games.findById(gameId);
    if (!game) {
      return { ok: false as const, reason: 'GAME_NOT_FOUND' };
    }

    if (!['OPEN', 'FULL'].includes(game.status)) {
      return { ok: false as const, reason: 'REGISTRATION_CLOSED' };
    }

    const existing = this.registrations.findByGameAndUser(gameId, userId);
    if (existing && existing.status !== 'CANCELLED') {
      return { ok: false as const, reason: 'ALREADY_REGISTERED' };
    }

    const nextStatus = 'WAITLIST';

    const registration = this.registrations.createOrRestore(gameId, userId, nextStatus);
    this.gameService.refreshStatus(gameId);
    this.gameService.syncRegisteredPlayersText(gameId);

    return { ok: true as const, registration };
  }

  unregister(gameId: number, userId: number) {
    const cancelled = this.registrations.cancel(gameId, userId);
    if (!cancelled) {
      return { ok: false as const, reason: 'NOT_REGISTERED' };
    }

    this.gameService.refreshStatus(gameId);
    this.gameService.syncRegisteredPlayersText(gameId);
    return { ok: true as const };
  }

  hasActiveRegistration(gameId: number, userId: number) {
    const existing = this.registrations.findByGameAndUser(gameId, userId);
    return Boolean(existing && existing.status !== 'CANCELLED');
  }
}
