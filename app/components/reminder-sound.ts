/**
 * Synthesises each character's call with the Web Audio API rather than shipping audio files —
 * no binary assets, no network fetch, and it works offline.
 *
 * Browsers block audio until the user has interacted with the page, so an automatic attempt is
 * expected to fail and does so silently; the modal also offers a button that plays it on demand,
 * which always counts as a gesture.
 */
export function playCall(tone: number, pattern: number[] = [0, 0.22]): boolean {
  try {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return false;

    const context = new AudioCtor();
    // A suspended context means the browser has not granted playback yet.
    if (context.state === "suspended") void context.resume();

    for (const offset of pattern) {
      const start = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sawtooth";
      // A quick downward sweep is what makes a tone read as a bark or a call rather than a beep.
      oscillator.frequency.setValueAtTime(tone, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, tone * 0.45), start + 0.16);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    }

    // Release the hardware once the last call has finished.
    window.setTimeout(() => void context.close(), 1200);
    return true;
  } catch {
    // No Web Audio, or playback refused — the modal is fully usable without sound.
    return false;
  }
}
