import { env } from '../config/env';
import { UserRepository } from '../repositories/user.repository';

type ExternalUserStatus = {
  exists: boolean;
  isBanned?: boolean;
  gamesCount?: number;
  status?: string;
};

type ExternalInactiveUser = {
  id: number;
  username: string;
};

export class ExternalValidationService {
  private readonly users = new UserRepository();

  private get apiUrl() {
    return env.TELEGRAM_CANDIDATE_BOT_API_URL.trim();
  }

  get enabled() {
    return this.apiUrl.length > 0;
  }

  async getUserStatus(params: { username?: string | null; userId?: number | null }): Promise<ExternalUserStatus> {
    if (!this.enabled) {
      const user = this.resolveLocalUser(params);
      if (!user) {
        return { exists: false, isBanned: false, gamesCount: 0, status: 'Не зарегистрирован' };
      }

      const exists = user.user_status !== 'Не зарегистрирован';
      const isBanned = user.user_status === 'Бан';
      return { exists, isBanned, gamesCount: user.games_count, status: user.user_status };
    }

    const url = new URL(this.apiUrl);
    url.searchParams.set('action', 'check_user');
    if (params.userId) {
      url.searchParams.set('userId', String(params.userId));
    }
    if (params.username) {
      url.searchParams.set('username', params.username);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`External validator failed with status ${response.status}`);
    }

    return (await response.json()) as ExternalUserStatus;
  }

  async notifyGameStarted(tags: string[]) {
    if (!this.enabled || tags.length === 0) {
      for (const tag of tags) {
        const user = this.resolveLocalUser({ username: tag });
        if (!user) {
          continue;
        }
        this.users.incrementGamesByUserId(user.id);
      }
      return;
    }

    const url = new URL(this.apiUrl);
    url.searchParams.set('action', 'log_game');
    url.searchParams.set('tags', tags.join(','));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`External game log failed with status ${response.status}`);
    }
  }

  async getInactiveUsers() {
    if (!this.enabled) {
      return this.users.listInactive(['Кандидат', 'На проверке', 'Одобрен'], 3);
    }

    const url = new URL(this.apiUrl);
    url.searchParams.set('action', 'get_inactive');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`External inactive fetch failed with status ${response.status}`);
    }

    return (await response.json()) as ExternalInactiveUser[];
  }

  registerLocalUser(userId: number) {
    return this.users.ensureRegistered(userId);
  }

  private resolveLocalUser(params: { username?: string | null; userId?: number | null }) {
    if (params.userId) {
      const byId = this.users.findByTelegramId(params.userId);
      if (byId) {
        return byId;
      }
    }

    if (params.username) {
      return this.users.findByUsername(params.username);
    }

    return undefined;
  }
}
