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
  lib/                    Framework-free helpers: currency, permissions, validation, errors,
                          inactivity, breadcrumbs, platform. Pure and unit-tested.
  components/
    ui/                   shadcn/ui primitives. DO NOT EDIT (see below)
    common/               App building blocks composed from ui/: ConfirmDialog, Money,
                          TextField, ThemeToggle, BrandedSpinner…
    auth/                 AuthGuard, PublicOnly, RoleBasedAccess, AuthShell…
    layout/               AppLayout, AppSidebar, AppHeader, Breadcrumbs, CommandPalette, MobileFab
    session/              InactivityManager, PrivacyToggle
  features/<name>/        Self-contained modules: api.ts, hooks.ts, types.ts, components/, pages/
  pages/                  Remaining top-level pages (being moved into features/ phase by phase)
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
3. **Row-level security** on every table:
   - Members read their own business's rows.
   - Staff see only the sales they recorded.
   - Deletes and admin tables (`invitations`, other members' roles) require `is_admin()`.
4. **Column grants.** Users can update only `first_name` and `last_name` on their own profile.
   - `businesses`, `user_roles`, `invitations` and `credit_payments` have no client write access at all.
   - Changes to them go through RPCs or edge functions.
5. **RPCs** (`SECURITY DEFINER`, which check membership and role themselves): `record_credit_payment`, `add_stock`, `update_business_details`, `complete_invitation`, `is_business_name_available`. Writes that must be atomic happen here, never as read-modify-write from the browser.
6. **Sign-up.** The `handle_new_user` trigger never trusts client metadata for role or business.
   - Self sign-up always creates a new business, with the signer as its admin.
   - Staff join only through an invitation: a random token bound to an email, valid for 7 days, used once. The role comes from the invitation row.
7. **Edge functions:**
   - `invite-staff`: invite, resend and revoke staff invitations.
   - `manage-staff`: edit role or name, deactivate or reactivate members.
   - Both verify the JWT, then read the caller's role from the database. They use the service role, so every query must be scoped to the caller's business.
   - Admins can't demote or deactivate themselves.
   - The database refuses to leave a business without an active admin.
8. **Capabilities in the UI.** Components check capabilities from `useSecurity()` (matrix in `src/lib/permissions.ts`), never raw role strings.
   - `RoleBasedAccess` guards admin pages.
   - Nothing admin-only renders while the role is still loading.

Every rule above has a test in `supabase/tests/security.test.ts`. The tests run the real migrations and execute SQL as role `authenticated`, which is exactly what a direct API call does.

## Data and money conventions

- **Server reads** go through React Query with keys from `src/lib/queryKeys.ts`. Invalidate those keys after writes.
- **Money** is shown with `<Money value={…}/>` (business currency, tabular figures, `.sensitive` for privacy mode). Format strings with `formatMoney`.
- **Dates:** calendar dates (e.g. `credits.due_date`) are SQL `date` values. Format them with `format(d, "yyyy-MM-dd")`, never `toISOString()`, which shifts to UTC.

## How to add a feature

1. **Migration.** Add `supabase/migrations/<timestamp>_<name>.sql`.
   - Include RLS policies, grants, and a `business_id` column with an FK.
   - Add to the `enforce_tenant_scope` trigger if the table is business data.
2. **Tests.** Add security tests in `supabase/tests/`, then run `npm test`.
3. **Types.** Run `npm run db:types` to regenerate `src/integrations/supabase/types.ts`.
4. **Code.** Put the feature in `src/features/<name>/`:
   - `api.ts` (Supabase calls)
   - `hooks.ts` (React Query, using keys added to `queryKeys.ts`)
   - `components/` and `pages/`
5. **Route.** Register the route:
   - a lazy `<Route>` in `App.tsx`;
   - an entry in `APP_PAGES` (and `QUICK_ACTIONS` if it creates things) in `src/config/routes.ts`.
6. **Guard.** If it's admin-only, add a capability in `src/lib/permissions.ts`.
   - Wrap the route in `<RoleBasedAccess capability=…>`.
   - Set `capability` on the registry entry.
7. **Check.** Run `npm run check` (lint, typecheck, edge-function check, tests, build).

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
supabase functions deploy invite-staff manage-staff
supabase secrets set SITE_URL=https://<your-domain> ALLOWED_ORIGINS=https://<your-domain>
```

Then merge to `main`; Vercel deploys the frontend.

In the Supabase dashboard, open **Authentication → URL configuration**. Set the Site URL, and add `https://<your-domain>/**` to the redirect URLs. Invitation and password-reset links return to `/accept-invite` and `/reset-password`.
