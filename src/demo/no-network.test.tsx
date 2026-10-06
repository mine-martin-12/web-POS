/**
 * Demo mode end to end, in the real <App/>: it opens without Supabase, every page renders
 * for both roles, and nothing ever reaches the network except PGlite's own files.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", async (original) => ({
  ...(await original<typeof import("@supabase/supabase-js")>()),
  createClient,
}));

/** Every request the page tried to make. */
const requests: string[] = [];

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      // PGlite loads its own .wasm/.data files (file: URLs here; the app's own assets in a browser).
      if (url.startsWith("file:")) return new Response(await readFile(fileURLToPath(url)));
      requests.push(url);
      // No shipped history in tests: the demo builds the shop itself.
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    }),
  );
  vi.stubGlobal(
    "WebSocket",
    class {
      constructor(url: string) {
        requests.push(`ws:${url}`);
        throw new Error("No WebSockets in demo mode");
      }
    },
  );
  // PGlite's own files load over XHR under jsdom (file: URLs); anything else is recorded and blocked.
  const open = XMLHttpRequest.prototype.open;
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(function (this: XMLHttpRequest, ...args: unknown[]) {
    const url = String(args[1]);
    if (!url.startsWith("file:")) {
      requests.push(`xhr:${url}`);
      throw new Error("No requests in demo mode");
    }
    return (open as (...a: unknown[]) => void).apply(this, args);
  });
  // jsdom's Blob has no arrayBuffer(); PGlite needs it to read its bundled files.
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }

  // Load the lazily imported pages up front: transforming them on first click is slow
  // under the test runner and isn't what this test is about.
  await Promise.all([
    import("@/features/dashboard/pages/DashboardPage"),
    import("@/features/sales/pages/SalesPage"),
    import("@/features/credits/pages/CreditsPage"),
    import("@/features/products/pages/ProductsPage"),
    import("@/features/customers/pages/CustomersPage"),
    import("@/features/staff/pages/StaffPage"),
    import("@/features/approvals/pages/ApprovalsPage"),
    import("@/features/activity/pages/ActivityPage"),
    import("@/features/expenses/pages/ExpensesPage"),
    import("@/features/reports/pages/ReportsPage"),
    import("@/features/messaging/pages/MessagingPage"),
  ]);

  window.history.replaceState(null, "", "/app?demo=1");
  const { setDemoMode } = await import("@/data/mode");
  setDemoMode(true);
  const demo = await import("@/demo");
  await demo.startDemo();
}, 300_000);

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openPage(path: string, heading: RegExp) {
  const link = document.querySelector<HTMLAnchorElement>(`a[href="${path}"]`);
  expect(link, `nav link ${path}`).not.toBeNull();
  await act(async () => {
    fireEvent.click(link!);
  });
  try {
    await screen.findByRole("heading", { level: 1, name: heading }, { timeout: 20_000 });
  } catch (error) {
    console.log("DEBUG", window.location.pathname, document.querySelector("#main-content")?.textContent?.slice(0, 600));
    throw error;
  }
}

const ADMIN_PAGES: Array<[string, RegExp]> = [
  ["/app/sales", /^Sales$/],
  ["/app/credits", /^Credits$/],
  ["/app/customers", /^Customers$/],
  ["/app/products", /^Products$/],
  ["/app/approvals", /^Approvals$/],
  ["/app/staff", /^Team$/],
  ["/app/reports", /^Reports$/],
  ["/app/expenses", /^Expenses$/],
  ["/app/messages", /^Messages$/],
  ["/app/activity", /^Activity$/],
  ["/app", /^Good (morning|afternoon|evening)/],
];

describe("demo mode in the real app", () => {
  // One test: Testing Library unmounts the app after each test.
  it("opens without Supabase, renders every page for both roles, and stays offline", async () => {
    window.history.replaceState(null, "", "/app");
    const { default: App } = await import("@/App");
    render(<App />);
    expect(await screen.findByRole("region", { name: "Demo mode" }, { timeout: 30_000 })).toHaveTextContent(
      "Demo mode – changes aren't saved",
    );
    await screen.findByText("Demo Shop", undefined, { timeout: 30_000 });

    // Every page, as the admin.
    for (const [path, heading] of ADMIN_PAGES) await openPage(path, heading);

    // The staff view: own sales only, no admin pages, masked phones.
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /Staff/ }));
    });
    await waitFor(() => expect(document.querySelector('a[href="/app/staff"]')).toBeNull(), { timeout: 20_000 });
    await openPage("/app/sales", /^Sales$/);
    expect(await screen.findByText("The sales you recorded.", undefined, { timeout: 20_000 })).toBeInTheDocument();
    await openPage("/app/customers", /^Customers$/);
    await waitFor(() => expect(document.body.textContent).toMatch(/\+2547000\*\*\*\d\d/), { timeout: 20_000 });
    expect(document.body.textContent).not.toMatch(/\+254700000\d{3}/);

    // Nothing reached Supabase, or the network at all.
    expect(createClient).not.toHaveBeenCalled();
    expect(requests.filter((url) => !url.endsWith("/demo/history.tgz"))).toEqual([]);
  }, 300_000);
});
