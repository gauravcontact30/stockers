import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubscriptionProvider } from "../../app/components/subscription-provider";
import {
  REMIND_EVERY_MS,
  SubscriptionBadge,
  SubscriptionReminder,
  reminderCopy,
  shouldRemind,
} from "../../app/components/subscription-reminder";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
  marketDaysUsed: 4,
  marketDaysLeft: 1,
  trialStartedAt: "2026-08-01T04:00:00.000Z",
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
 * The reminder waits two seconds before its first appearance so the page can be read first. The
 * pending microtasks are flushed before the clock moves, so the status fetch has landed and the
 * timer has actually been scheduled.
 */
async function advanceToFirstShow() {
  await act(async () => {});
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("shouldRemind", () => {
  it("stays quiet with no status, for admins, for subscribers, and early in the trial", () => {
    expect(shouldRemind(null)).toBe(false);
    expect(shouldRemind({ ...baseStatus, isAdmin: true, state: "admin" } as never)).toBe(false);
    expect(shouldRemind({ ...baseStatus, state: "active" } as never)).toBe(false);
    expect(shouldRemind({ ...baseStatus, marketDaysLeft: 4 } as never)).toBe(false);
  });

  it("nudges once the trial is nearly up, and once it has expired", () => {
    expect(shouldRemind({ ...baseStatus, marketDaysLeft: 2 } as never)).toBe(true);
    expect(shouldRemind({ ...baseStatus, marketDaysLeft: 1 } as never)).toBe(true);
    expect(shouldRemind({ ...baseStatus, state: "expired", marketDaysLeft: 0 } as never)).toBe(true);
  });
});

describe("reminderCopy", () => {
  // One source for both the rendered text and the spoken line, so they cannot diverge.
  it("counts down the trial, with correct pluralisation", () => {
    expect(reminderCopy({ ...baseStatus, marketDaysLeft: 1 } as never)).toEqual({
      headline: "Your free trial is nearly up",
      body: "You have 1 open market day left on your trial.",
    });

    expect(reminderCopy({ ...baseStatus, marketDaysLeft: 2 } as never).body).toBe(
      "You have 2 open market days left on your trial.",
    );
  });

  it("switches to the expired wording, which never claims anything is blocked", () => {
    const copy = reminderCopy({ ...baseStatus, state: "expired", marketDaysLeft: 0 } as never);
    expect(copy.headline).toBe("Your free trial has ended");
    expect(copy.body).toContain("Everything still works");
  });
});

describe("SubscriptionReminder", () => {
  it("waits before its first appearance, then shows a character shouting", async () => {
    mockStatus();
    renderWithProvider(<SubscriptionReminder />);

    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await advanceToFirstShow();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Your free trial is nearly up");
    expect(screen.getByText("You have 1 open market day left on your trial.")).toBeInTheDocument();
    // The reminder is a nudge, not a wall — nothing is actually locked.
    expect(screen.getByText(/Nothing is locked right now/)).toBeInTheDocument();
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

  it("asks an expired user to subscribe without claiming anything is blocked", async () => {
    mockStatus({ state: "expired", marketDaysLeft: 0 });
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    expect(screen.getByText("Your free trial has ended")).toBeInTheDocument();
    expect(screen.getByText(/Everything still works/)).toBeInTheDocument();
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
    await user.click(screen.getByText("🔊 Hear it"));
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
    expect(line).toContain("1 open market day");
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

    await user.click(screen.getByText("🔊 Hear it"));
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

  it("renews from the popup and closes on success", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => baseStatus } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ ...baseStatus, state: "active" }) } as Response) as unknown as typeof fetch;

    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    await user.click(screen.getByText("Renew for 30 days"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the popup open and explains why when renewal fails", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => baseStatus } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Please sign in." }) } as Response) as unknown as typeof fetch;

    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    await user.click(screen.getByText("Renew for 30 days"));
    expect(await screen.findByText("Please sign in.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers sign-up rather than renewal to a signed-out visitor", async () => {
    mockStatus({ state: "expired", signedIn: false, marketDaysLeft: 0 });
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();

    expect(screen.getByText("Create an account")).toHaveAttribute("href", "/signup");
    expect(screen.queryByText("Renew for 30 days")).not.toBeInTheDocument();
  });

  it("pluralises the remaining days", async () => {
    mockStatus({ marketDaysLeft: 2 });
    renderWithProvider(<SubscriptionReminder />);
    await advanceToFirstShow();
    expect(screen.getByText("You have 2 open market days left on your trial.")).toBeInTheDocument();
  });

  it("closes from the ✕ button", async () => {
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
    [{}, "Trial · 1 market day left"],
    [{ marketDaysLeft: 3 }, "Trial · 3 market days left"],
    [{ state: "active" }, "Subscribed"],
    [{ state: "admin", isAdmin: true }, "Admin"],
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
});
