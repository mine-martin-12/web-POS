// Shared request/response helpers for edge functions.

/** Comma-separated list of allowed browser origins, e.g.
 *  `supabase secrets set ALLOWED_ORIGINS=https://pos.example.com,http://localhost:8080`.
 *  When unset, any origin is allowed (the JWT is still required). */
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = allowedOrigins.length === 0 ? "*" : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** The app's public URL, used for links in emails. Prefers the caller's origin when it is
 *  an allowed one, then SITE_URL. */
export function siteUrl(req: Request): string {
  const origin = req.headers.get("Origin");
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) return origin;
  const configured = Deno.env.get("SITE_URL");
  if (configured) return configured.replace(/\/$/, "");
  throw new HttpError(500, "SITE_URL is not configured");
}

/** Throw to return a JSON error with a specific status and a message safe to show users. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Wraps a handler with CORS preflight, POST-only, JSON parsing and error mapping.
 *  Unexpected errors are logged server-side and reported generically. */
export function serve(handler: (req: Request, body: Record<string, unknown>) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
    try {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, "Invalid JSON body");
      }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new HttpError(400, "Invalid JSON body");
      }
      return await handler(req, body);
    } catch (error) {
      if (error instanceof HttpError) return json(req, { error: error.message }, error.status);
      console.error(error);
      return json(req, { error: "Something went wrong. Please try again." }, 500);
    }
  });
}

export function requireString(body: Record<string, unknown>, key: string, label = key): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") throw new HttpError(400, `${label} is required`);
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new HttpError(400, `${key} must be text`);
  return value.trim();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUuid(body: Record<string, unknown>, key: string): string {
  const value = requireString(body, key);
  if (!UUID.test(value)) throw new HttpError(400, `${key} is not a valid id`);
  return value;
}

export type AppRole = "admin" | "user";
export function requireRole(value: unknown): AppRole {
  if (value !== "admin" && value !== "user") throw new HttpError(400, "Role must be admin or user");
  return value;
}
