/**
 * Synthesises each character's call with the Web Audio API rather than shipping audio files —
 * no binary assets, no network fetch, and it works offline.
 *
 * A bark and a meow have to actually sound different, so a call is more than a frequency: the
 * waveform, how the pitch bends across the beat, how long each beat lasts and how many beats
 * there are together are what separate a dog from a cat from a robot.
 *
 * Browsers block audio until the user has interacted with the page, so an automatic attempt is
 * expected to fail and does so silently; the modal also offers a button that plays it on demand,
 * which always counts as a gesture.
 */

export type CallSound = {
  /** Starting frequency in hertz. */
  tone: number;
  /** Offsets, in seconds, at which each beat of the call begins. */
  pattern: number[];
  /** Timbre. A sawtooth is rough and animal, a sine is smooth, a square is electronic. */
  wave: OscillatorType;
  /**
   * Pitch multipliers at the middle and the end of a beat. `[1.35, 0.7]` rises then falls, which
   * is what makes a tone read as a meow; `[0.5, 0.42]` drops away, which reads as a bark.
   */
  bend: [number, number];
  /** Length of one beat in seconds. */
  length: number;
  /** Peak gain, 0 to 1. Kept low — this fires unprompted. */
  volume: number;
};

/** Frequencies are clamped into audible range so a bend can never ask for 0 Hz or a squeal. */
const MIN_HZ = 40;
const MAX_HZ = 8000;
/** Long enough for the longest call in the cast to finish before the context is released. */
const RELEASE_MS = 2500;

function clampHz(value: number): number {
  return Math.min(MAX_HZ, Math.max(MIN_HZ, value));
}

export function playCall(call: CallSound): boolean {
  try {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return false;

    const context = new AudioCtor();
    // A suspended context means the browser has not granted playback yet.
    if (context.state === "suspended") void context.resume();

    for (const offset of call.pattern) {
      const start = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = call.wave;
      oscillator.frequency.setValueAtTime(clampHz(call.tone), start);
      oscillator.frequency.exponentialRampToValueAtTime(clampHz(call.tone * call.bend[0]), start + call.length * 0.45);
      oscillator.frequency.exponentialRampToValueAtTime(clampHz(call.tone * call.bend[1]), start + call.length);

      // Ramps rather than steps: an instant cut leaves an audible click on every beat.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(call.volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + call.length);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + call.length + 0.05);
    }

    // Release the hardware once the last beat has finished.
    window.setTimeout(() => void context.close(), RELEASE_MS);
    return true;
  } catch {
    // No Web Audio, or playback refused — the modal is fully usable without sound.
    return false;
  }
}
