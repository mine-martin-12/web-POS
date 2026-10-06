# Smart POS: architecture

This document is for developers working on Smart POS. It is a short map of how the app is built, where things live, and the rules that keep it secure and correct.

## Stack

| Layer | Choice |
|---|---|
| UI | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix primitives) |
| Data fetching | TanStack React Query (one key registry: `src/lib/queryKeys.ts`) |
| Backend | Supabase: Postgres with row-level security, Auth, Edge Functions (Deno), Realtime |
| Hosting | Vercel (SPA rewrite in `vercel.json`) |
| Tests | Vitest + Testing Library (UI), and the real migrations run in PGlite (database) |

## Folder map

```
src/
  App.tsx                 Provider stack + every route (lazy-loaded)
  config/                 App-wide constants: routes.ts (route registry), session.ts (timeouts)
  contexts/               AuthContext (session, profile, business, role), PrivacyModeContext
  hooks/                  Cross-cutting hooks: useSecurity, useActionParam, useNavCounts…
  lib/                    Framework-free helpers, pure and unit-tested: finance (all money maths),
                          dates, currency, phone, csv, exports/ (PDF, XLSX, ZIP), fetchAll,
                          optimistic, permissions, validation, smsTemplate, subscription, …
  components/
    ui/                   shadcn/ui primitives. DO NOT EDIT (see below)
    common/               App building blocks composed from ui/: DataTable (every list),
                          ExportMenu, ConfirmDialog, EmptyState, Money, BarList, DateField,
                          TextField, ThemeToggle, BrandedSpinner…
    auth/                 AuthGuard, PublicOnly, RoleBasedAccess, AuthShell…
    layout/               AppLayout, AppSidebar, AppHeader, Breadcrumbs, CommandPalette, MobileFab
    session/              InactivityManager, PrivacyToggle
  features/<name>/        Self-contained modules: api.ts, hooks.ts, types.ts, lib.ts, components/, pages/
                          sales, credits, customers, products, expenses, dashboard, reports,
                          approvals, activity, notifications, messaging, staff
  pages/                  Public/auth pages (landing, auth, reset, accept-invite, expired, 404)
                          and Settings
  integrations/supabase/  Supabase client + GENERATED types.ts
supabase/
  migrations/             SQL migrations (never edit an applied one; add a new file)
  functions/              Edge functions; _shared/ has auth + HTTP helpers
  tests/                  PGlite harness + database security tests
scripts/gen-db-types.ts   Regenerates types.ts from the migrations (npm run db:types)
```

## Provider stack (outer → inner)

`QueryClientProvider` → `ThemeProvider` (next-themes) → `AuthProvider` → `PrivacyModeProvider` → `TooltipProvider` + toasters → `InactivityManager` → `BrowserRouter`.

## Routing

- **Public routes:** `/` (landing; signed-in users are sent to `/app`), `/auth`, `/reset-password`, `/accept-invite`.
- **App routes:** everything under `/app/*`. They render inside one `AuthGuard` + `AppLayout` route; pages render in its `<Outlet/>`.
  - Signed-out users go to `/auth` and come back afterwards.
  - A password-recovery session can only use `/reset-password`.
- **Route registry:** `src/config/routes.ts` lists every app page and quick action. The sidebar, breadcrumbs, command palette and mobile action button are all built from it, so a page that isn't registered can't be linked to by mistake.
- **Quick actions:** these open a page's create dialog by adding `?new=1` (or `?invite=1`) to the URL. Pages listen with `useActionParam`.
- **Legacy redirects:** old URLs (`/sales`, `/dashboard`…) redirect via `LEGACY_REDIRECTS`.

## Security model

The database is the security boundary. The UI only hides what a user can't use.

1. **Tenancy.**
   - Every business table has `business_id` (FK → `businesses`), and every user belongs to exactly one business (`profiles.business_id`).
   - The `enforce_tenant_scope` trigger sets `business_id` and `created_by` on insert from the caller's session. Client values are ignored.
   - The same trigger rejects links to another business's rows (e.g. a sale for someone else's product).
2. **Roles.**
   - Roles live in `user_roles (user_id, business_id, role)`, not on the profile.
   - Clients can read their own role but can't write any role.
   - Helpers for policies and functions: `get_user_business(uid)`, `has_role(uid, role)`, `is_admin()`. They are `SECURITY DEFINER`, scoped to the current business, and ignore deactivated members.
   - `get_user_business()` also returns NULL when the business is expired or suspended, so every policy, trigger and RPC stops working for it. `get_member_business()` is the status-blind variant, used only for the business row itself (needed by the `/expired` page).
3. **Row-level security** on every table:
   - Members read their own business's rows.
   - Staff see only the sales they recorded.
   - Deletes and admin tables (`invitations`, other members' roles) require `is_admin()`.
4. **Column grants.** Users can update only `first_name` and `last_name` on their own profile.
   - `businesses` (including `account_status` / `trial_ends_at`), `user_roles`, `invitations`, `credit_payments`, `pending_updates` and `activity_logs` have no client write access at all.
   - `sales` and `credits` are written only through RPCs; staff may insert `products` and `customers`, admins update them.
   - `customers.phone` is not readable by any client. Reads go through the SECURITY DEFINER functions `customers_secure()` and `search_customers()`, which mask the number for non-admins (`+2547123***90`).
5. **RPCs** (`SECURITY DEFINER`, which check membership and role themselves). Writes that must be atomic happen here, never as read-modify-write from the browser.
   - Sales: `record_sale` (sale, credit and deposit in one transaction), `update_sale` (admin, per-column whitelist).
   - Money and stock: `record_credit_payment`, `add_stock`, `update_product`.
   - Customers: `create_customer` (phone match reuses the record; name match asks first), `search_customers`.
   - Approvals: `submit_change`, `resubmit_change`, `review_change` (re-checks the record, then applies through the same whitelist), `archive_change`.
   - Account: `update_business_details`, `complete_invitation`, `is_business_name_available`.
6. **Sign-up.** The `handle_new_user` trigger never trusts client metadata for role or business.
   - Self sign-up always creates a new business, with the signer as its admin.
   - Staff join only through an invitation: a random token bound to an email, valid for 7 days, used once. The role comes from the invitation row.
7. **Edge functions:**
   - `invite-staff`: invite, resend and revoke staff invitations.
   - `manage-staff`: edit role or name, deactivate or reactivate members.
   - Both verify the JWT, then read the caller's role from the database. They use the service role, so every query must be scoped to the caller's business.
   - Admins can't demote or deactivate themselves.
   - The database refuses to leave a business without an active admin.
8. **Audit trail.** The `log_activity` trigger writes `activity_logs` for every business table (changed fields only, phones masked, invitation tokens dropped). Reasons from change requests are captured through the transaction-local `app.change_reason` setting. Only admins can read the log.
9. **Approvals.** Staff can't edit saved sales, credits or products. They submit a change request with a reason, and an admin reviews it.
10. **Capabilities in the UI.** Components check capabilities from `useSecurity()` (matrix in `src/lib/permissions.ts`), never raw role strings.
   - `RoleBasedAccess` guards admin pages.
   - Nothing admin-only renders while the role is still loading.

Every rule above has a test in `supabase/tests/` (`security`, `customers`, `sales`, `approvals`, `audit`, `subscription`, `upgrade`). The tests run the real migrations and execute SQL as role `authenticated`, which is exactly what a direct API call does.

## Data and money conventions

- **Server reads** go through React Query with keys from `src/lib/queryKeys.ts`. Invalidate those keys after writes.
- **Paging:** any query whose total matters uses `fetchAll` (`src/lib/fetchAll.ts`) with a stable, unique order. PostgREST silently stops at 1000 rows.
- **Money maths** happens only in `src/lib/finance.ts`, in integer cents. `saleMoney`/`summarizeSales` guarantee billed = collected + outstanding. `pctChange` divides by |previous|.
- **Money display:** `<Money value={…}/>` or `<Money cents={…}/>` (business currency, tabular figures, `.sensitive` for privacy mode). Format strings with `formatMoney`.
- **Phones** are normalised with `normalizePhone` (`src/lib/phone.ts`), which mirrors SQL `normalize_phone()`. A test runs both implementations on the same inputs.
- **CSV:** use `toCsv`/`downloadCsv` (`src/lib/csv.ts`): BOM, quoting, formula-injection guard, business header, readable sequential IDs.
- **Dates:** day and month keys come from `src/lib/dates.ts` in the business time zone (`dayKey`, `monthKey`, `startOfDayUtc`). Calendar dates (e.g. `credits.due_date`) are SQL `date` values; never use `toISOString()` for them, because it shifts to UTC.

## UI conventions

- **Lists** use `DataTable` (search, sort, page, density, mobile cards, bulk select). Filters live in the URL via `useUrlState`. Summary tiles are computed from the same filtered rows the table shows.
- **Row actions** that change money or stock are optimistic (`optimisticListUpdate`): update the cache, roll back with a toast on error, then invalidate.
- **Exports** describe rows once as an `ExportSheet`. `ExportMenu` renders it as PDF (official A4), CSV and XLSX, so exports always match the screen.
- **Colours** come from tokens in `src/index.css`, which are checked against WCAG AA in light and dark. Charts use `--chart-1..3` (colour-blind safe). Never hard-code greens or reds.
- **Motion** uses the shared tokens; `prefers-reduced-motion` turns animation off globally.
- **Empty states:** `EmptyState` for "nothing yet", and the table's built-in state for "no results".

## How to add a feature

1. **Migration.** Add `supabase/migrations/<timestamp>_<name>.sql`.
   - Include RLS policies, grants, and a `business_id` column with an FK.
   - Add to the `enforce_tenant_scope` trigger if the table is business data.
2. **Tests.** Add security tests in `supabase/tests/`, then run `npm test`.
3. **Types.** Run `npm run db:types` to regenerate `src/integrations/supabase/types.ts`.
4. **Code.** Put the feature in `src/features/<name>/`:
   - `api.supabase.ts` (the Supabase calls; the only place that imports the client)
   - `api.ts` (re-exports it and routes each backend function with `routed()`, so demo mode can answer it; add the slice to `DataApi` in `src/data/types.ts`)
   - the demo version in `src/demo/api/<name>.ts` (the typecheck fails until it exists)
   - `hooks.ts` (React Query, using keys added to `queryKeys.ts`)
   - `components/` and `pages/`
5. **Route.** Register the route:
   - a lazy `<Route>` in `App.tsx`;
   - an entry in `APP_PAGES` (and `QUICK_ACTIONS` if it creates things) in `src/config/routes.ts`.
6. **Guard.** If it's admin-only, add a capability in `src/lib/permissions.ts`.
   - Wrap the route in `<RoleBasedAccess capability=…>`.
   - Set `capability` on the registry entry.
7. **Check.** Run `npm run check` (lint, typecheck, edge-function check, tests, build).

## Demo mode

**Try the demo** on the sign-in page (or a link with `?demo=1`) opens the whole app on sample data, with no Supabase involved at all.

- **How it switches.** `src/data/mode.ts` keeps a per-tab flag in sessionStorage. `src/main.tsx` checks it before React renders and, in demo mode, loads `import("@/demo")` behind a loading screen. Every backend call goes through a feature's routed `api.ts`, which sends it to `src/demo/api/*` instead of `api.supabase.ts`. `AuthProvider` swaps in the demo's signed-in member, and the inactivity sign-out isn't mounted.
- **Same rules as production.** The demo database is PGlite (Postgres in WebAssembly) running the real migrations. Each call runs as role `authenticated` with the acting member's id, so RLS, column grants, triggers, RPC checks and error messages are the production ones. The edge functions are stood in for by `src/demo/simulate/edge.ts` (same checks and response shapes; nothing is sent). Success toasts for simulated side effects use `simulatedNote()`.
- **Never reaches Supabase.** The Supabase client is created lazily; in demo mode any use throws `DemoLeakError`. ESLint allows the client only in `*.supabase.ts` and the auth screens, and forbids static imports of `@/demo`.
- **Sample data.** `src/demo/seed` builds "Demo Shop" through the same database functions the app uses. The history up to yesterday is built at build time (`npm run demo:snapshot`, part of `npm run build`) into `public/demo/history.tgz`. The browser loads it, shifts all dates so it ends yesterday (`shiftToToday`), and records today's trading live (`seedToday`). Without the file (dev server), the browser builds everything itself, which is slower.
- **Session only.** The database lives in the tab's memory: changes last until reload, Reset or Exit. The role switcher (Admin / Staff) changes the acting member.
- **Kept out of the normal app.** The demo, PGlite and the history snapshot load only in demo mode and aren't precached by the service worker. `npm run check` ends with `scripts/check-bundle.mjs`, which fails if any of it is loaded statically by the app.
- **Tests.** `src/demo/no-network.test.tsx` renders the real app in demo mode across every page for both roles and fails on any Supabase client or network request. `engine.test.ts`, `seed/seed.test.ts` and `session.test.ts` cover the main flows, permissions, the sample data, and reset and exit.

## Do not touch

- `src/components/ui/*`: shadcn primitives. Extend them by composition in `components/common/`.
- `src/integrations/supabase/types.ts`: generated. Run `npm run db:types` (or `supabase gen types`).
- Applied migrations in `supabase/migrations/`: add a new migration instead.
- `supabase/functions/deno.lock`: updated by Deno.

## Deploying

```sh
supabase link --project-ref khmimsqqpjzmysmsdidd
supabase db dump -f backup-$(date +%F).sql      # always back up first
supabase db push                                 # apply new migrations
supabase functions deploy invite-staff manage-staff send-sms
supabase secrets set SITE_URL=https://<your-domain> ALLOWED_ORIGINS=https://<your-domain>
supabase secrets set AT_USERNAME=<africastalking-username> AT_API_KEY=<key> [AT_SENDER_ID=<id>] [AT_SANDBOX=true]
```

Then merge to `main`; Vercel deploys the frontend.

In the Supabase dashboard, open **Authentication → URL configuration**. Set the Site URL, and add `https://<your-domain>/**` to the redirect URLs. Invitation and password-reset links return to `/accept-invite` and `/reset-password`.
