/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";
import { DELETE, GET, POST } from "../../app/api/portfolio/route";
import { listHoldings, MAX_HOLDINGS, saveHolding } from "../../app/lib/portfolio";
import { createToken, type AppUser } from "../../app/lib/store";

const usersPath = process.env.STOCKERS_USERS_FILE as string;
const holdingsPath = process.env.STOCKERS_PORTFOLIO_FILE as string;

function account(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_owner",
    name: "Asha Rao",
    email: "asha@example.com",
    passwordHash: "salt:hash",
    plan: "Starter",
    createdAt: "2026-08-01T00:00:00.000Z",
    role: "user",
    subscribedUntil: null,
    emailVerifiedAt: null,
    verificationToken: null,
    ...overrides,
  };
}

const owner = account();
const other = account({ id: "user_other", email: "bala@example.com", name: "Bala Iyer" });

let originalRoster: string | null = null;

beforeAll(async () => {
  originalRoster = await fs.readFile(usersPath, "utf8").catch(() => null);
});

beforeEach(async () => {
  await fs.rm(holdingsPath, { force: true });
  await fs.mkdir(path.dirname(usersPath), { recursive: true });
  await fs.writeFile(usersPath, JSON.stringify([owner, other], null, 2), "utf8");
});

afterEach(async () => {
  if (originalRoster === null) await fs.rm(usersPath, { force: true });
  else await fs.writeFile(usersPath, originalRoster, "utf8");
  await fs.rm(holdingsPath, { force: true });
});

function request(caller: AppUser | null, init: RequestInit & { query?: string } = {}) {
  const { query = "", ...rest } = init;
  return new Request(`http://localhost/api/portfolio${query}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(caller ? { Authorization: `Bearer ${createToken(caller)}` } : {}),
    },
  });
}

describe("a signed-out caller", () => {
  it("is refused by every handler, and told why", async () => {
    for (const handler of [
      () => GET(request(null)),
      () => POST(request(null, { method: "POST", body: JSON.stringify({ symbol: "RELIANCE" }) })),
      () => DELETE(request(null, { method: "DELETE", query: "?symbol=RELIANCE" })),
    ]) {
      const response = await handler();
      expect(response.status).toBe(401);
      expect((await response.json()).error).toBe("Sign in to use your portfolio.");
    }
  });
});

describe("GET /api/portfolio", () => {
  it("answers with this account's holdings and nobody else's", async () => {
    await saveHolding(owner.id, { symbol: "RELIANCE", quantity: 10, avgPrice: 1000 });
    await saveHolding(other.id, { symbol: "TCS", quantity: 5, avgPrice: 3000 });

    const response = await GET(request(owner));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.holdings.map((entry: { symbol: string }) => entry.symbol)).toEqual(["RELIANCE"]);
    expect(payload).toMatchObject({ max: MAX_HOLDINGS, backend: "file" });
  });

  it("answers an empty portfolio with an empty list rather than an error", async () => {
    const payload = await (await GET(request(owner))).json();

    expect(payload.holdings).toEqual([]);
  });
});

describe("POST /api/portfolio", () => {
  it("adds a holding and answers with the portfolio it produced", async () => {
    const response = await POST(
      request(owner, {
        method: "POST",
        body: JSON.stringify({ symbol: "reliance", quantity: "10", avgPrice: "1,000.50", targetPrice: "1500", note: " core " }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.saved).toBe("RELIANCE");
    expect(payload.holdings[0]).toMatchObject({
      symbol: "RELIANCE",
      quantity: 10,
      avgPrice: 1000.5,
      targetPrice: 1500,
      note: "core",
    });
  });

  it("attributes the holding to the caller, never to an id in the body", async () => {
    await POST(request(owner, { method: "POST", body: JSON.stringify({ symbol: "RELIANCE", userId: other.id, quantity: 1 }) }));

    expect(await listHoldings(owner.id)).toHaveLength(1);
    expect(await listHoldings(other.id)).toEqual([]);
  });

  it("refuses a symbol that is not one", async () => {
    const response = await POST(request(owner, { method: "POST", body: JSON.stringify({ symbol: "not a ticker" }) }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("That is not a symbol this exchange lists.");
  });

  it("refuses a body it cannot read", async () => {
    const bad = new Request("http://localhost/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${createToken(owner)}` },
      body: "{not json",
    });

    const response = await POST(bad);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid request body.");
  });

  it("names the cap when the portfolio is full", async () => {
    for (let index = 0; index < MAX_HOLDINGS; index++) {
      await saveHolding(owner.id, { symbol: `SYM${index}`, quantity: 1 });
    }

    const response = await POST(request(owner, { method: "POST", body: JSON.stringify({ symbol: "ONEMORE" }) }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(String(MAX_HOLDINGS));
  });
});

describe("DELETE /api/portfolio", () => {
  it("removes a holding named in the query string", async () => {
    await saveHolding(owner.id, { symbol: "RELIANCE", quantity: 1 });

    const response = await DELETE(request(owner, { method: "DELETE", query: "?symbol=RELIANCE" }));

    expect(response.status).toBe(200);
    expect((await response.json()).holdings).toEqual([]);
  });

  it("removes a holding named in the body", async () => {
    await saveHolding(owner.id, { symbol: "RELIANCE", quantity: 1 });

    const response = await DELETE(
      request(owner, { method: "DELETE", body: JSON.stringify({ symbol: "RELIANCE" }) }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).holdings).toEqual([]);
  });

  it("cannot reach another account's holding of the same stock", async () => {
    await saveHolding(other.id, { symbol: "RELIANCE", quantity: 1 });

    const response = await DELETE(request(owner, { method: "DELETE", query: "?symbol=RELIANCE" }));

    expect(response.status).toBe(404);
    expect(await listHoldings(other.id)).toHaveLength(1);
  });

  it("reports a stock that is not held", async () => {
    const response = await DELETE(request(owner, { method: "DELETE", query: "?symbol=TCS" }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("That stock is not in your portfolio.");
  });
});
