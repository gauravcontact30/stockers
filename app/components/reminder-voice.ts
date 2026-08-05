/**
 * Speaks the reminder aloud using the browser's built-in speech synthesis.
 *
 * Why this and not recorded voiceover: hiring or licensing voice artists means shipping audio
 * files per line, and every line here is dynamic (days remaining, trial vs expired). The Web
 * Speech API reads whatever the modal actually says, in whatever voices the user's OS provides,
 * with no assets and no network call.
 *
 * A "character voice" here is a real system voice plus a pitch/rate profile — a low, slow male
 * voice reads as heroic; a high, quick one reads as a squeaky cartoon. That is as close to a
 * cartoon performance as a browser can get, and it is genuinely different each time because the
 * voice is rotated through everything the machine has installed.
 */

export type VoiceProfile = {
  /** Preferred voice gender. Falls back to any available voice when the machine has none. */
  gender: "male" | "female" | "any";
  /** 0 to 2, where 1 is the voice's natural pitch. */
  pitch: number;
  /** 0.1 to 10, where 1 is natural speed. */
  rate: number;
};

// System voice names are the only signal available — the API exposes no gender field. These are
// the common English voices across Windows (David/Zira/Ravi/Heera), macOS (Alex/Samantha/Daniel)
// and Chrome's own bundled set.
const FEMALE_HINTS = [
  "female", "woman", "zira", "hazel", "susan", "samantha", "karen", "moira", "tessa", "fiona",
  "victoria", "catherine", "linda", "heera", "eva", "aria", "jenny", "michelle", "sonia",
  "natasha", "neerja", "kalpana", "swara",
];

const MALE_HINTS = [
  "male", "man", "david", "mark", "george", "james", "alex", "daniel", "fred", "ravi", "guy",
  "ryan", "thomas", "brian", "william", "prabhat", "hemant", "oliver", "arthur",
];

export function classifyVoice(name: string): "male" | "female" | "unknown" {
  const lower = name.toLowerCase();
  // Female is tested first: "female" contains "male" as a substring, so the reverse order would
  // misclassify every voice explicitly labelled female.
  if (FEMALE_HINTS.some((hint) => lower.includes(hint))) return "female";
  if (MALE_HINTS.some((hint) => lower.includes(hint))) return "male";
  return "unknown";
}

type Synth = {
  getVoices: () => SpeechSynthesisVoice[];
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function synth(): Synth | null {
  // A plain property read, so no guard is needed here — the calls that can actually fail
  // (getVoices, speak) are wrapped individually below.
  return (window as unknown as { speechSynthesis?: Synth }).speechSynthesis ?? null;
}

/** English voices only — the reminder text is English, and a Hindi voice reading it is unintelligible. */
export function englishVoices(): SpeechSynthesisVoice[] {
  const speech = synth();
  if (!speech) return [];

  try {
    return speech.getVoices().filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  } catch {
    return [];
  }
}

/**
 * Chooses a voice for this profile, rotated by `turn` so consecutive reminders never sound the
 * same. Falls back to the full list when the machine has no voice of the requested gender —
 * many Linux installs ship exactly one.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  profile: VoiceProfile,
  turn: number,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const matching =
    profile.gender === "any" ? voices : voices.filter((voice) => classifyVoice(voice.name) === profile.gender);

  const pool = matching.length > 0 ? matching : voices;
  return pool[Math.abs(turn) % pool.length];
}

export function stopSpeaking(): void {
  synth()?.cancel();
}

/**
 * Reads `text` aloud. Returns false when speech is unavailable or refused, so the caller can stay
 * silent rather than pretending it worked.
 *
 * Browsers block speech until the user has interacted with the page, so an automatic attempt on
 * an untouched page is expected to fail; the modal's button covers that case.
 */
export function speak(text: string, profile: VoiceProfile, turn: number): boolean {
  const speech = synth();
  const Utterance = (window as unknown as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
    .SpeechSynthesisUtterance;
  if (!speech || !Utterance || !text.trim()) return false;

  try {
    // Anything still being read from a previous appearance is cut off, so two voices never
    // overlap when the reminder returns.
    speech.cancel();

    const utterance = new Utterance(text);
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;

    const voice = pickVoice(englishVoices(), profile, turn);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    speech.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/**
 * Voices load asynchronously in Chrome: the first getVoices() call returns an empty list and the
 * real one arrives with a "voiceschanged" event. Returns an unsubscribe function.
 */
export function onVoicesReady(callback: () => void): () => void {
  const speech = synth();
  if (!speech?.addEventListener) return () => {};

  speech.addEventListener("voiceschanged", callback);
  return () => speech.removeEventListener?.("voiceschanged", callback);
}
