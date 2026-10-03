# Smart POS

Point-of-sale and back-office web app for small businesses. Use it to record sales and customer credits, track stock, and manage your team.

## Getting started

```sh
npm install
cp .env.example .env.local   # optional: defaults point at the hosted Supabase project
npm run dev                  # http://localhost:8080
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run check` | Lint, typecheck, edge-function typecheck, tests, production build |
| `npm test` | Unit tests and database security tests (real migrations in PGlite) |
| `npm run db:types` | Regenerate Supabase TypeScript types from the migrations |
| `npm run check:functions` | Type-check the Supabase edge functions with Deno |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the folder map, the security model, how to add a feature, and deployment steps.
