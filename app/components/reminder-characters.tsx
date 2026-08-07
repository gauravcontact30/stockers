"use client";

/**
 * Original cartoon characters drawn as inline SVG.
 *
 * These are deliberately generic archetypes — a masked hero, a dog, a cat, a robot — rather than
 * any recognisable comic or film character. Marvel, Mattel and Diamond Comics characters are
 * trademarked, and putting their likenesses in a paid product would infringe, so the brief's
 * playful spirit is met with artwork that is ours to ship.
 */

import type { CallSound } from "./reminder-sound";
import type { VoiceProfile } from "./reminder-voice";

export type CharacterKey = "hero" | "dog" | "cat" | "robot" | "narrator" | "kid";

export type Character = {
  key: CharacterKey;
  /** Name shown on the modal, so the reader knows who is talking. */
  name: string;
  /** What the character shouts in its speech bubble. */
  shout: string;
  /** Onomatopoeia shown alongside the sound button. */
  noise: string;
  /**
   * The synthesised call. Each is shaped so it is recognisable on its own: the dog's two short
   * falling sawtooth beats bark, the cat's long rise-and-fall sine mews, the robot's flat square
   * beats beep.
   */
  call: CallSound;
  accent: string;
  /**
   * How this character's line is spoken. Pitch and rate are what turn a plain system voice into
   * a character: low and slow reads as heroic, high and quick reads as a squeaky cartoon.
   */
  voice: VoiceProfile;
};

/**
 * The cast rotates so a returning reminder is a different character in a different voice.
 * Deliberately a mix of male-leaning, female-leaning and neutral profiles.
 */
export const CHARACTERS: Character[] = [
  {
    key: "hero",
    name: "The Masked Investor",
    shout: "With great charts comes great responsibility!",
    noise: "THWIP!",
    // A quick rising whip-crack, then a second one an instant later.
    call: { tone: 520, pattern: [0, 0.14], wave: "sawtooth", bend: [1.6, 2.4], length: 0.12, volume: 0.16 },
    accent: "from-rose-500 to-indigo-600",
    voice: { gender: "male", pitch: 0.6, rate: 0.88 },
  },
  {
    key: "dog",
    name: "Bruno the Watchdog",
    shout: "Woof! Your trial is running out!",
    noise: "WOOF! WOOF!",
    // Two short rough beats that drop hard in pitch — the shape of a bark.
    call: { tone: 260, pattern: [0, 0.26], wave: "sawtooth", bend: [0.5, 0.4], length: 0.18, volume: 0.2 },
    accent: "from-amber-500 to-orange-600",
    voice: { gender: "male", pitch: 0.4, rate: 1.15 },
  },
  {
    key: "cat",
    name: "Mitthu the Cat",
    shout: "Meow… renew before I knock this off the table.",
    noise: "MEEEOW!",
    // One long smooth beat that climbs and then falls away — a mew.
    call: { tone: 620, pattern: [0], wave: "sine", bend: [1.4, 0.72], length: 0.72, volume: 0.18 },
    accent: "from-violet-500 to-fuchsia-600",
    voice: { gender: "female", pitch: 1.7, rate: 0.85 },
  },
  {
    key: "robot",
    name: "Unit CANDLE-9",
    shout: "BEEP BOOP. SUBSCRIPTION STATUS: HUNGRY.",
    noise: "BEEP BOOP!",
    // Three flat square beats, the middle one a fifth lower — electronic, not animal.
    call: { tone: 440, pattern: [0, 0.16, 0.32], wave: "square", bend: [1, 0.66], length: 0.1, volume: 0.12 },
    accent: "from-cyan-500 to-teal-600",
    voice: { gender: "any", pitch: 0.3, rate: 0.8 },
  },
  {
    key: "narrator",
    name: "The Narrator",
    shout: "Meanwhile, in a portfolio not far from here…",
    noise: "DUN DUN DUUUN!",
    // Two short low notes and a third that sinks — the cliffhanger sting.
    call: { tone: 175, pattern: [0, 0.3, 0.6], wave: "triangle", bend: [0.95, 0.55], length: 0.34, volume: 0.22 },
    accent: "from-slate-600 to-slate-900",
    voice: { gender: "male", pitch: 0.5, rate: 0.78 },
  },
  {
    key: "kid",
    name: "Chikki the Chart Whiz",
    shout: "Hey! Hey! Are you gonna renew or what?!",
    noise: "WHEEE!",
    // A single bright slide upward, like a party whistle.
    call: { tone: 700, pattern: [0], wave: "triangle", bend: [1.7, 2.6], length: 0.5, volume: 0.14 },
    accent: "from-emerald-500 to-lime-600",
    voice: { gender: "female", pitch: 1.9, rate: 1.25 },
  },
];

export function characterFor(index: number): Character {
  return CHARACTERS[Math.abs(index) % CHARACTERS.length];
}

function Hero() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="22" ry="4" className="fill-slate-900/10" />
      <path d="M32 44 Q50 30 68 44 L64 76 Q50 84 36 76 Z" className="fill-rose-500" />
      <path d="M50 44 L50 80" className="stroke-rose-700" strokeWidth="1.5" />
      <circle cx="50" cy="34" r="18" className="fill-rose-600" />
      {/* Mask eyes */}
      <path d="M38 32 Q44 26 48 32 Q44 36 38 32 Z" className="fill-white" />
      <path d="M52 32 Q56 26 62 32 Q56 36 52 32 Z" className="fill-white" />
      <path d="M32 30 L68 30" className="stroke-rose-800" strokeWidth="1" opacity="0.5" />
      <path d="M32 38 L68 38" className="stroke-rose-800" strokeWidth="1" opacity="0.5" />
      <path d="M50 16 L50 52" className="stroke-rose-800" strokeWidth="1" opacity="0.5" />
      {/* Arms, one raised */}
      <path d="M32 48 L18 34" className="stroke-rose-600" strokeWidth="7" strokeLinecap="round" />
      <path d="M68 48 L80 60" className="stroke-rose-600" strokeWidth="7" strokeLinecap="round" />
    </g>
  );
}

function Dog() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="24" ry="4" className="fill-slate-900/10" />
      <ellipse cx="50" cy="66" rx="22" ry="18" className="fill-amber-400" />
      <circle cx="50" cy="38" r="20" className="fill-amber-500" />
      {/* Floppy ears */}
      <ellipse cx="30" cy="36" rx="7" ry="14" className="fill-amber-700" />
      <ellipse cx="70" cy="36" rx="7" ry="14" className="fill-amber-700" />
      <circle cx="43" cy="35" r="3" className="fill-slate-900" />
      <circle cx="57" cy="35" r="3" className="fill-slate-900" />
      <ellipse cx="50" cy="45" rx="5" ry="4" className="fill-slate-900" />
      {/* Open, barking mouth */}
      <path d="M42 52 Q50 62 58 52 Q50 56 42 52 Z" className="fill-rose-400" />
      <path d="M72 70 Q86 62 82 50" className="stroke-amber-500" strokeWidth="6" strokeLinecap="round" fill="none" />
    </g>
  );
}

function Cat() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="22" ry="4" className="fill-slate-900/10" />
      <ellipse cx="50" cy="68" rx="20" ry="17" className="fill-violet-400" />
      <circle cx="50" cy="40" r="19" className="fill-violet-500" />
      <path d="M33 26 L31 10 L45 20 Z" className="fill-violet-500" />
      <path d="M67 26 L69 10 L55 20 Z" className="fill-violet-500" />
      <ellipse cx="43" cy="38" rx="3" ry="4" className="fill-slate-900" />
      <ellipse cx="57" cy="38" rx="3" ry="4" className="fill-slate-900" />
      <path d="M47 47 L50 50 L53 47" className="stroke-slate-900" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M28 44 L40 46 M28 50 L40 49" className="stroke-slate-700" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M72 44 L60 46 M72 50 L60 49" className="stroke-slate-700" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M70 74 Q86 70 84 54" className="stroke-violet-500" strokeWidth="6" strokeLinecap="round" fill="none" />
    </g>
  );
}

function Robot() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="22" ry="4" className="fill-slate-900/10" />
      <rect x="32" y="52" width="36" height="32" rx="6" className="fill-cyan-500" />
      <rect x="34" y="24" width="32" height="26" rx="8" className="fill-cyan-400" />
      <circle cx="43" cy="36" r="4" className="fill-slate-900" />
      <circle cx="57" cy="36" r="4" className="fill-slate-900" />
      <rect x="42" y="44" width="16" height="3" rx="1.5" className="fill-slate-900" />
      {/* Antenna */}
      <path d="M50 24 L50 14" className="stroke-cyan-600" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="11" r="4" className="fill-amber-400" />
      <path d="M32 60 L20 68" className="stroke-cyan-500" strokeWidth="6" strokeLinecap="round" />
      <path d="M68 60 L80 52" className="stroke-cyan-500" strokeWidth="6" strokeLinecap="round" />
      <rect x="42" y="62" width="16" height="10" rx="2" className="fill-cyan-200" />
    </g>
  );
}

function Narrator() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="22" ry="4" className="fill-slate-900/10" />
      {/* Trench coat */}
      <path d="M30 48 Q50 38 70 48 L74 84 L26 84 Z" className="fill-slate-700" />
      <path d="M50 40 L50 84" className="stroke-slate-900" strokeWidth="1.5" />
      <circle cx="50" cy="34" r="17" className="fill-amber-200" />
      {/* Wide-brimmed hat, shading the eyes */}
      <ellipse cx="50" cy="24" rx="26" ry="5" className="fill-slate-900" />
      <path d="M36 24 Q36 8 50 8 Q64 8 64 24 Z" className="fill-slate-900" />
      <circle cx="44" cy="34" r="2.5" className="fill-slate-900" />
      <circle cx="56" cy="34" r="2.5" className="fill-slate-900" />
      <path d="M44 43 Q50 47 56 43" className="stroke-slate-900" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M30 52 L18 66" className="stroke-slate-700" strokeWidth="7" strokeLinecap="round" />
      <path d="M70 52 L82 66" className="stroke-slate-700" strokeWidth="7" strokeLinecap="round" />
    </g>
  );
}

function Kid() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="20" ry="4" className="fill-slate-900/10" />
      <path d="M36 54 Q50 46 64 54 L66 84 L34 84 Z" className="fill-emerald-500" />
      <circle cx="50" cy="36" r="18" className="fill-amber-200" />
      {/* Spiky hair */}
      <path d="M34 26 L38 12 L44 24 L50 10 L56 24 L62 12 L66 26 Z" className="fill-slate-800" />
      <circle cx="43" cy="36" r="3.5" className="fill-slate-900" />
      <circle cx="57" cy="36" r="3.5" className="fill-slate-900" />
      <circle cx="44.5" cy="34.5" r="1.2" className="fill-white" />
      <circle cx="58.5" cy="34.5" r="1.2" className="fill-white" />
      {/* Big open grin */}
      <path d="M42 44 Q50 54 58 44 Z" className="fill-rose-500" />
      <circle cx="34" cy="44" r="3.5" className="fill-rose-300" opacity="0.7" />
      <circle cx="66" cy="44" r="3.5" className="fill-rose-300" opacity="0.7" />
      {/* Both arms up, mid-cheer */}
      <path d="M36 58 L22 44" className="stroke-emerald-500" strokeWidth="6" strokeLinecap="round" />
      <path d="M64 58 L78 44" className="stroke-emerald-500" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

const ART: Record<CharacterKey, () => React.JSX.Element> = {
  hero: Hero,
  dog: Dog,
  cat: Cat,
  robot: Robot,
  narrator: Narrator,
  kid: Kid,
};

export function CharacterArt({ character }: { character: Character }) {
  const Art = ART[character.key];

  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`${character.name}, ${character.key} character`} className="h-32 w-32 drop-shadow-lg">
      <Art />
    </svg>
  );
}

/**
 * The full line read aloud, built from exactly what the modal displays — the character's shout,
 * the headline and the body — so the audio and the text can never drift apart.
 */
export function speechScript(character: Character, headline: string, body: string): string {
  // Each part is trimmed before joining, otherwise a stray trailing space leaves the full stop
  // detached ("Headline .") and the voice pauses in the wrong place.
  const parts = [character.shout, `${headline.trim()}.`, body];
  return parts.map((part) => part.replace(/\s+/g, " ").trim()).join(" ");
}
