import { playCall, type CallSound } from "../../app/components/reminder-sound";

type Osc = {
  type: string;
  frequency: { setValueAtTime: jest.Mock; exponentialRampToValueAtTime: jest.Mock };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
};

type Ctx = {
  state: string;
  currentTime: number;
  resume: jest.Mock;
  close: jest.Mock;
  createOscillator: jest.Mock;
  createGain: jest.Mock;
  destination: unknown;
};

function stubAudio(state = "running") {
  const made: Osc[] = [];
  const gainNode = { gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }, connect: jest.fn() };
  gainNode.connect.mockReturnValue({ connect: jest.fn() });

  const ctx: Ctx = {
    state,
    currentTime: 0,
    resume: jest.fn(),
    close: jest.fn(),
    destination: {},
    createOscillator: jest.fn(() => {
      const node: Osc = {
        type: "",
        frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        connect: jest.fn(() => gainNode),
        start: jest.fn(),
        stop: jest.fn(),
      };
      made.push(node);
      return node;
    }),
    createGain: jest.fn(() => gainNode),
  };

  (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ctx);
  return { ctx, gainNode, oscillators: made };
}

const bark: CallSound = { tone: 260, pattern: [0, 0.26], wave: "sawtooth", bend: [0.5, 0.4], length: 0.18, volume: 0.2 };

describe("playCall", () => {
  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
    jest.useRealTimers();
  });

  it("synthesises one oscillator per beat in the pattern", () => {
    const audio = stubAudio();
    expect(playCall(bark)).toBe(true);
    expect(audio.oscillators).toHaveLength(2);
  });

  it("plays a single-beat call once", () => {
    const audio = stubAudio();
    playCall({ ...bark, pattern: [0] });
    expect(audio.oscillators).toHaveLength(1);
  });

  // The waveform is what separates a bark from a beep, so it has to reach the oscillator.
  it("applies the call's own waveform", () => {
    const audio = stubAudio();
    playCall({ ...bark, wave: "square" });
    expect(audio.oscillators[0].type).toBe("square");
  });

  // A bark falls in pitch, a mew rises then falls: both bend points must be scheduled.
  it("bends the pitch through the mid point and on to the end of the beat", () => {
    const audio = stubAudio();
    playCall({ ...bark, tone: 400, bend: [1.5, 0.5], length: 0.2 });

    const ramps = audio.oscillators[0].frequency.exponentialRampToValueAtTime.mock.calls;
    expect(ramps[0][0]).toBe(600);
    expect(ramps[0][1]).toBeCloseTo(0.09);
    expect(ramps[1][0]).toBe(200);
    expect(ramps[1][1]).toBeCloseTo(0.2);
  });

  // A bend that would leave audible range is pulled back rather than asking the browser for a
  // frequency it will reject.
  it("clamps a bend that would fall below or climb past hearing", () => {
    const audio = stubAudio();
    playCall({ ...bark, tone: 60, bend: [0.1, 0.05] });
    const ramps = audio.oscillators[0].frequency.exponentialRampToValueAtTime.mock.calls;
    expect(ramps[0][0]).toBe(40);

    playCall({ ...bark, tone: 6000, bend: [2, 4] });
    const high = audio.oscillators[audio.oscillators.length - 1].frequency.exponentialRampToValueAtTime.mock.calls;
    expect(high[1][0]).toBe(8000);
  });

  it("uses the call's own volume for the envelope peak", () => {
    const audio = stubAudio();
    playCall({ ...bark, volume: 0.11 });
    expect(audio.gainNode.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.11, 0.02);
  });

  // Browsers suspend audio until the user has interacted with the page.
  it("resumes a suspended context", () => {
    const audio = stubAudio("suspended");
    playCall(bark);
    expect(audio.ctx.resume).toHaveBeenCalled();
  });

  it("releases the audio hardware once the call has finished", () => {
    jest.useFakeTimers();
    const audio = stubAudio();
    playCall(bark);
    expect(audio.ctx.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2500);
    expect(audio.ctx.close).toHaveBeenCalled();
  });

  // Sound is decorative; a browser without Web Audio must not break the reminder.
  it("reports failure rather than throwing when Web Audio is unavailable", () => {
    expect(playCall(bark)).toBe(false);
  });

  it("reports failure when the browser refuses to build a context", () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => {
      throw new Error("blocked");
    });
    expect(playCall(bark)).toBe(false);
  });

  it("falls back to the webkit-prefixed context", () => {
    const audio = stubAudio();
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext = (
      window as unknown as { AudioContext: unknown }
    ).AudioContext;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;

    expect(playCall(bark)).toBe(true);
    expect(audio.oscillators).toHaveLength(2);
  });
});
