import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubscriptionProvider } from "../../app/components/subscription-provider";
import {
  REMIND_EVERY_MS,
  SubscriptionBadge,
  SubscriptionReminder,
  isReminderFreeRoute,
  reminderCopy,
  shouldRemind,
  daysUntil,
  remindersShown,
  reminderKey,
  MAX_REMINDERS,
  REMINDER_COUNT_KEY,
  reminderKicker,
  patternSpinClass,
  todayIST,
} from "../../app/components/subscription-reminder";

// The reminder asks which route it is on so it can stay off the auth pages. Outside an app-router
// context `usePathname` returns null, which is what every other test in this file relies on.
let mockPathname: string | null = null;
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("../../app/components/subscribe-modal", () => ({
  SubscribeModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Buy Plan">
        <p>Choose a plan and billing.</p>
        <button type="button" onClick={onClose}>
          Close buy plan
        </button>
      </div>
    ) : null,
}));

jest.mock("../../app/components/reminder-sound", () => ({ playCall: jest.fn(() => true) }));
jest.mock("../../app/components/reminder-voice", () => ({
  speak: jest.fn(() => true),
  stopSpeaking: jest.fn(),
}));
import { playCall } from "../../app/components/reminder-sound";
import { speak, stopSpeaking } from "../../app/components/reminder-voice";

const baseStatus = {
  state: "trial",
  allowed: true,
  enforced: false,
  isAdmin: false,
  tier: "pro",
  planName: "Pro",
  marketDaysUsed: 4,
  marketDaysLeft: 1,
  trialStartedAt: "2026-08-01T04:00:00.000Z",
  trialEndsAt: "2026-08-04",
  subscribedUntil: null,
  today: "2026-08-05",
  locks: {},
  features: [],
  signedIn: true,
  name: "Aarav",
};

function mockStatus(overrides: Record<string, unknown> = {}) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...baseStatus, ...overrides }) } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderWithProvider(ui: React.ReactNode) {
  return render(<SubscriptionProvider>{ui}</SubscriptionProvider>);
}

/**
 * The reminder waits two seconds before its first appearance so the page can be read first.
 *
 * Two flushes before the clock moves, not one. The status arrives on the first; only then does the
 * component know which expiry it is counting appearances for, and it reads that count on a second
 * pass. The delay timer is scheduled after both, so advancing the clock any earlier finds nothing
 * to advance.
 */
async function advanceToFirstShow() {
  await act(async () => {});
  await act(async () => {});
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // The appearance count now lives in localStorage, so without this a suite that spends the
  // allowance leaves every test after it looking at a reminder that is correctly suppressed.
  window.localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const TODAY = "2026-08-09";

describe("daysUntil", () => {
  it("counts whole days from today to the date given", () => {
    expect(daysUntil("2026-08-10", TODAY)).toBe(1);
    expect(daysUntil("2026-08-09", TODAY)).toBe(0);
    expect(daysUntil("2026-08-16", TODAY)).toBe(7);
  });

  it("goes negative for a date already past", () => {
    expect(daysUntil("2026-08-08", TODAY)).toBe(-1);
  });

  // Null rather than zero: zero means "expires today" and would interrupt someone on no evidence.
  it("says nothing when there is no date to work from", () => {
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil("not-a-date", TODAY)).toBeNull();
    expect(daysUntil("2026-08-10", "")).toBeNull();
  });
});

describe("shouldRemind", () => {
  /**
   * One day, and one day only. The old rule fired from two trial days out and then on every page
   * for anyone expired â€” including signed-out visitors, for whom it was a conversion prompt rather
   * than a reminder about anything.
   */
  it("warns a subscriber exactly one day before their access lapses", () => {
    const active = { ...baseStatus, state: "active", signedIn: true };
    expect(shouldRemind({ ...active, subscribedUntil: "2026-08-10" } as never, TODAY)).toBe(true);
  });

  it("leaves a subscriber alone on any other day", () => {
    const active = { ...baseStatus, state: "active", signedIn: true };
    expect(shouldRemind({ ...active, subscribedUntil: "2026-08-12" } as never, TODAY)).toBe(false);
    expect(shouldRemind({ ...active, subscribedUntil: "2026-08-09" } as never, TODAY)).toBe(false);
    expect(shouldRemind({ ...active, subscribedUntil: null } as never, TODAY)).toBe(false);
  });

  it("warns a trial user on their last calendar day only", () => {
    const trial = { ...baseStatus, state: "trial", signedIn: true };
    expect(shouldRemind({ ...trial, marketDaysLeft: 1 } as never, TODAY)).toBe(true);
    expect(shouldRemind({ ...trial, marketDaysLeft: 2 } as never, TODAY)).toBe(false);
    expect(shouldRemind({ ...trial, marketDaysLeft: 0 } as never, TODAY)).toBe(false);
  });

  it("opens for an expired signed-in trial so the user can subscribe", () => {
    expect(shouldRemind({ ...baseStatus, state: "expired", signedIn: true, marketDaysLeft: 0 } as never, TODAY)).toBe(true);
  });

  // Admins and strangers are not trial-expiration subscription prompts.
  it("stays quiet for admins and signed-out visitors", () => {
    expect(shouldRemind(null, TODAY)).toBe(false);
    expect(shouldRemind({ ...baseStatus, isAdmin: true, state: "admin" } as never, TODAY)).toBe(false);
    expect(shouldRemind({ ...baseStatus, state: "expired", signedIn: false, marketDaysLeft: 0 } as never, TODAY)).toBe(false);
    expect(shouldRemind({ ...baseStatus, state: "trial", marketDaysLeft: 1, signedIn: false } as never, TODAY)).toBe(false);
  });
});

describe("remindersShown", () => {
  it("reads the count back for the expiry it was written against", () => {
    expect(remindersShown(JSON.stringify({ key: "2026-08-10", count: 2 }), "2026-08-10")).toBe(2);
  });

  // A new period starts a fresh allowance rather than inheriting a spent one.
  it("starts again when the expiry it is counting toward has changed", () => {
    expect(remindersShown(JSON.stringify({ key: "2026-07-10", count: 3 }), "2026-08-10")).toBe(0);
  });

  // Showing the reminder is a far milder failure than suppressing it forever.
  it("counts unreadable storage as none shown", () => {
    expect(remindersShown(null, "2026-08-10")).toBe(0);
    expect(remindersShown("not json", "2026-08-10")).toBe(0);
    expect(remindersShown(JSON.stringify({ key: "2026-08-10", count: "many" }), "2026-08-10")).toBe(0);
    expect(remindersShown(JSON.stringify({ key: "2026-08-10", count: -4 }), "2026-08-10")).toBe(0);
  });
});

describe("reminderKey", () => {
  it("keys a subscriber's count by the day their access lapses", () => {
    expect(reminderKey({ ...baseStatus, state: "active", subscribedUntil: "2026-08-10" } as never)).toBe("2026-08-10");
  });

  it("keys a trial user's count by the days they have left", () => {
    expect(reminderKey({ ...baseStatus, state: "trial", marketDaysLeft: 1 } as never)).toBe("trial:2026-08-04");
  });

  it("has no key at all before the status arrives", () => {
    expect(reminderKey(null)).toBe("");
  });
});

describe("reminderCopy", () => {
  it("pluralises the remaining days", () => {
    expect(reminderCopy({ ...baseStatus, marketDaysLeft: 2 } as never).body).toBe(
      "You have 2 calendar days left on your trial.",
    );
    expect(reminderCopy({ ...baseStatus, marketDaysLeft: 1 } as never).body).toBe(
      "You have 1 calendar day left on your trial.",
    );
  });

  // One source for both the rendered text and the spoken line, so they cannot diverge.
  it("counts down the trial, with correct pluralisation", () => {
    expect(reminderCopy({ ...baseStatus, marketDaysLeft: 1 } as never)).toEqual({
      headline: "Your free trial is nearly up",
      body: "You have 1 calendar day left on your trial.",
    });

    expect(reminderCopy({ ...baseStatus, marketDaysLeft: 2 } as never).body).toBe(
      "You have 2 calendar days left on your trial.",
    );
  });

  it("switches to the expired wording, which never claims anything is blocked", () => {
    const copy = reminderCopy({ ...baseStatus, state: "expired", marketDaysLeft: 0 } as never);
    expect(copy.headline).toBe("Your free trial has ended");
    expect(copy.body).toContain("Subscribe to Starter, Pro or Elite");
  });
});

describe("isReminderFreeRoute", () => {
  it("covers both auth routes and anything nested under them", () => {
    expect(isReminderFreeRoute("/signin")).toBe(true);
    expect(isReminderFreeRoute("/signup")).toBe(true);
    expect(isReminderFreeRoute("/signup/step-two")).toBe(true);
  });

  it("leaves every other route alone", () => {
    expect(isReminderFreeRoute("/")).toBe(false);
    expect(isReminderFreeRoute("/dashboard")).toBe(false);
    expect(isReminderFreeRoute("/news")).toBe(false);
    // A route that merely starts with the same letters is not an auth route.
    expect(isReminderFreeRoute("/signups-are-open")).toBe(false);
  });

  it("treats an unknown route as ordinary", () => {
    expect(isReminderFreeRoute(null)).toBe(false);
  });
});

describe("SubscriptionReminder", () => {
  afterEach(() => {
    mockPathname = null;
  });

  // The regression this guards: the reminder is `fixed inset-0`, so on the sign-up page it covered
  // the form and swallowed the click on "Create account" â€” a new visitor could not sign up at all.
  it.each(["/signup", "/signin"])("never appears on %s, however lapsed the visitor is", async (route) => {
    mockPathname = route;
    mockStatus({ state: "expired", marketDaysLeft: 0 });
    renderWithProvider(<SubscriptionReminder />);

    await advanceToFirstShow();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("still appears on an ordinary page for the same visitor", async () => {
    mockPathname = "/dashboard";
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);

    await advanceToFirstShow();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("waits before its first appearance, then shows a character shouting", async () => {
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);

    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await advanceToFirstShow();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Your free trial is nearly up");
    expect(screen.getByText("You have 1 calendar day left on your trial.")).toBeInTheDocument();
    // The reminder is a nudge, not a wall â€” nothing is actually locked.
    expect(screen.getByText(/Starter and Pro AI features are unlocked/)).toBeInTheDocument();
    expect(playCall).toHaveBeenCalled();
  });

  it("returns every 15 minutes with a different character", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);

    await advanceToFirstShow();
    const firstShout = screen.getByRole("dialog").textContent;

    await user.click(screen.getByText("Maybe later"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(REMIND_EVERY_MS);
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The cast rotates, so a returning reminder isn't the identical panel again.
    expect(screen.getByRole("dialog").textContent).not.toBe(firstShout);
  });

  /**
   * The brief asked for a modal that looks different every time it opens, so the chrome, the
   * pattern and the animations rotate on their own cycle alongside the cast.
   *
   * Three appearances is the whole allowance now, so three distinct looks is the whole claim â€”
   * the six-character, five-theme rotation still guarantees they differ.
   */
  it("opens in a different look each time, not just with a different character", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    const panel = () => screen.getByRole("dialog").firstElementChild as HTMLElement;
    const looks: string[] = [];

    for (let round = 0; round < MAX_REMINDERS; round++) {
      looks.push(`${panel().dataset.theme}/${panel().dataset.character}`);
      await user.click(screen.getByText("Maybe later"));
      await act(async () => {
        jest.advanceTimersByTime(REMIND_EVERY_MS);
      });
    }

    expect(new Set(looks).size).toBe(MAX_REMINDERS);
  });

  it("carries the theme's entrance animation and idle motion onto the panel", async () => {
    mockStatus();
    const { container } = renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    const panel = screen.getByRole("dialog").firstElementChild as HTMLElement;
    expect(panel.className).toContain("animate-pop-in");
    expect(container.querySelector(".animate-character-bounce")).toBeInTheDocument();
  });

  // Each character's call is its own sound, not a shared beep at a different pitch.
  it("plays the character's own call rather than a bare frequency", async () => {
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    expect(playCall).toHaveBeenCalledWith(
      expect.objectContaining({ wave: expect.any(String), bend: expect.any(Array), pattern: expect.any(Array) }),
    );
  });

  // Nothing can be done about an expiry that has already happened, so the interruption has no
  // purpose. The reminder's whole job is the day of notice before it.
  it("interrupts an expired signed-in trial with a subscription alert", async () => {
    mockStatus({ state: "expired", marketDaysLeft: 0 });
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Your free trial has ended");
    expect(screen.getByText(/Starter and Pro AI features are locked now/)).toBeInTheDocument();
  });

  it("never interrupts an admin", async () => {
    mockStatus({ isAdmin: true, state: "admin" });
    const { container } = renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();
    expect(container).toBeEmptyDOMElement();
  });

  it("plays the character's call on demand and can be muted", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    (playCall as jest.Mock).mockClear();
    await user.click(screen.getByText("ðŸ”Š Hear it"));
    expect(playCall).toHaveBeenCalledTimes(1);

    const mute = screen.getByRole("button", { name: /Voice on/ });
    await user.click(mute);
    expect(screen.getByRole("button", { name: /Muted/ })).toHaveAttribute("aria-pressed", "true");
    // Muting must silence a line that is already being read, not just the next one.
    expect(stopSpeaking).toHaveBeenCalled();
  });

  // The voiceover is the point of the modal: it must read exactly what is on screen.
  it("reads the modal aloud in the character's voice", async () => {
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    // The voice follows the character's call rather than talking over it.
    expect(speak).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    const [line, profile] = (speak as jest.Mock).mock.calls[0];
    expect(line).toContain("With great charts comes great responsibility!");
    expect(line).toContain("Your free trial is nearly up");
    expect(line).toContain("1 calendar day");
    expect(profile).toEqual({ gender: "male", pitch: 0.6, rate: 0.88 });
  });

  it("uses a different voice profile when a different character returns", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    const first = (speak as jest.Mock).mock.calls[0];

    await user.click(screen.getByText("Maybe later"));
    (speak as jest.Mock).mockClear();

    await act(async () => {
      jest.advanceTimersByTime(REMIND_EVERY_MS);
    });
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    const second = (speak as jest.Mock).mock.calls[0];
    expect(second[1]).not.toEqual(first[1]);
    // The rotation index is passed through so the system voice differs too, not just the pitch.
    expect(second[2]).not.toBe(first[2]);
  });

  it("speaks on demand from the Hear it button", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();
    (speak as jest.Mock).mockClear();

    await user.click(screen.getByText("ðŸ”Š Hear it"));
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    expect(speak).toHaveBeenCalled();
  });

  it("stops the voiceover when dismissed", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();
    (stopSpeaking as jest.Mock).mockClear();

    await user.click(screen.getByText("Maybe later"));
    expect(stopSpeaking).toHaveBeenCalled();
  });

  it("opens the buy plan modal from the popup", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus({ state: "expired", marketDaysLeft: 0 });

    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    await user.click(screen.getByText("Subscribe now"));
    expect(screen.getByRole("dialog", { name: "Buy Plan" })).toBeInTheDocument();
  });

  // A stranger has no subscription to be reminded about. This was a conversion prompt wearing a
  // reminder's clothes, and it interrupted every visitor on every marketing page.
  it("never interrupts a signed-out visitor", async () => {
    mockStatus({ state: "expired", signedIn: false, marketDaysLeft: 0 });
    const { container } = renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Three appearances, then silence â€” counted across reloads rather than per page view, because a
   * reader who opens the dashboard five times has not agreed to be interrupted five times.
   *
   * The third appearance has to survive being counted. An earlier version wrote the count as the
   * modal opened and then hid it in the same render for having reached the limit, so only two of
   * the three were ever seen.
   */
  it("appears three times and no more", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    for (let shown = 1; shown <= MAX_REMINDERS; shown++) {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await user.click(screen.getByText("Maybe later"));
      await act(async () => {
        jest.advanceTimersByTime(REMIND_EVERY_MS);
      });
    }

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("remembers the spent allowance across a reload", async () => {
    window.localStorage.setItem(REMINDER_COUNT_KEY, JSON.stringify({ key: "trial:2026-08-04", count: MAX_REMINDERS }));
    mockStatus();

    const { container } = renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    expect(container).toBeEmptyDOMElement();
  });

  // A new subscription period is a new allowance, not an inherited one.
  it("starts a fresh three when the expiry it is counting toward changes", async () => {
    window.localStorage.setItem(REMINDER_COUNT_KEY, JSON.stringify({ key: "trial:2026-08-01", count: MAX_REMINDERS }));
    mockStatus();

    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes from the âœ• button", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    await user.click(screen.getByLabelText("Dismiss reminder"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays silent while muted", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    await user.click(screen.getByRole("button", { name: /Voice on/ }));
    await user.click(screen.getByText("Maybe later"));
    (playCall as jest.Mock).mockClear();
    (speak as jest.Mock).mockClear();

    await act(async () => {
      jest.advanceTimersByTime(REMIND_EVERY_MS);
    });
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(playCall).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });
});

describe("SubscriptionBadge", () => {
  it.each([
    [{}, "Trial - 1 calendar day left"],
    [{ marketDaysLeft: 3 }, "Trial - 3 calendar days left"],
    [{ state: "active" }, "Subscribed"],
    [{ state: "expired" }, "Trial ended"],
    [{ state: "expired", signedIn: false }, "Free preview"],
  ])("renders %s as %s", async (overrides, expected) => {
    mockStatus(overrides as Record<string, unknown>);
    renderWithProvider(<SubscriptionBadge />);
    await act(async () => {});
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("renders nothing until the status arrives", async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = renderWithProvider(<SubscriptionBadge />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The chip tells a reader where they stand with the paywall. An administrator stands outside it,
   * so the chip had nothing to say to them and simply announced the role in the public header.
   */
  it("shows nothing at all to an admin", async () => {
    mockStatus({ state: "admin", isAdmin: true });
    const { container } = renderWithProvider(<SubscriptionBadge />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});

describe("reminderCopy across the three states", () => {
  /**
   * The bug this covers: a paying subscriber a day from renewal was told their *free trial* was
   * nearly up. Wrong, and insulting to someone who has already paid.
   */
  it("tells a subscriber their subscription is ending, not their trial", () => {
    const copy = reminderCopy({ ...baseStatus, state: "active", subscribedUntil: "2026-08-10" } as never);
    expect(copy.headline).toBe("Your subscription ends tomorrow");
    expect(copy.body).not.toMatch(/trial/i);
  });

  it("still has its own words for a trial that has run out", () => {
    const copy = reminderCopy({ ...baseStatus, state: "expired", marketDaysLeft: 0 } as never);
    expect(copy.headline).toBe("Your free trial has ended");
  });
});

describe("reminderKicker", () => {
  it("calls a subscription ending a subscription, and a trial a trial", () => {
    expect(reminderKicker({ ...baseStatus, state: "active" } as never)).toBe("Subscription ending");
    expect(reminderKicker({ ...baseStatus, state: "trial" } as never)).toBe("Trial ending");
    expect(reminderKicker({ ...baseStatus, state: "expired" } as never)).toBe("Trial expired");
  });
});

describe("patternSpinClass", () => {
  // Radiating wedges only read as a spotlight if they turn; the other patterns are still.
  it("turns the starburst and leaves every other pattern alone", () => {
    expect(patternSpinClass("starburst")).toBe("animate-ray-spin");
    expect(patternSpinClass("confetti")).toBe("");
  });
});

describe("todayIST", () => {
  // The dates it is compared against are IST dates, so a subscriber abroad must not lose a day.
  it("reports the exchange's date, not the reader's", () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIST()).toBe(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  });
});

