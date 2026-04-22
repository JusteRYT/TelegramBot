# Telegram Bot Platform

Легкий Telegram-бот на TypeScript + SQLite с встроенной веб-админкой.

## Что внутри

- TypeScript
- Fastify
- grammY
- SQLite (`data/app.db`)
- Веб-админка на `/admin` с редактированием:
- Игр
- Пользователей
- Регистраций
- Авто-напоминания и триггеры (внутри процесса бота)

## Legacy-совместимость (что перенесено)

- Колонки пользователей из старого `ALL_USERS`:
- `Статус` (`Кандидат` / `На проверке` / `Одобрен` / `Бан`)
- `Последняя игра`
- `Предупреждения`
- `Количество игр`
- Напоминания:
- до игры (24ч / 1ч)
- об анкетах (ежедневно в 10:00 и 20:00 МСК)
- о неактивности (суббота, 12:00 МСК)
- Единый бот: проверки статусов/банов/игр могут работать локально без второго бота

## Модерация в одном боте

Команды в admin-топике:

- `/uinfo @username`
- `/uwarn @username причина`
- `/uban @username причина`
- `/uunban @username`
- `/ureview @username`
- `/uapprove @username`
- `/ugame @username`
- `/uall`

Дополнительно:
- При первом `/start` пользователь получает уведомление о регистрации в системе.

## Быстрый локальный запуск (prod-профиль)

1. Заполнить [`.env`](C:/Users/JusteRYT/Desktop/TelegramBot/.env)
2. `npm install`
3. `npm run db:init`
4. `npm run start:dev`
5. Открыть `http://localhost:3000/admin`

## Режимы запуска (profiles)

Поддерживаются профили через аргумент `--profile`:

- `default` → читает только [`.env`](C:/Users/JusteRYT/Desktop/TelegramBot/.env)
- `test` → читает только [`.env.test`](C:/Users/JusteRYT/Desktop/TelegramBot/.env.test)

Скрипты:

- `npm run start:dev` — dev default
- `npm run start:dev:test` — dev test
- `npm run db:init` — init default DB
- `npm run db:init:test` — init test DB
- `npm run reminders:run` — вручную выполнить все reminder-процессы (default)
- `npm run reminders:run:test` — вручную выполнить reminders в test
- `npm run start` — run build в default
- `npm run start:test` — run build в test

## Как указывать Chat/Topic ID

1. В нужном чате/топике отправь команду `/id`
2. Возьми значения из ответа:
- `Chat ID` → в `MAIN_CHAT_ID` и/или `ADMIN_CHAT_ID`
- `Topic ID` → в `ANNOUNCEMENT_TOPIC_ID` и/или `ADMIN_TOPIC_ID`

Пример для debug:

- `MAIN_CHAT_ID=-1003893720247`
- `ANNOUNCEMENT_TOPIC_ID=1623`
- `ADMIN_CHAT_ID=-1003893720247`
- `ADMIN_TOPIC_ID=1623`

## Веб-админка

Открывается по `http://<ip>:<port>/admin` и защищена Basic Auth:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Теперь админка позволяет менять значения прямо в таблицах и сохранять в БД без ручного SQL.

## Деплой на VPS

- `npm run build`
- `npm run db:init`
- `npm run start`

Для systemd используй:

- [deploy/deploy.sh](C:/Users/JusteRYT/Desktop/TelegramBot/deploy/deploy.sh)
- [deploy/telegram-bot.service](C:/Users/JusteRYT/Desktop/TelegramBot/deploy/telegram-bot.service)
