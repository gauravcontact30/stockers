import { playCall } from "../../app/components/reminder-sound";

type Ctx = {
  state: string;
  currentTime: number;
  resume: jest.Mock;
  close: jest.Mock;
  createOscillator: jest.Mock;
  createGain: jest.Mock;
  destination: unknown;
};

function stubAudio(state = "running"): { ctx: Ctx; oscillators: number } {
  let oscillators = 0;

  const gainNode = { gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }, connect: jest.fn() };
  gainNode.connect.mockReturnValue({ connect: jest.fn() });

  const ctx: Ctx = {
    state,
    currentTime: 0,
    resume: jest.fn(),
    close: jest.fn(),
    destination: {},
    createOscillator: jest.fn(() => {
      oscillators++;
      const node = {
        type: "",
        frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        connect: jest.fn(() => gainNode),
        start: jest.fn(),
        stop: jest.fn(),
      };
      return node;
    }),
    createGain: jest.fn(() => gainNode),
  };

  (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ctx);
  return { ctx, get oscillators() { return oscillators; } };
}

describe("playCall", () => {
  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
    jest.useRealTimers();
  });

  it("synthesises one tone per beat in the pattern", () => {
    const audio = stubAudio();
    expect(playCall(240)).toBe(true);
    // Default pattern is two beats — a bark, not a single beep.
    expect(audio.oscillators).toBe(2);
  });

  it("honours a custom pattern", () => {
    const audio = stubAudio();
    playCall(400, [0]);
    expect(audio.oscillators).toBe(1);
  });

  // Browsers suspend audio until the user has interacted with the page.
  it("resumes a suspended context", () => {
    const audio = stubAudio("suspended");
    playCall(300);
    expect(audio.ctx.resume).toHaveBeenCalled();
  });

  it("releases the audio hardware once the call has finished", () => {
    jest.useFakeTimers();
    const audio = stubAudio();
    playCall(300);
    expect(audio.ctx.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1200);
    expect(audio.ctx.close).toHaveBeenCalled();
  });

  // Sound is decorative; a browser without Web Audio must not break the reminder.
  it("reports failure rather than throwing when Web Audio is unavailable", () => {
    expect(playCall(300)).toBe(false);
  });

  it("reports failure when the browser refuses to build a context", () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => {
      throw new Error("blocked");
    });
    expect(playCall(300)).toBe(false);
  });

  it("falls back to the webkit-prefixed context", () => {
    const audio = stubAudio();
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext = (
      window as unknown as { AudioContext: unknown }
    ).AudioContext;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;

    expect(playCall(300)).toBe(true);
    expect(audio.oscillators).toBe(2);
  });
});
