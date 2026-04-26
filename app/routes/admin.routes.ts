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
  app.post('/admin/games', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const body = request.body as FormBody;
    const startsAt = parseDateTimeLocal(body.starts_at);
    if (!startsAt) {
      reply.redirect('/admin?saved=invalid_game_datetime');
      return;
    }

    const createdByUserId = parseNullableInt(body.created_by_user_id);
    if (!createdByUserId || !users.findById(createdByUserId)) {
      reply.redirect('/admin?saved=invalid_game_creator');
      return;
    }

    const type = normalizeGameType(body.type) ?? 'DND';
    const status = normalizeGameStatus(body.status) ?? 'OPEN';
    const registrationLimit = parseNullableInt(body.registration_limit) ?? undefined;

    const created = games.createGame({
      type,
      title: (body.title ?? '').trim(),
      startsAtInput: startsAt,
      gmName: normalizeNullableText(body.gm_name),
      registrationLimit,
      participantSlotsText: normalizeNullableText(body.participant_slots_text),
      registeredPlayersText: normalizePlayers(body.registered_players_text),
      imageFileId: normalizeNullableText(body.image_file_id),
      description: normalizeNullableText(body.description),
      status,
      createdByUserId,
    });

    if (!created.ok) {
      reply.redirect(`/admin?saved=${encodeURIComponent(`game_create_failed_${created.reason}`)}`);
      return;
    }

    reply.redirect('/admin?saved=game_created');
  });

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
      lastGameAt: parseDateTimeLocal(body.last_game_at) ?? normalizeNullableText(body.last_game_at),
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

  app.post('/admin/users', async (request, reply) => {
    if (!ensureAdminPanelAuth(request, reply)) {
      return;
    }

    const body = request.body as FormBody;
    const usernameRaw = (body.username ?? '').trim();
    if (!usernameRaw) {
      reply.redirect('/admin?saved=username_required');
      return;
    }

    const normalizedUsername = usernameRaw.replace('@', '').trim();
    const firstName = normalizeNullableText(body.first_name);
    const lastName = normalizeNullableText(body.last_name);
    const status = normalizeUserStatus(body.user_status) ?? 'Кандидат';
    const warningsCount = parseNonNegativeInt(body.warnings_count) ?? 0;
    const gamesCount = parseNonNegativeInt(body.games_count) ?? 0;
    const isAdmin = body.is_admin === '1';
    const lastGameAt = parseDateTimeLocal(body.last_game_at) ?? null;
    const telegramId = parseTelegramId(body.telegram_id);

    let user =
      telegramId !== null
        ? users.upsertByTelegram({
            telegramId,
            username: normalizedUsername,
            firstName,
            lastName,
            isAdmin,
          })
        : users.createManualUser({
            username: normalizedUsername,
            firstName,
            lastName,
            status,
          });

    if (!user) {
      reply.redirect('/admin?saved=user_create_failed');
      return;
    }

    users.updateById({
      id: user.id,
      username: normalizedUsername,
      firstName,
      lastName,
      userStatus: status,
      warningsCount,
      gamesCount,
      lastGameAt,
      isAdmin,
    });

    user = users.findById(user.id);
    if (!user) {
      reply.redirect('/admin?saved=user_create_failed');
      return;
    }

    reply.redirect('/admin?saved=user_created');
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
            :root {
              --bg: #f6f9ff;
              --bg-soft: #e8f0ff;
              --surface: #ffffff;
              --surface-2: #f9fbff;
              --text: #18243a;
              --muted: #607293;
              --line: #d8e3f4;
              --accent: #2463eb;
              --accent-soft: #e8f0ff;
              --danger: #d0342c;
              --success-bg: #e8f8ee;
              --success-line: #bce7ca;
              --success-text: #13653c;
              --shadow: 0 10px 30px rgba(20, 33, 60, 0.10);
              --stripe: #f5f8ff;
            }
            body[data-theme="dark"] {
              --bg: #0b1323;
              --bg-soft: #13213a;
              --surface: #162238;
              --surface-2: #101b2f;
              --text: #edf3ff;
              --muted: #b5c2db;
              --line: #2a3a59;
              --accent: #66a0ff;
              --accent-soft: #1b2d4d;
              --danger: #ff6b63;
              --success-bg: #183829;
              --success-line: #2a5e46;
              --success-text: #b6f6d0;
              --shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
              --stripe: #132039;
            }
            * { box-sizing: border-box; }
            body {
              font-family: "Segoe UI", "Trebuchet MS", sans-serif;
              margin: 0;
              padding: 18px;
              color: var(--text);
              background:
                radial-gradient(1200px 450px at 0% -5%, var(--bg-soft), transparent 60%),
                radial-gradient(1000px 450px at 100% 0%, var(--bg-soft), transparent 58%),
                var(--bg);
            }
            h1, h2, h3 { margin: 0; }
            .layout { max-width: 1600px; margin: 0 auto; }
            .topbar {
              position: sticky;
              top: 0;
              z-index: 20;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding: 14px;
              margin-bottom: 14px;
              border-radius: 14px;
              border: 1px solid var(--line);
              background: var(--surface);
              box-shadow: var(--shadow);
            }
            .title-wrap small { display: block; color: var(--muted); margin-top: 4px; font-size: 12px; }
            .theme-toggle {
              border: 1px solid var(--line);
              background: var(--surface-2);
              color: var(--text);
              border-radius: 10px;
              padding: 8px 12px;
              cursor: pointer;
            }
            .card {
              background: var(--surface);
              border-radius: 14px;
              border: 1px solid var(--line);
              padding: 14px;
              margin-bottom: 14px;
              box-shadow: var(--shadow);
              overflow-x: auto;
            }
            .section-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              margin-bottom: 8px;
            }
            .hint { color: var(--muted); margin: 0 0 12px 0; }
            .ok {
              background: var(--success-bg);
              border: 1px solid var(--success-line);
              color: var(--success-text);
              padding: 10px 12px;
              border-radius: 10px;
              margin-bottom: 12px;
            }
            table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              min-width: 980px;
              table-layout: fixed;
              border: 1px solid var(--line);
              border-radius: 12px;
              overflow: hidden;
            }
            th, td {
              text-align: left;
              padding: 8px;
              border-bottom: 1px solid var(--line);
              vertical-align: middle;
              font-size: 12px;
            }
            th {
              position: sticky;
              top: 64px;
              z-index: 4;
              background: var(--surface-2);
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.03em;
            }
            tbody tr:nth-child(even) { background: var(--stripe); }
            input, textarea, select, button { font: inherit; }
            input, textarea, select {
              width: 100%;
              padding: 6px 8px;
              border: 1px solid var(--line);
              border-radius: 8px;
              color: var(--text);
              background: var(--surface-2);
            }
            textarea { min-height: 42px; resize: vertical; }
            input:focus, textarea:focus, select:focus {
              outline: none;
              border-color: var(--accent);
              box-shadow: 0 0 0 3px rgba(70, 130, 255, 0.22);
            }
            button {
              background: var(--accent);
              color: #fff;
              border: none;
              border-radius: 8px;
              padding: 7px 11px;
              cursor: pointer;
              font-weight: 600;
            }
            .btn-secondary {
              background: var(--accent-soft);
              color: var(--text);
              border: 1px solid var(--line);
            }
            .btn-danger { background: var(--danger); }
            .mono { font-family: Consolas, monospace; }
            .small { font-size: 10px; color: var(--muted); margin-top: 2px; }
            .row-actions { display: flex; gap: 6px; }
            .nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .game-stack { display: grid; gap: 6px; }
            .new-entry {
              background: var(--surface-2);
              border: 1px dashed var(--line);
              border-radius: 12px;
              padding: 12px;
              margin: 0 0 12px 0;
            }
            .new-entry h3 { margin-bottom: 8px; font-size: 14px; }
            .new-entry-grid { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 8px; }
            .collapsible-form { display: none; }
            .collapsible-form.open { display: block; }
            .status-help {
              background: var(--surface-2);
              border: 1px solid var(--line);
              border-radius: 10px;
              padding: 10px;
              margin-bottom: 10px;
              font-size: 12px;
              color: var(--text);
            }
            @media (max-width: 920px) {
              body { padding: 10px; }
              .topbar { position: static; }
              .new-entry-grid { grid-template-columns: 1fr 1fr; }
            }
            @media (max-width: 640px) {
              .new-entry-grid { grid-template-columns: 1fr; }
              .section-head { flex-direction: column; align-items: flex-start; }
            }
          </style>
        </head>
        <body>
          <div class="layout">
          <div class="topbar">
            <div class="title-wrap">
              <h1>Telegram Bot Admin</h1>
              <small>Панель управления играми и игроками</small>
            </div>
            <button type="button" id="themeToggle" class="theme-toggle">🌙 Тема</button>
          </div>
          <p class="hint">Веб-морда для просмотра и редактирования записей БД. После изменения нажмите "Сохранить".</p>
          ${query.saved ? `<div class="ok">Изменения сохранены: ${escapeHtml(query.saved)}</div>` : ''}

          <div class="card">
            <div class="section-head">
              <h2>Игры</h2>
              <button type="button" class="btn-secondary" data-toggle="createGameForm">+ Добавить игру</button>
            </div>
            <div class="hint">Редактирование игр в более компактном виде: слева основные параметры, справа состав и медиа.</div>
            <form method="post" action="/admin/games" class="new-entry collapsible-form" id="createGameForm">
              <h3>Добавить новую игру</h3>
              <div class="new-entry-grid">
                <div>
                  <div class="small">Название</div>
                  <input name="title" placeholder="Название игры" />
                </div>
                <div>
                  <div class="small">Тип</div>
                  <select name="type">
                    <option value="DND">DND</option>
                    <option value="MAFIA">MAFIA</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <div class="small">Статус</div>
                  <select name="status">
                    <option value="OPEN">Идет набор</option>
                    <option value="FULL">Группа собрана</option>
                    <option value="DONE">Игра завершена</option>
                    <option value="CANCELLED">Отменена</option>
                  </select>
                </div>
                <div>
                  <div class="small">Старт (МСК)</div>
                  <input type="datetime-local" name="starts_at" value="" />
                </div>
                <div>
                  <div class="small">ГМ</div>
                  <input name="gm_name" placeholder="@gm_username" />
                </div>
                <div>
                  <div class="small">Лимит мест</div>
                  <input name="registration_limit" placeholder="например 5" />
                </div>
                <div>
                  <div class="small">Создатель (user_id)</div>
                  <select name="created_by_user_id">
                    ${allUsers
                      .map((u) => `<option value="${u.id}">#${u.id} ${escapeHtml(u.username ? `@${u.username}` : String(u.telegram_id))}</option>`)
                      .join('')}
                  </select>
                </div>
                <div>
                  <div class="small">image_file_id</div>
                  <input name="image_file_id" placeholder="опционально" />
                </div>
                <div style="grid-column: span 2;">
                  <div class="small">participant_slots_text</div>
                  <input name="participant_slots_text" placeholder="опционально" />
                </div>
                <div style="grid-column: span 2;">
                  <div class="small">registered_players_text (через запятую)</div>
                  <input name="registered_players_text" placeholder="@user1, @user2" />
                </div>
                <div style="grid-column: span 4;">
                  <div class="small">Описание</div>
                  <textarea name="description" placeholder="Описание игры"></textarea>
                </div>
              </div>
              <div style="margin-top: 8px;">
                <button type="submit">Добавить игру</button>
              </div>
            </form>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Основное</th>
                  <th>Дата и мастер</th>
                  <th>Состав</th>
                  <th>Описание и медиа</th>
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
                            <div class="game-stack">
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
                            </div>
                          </td>
                          <td>
                            <div class="game-stack">
                            <input type="datetime-local" name="starts_at" value="${escapeAttr(toDateTimeLocal(game.starts_at))}" />
                            <div class="small">gm_name</div>
                            <input name="gm_name" value="${escapeAttr(game.gm_name ?? '')}" />
                            </div>
                          </td>
                          <td>
                            <div class="game-stack">
                            <div class="small">registration_limit</div>
                            <input name="registration_limit" value="${escapeAttr(game.registration_limit?.toString() ?? '')}" />
                            <div class="small">participant_slots_text</div>
                            <input name="participant_slots_text" value="${escapeAttr(game.participant_slots_text ?? '')}" />
                            <div class="small">registered_players_text</div>
                            <textarea name="registered_players_text">${escapeHtml(game.registered_players_text ?? '')}</textarea>
                            <div class="small">submitted_sheet_users</div>
                            <input name="submitted_sheet_users" value="${escapeAttr(game.submitted_sheet_users ?? '')}" />
                            </div>
                          </td>
                          <td>
                            <div class="game-stack">
                            <div class="small">description</div>
                            <textarea name="description">${escapeHtml(game.description ?? '')}</textarea>
                            <div class="small">image_file_id</div>
                            <input name="image_file_id" value="${escapeAttr(game.image_file_id ?? '')}" />
                            </div>
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
            <div class="section-head">
              <h2>Пользователи</h2>
              <button type="button" class="btn-secondary" data-toggle="createUserForm">+ Добавить пользователя</button>
            </div>
            <form method="post" action="/admin/users" class="new-entry collapsible-form" id="createUserForm">
              <h3>Добавить нового пользователя</h3>
              <div class="new-entry-grid">
                <div>
                  <div class="small">Username</div>
                  <input name="username" placeholder="@username" />
                </div>
                <div>
                  <div class="small">Telegram ID (опц.)</div>
                  <input name="telegram_id" placeholder="например 502302735" />
                </div>
                <div>
                  <div class="small">Имя</div>
                  <input name="first_name" placeholder="Имя" />
                </div>
                <div>
                  <div class="small">Фамилия</div>
                  <input name="last_name" placeholder="Фамилия" />
                </div>
                <div>
                  <div class="small">Статус</div>
                  <select name="user_status">
                    <option value="Не зарегистрирован">Не зарегистрирован</option>
                    <option value="Кандидат" selected>Кандидат</option>
                    <option value="На проверке">На проверке</option>
                    <option value="Одобрен">Одобрен</option>
                    <option value="Бан">Бан</option>
                  </select>
                </div>
                <div>
                  <div class="small">Последняя игра (опц.)</div>
                  <input type="datetime-local" name="last_game_at" value="" />
                </div>
                <div>
                  <div class="small">Предупреждения</div>
                  <input name="warnings_count" value="0" />
                </div>
                <div>
                  <div class="small">Игр</div>
                  <input name="games_count" value="0" />
                </div>
                <div>
                  <div class="small">Admin</div>
                  <select name="is_admin">
                    <option value="0" selected>no</option>
                    <option value="1">yes</option>
                  </select>
                </div>
              </div>
              <div style="margin-top: 8px;">
                <button type="submit">Добавить пользователя</button>
              </div>
            </form>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Telegram</th>
                  <th>Username</th>
                  <th>Имя</th>
                  <th>Фамилия</th>
                  <th>В базе с</th>
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
                          <td class="nowrap">${escapeHtml(formatHumanDate(user.created_at))}</td>
                          <td>
                            <select name="user_status">
                              ${selectOptionLabel(user.user_status, 'Не зарегистрирован', 'Не зарегистрирован')}
                              ${selectOptionLabel(user.user_status, 'Кандидат', 'Кандидат')}
                              ${selectOptionLabel(user.user_status, 'На проверке', 'На проверке')}
                              ${selectOptionLabel(user.user_status, 'Одобрен', 'Одобрен')}
                              ${selectOptionLabel(user.user_status, 'Бан', 'Бан')}
                            </select>
                          </td>
                          <td><input type="datetime-local" name="last_game_at" value="${escapeAttr(toDateTimeLocal(user.last_game_at ?? ''))}" /></td>
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
            <div class="section-head">
              <h2>Предупреждения (warnings_log)</h2>
              <button type="button" class="btn-secondary" data-toggle="createWarningForm">+ Добавить предупреждение</button>
            </div>
            <form method="post" action="/admin/warnings" class="new-entry collapsible-form" id="createWarningForm">
              <h3>Добавить новое предупреждение</h3>
              <div class="new-entry-grid">
                <div>
                  <div class="small">Пользователь</div>
                  <select name="user_id">
                    ${allUsers
                      .map((u) => `<option value="${u.id}">#${u.id} ${escapeHtml(u.username ? `@${u.username}` : String(u.telegram_id))}</option>`)
                      .join('')}
                  </select>
                </div>
                <div>
                  <div class="small">Дата</div>
                  <input type="datetime-local" name="created_at" value="" />
                </div>
                <div style="grid-column: span 2;">
                  <div class="small">Причина</div>
                  <input name="reason" placeholder="Причина предупреждения" />
                </div>
              </div>
              <div style="margin-top: 8px;">
                <button type="submit">Добавить</button>
              </div>
            </form>
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
            <div class="section-head">
              <h2>Баны (bans_log)</h2>
              <button type="button" class="btn-secondary" data-toggle="createBanForm">+ Добавить бан</button>
            </div>
            <form method="post" action="/admin/bans" class="new-entry collapsible-form" id="createBanForm">
              <h3>Добавить новый бан</h3>
              <div class="new-entry-grid">
                <div>
                  <div class="small">Пользователь</div>
                  <select name="user_id">
                    ${allUsers
                      .map((u) => `<option value="${u.id}">#${u.id} ${escapeHtml(u.username ? `@${u.username}` : String(u.telegram_id))}</option>`)
                      .join('')}
                  </select>
                </div>
                <div>
                  <div class="small">Дата</div>
                  <input type="datetime-local" name="created_at" value="" />
                </div>
                <div>
                  <div class="small">Статус пользователя</div>
                  <select name="set_status_banned">
                    <option value="1" selected>Ставить Бан</option>
                    <option value="0">Не менять</option>
                  </select>
                </div>
                <div style="grid-column: span 1;">
                  <div class="small">Причина</div>
                  <input name="reason" placeholder="Причина бана" />
                </div>
              </div>
              <div style="margin-top: 8px;">
                <button type="submit">Добавить</button>
              </div>
            </form>
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
            <div class="status-help">
              <b>Пояснение статусов:</b><br/>
              • <b>Подтвержден</b> — игрок в основном составе игры.<br/>
              • <b>Лист ожидания</b> — мест нет, игрок в очереди.<br/>
              • <b>Отменен</b> — запись снята игроком/админом и не участвует в наборе.
            </div>
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
                          <td>${escapeHtml(formatHumanDate(item.created_at))}</td>
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
          <script>
            (function () {
              const key = 'tg_admin_theme';
              const root = document.body;
              const btn = document.getElementById('themeToggle');
              const setTheme = function (theme) {
                root.setAttribute('data-theme', theme);
                if (btn) {
                  btn.textContent = theme === 'dark' ? '☀️ Тема' : '🌙 Тема';
                }
              };
              const saved = localStorage.getItem(key);
              const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
              setTheme(saved || (prefersDark ? 'dark' : 'light'));
              if (btn) {
                btn.addEventListener('click', function () {
                  const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
                  const next = current === 'dark' ? 'light' : 'dark';
                  setTheme(next);
                  localStorage.setItem(key, next);
                });
              }

              document.querySelectorAll('[data-toggle]').forEach(function (toggleBtn) {
                toggleBtn.addEventListener('click', function () {
                  const targetId = toggleBtn.getAttribute('data-toggle');
                  if (!targetId) return;
                  const form = document.getElementById(targetId);
                  if (!form) return;
                  const isOpen = form.classList.toggle('open');
                  if (isOpen) {
                    const firstInput = form.querySelector('input, select, textarea');
                    if (firstInput) firstInput.focus();
                    toggleBtn.textContent = '− Скрыть форму';
                  } else {
                    toggleBtn.textContent =
                      targetId === 'createGameForm' ? '+ Добавить игру' :
                      targetId === 'createUserForm' ? '+ Добавить пользователя' :
                      targetId === 'createWarningForm' ? '+ Добавить предупреждение' :
                      '+ Добавить бан';
                  }
                });
              });
            })();
          </script>
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

function formatHumanDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date) + ' МСК';
}

function parseNullableInt(value?: string) {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseTelegramId(value?: string) {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }

  if (!/^-?\d+$/.test(normalized)) {
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
