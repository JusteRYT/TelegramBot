import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Bot } from 'grammy';

import { env } from '../config/env';
import { RegistrationRepository } from '../repositories/registration.repository';
import { UserRepository } from '../repositories/user.repository';
import { AnnouncementService } from '../services/announcement.service';
import { AuthService } from '../services/auth.service';
import { GameService } from '../services/game.service';

const auth = new AuthService();
const users = new UserRepository();
const games = new GameService();
const registrations = new RegistrationRepository();

type FormBody = Record<string, string | undefined>;

function ensureAdminPanelAuth(request: FastifyRequest, reply: FastifyReply) {
  if (auth.isAdminPanelAuthorized(request.headers.authorization)) {
    return true;
  }

  reply.header('www-authenticate', 'Basic realm="Admin Panel"');
  reply.code(401).send('Authentication required');
  return false;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post('/admin/games/:id/delete', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const gameId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(gameId)) {
      reply.code(400).send('Invalid game id');
      return;
    }

    const game = games.getById(gameId);
    if (!game) {
      reply.code(404).send('Game not found');
      return;
    }

    try {
      if (game.announcement_message_id) {
        await deleteAnnouncement(game.announcement_message_id);
      }

      games.deleteGame(gameId);
      reply.redirect('/admin?saved=game_deleted');
    } catch (error) {
      console.error(`Failed to delete game #${gameId}:`, error);
      reply.redirect('/admin?saved=game_delete_failed');
    }
  });

  app.post('/admin/games/:id', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const gameId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(gameId)) {
      reply.code(400).send('Invalid game id');
      return;
    }

    const game = games.getById(gameId);
    if (!game) {
      reply.code(404).send('Game not found');
      return;
    }

    const body = request.body as FormBody;
    const startsAt = parseDateTimeLocal(body.starts_at) ?? game.starts_at;
    const registrationLimit = parseNullableInt(body.registration_limit);
    const status = normalizeGameStatus(body.status) ?? game.status;

    games.updateGameField({
      gameId,
      type: normalizeGameType(body.type) ?? game.type,
      title: (body.title ?? '').trim() || game.title,
      description: normalizeNullableText(body.description),
      startsAt,
      gmName: normalizeNullableText(body.gm_name),
      registrationLimit,
      participantSlotsText: normalizeNullableText(body.participant_slots_text),
      registeredPlayersText: normalizePlayers(body.registered_players_text),
      imageFileId: normalizeNullableText(body.image_file_id),
      status,
      submittedSheetUsers: normalizeUsersCsv(body.submitted_sheet_users),
    });
    await syncAnnouncement(gameId);

    reply.redirect('/admin?saved=game');
  });

  app.post('/admin/users/:id', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const userId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(userId)) {
      reply.code(400).send('Invalid user id');
      return;
    }

    const body = request.body as FormBody;
    const ok = users.updateById({
      id: userId,
      username: normalizeNullableText(body.username),
      firstName: normalizeNullableText(body.first_name),
      lastName: normalizeNullableText(body.last_name),
      userStatus: normalizeUserStatus(body.user_status) ?? 'Кандидат',
      lastGameAt: normalizeNullableText(body.last_game_at),
      warningsCount: parseNonNegativeInt(body.warnings_count) ?? 0,
      gamesCount: parseNonNegativeInt(body.games_count) ?? 0,
      isAdmin: body.is_admin === '1',
    });

    if (!ok) {
      reply.code(404).send('User not found');
      return;
    }

    reply.redirect('/admin?saved=user');
  });

  app.post('/admin/users/:id/delete', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const userId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(userId)) {
      reply.code(400).send('Invalid user id');
      return;
    }

    try {
      const result = users.deleteById(userId);
      if (!result.ok) {
        const reason = result.reason === 'HAS_CREATED_GAMES'
          ? 'Нельзя удалить: пользователь является создателем игр.'
          : 'Не удалось удалить пользователя.';
        reply.redirect(`/admin?saved=${encodeURIComponent(reason)}`);
        return;
      }

      reply.redirect('/admin?saved=user_deleted');
    } catch (error) {
      console.error(`Failed to delete user #${userId}:`, error);
      reply.redirect('/admin?saved=user_delete_failed');
    }
  });

  app.post('/admin/warnings', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const body = request.body as FormBody;
    const warningId = parseNullableInt(body.warning_id);
    const userId = parseNullableInt(body.user_id);
    const reason = (body.reason ?? '').trim();
    const createdAt = parseDateTimeLocal(body.created_at);

    if (!userId || !users.findById(userId)) {
      reply.code(400).send('Invalid user id');
      return;
    }
    if (!reason) {
      reply.code(400).send('Reason is required');
      return;
    }

    if (warningId) {
      const ok = users.updateWarningLogById({ id: warningId, userId, reason, createdAt });
      if (!ok) {
        reply.code(404).send('Warning log not found');
        return;
      }
      reply.redirect('/admin?saved=warning_updated');
      return;
    }

    users.createWarningLog({ userId, reason, createdAt });
    reply.redirect('/admin?saved=warning_created');
  });

  app.post('/admin/warnings/:id/delete', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const warningId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(warningId)) {
      reply.code(400).send('Invalid warning id');
      return;
    }

    const ok = users.deleteWarningLogById(warningId);
    if (!ok) {
      reply.code(404).send('Warning log not found');
      return;
    }

    reply.redirect('/admin?saved=warning_deleted');
  });

  app.post('/admin/bans', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const body = request.body as FormBody;
    const banId = parseNullableInt(body.ban_id);
    const userId = parseNullableInt(body.user_id);
    const reason = (body.reason ?? '').trim();
    const createdAt = parseDateTimeLocal(body.created_at);
    const setStatusBanned = body.set_status_banned === '1';

    if (!userId || !users.findById(userId)) {
      reply.code(400).send('Invalid user id');
      return;
    }
    if (!reason) {
      reply.code(400).send('Reason is required');
      return;
    }

    if (setStatusBanned) {
      users.changeStatusById(userId, 'Бан');
    }

    if (banId) {
      const ok = users.updateBanLogById({ id: banId, userId, reason, createdAt });
      if (!ok) {
        reply.code(404).send('Ban log not found');
        return;
      }
      reply.redirect('/admin?saved=ban_updated');
      return;
    }

    users.createBanLog({ userId, reason, createdAt });
    reply.redirect('/admin?saved=ban_created');
  });

  app.post('/admin/bans/:id/delete', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const banId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(banId)) {
      reply.code(400).send('Invalid ban id');
      return;
    }

    const ok = users.deleteBanLogById(banId);
    if (!ok) {
      reply.code(404).send('Ban log not found');
      return;
    }

    reply.redirect('/admin?saved=ban_deleted');
  });

  app.post('/admin/registrations/:id', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const registrationId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(registrationId)) {
      reply.code(400).send('Invalid registration id');
      return;
    }

    const registration = registrations.findById(registrationId);
    if (!registration) {
      reply.code(404).send('Registration not found');
      return;
    }

    const body = request.body as FormBody;
    const status = normalizeRegistrationStatus(body.status);
    if (!status) {
      reply.code(400).send('Invalid registration status');
      return;
    }

    registrations.updateStatusById(registrationId, status);
    games.syncRegisteredPlayersText(registration.game_id);
    games.refreshStatus(registration.game_id);

    reply.redirect('/admin?saved=registration');
  });

  app.post('/admin/registrations/:id/delete', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const registrationId = Number.parseInt((request.params as { id: string }).id, 10);
    if (Number.isNaN(registrationId)) {
      reply.code(400).send('Invalid registration id');
      return;
    }

    const registration = registrations.findById(registrationId);
    if (!registration) {
      reply.code(404).send('Registration not found');
      return;
    }

    registrations.deleteById(registrationId);
    games.syncRegisteredPlayersText(registration.game_id);
    games.refreshStatus(registration.game_id);
    await syncAnnouncement(registration.game_id);

    reply.redirect('/admin?saved=registration_deleted');
  });

  app.get('/admin', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const query = request.query as { saved?: string };
    const allUsers = users.listAll();
    const allGames = games.listAllDetailed();
    const allRegistrations = registrations.listAllDetailed();
    const allWarnings = users.listWarningsDetailed();
    const allBans = users.listBansDetailed();

    const html = `
      <!doctype html>
      <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Telegram Bot Admin</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 18px; background: #f5f7fb; color: #1d2433; }
            h1, h2 { margin-bottom: 10px; }
            .card { background: white; border-radius: 12px; padding: 14px; margin-bottom: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); overflow-x: auto; }
            .hint { color: #63708a; margin-bottom: 12px; }
            .ok { background: #e9f9ef; border: 1px solid #b7e7c4; color: #166534; padding: 8px 10px; border-radius: 10px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; min-width: 1100px; table-layout: fixed; }
            th, td { text-align: left; padding: 6px; border-bottom: 1px solid #e7ebf3; vertical-align: middle; font-size: 12px; }
            th { background: #f0f4fb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; }
            input, textarea, select, button { font: inherit; }
            input, textarea, select { width: 100%; box-sizing: border-box; padding: 5px 7px; border: 1px solid #d4dbe8; border-radius: 7px; background: white; }
            textarea { min-height: 34px; resize: vertical; }
            button { background: #1d4ed8; color: white; border: none; border-radius: 7px; padding: 6px 8px; cursor: pointer; }
            .mono { font-family: Consolas, monospace; }
            .small { font-size: 10px; color: #63708a; margin-top: 2px; }
            .row-actions { display: flex; gap: 6px; }
            .btn-danger { background: #b42318; }
            .inline-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            .nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .compact { max-width: 220px; }
          </style>
        </head>
        <body>
          <h1>Telegram Bot Admin</h1>
          <p class="hint">Веб-морда для просмотра и редактирования записей БД. После изменения нажмите "Сохранить".</p>
          ${query.saved ? `<div class="ok">Изменения сохранены: ${escapeHtml(query.saved)}</div>` : ''}

          <div class="card">
            <h2>Игры</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название / тип / статус</th>
                  <th>Старт / мастер</th>
                  <th>Лимиты / игроки / анкеты</th>
                  <th>Описание / image_file_id</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                ${allGames
                  .map((game) => {
                    return `
                      <tr>
                        <form method="post" action="/admin/games/${game.id}">
                          <td class="mono">${game.id}</td>
                          <td>
                            <input name="title" value="${escapeAttr(game.title)}" />
                            <div class="small">type</div>
                            <select name="type">
                              ${selectOption(game.type, 'DND')}
                              ${selectOption(game.type, 'MAFIA')}
                              ${selectOption(game.type, 'OTHER')}
                            </select>
                            <div class="small">status</div>
                            <select name="status">
                              ${selectOptionLabel(game.status, 'OPEN', 'Идет набор')}
                              ${selectOptionLabel(game.status, 'FULL', 'Группа собрана')}
                              ${selectOptionLabel(game.status, 'DONE', 'Игра завершена')}
                              ${selectOptionLabel(game.status, 'CANCELLED', 'Отменена')}
                            </select>
                          </td>
                          <td>
                            <input type="datetime-local" name="starts_at" value="${escapeAttr(toDateTimeLocal(game.starts_at))}" />
                            <div class="small">gm_name</div>
                            <input name="gm_name" value="${escapeAttr(game.gm_name ?? '')}" />
                          </td>
                          <td>
                            <div class="small">registration_limit</div>
                            <input name="registration_limit" value="${escapeAttr(game.registration_limit?.toString() ?? '')}" />
                            <div class="small">participant_slots_text</div>
                            <input name="participant_slots_text" value="${escapeAttr(game.participant_slots_text ?? '')}" />
                            <div class="small">registered_players_text</div>
                            <textarea name="registered_players_text">${escapeHtml(game.registered_players_text ?? '')}</textarea>
                            <div class="small">submitted_sheet_users</div>
                            <input name="submitted_sheet_users" value="${escapeAttr(game.submitted_sheet_users ?? '')}" />
                          </td>
                          <td>
                            <div class="small">description</div>
                            <textarea name="description">${escapeHtml(game.description ?? '')}</textarea>
                            <div class="small">image_file_id</div>
                            <input name="image_file_id" value="${escapeAttr(game.image_file_id ?? '')}" />
                          </td>
                          <td style="min-width: 170px;">
                            <button type="submit">Сохранить</button>
                            <button
                              type="submit"
                              formaction="/admin/games/${game.id}/delete"
                              formmethod="post"
                              style="margin-top:8px; background:#b42318;"
                              onclick="return confirm('Удалить игру #${game.id}?');"
                            >
                              Удалить
                            </button>
                          </td>
                        </form>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="card">
            <h2>Пользователи</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Telegram</th>
                  <th>Username</th>
                  <th>Имя</th>
                  <th>Фамилия</th>
                  <th>Статус</th>
                  <th>Last game</th>
                  <th>Warn</th>
                  <th>Games</th>
                  <th>Admin</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                ${allUsers
                  .map(
                    (user) => `
                      <tr>
                        <form method="post" action="/admin/users/${user.id}">
                          <td class="mono nowrap">${user.id}</td>
                          <td class="mono nowrap">${user.telegram_id}</td>
                          <td><input name="username" value="${escapeAttr(user.username ?? '')}" /></td>
                          <td><input name="first_name" value="${escapeAttr(user.first_name ?? '')}" /></td>
                          <td><input name="last_name" value="${escapeAttr(user.last_name ?? '')}" /></td>
                          <td>
                            <select name="user_status">
                              ${selectOptionLabel(user.user_status, 'Не зарегистрирован', 'Не зарегистрирован')}
                              ${selectOptionLabel(user.user_status, 'Кандидат', 'Кандидат')}
                              ${selectOptionLabel(user.user_status, 'На проверке', 'На проверке')}
                              ${selectOptionLabel(user.user_status, 'Одобрен', 'Одобрен')}
                              ${selectOptionLabel(user.user_status, 'Бан', 'Бан')}
                            </select>
                          </td>
                          <td><input name="last_game_at" value="${escapeAttr(user.last_game_at ?? '')}" /></td>
                          <td><input name="warnings_count" value="${escapeAttr(String(user.warnings_count ?? 0))}" /></td>
                          <td><input name="games_count" value="${escapeAttr(String(user.games_count ?? 0))}" /></td>
                          <td>
                            <select name="is_admin">
                              <option value="0"${user.is_admin ? '' : ' selected'}>no</option>
                              <option value="1"${user.is_admin ? ' selected' : ''}>yes</option>
                            </select>
                          </td>
                          <td>
                            <div class="row-actions">
                              <button type="submit">Сохранить</button>
                              <button
                                type="submit"
                                formaction="/admin/users/${user.id}/delete"
                                formmethod="post"
                                class="btn-danger"
                                onclick="return confirm('Удалить пользователя #${user.id}?');"
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </form>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="card">
            <h2>Предупреждения (warnings_log)</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Пользователь</th>
                  <th>Причина</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <form method="post" action="/admin/warnings">
                    <td class="mono">new</td>
                    <td>
                      <input type="hidden" name="warning_id" value="" />
                      <select name="user_id">
                        ${allUsers
                          .map((u) => `<option value="${u.id}">#${u.id} ${escapeHtml(u.username ? `@${u.username}` : String(u.telegram_id))}</option>`)
                          .join('')}
                      </select>
                    </td>
                    <td><input name="reason" placeholder="Причина предупреждения" /></td>
                    <td><input type="datetime-local" name="created_at" value="" /></td>
                    <td><button type="submit">Добавить</button></td>
                  </form>
                </tr>
                ${allWarnings
                  .map(
                    (item) => `
                      <tr>
                        <form method="post" action="/admin/warnings">
                          <td class="mono">${item.id}<input type="hidden" name="warning_id" value="${item.id}" /></td>
                          <td>
                            <select name="user_id">
                              ${allUsers
                                .map(
                                  (u) =>
                                    `<option value="${u.id}"${u.id === item.user_id ? ' selected' : ''}>#${u.id} ${escapeHtml(u.username ? `@${u.username}` : String(u.telegram_id))}</option>`,
                                )
                                .join('')}
                            </select>
                          </td>
                          <td><input name="reason" value="${escapeAttr(item.reason)}" /></td>
                          <td><input type="datetime-local" name="created_at" value="${escapeAttr(toDateTimeLocal(item.created_at))}" /></td>
                          <td>
                            <div class="row-actions">
                              <button type="submit">Сохранить</button>
                              <button
                                type="submit"
                                formaction="/admin/warnings/${item.id}/delete"
                                formmethod="post"
                                class="btn-danger"
                                onclick="return confirm('Удалить предупреждение #${item.id}?');"
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </form>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="card">
            <h2>Баны (bans_log)</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Пользователь</th>
                  <th>Причина</th>
                  <th>Дата</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <form method="post" action="/admin/bans">
                    <td class="mono">new</td>
                    <td>
                      <input type="hidden" name="ban_id" value="" />
                      <select name="user_id">
                        ${allUsers
                          .map((u) => `<option value="${u.id}">#${u.id} ${escapeHtml(u.username ? `@${u.username}` : String(u.telegram_id))}</option>`)
                          .join('')}
                      </select>
                    </td>
                    <td><input name="reason" placeholder="Причина бана" /></td>
                    <td><input type="datetime-local" name="created_at" value="" /></td>
                    <td>
                      <select name="set_status_banned">
                        <option value="1" selected>Ставить Бан</option>
                        <option value="0">Не менять</option>
                      </select>
                    </td>
                    <td><button type="submit">Добавить</button></td>
                  </form>
                </tr>
                ${allBans
                  .map(
                    (item) => `
                      <tr>
                        <form method="post" action="/admin/bans">
                          <td class="mono">${item.id}<input type="hidden" name="ban_id" value="${item.id}" /></td>
                          <td>
                            <select name="user_id">
                              ${allUsers
                                .map(
                                  (u) =>
                                    `<option value="${u.id}"${u.id === item.user_id ? ' selected' : ''}>#${u.id} ${escapeHtml(u.username ? `@${u.username}` : String(u.telegram_id))}</option>`,
                                )
                                .join('')}
                            </select>
                          </td>
                          <td><input name="reason" value="${escapeAttr(item.reason)}" /></td>
                          <td><input type="datetime-local" name="created_at" value="${escapeAttr(toDateTimeLocal(item.created_at))}" /></td>
                          <td>
                            <select name="set_status_banned">
                              <option value="1">Ставить Бан</option>
                              <option value="0" selected>Не менять</option>
                            </select>
                          </td>
                          <td>
                            <div class="row-actions">
                              <button type="submit">Сохранить</button>
                              <button
                                type="submit"
                                formaction="/admin/bans/${item.id}/delete"
                                formmethod="post"
                                class="btn-danger"
                                onclick="return confirm('Удалить бан #${item.id}?');"
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </form>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="card">
            <h2>Регистрации</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Игра / Пользователь</th>
                  <th>Статус</th>
                  <th>Создано</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                ${allRegistrations
                  .map(
                    (item) => `
                      <tr>
                        <form method="post" action="/admin/registrations/${item.id}">
                          <td class="mono">${item.id}</td>
                          <td>#${item.game_id} ${escapeHtml(item.game_title)}<br/>${item.username ? `@${escapeHtml(item.username)}` : escapeHtml(item.first_name ?? String(item.telegram_id))}</td>
                          <td>
                            <select name="status">
                              ${selectOptionLabel(item.status, 'CONFIRMED', 'Подтвержден')}
                              ${selectOptionLabel(item.status, 'WAITLIST', 'Лист ожидания')}
                              ${selectOptionLabel(item.status, 'CANCELLED', 'Отменен')}
                            </select>
                          </td>
                          <td>${escapeHtml(item.created_at)}</td>
                          <td style="min-width: 170px;">
                            <button type="submit">Сохранить</button>
                            <button
                              type="submit"
                              formaction="/admin/registrations/${item.id}/delete"
                              formmethod="post"
                              style="margin-top:8px; background:#b42318;"
                              onclick="return confirm('Удалить регистрацию #${item.id}?');"
                            >
                              Удалить
                            </button>
                          </td>
                        </form>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;

    reply.type('text/html').send(html);
  });
}

function parseDateTimeLocal(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseNullableInt(value?: string) {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNonNegativeInt(value?: string) {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeNullableText(value?: string) {
  const normalized = (value ?? '').trim();
  return normalized.length ? normalized : null;
}

function normalizeUsersCsv(value?: string) {
  return (value ?? '')
    .split(/[,;\n]+/)
    .map((item) => item.trim().replace('@', '').toLowerCase())
    .filter(Boolean)
    .join(',');
}

function normalizePlayers(value?: string) {
  return (value ?? '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',');
}

function normalizeGameStatus(value?: string) {
  const aliases: Record<string, 'OPEN' | 'FULL' | 'DONE' | 'CANCELLED'> = {
    OPEN: 'OPEN',
    FULL: 'FULL',
    DONE: 'DONE',
    CANCELLED: 'CANCELLED',
    'Идет набор': 'OPEN',
    'Группа собрана': 'FULL',
    'Игра завершена': 'DONE',
    'Отменена': 'CANCELLED',
  };

  if (!value) {
    return null;
  }

  return aliases[value] ?? null;
}

function normalizeGameType(value?: string) {
  const allowed = new Set(['DND', 'MAFIA', 'OTHER']);
  return value && allowed.has(value) ? (value as 'DND' | 'MAFIA' | 'OTHER') : null;
}

function normalizeRegistrationStatus(value?: string) {
  const aliases: Record<string, 'CONFIRMED' | 'WAITLIST' | 'CANCELLED'> = {
    CONFIRMED: 'CONFIRMED',
    WAITLIST: 'WAITLIST',
    CANCELLED: 'CANCELLED',
    'Подтвержден': 'CONFIRMED',
    'Лист ожидания': 'WAITLIST',
    'Отменен': 'CANCELLED',
  };

  if (!value) {
    return null;
  }

  return aliases[value] ?? null;
}

function normalizeUserStatus(value?: string) {
  const allowed = new Set(['Не зарегистрирован', 'Кандидат', 'На проверке', 'Одобрен', 'Бан']);
  return value && allowed.has(value) ? value : null;
}

function selectOption(current: string, option: string) {
  return `<option value="${option}"${current === option ? ' selected' : ''}>${option}</option>`;
}

function selectOptionLabel(current: string, value: string, label: string) {
  return `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

async function syncAnnouncement(gameId: number) {
  if (env.TELEGRAM_BOT_TOKEN === 'replace_with_real_bot_token') {
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const announcements = new AnnouncementService(bot);

  try {
    await announcements.refreshGame(gameId);
  } catch (error) {
    console.error(`Failed to sync announcement for game #${gameId}`, error);
  }
}

async function deleteAnnouncement(messageId: number) {
  if (env.TELEGRAM_BOT_TOKEN === 'replace_with_real_bot_token') {
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const announcements = new AnnouncementService(bot);

  await announcements.deleteAnnouncementMessage(messageId);
}
