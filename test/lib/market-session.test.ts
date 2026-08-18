import {
  isAfterMarketClose,
  isBeforeMarketOpen,
  isTradingDay,
  istInstant,
  marketCloseAt,
  marketOpenAt,
  marketSessionState,
  tradingDayKey,
} from "../../app/lib/market-session";

/**
 * The exchange clock.
 *
 * Every instant below is written in UTC and read in IST, which is the whole point of the module:
 * the server this runs on is not in Kolkata, and "is the market open" has to be answered in the
 * exchange's time zone rather than the machine's. 18 August 2026 is a Tuesday.
 */
const at = (utc: string) => new Date(utc);

describe("tradingDayKey", () => {
  it("reads the IST date, not the server's", () => {
    // 19:00 UTC is already the next morning in IST — a server in London would otherwise spend five
    // and a half hours of every day naming the wrong session.
    expect(tradingDayKey(at("2026-08-17T19:00:00Z"))).toBe("2026-08-18");
    expect(tradingDayKey(at("2026-08-17T18:00:00Z"))).toBe("2026-08-17");
  });
});

describe("istInstant, marketOpenAt and marketCloseAt", () => {
  it("pins the exchange's hours to IST rather than to the server's offset", () => {
    expect(istInstant("2026-08-18", "09:15")).toBe("2026-08-18T09:15:00+05:30");
    expect(marketOpenAt("2026-08-18")).toBe("2026-08-18T09:15:00+05:30");
    expect(marketCloseAt("2026-08-18")).toBe("2026-08-18T15:30:00+05:30");
  });

  it("defaults to the IST day in progress", () => {
    expect(marketOpenAt()).toContain(tradingDayKey());
    expect(marketCloseAt()).toContain(tradingDayKey());
  });
});

describe("isBeforeMarketOpen and isAfterMarketClose", () => {
  it("puts 09:15 and 15:30 IST on the right side of each boundary", () => {
    // 03:44 UTC is 09:14 IST: one minute before the bell.
    expect(isBeforeMarketOpen(at("2026-08-18T03:44:00Z"))).toBe(true);
    expect(isBeforeMarketOpen(at("2026-08-18T03:45:00Z"))).toBe(false);

    // 10:00 UTC is 15:30 IST: the close itself counts as closed.
    expect(isAfterMarketClose(at("2026-08-18T09:59:00Z"))).toBe(false);
    expect(isAfterMarketClose(at("2026-08-18T10:00:00Z"))).toBe(true);
  });
});

describe("isTradingDay", () => {
  const saved = process.env.BSE_MARKET_HOLIDAYS;

  afterEach(() => {
    if (saved === undefined) delete process.env.BSE_MARKET_HOLIDAYS;
    else process.env.BSE_MARKET_HOLIDAYS = saved;
  });

  it("skips the weekend", () => {
    delete process.env.BSE_MARKET_HOLIDAYS;
    expect(isTradingDay("2026-08-18")).toBe(true);
    expect(isTradingDay("2026-08-15")).toBe(false); // Saturday
    expect(isTradingDay("2026-08-16")).toBe(false); // Sunday
  });

  it("skips the days an operator configured, and ignores the spaces around them", () => {
    process.env.BSE_MARKET_HOLIDAYS = " 2026-08-18 , 2026-10-02 ";
    expect(isTradingDay("2026-08-18")).toBe(false);
    expect(isTradingDay("2026-10-02")).toBe(false);
    expect(isTradingDay("2026-08-19")).toBe(true);
  });
});

describe("marketSessionState", () => {
  const saved = process.env.BSE_MARKET_HOLIDAYS;

  beforeEach(() => {
    delete process.env.BSE_MARKET_HOLIDAYS;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.BSE_MARKET_HOLIDAYS;
    else process.env.BSE_MARKET_HOLIDAYS = saved;
  });

  it("answers about right now when it is asked nothing", () => {
    // The default argument is how every caller in the app uses these: the board asks what the
    // exchange is doing, not what it was doing at some instant it had to work out first.
    expect(["pre-open", "live", "closed", "holiday"]).toContain(marketSessionState());
    expect(typeof isBeforeMarketOpen()).toBe("boolean");
    expect(typeof isAfterMarketClose()).toBe("boolean");
  });

  it("walks a trading day from pre-open through live to closed", () => {
    expect(marketSessionState(at("2026-08-18T03:00:00Z"))).toBe("pre-open"); // 08:30 IST
    expect(marketSessionState(at("2026-08-18T06:00:00Z"))).toBe("live"); // 11:30 IST
    expect(marketSessionState(at("2026-08-18T11:00:00Z"))).toBe("closed"); // 16:30 IST
  });

  it("calls a weekend and a configured holiday what they are, at any hour", () => {
    expect(marketSessionState(at("2026-08-15T06:00:00Z"))).toBe("holiday");

    process.env.BSE_MARKET_HOLIDAYS = "2026-08-18";
    // Mid-session on paper, and still a holiday: the day is checked before the clock is.
    expect(marketSessionState(at("2026-08-18T06:00:00Z"))).toBe("holiday");
  });
});
