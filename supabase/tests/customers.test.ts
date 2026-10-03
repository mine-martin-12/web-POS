// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "../../src/lib/phone";
import { asUser, createBusiness, createDb, createProduct, expectError, inviteMember, rows, type Db } from "./harness";

let db: Db;
let acme: { businessId: string; adminId: string; staffId: string };
let other: { businessId: string; adminId: string };

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  acme = { ...a, staffId: await inviteMember(db, a.businessId, "staff@acme.test") };
  other = await createBusiness(db, "Other", "owner@other.test");
}, 60_000);

const PHONE_CASES = [
  "0712345678",
  "0712 345 678",
  "712345678",
  "254712345678",
  "+254 712 345 678",
  "+254-712-345-678",
  "00254712345678",
  "0112345678",
  "+14155550100",
  "12345",
  "",
  "abc",
  "0",
];

describe("phone normalisation", () => {
  it.each(PHONE_CASES)("SQL and TypeScript agree on %j", async (input) => {
    const [{ phone }] = await rows<{ phone: string | null }>(db, "SELECT normalize_phone($1) AS phone", [input]);
    expect(phone).toBe(normalizePhone(input));
  });

  it("produces the canonical Kenyan form", () => {
    expect(normalizePhone("0712 345 678")).toBe("+254712345678");
    expect(normalizePhone("12345")).toBeNull();
  });

  it("masks the same way on both sides", async () => {
    const [{ masked }] = await rows<{ masked: string }>(db, "SELECT mask_phone('+254712345690') AS masked");
    expect(masked).toBe("+2547123***90");
    expect(maskPhone("+254712345690")).toBe(masked);
  });
});

describe("customers", () => {
  let wanjiku: string;

  beforeAll(async () => {
    const [{ result }] = await asUser(db, acme.staffId, () =>
      rows<{ result: { status: string; customer: { id: string } } }>(
        db,
        "SELECT create_customer('  Wanjiku   Kamau ', '0712 345 678') AS result",
      ),
    );
    expect(result.status).toBe("created");
    wanjiku = result.customer.id;
  });

  it("stores a canonical phone and a tidy name", async () => {
    const [c] = await rows<{ name: string; phone: string }>(db, "SELECT name, phone FROM customers WHERE id = $1", [wanjiku]);
    expect(c).toEqual({ name: "Wanjiku Kamau", phone: "+254712345678" });
  });

  it("never lets clients read the raw phone column", async () => {
    for (const userId of [acme.staffId, acme.adminId]) {
      const msg = await asUser(db, userId, () => expectError(db, "SELECT phone FROM customers"));
      expect(msg).toMatch(/permission denied/);
    }
  });

  it("masks phones for staff and shows them to admins", async () => {
    const [staffView] = await asUser(db, acme.staffId, () =>
      rows<{ phone: string }>(db, "SELECT phone FROM customers_secure WHERE id = $1", [wanjiku]),
    );
    expect(staffView.phone).toBe("+2547123***78");
    const [adminView] = await asUser(db, acme.adminId, () =>
      rows<{ phone: string }>(db, "SELECT phone FROM customers_secure WHERE id = $1", [wanjiku]),
    );
    expect(adminView.phone).toBe("+254712345678");
  });

  it("reuses the existing record on a phone match", async () => {
    const [{ result }] = await asUser(db, acme.staffId, () =>
      rows<{ result: { status: string; customer: { id: string } } }>(
        db,
        "SELECT create_customer('W. Kamau', '+254712345678') AS result",
      ),
    );
    expect(result.status).toBe("existing_phone");
    expect(result.customer.id).toBe(wanjiku);
  });

  it("offers name matches unless told it's a different person", async () => {
    const [{ result }] = await asUser(db, acme.staffId, () =>
      rows<{ result: { status: string; matches: unknown[] } }>(db, "SELECT create_customer('wanjiku kamau') AS result"),
    );
    expect(result.status).toBe("name_matches");
    expect(result.matches).toHaveLength(1);
    const [{ forced }] = await asUser(db, acme.staffId, () =>
      rows<{ forced: { status: string } }>(db, "SELECT create_customer('Wanjiku Kamau', NULL, NULL, true) AS forced"),
    );
    expect(forced.status).toBe("created");
  });

  it("searches by exact phone (even for staff), by name, and lists recent", async () => {
    const byPhone = await asUser(db, acme.staffId, () =>
      rows<{ id: string; phone: string }>(db, "SELECT id, phone FROM search_customers('0712345678')"),
    );
    expect(byPhone.map((c) => c.id)).toEqual([wanjiku]);
    expect(byPhone[0].phone).toContain("***");

    const byName = await asUser(db, acme.staffId, () => rows<{ name: string }>(db, "SELECT name FROM search_customers('kama')"));
    expect(byName.length).toBeGreaterThanOrEqual(1);

    const tooShort = await asUser(db, acme.staffId, () => rows(db, "SELECT * FROM search_customers('w')"));
    expect(tooShort).toHaveLength(0);

    const recent = await asUser(db, acme.staffId, () => rows(db, "SELECT * FROM search_customers('')"));
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });

  it("is invisible to other businesses", async () => {
    const found = await asUser(db, other.adminId, () => rows(db, "SELECT * FROM search_customers('0712345678')"));
    expect(found).toHaveLength(0);
    const viaView = await asUser(db, other.adminId, () => rows(db, "SELECT * FROM customers_secure"));
    expect(viaView).toHaveLength(0);
  });

  it("only admins can edit customers", async () => {
    const updated = await asUser(db, acme.staffId, () =>
      rows(db, "UPDATE customers SET name = 'Hacked' WHERE id = $1 RETURNING id", [wanjiku]),
    );
    expect(updated).toHaveLength(0);
  });

  it("sales and credits can't point at another business's customer", async () => {
    const productId = await createProduct(db, other.businessId);
    const msg = await asUser(db, other.adminId, () =>
      expectError(
        db,
        "INSERT INTO sales (business_id, product_id, quantity, selling_price, customer_id) VALUES ($1, $2, 1, 10, $3)",
        [other.businessId, productId, wanjiku],
      ),
    );
    expect(msg).toMatch(/Customer not found/);
  });
});
