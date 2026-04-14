# Office Live Board

Интерактивная карта офиса на Next.js:
- любой сотрудник может занять/освободить стол;
- имя и комментарий видны всем;
- изменения распространяются в realtime через SSE + Redis Pub/Sub;
- расстановка столов/линий и номера столов сохраняются в Redis и одинаково воспроизводятся на сервере;
- у каждого стола есть отдельный график бронирований за 14 дней.

## Стек

- Next.js 16 (App Router, TypeScript)
- PostgreSQL (основная база)
- Redis (канал событий между инстансами)
- Prisma ORM
- Recharts (графики)

## Переменные окружения

Создайте `.env`:

```env
DATABASE_URL="postgresql://app_user:app_password@localhost:5432/office_map?schema=public"
REDIS_URL="redis://localhost:6379"
```

## Локальный запуск

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Приложение будет доступно на `http://localhost:3000`.

## Важные скрипты

- `npm run db:generate` - генерация Prisma Client
- `npm run db:push` - применить схему в БД без миграций
- `npm run db:migrate` - создать и применить миграцию
- `npm run db:seed` - заполнить столы по шаблону
- `npm run build` - production-сборка
- `npm run start` - запуск production-сервера

`prisma generate` запускается автоматически при `npm install`/`npm ci` и перед `npm run build`.

## Деплой на Linux (Ubuntu)

1. Установить Node.js LTS, PostgreSQL, Redis.
2. Создать пользователя и базу в PostgreSQL.
3. Клонировать проект на сервер.
4. Заполнить `.env` с `DATABASE_URL` и `REDIS_URL`.
5. Выполнить:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
```

6. Запуск через systemd или PM2:

```bash
npm run start
```

## Архитектура

- `GET /api/desks` - список столов + текущий владелец
- `POST /api/claim` - занять/освободить стол
- `GET /api/desks/[deskId]/history` - данные графика для стола
- `GET/PUT /api/layout` - загрузка/сохранение расстановки в Redis
- `GET /api/events` - SSE поток событий

Redis используется для pub/sub канала `desk_updates`, чтобы обновления сразу попадали всем подключенным клиентам.
