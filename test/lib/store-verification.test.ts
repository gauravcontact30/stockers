// The account-verification half of the store: issuing a single-use token at sign-up, spending it,
// re-issuing it, and the redacted view the admin dashboard is served.
//
// These exercise the account store for real, against the per-worker file jest.setup.ts points it
// at rather than the developer's own `app/data/users.json` — a test run must not cost anyone their
// account, and two suites sharing one file raced each other across Jest's parallel workers.
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createUser,
  listUsers,
  newVerificationToken,
  refreshVerificationToken,
  verifyEmailToken,
} from "../../app/lib/store";

const usersPath = process.env.STOCKERS_USERS_FILE as string;
let original: string | null = null;

beforeAll(async () => {
  original = await fs.readFile(usersPath, "utf8").catch(() => null);
});

afterAll(async () => {
  if (original === null) {
    await fs.rm(usersPath, { force: true });
  } else {
    await fs.writeFile(usersPath, original, "utf8");
  }
});

beforeEach(async () => {
  await fs.mkdir(path.dirname(usersPath), { recursive: true });
  await fs.writeFile(usersPath, "[]", "utf8");
});

const signUp = (email: string) => createUser({ name: "Test Person", email, password: "secret123", plan: "Starter" });

describe("newVerificationToken", () => {
  it("is long and never repeats", () => {
    const a = newVerificationToken();
    const b = newVerificationToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });
});

describe("createUser", () => {
  it("starts every account unverified, with a token waiting to be spent", async () => {
    const user = await signUp("new@example.com");

    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.verificationToken).toHaveLength(64);
    expect(user?.verificationSentAt).toBeNull();
  });
});

describe("verifyEmailToken", () => {
  it("marks the address confirmed and spends the token", async () => {
    const user = await signUp("verify@example.com");

    const verified = await verifyEmailToken(user!.verificationToken!);

    expect(verified?.id).toBe(user!.id);
    expect(verified?.emailVerifiedAt).toEqual(expect.any(String));
    expect(verified?.verificationToken).toBeNull();
  });

  it("refuses the same link a second time", async () => {
    const user = await signUp("once@example.com");
    const token = user!.verificationToken!;

    await expect(verifyEmailToken(token)).resolves.not.toBeNull();
    await expect(verifyEmailToken(token)).resolves.toBeNull();
  });

  it("refuses an unknown or empty token", async () => {
    await signUp("other@example.com");

    await expect(verifyEmailToken("not-a-real-token")).resolves.toBeNull();
    await expect(verifyEmailToken("")).resolves.toBeNull();
  });
});

describe("refreshVerificationToken", () => {
  it("issues a new link and invalidates the previous one", async () => {
    const user = await signUp("resend@example.com");
    const firstToken = user!.verificationToken!;

    const issued = await refreshVerificationToken(user!.id);

    expect(issued?.token).not.toBe(firstToken);
    // The superseded link must no longer work, or a leaked old mail would still verify.
    await expect(verifyEmailToken(firstToken)).resolves.toBeNull();
    await expect(verifyEmailToken(issued!.token)).resolves.not.toBeNull();
  });

  it("declines for an unknown account", async () => {
    await expect(refreshVerificationToken("user_nope")).resolves.toBeNull();
  });

  it("declines once the address is already confirmed", async () => {
    const user = await signUp("done@example.com");
    await verifyEmailToken(user!.verificationToken!);

    await expect(refreshVerificationToken(user!.id)).resolves.toBeNull();
  });
});

describe("listUsers", () => {
  it("never exposes the password hash or a live verification token", async () => {
    await signUp("listed@example.com");

    const [row] = await listUsers();

    expect(row).not.toHaveProperty("passwordHash");
    expect(row).not.toHaveProperty("verificationToken");
    expect(row.email).toBe("listed@example.com");
  });

  it("reports verification as a plain flag", async () => {
    const user = await signUp("flag@example.com");
    expect((await listUsers())[0].emailVerified).toBe(false);

    await verifyEmailToken(user!.verificationToken!);
    expect((await listUsers())[0].emailVerified).toBe(true);
  });

  it("puts the newest account first", async () => {
    await signUp("older@example.com");
    // createdAt is an ISO timestamp; without a gap two sign-ups in the same millisecond tie.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await signUp("newer@example.com");

    expect((await listUsers()).map((user) => user.email)).toEqual(["newer@example.com", "older@example.com"]);
  });
});
