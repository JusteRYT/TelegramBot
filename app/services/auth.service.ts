import { env } from '../config/env';

export class AuthService {
  isAdminTelegramId(telegramId: number) {
    return env.telegramAdminIds.includes(telegramId);
  }

  isAdminPanelAuthorized(authHeader?: string) {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return false;
    }

    const raw = authHeader.slice('Basic '.length);
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');

    return username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD;
  }
}
