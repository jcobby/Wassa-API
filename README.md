# wpn-api

Express + MongoDB backend for the Wassa Professionals Network site.

## Setup

```bash
npm install
cp .env.example .env
# edit .env — set JWT_SECRET, MONGO_URI, etc.
npm run dev
```

API runs on `http://localhost:4000`.

## Scripts

- `npm run dev` — start in watch mode with `tsx`
- `npm run build` — type-check + compile to `dist/`
- `npm start` — run compiled output
- `npm run seed:admin` — create the first admin user from `ADMIN_*` env vars

## Bootstrapping the first admin

```bash
# set ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_FULL_NAME in .env, then:
npm run seed:admin
```

## Endpoints

See `src/routes/`. CORS allows the origin in `FRONTEND_ORIGIN`. Auth is via an httpOnly cookie named `wpn_token`.
