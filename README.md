# Telegram Bot Platform

TypeScript + SQLite Telegram-бот с веб-админкой (`/admin`), анонсами игр, регистрацией и модерацией пользователей.

## Минимум Команд (VPS)

1. Первый деплой (prod/default), скрипт сам спросит токен:
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-install.sh | sudo PROFILE=default bash
```

2. Обновление (если в GitHub есть новые коммиты):
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-update.sh | sudo PROFILE=default bash
```

3. Проверка статуса и логов:
```bash
sudo systemctl status telegram-bot --no-pager
sudo journalctl -u telegram-bot -n 100 --no-pager
```

4. Админка:
- `http://<SERVER_IP>:3000/admin`

## Быстрый запуск локально

1. Установить зависимости:
```bash
npm install
```

2. Инициализировать БД:
```bash
npm run db:init:test
```

3. Запустить:
```bash
npm run start:dev:test
```

4. Веб-админка:
- `http://localhost:3001/admin`
- логин/пароль из `.env.test`: `ADMIN_USERNAME` / `ADMIN_PASSWORD`

## Важные ENV-переменные

Профиль `test` читает только `.env.test`.

- `TELEGRAM_BOT_TOKEN` — токен бота
- `MAIN_CHAT_ID` — чат с анонсами
- `ANNOUNCEMENT_TOPIC_ID` — топик анонсов
- `ADMIN_CHAT_ID` — чат админки
- `ADMIN_TOPIC_ID` — админ-топик
- `GENERAL_CHAT_ID` — общий чат для рекламного поста о новом анонсе (`0` = выключено)
- `DATABASE_PATH` — путь к SQLite БД
- `BACKUP_DIR` — папка бэкапов
- `BACKUP_RETENTION_DAYS` — сколько дней хранить бэкапы
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — доступ к `/admin`

## Скрипты

- `npm run start:dev:test` — dev режим (test профиль)
- `npm run start:test` — запуск собранного приложения (test профиль)
- `npm run db:init:test` — миграции/инициализация БД (test профиль)
- `npm run reminders:run:test` — ручной запуск reminder-процессов
- `npm run backup:db:test` — создать backup БД + удалить старше retention

Для default-профиля есть аналогичные команды без `:test`.

## VPS деплой (Ubuntu, systemd)

### One-command deploy (из публичного репозитория)

```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-install.sh | sudo bash
```

Скрипт сам спросит `TELEGRAM_BOT_TOKEN` текстом (если он не передан через ENV и не задан в `.env`).

По умолчанию:
- repo: `https://github.com/JusteRYT/TelegramBot.git`
- branch: `main`
- path: `/opt/telegram-bot`
- profile: `default`

Если нужен test-профиль:
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-install.sh | sudo PROFILE=test bash
```

Полностью без ручного редактирования `.env` (все значения передаются сразу):
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-install.sh | sudo \
  PROFILE=test \
  TELEGRAM_BOT_TOKEN='your_token' \
  TELEGRAM_ALLOWED_ADMIN_IDS='502302735' \
  MAIN_CHAT_ID='-1003893720247' \
  ANNOUNCEMENT_TOPIC_ID='1623' \
  ADMIN_CHAT_ID='-1003893720247' \
  ADMIN_TOPIC_ID='797' \
  GENERAL_CHAT_ID='0' \
  ADMIN_USERNAME='admin' \
  ADMIN_PASSWORD='admin' \
  bash
```

Если нужно переопределить branch/path:
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-install.sh | sudo BRANCH=main APP_DIR=/opt/telegram-bot PROFILE=test bash
```

Скрипт:
- ставит Node.js и зависимости ОС
- клонирует/обновляет репозиторий
- создает `.env` или `.env.test` из `.env.example` (если файла нет)
- делает `npm install`, `npm run build`, `db:init`
- поднимает `systemd` сервис бота
- поднимает `systemd` timer для ежедневного backup
- если целевая БД не найдена, может восстановить её из:
  - `DB_SOURCE_PATH=/tmp/app.db`
  - `DB_SOURCE_URL=https://.../app.db`
  - или автоматически скопировать `data/app.test.db -> data/app.db` при `PROFILE=default`

### 1. Подготовка сервера

```bash
sudo apt update
sudo apt install -y git curl rsync
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Клонирование и настройка

```bash
sudo mkdir -p /opt/telegram-bot
sudo chown -R $USER:$USER /opt/telegram-bot
git clone <YOUR_REPO_URL> /opt/telegram-bot
cd /opt/telegram-bot
npm install
```

Создай `.env.test` (или `.env`, если используешь default-профиль) и заполни переменные.

### 3. Сборка и инициализация БД

```bash
npm run build
npm run db:init:test
```

### 4. systemd сервис

Скопируй unit:
```bash
sudo cp deploy/telegram-bot.service /etc/systemd/system/telegram-bot.service
```

Открой и при необходимости поправь:
- `WorkingDirectory=/opt/telegram-bot`
- `ExecStart=/usr/bin/npm run start:test`

Запуск:
```bash
sudo systemctl daemon-reload
sudo systemctl enable telegram-bot
sudo systemctl restart telegram-bot
sudo systemctl status telegram-bot
```

Логи:
```bash
journalctl -u telegram-bot -f
```

## Бэкапы БД (хранение 7 дней)

### Что уже реализовано

Скрипт `npm run backup:db:test`:
- делает консистентный snapshot SQLite через `VACUUM INTO`
- сохраняет в `BACKUP_DIR`
- удаляет бэкапы старше `BACKUP_RETENTION_DAYS`

По умолчанию:
- `BACKUP_DIR=./backups`
- `BACKUP_RETENTION_DAYS=7`

### Рекомендовано: systemd timer (ежедневно в 03:30)

Уже готовые unit-файлы:
- `deploy/telegram-bot-backup.service`
- `deploy/telegram-bot-backup.timer`

Установка:
```bash
cd /opt/telegram-bot
sudo cp deploy/telegram-bot-backup.service /etc/systemd/system/
sudo cp deploy/telegram-bot-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now telegram-bot-backup.timer
```

Проверка:
```bash
systemctl list-timers | grep telegram-bot-backup
journalctl -u telegram-bot-backup.service -n 50 --no-pager
```

Ручной запуск бэкапа:
```bash
sudo systemctl start telegram-bot-backup.service
```

Если нужен cron вместо timer:
```cron
30 3 * * * cd /opt/telegram-bot && /usr/bin/npm run backup:db:test >> /opt/telegram-bot/backup.log 2>&1
```

## Обновление на VPS

```bash
cd /opt/telegram-bot
git pull
npm install
npm run build
npm run db:init:test
sudo systemctl restart telegram-bot
```

### One-command update (если есть новые коммиты в GitHub)

Скрипт сам проверяет `origin/main`:
- если обновлений нет — ничего не делает;
- если есть — делает `pull`, `npm install`, `build`, `db:init`, перезапускает сервис.

Запуск:
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-update.sh | sudo PROFILE=test bash
```

Для default-профиля:
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-update.sh | sudo PROFILE=default bash
```

## Перенос текущей БД на VPS

Пример: переносишь локальную `app.test.db` в production `app.db`.

1. Скопируй файл на сервер:
```bash
scp ./data/app.test.db user@server:/tmp/app.test.db
```

2. Запусти деплой с явным источником БД:
```bash
curl -fsSL https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-install.sh | sudo \
  PROFILE=default \
  DB_SOURCE_PATH=/tmp/app.test.db \
  TELEGRAM_BOT_TOKEN='your_token' \
  MAIN_CHAT_ID='-100...' \
  ANNOUNCEMENT_TOPIC_ID='4' \
  ADMIN_CHAT_ID='-100...' \
  ADMIN_TOPIC_ID='797' \
  bash
```

## Полное удаление бота с VPS

Скрипт:
```bash
curl -fsSL -o vps-uninstall.sh https://raw.githubusercontent.com/JusteRYT/TelegramBot/main/deploy/vps-uninstall.sh
chmod +x vps-uninstall.sh
sudo ./vps-uninstall.sh
```

По умолчанию удаляет:
- systemd сервис бота
- backup service/timer
- `/opt/telegram-bot` вместе с БД и бэкапами

Если хочешь оставить данные:
```bash
sudo PURGE_DATA=0 ./vps-uninstall.sh
```

## Где хранится БД

База остаётся по пути из `DATABASE_PATH` (например `./data/app.test.db`).
При обновлениях кода она не удаляется, если ты не удаляешь файл БД вручную.
