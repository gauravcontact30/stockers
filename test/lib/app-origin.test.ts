// Which variable wins, and what happens when none of them are set.
//
// This is worth its own suite because getting it wrong is invisible in development and expensive
// in production: every welcome email carries this value, and a wrong one sends new users to a link
// that does not work — or, worse, to someone else's site.

import { appOrigin } from "../../app/lib/app-origin";

// jest.setup.ts clears both names before any suite loads, so each test starts from "unset" and
// sets only what it is about.
afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("appOrigin", () => {
  it("uses APP_URL when it is set", () => {
    process.env.APP_URL = "https://www.stockersai.com";
    expect(appOrigin()).toBe("https://www.stockersai.com");
  });

  it("falls back to NEXT_PUBLIC_APP_URL, so existing deployments keep working after the rename", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.stockersai.com";
    expect(appOrigin()).toBe("https://www.stockersai.com");
  });

  it("prefers APP_URL when both are set", () => {
    process.env.APP_URL = "https://www.stockersai.com";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(appOrigin()).toBe("https://www.stockersai.com");
  });

  it("falls back to localhost when neither is set", () => {
    expect(appOrigin()).toBe("http://localhost:3000");
  });

  it("strips trailing slashes, however many", () => {
    process.env.APP_URL = "https://www.stockersai.com/";
    expect(appOrigin()).toBe("https://www.stockersai.com");

    process.env.APP_URL = "https://www.stockersai.com///";
    expect(appOrigin()).toBe("https://www.stockersai.com");
  });

  it("ignores a blank or whitespace-only value rather than building links against nothing", () => {
    process.env.APP_URL = "   ";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.stockersai.com";
    expect(appOrigin()).toBe("https://www.stockersai.com");
  });

  it("refuses to reduce to an empty origin", () => {
    // "/" trims away to nothing, which would put a relative URL in an email, where it means
    // nothing at all.
    process.env.APP_URL = "///";
    expect(appOrigin()).toBe("http://localhost:3000");
  });
});
