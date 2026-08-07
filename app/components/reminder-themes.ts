/**
 * The look the reminder wears on a given appearance.
 *
 * The brief asked for a modal that opens differently every time. Rotating the cast alone was not
 * enough — the panel itself was always the same white comic frame — so the chrome, the decorative
 * pattern, the entrance and the idle motion now rotate on their own cycle.
 *
 * There are five themes and six characters, and 5 and 6 share no factor, so the pairing walks
 * through all thirty combinations before any one of them comes round again.
 */

import type { CSSProperties } from "react";

export type PatternKey = "halftone" | "speed-lines" | "starburst" | "confetti" | "graph-paper";

export type ReminderTheme = {
  key: string;
  /** Named so a test — and a bug report — can say which look was on screen. */
  name: string;
  /** The dialog backdrop, behind everything. */
  backdrop: string;
  /** Border, radius and shadow of the panel itself. */
  shell: string;
  /** Background of the lower half, where the copy sits. */
  body: string;
  /** Painted over the character's banner. */
  pattern: PatternKey;
  /** Extra wash laid over the character's own gradient, so the same character reads differently. */
  wash: string;
  /** How the panel arrives. */
  entrance: string;
  /** How the character moves once it has arrived. */
  motion: string;
  /** The onomatopoeia badge. */
  chip: string;
  /** Speech bubble. */
  bubble: string;
  /**
   * The bubble's tail. Kept separate from `bubble` rather than overriding its radius: two
   * conflicting Tailwind utilities on one element resolve by stylesheet order, not by the order
   * they appear in the class string, so which one won would be luck.
   */
  tail: string;
  /** The small round buttons in the banner. */
  control: string;
  /** The kicker above the headline. */
  eyebrow: string;
  /** The headline. */
  heading: string;
  /** Body copy. */
  text: string;
  /** Fine print. */
  muted: string;
  /** The renew / sign-up call to action. */
  primary: string;
  /** The "See plans" link. */
  secondary: string;
  /** The "Maybe later" button. */
  dismiss: string;
};

export const REMINDER_THEMES: ReminderTheme[] = [
  {
    key: "comic",
    name: "Comic panel",
    backdrop: "bg-slate-950/70",
    shell: "rounded-[28px] border-4 border-slate-900 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.6)] dark:border-slate-100",
    body: "bg-white dark:bg-slate-900",
    pattern: "halftone",
    wash: "",
    entrance: "animate-pop-in",
    motion: "animate-character-bounce",
    chip: "border-[3px] border-slate-900 bg-amber-300 text-slate-900",
    bubble: "rounded-2xl border-[3px] border-slate-900 bg-white",
    tail: "border-b-[3px] border-l-[3px] border-slate-900 bg-white",
    control: "border-2 border-slate-900 bg-white text-slate-900 hover:bg-amber-200",
    eyebrow: "text-emerald-600 dark:text-emerald-400",
    heading: "text-slate-900 dark:text-white",
    text: "text-slate-600 dark:text-slate-300",
    muted: "text-slate-500 dark:text-slate-400",
    primary:
      "border-2 border-slate-900 bg-emerald-500 text-slate-900 shadow-[3px_3px_0_0_rgb(15,23,42)] hover:bg-emerald-400 dark:border-slate-100 dark:shadow-[3px_3px_0_0_rgb(241,245,249)]",
    secondary: "border-2 border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800",
    dismiss: "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
  },
  {
    key: "neon",
    name: "Neon terminal",
    backdrop: "bg-slate-950/85",
    shell: "rounded-3xl border border-emerald-400/40 shadow-[0_0_60px_-10px_rgba(16,185,129,0.5)]",
    body: "bg-slate-950",
    pattern: "graph-paper",
    wash: "bg-slate-950/45",
    entrance: "animate-slide-up-in",
    motion: "animate-float-idle",
    chip: "border border-emerald-400/50 bg-emerald-500/15 text-emerald-300",
    bubble: "rounded-xl border border-emerald-400/40 bg-slate-900/90 text-emerald-50",
    tail: "border-b border-l border-emerald-400/40 bg-slate-900",
    control: "border border-emerald-400/40 bg-slate-900/80 text-emerald-200 hover:bg-emerald-500/20",
    eyebrow: "text-emerald-400",
    heading: "text-white",
    text: "text-slate-300",
    muted: "text-slate-500",
    primary: "border border-emerald-400 bg-emerald-500 text-slate-950 shadow-[0_0_24px_-4px_rgba(16,185,129,0.8)] hover:bg-emerald-400",
    secondary: "border border-slate-700 text-slate-200 hover:bg-slate-800",
    dismiss: "text-slate-500 hover:text-slate-200",
  },
  {
    key: "storybook",
    name: "Storybook page",
    backdrop: "bg-amber-950/60",
    shell: "rounded-[36px] border-[3px] border-dashed border-amber-700 shadow-[0_20px_50px_-16px_rgba(120,53,15,0.55)]",
    body: "bg-amber-50 dark:bg-amber-950/40",
    pattern: "confetti",
    wash: "bg-amber-100/25",
    entrance: "animate-flip-in",
    motion: "animate-wobble",
    chip: "border-2 border-amber-700 bg-amber-200 text-amber-900",
    bubble: "rounded-[20px] border-2 border-amber-700 bg-amber-50",
    tail: "border-b-2 border-l-2 border-amber-700 bg-amber-50",
    control: "border-2 border-amber-700 bg-amber-50 text-amber-900 hover:bg-amber-200",
    eyebrow: "text-amber-700 dark:text-amber-400",
    heading: "text-amber-950 dark:text-amber-50",
    text: "text-amber-900/80 dark:text-amber-100/80",
    muted: "text-amber-800/60 dark:text-amber-200/50",
    primary: "border-2 border-amber-800 bg-amber-400 text-amber-950 shadow-[3px_3px_0_0_rgb(146,64,14)] hover:bg-amber-300",
    secondary: "border-2 border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40",
    dismiss: "text-amber-800/70 hover:text-amber-950 dark:text-amber-200/70 dark:hover:text-amber-50",
  },
  {
    key: "spotlight",
    name: "Stage spotlight",
    backdrop: "bg-black/80",
    shell: "rounded-[40px] border-2 border-white/25 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]",
    body: "bg-slate-900",
    pattern: "starburst",
    wash: "bg-black/30",
    entrance: "animate-zoom-in-soft",
    motion: "animate-jiggle",
    chip: "border-2 border-amber-300 bg-amber-400 text-slate-900",
    bubble: "rounded-2xl border-2 border-white/40 bg-white/95 text-slate-900",
    tail: "border-b-2 border-l-2 border-white/40 bg-white",
    control: "border-2 border-white/40 bg-white/90 text-slate-900 hover:bg-amber-200",
    eyebrow: "text-amber-300",
    heading: "text-white",
    text: "text-slate-300",
    muted: "text-slate-500",
    primary: "border-2 border-amber-300 bg-amber-400 text-slate-950 hover:bg-amber-300",
    secondary: "border-2 border-white/30 text-slate-100 hover:bg-white/10",
    dismiss: "text-slate-400 hover:text-white",
  },
  {
    key: "rally",
    name: "Rally board",
    backdrop: "bg-indigo-950/75",
    shell: "rounded-2xl border-2 border-indigo-400/50 shadow-[0_24px_60px_-18px_rgba(49,46,129,0.7)]",
    body: "bg-indigo-50 dark:bg-slate-900",
    pattern: "speed-lines",
    wash: "bg-indigo-900/25",
    entrance: "animate-swing-in",
    motion: "animate-character-bounce",
    chip: "border-2 border-indigo-900 bg-fuchsia-300 text-indigo-950",
    bubble: "rounded-lg border-2 border-indigo-900 bg-white",
    tail: "border-b-2 border-l-2 border-indigo-900 bg-white",
    control: "border-2 border-indigo-900 bg-white text-indigo-950 hover:bg-fuchsia-200",
    eyebrow: "text-fuchsia-600 dark:text-fuchsia-400",
    heading: "text-indigo-950 dark:text-white",
    text: "text-indigo-900/80 dark:text-slate-300",
    muted: "text-indigo-900/55 dark:text-slate-500",
    primary: "border-2 border-indigo-900 bg-fuchsia-400 text-indigo-950 shadow-[3px_3px_0_0_rgb(49,46,129)] hover:bg-fuchsia-300",
    secondary: "border-2 border-indigo-200 text-indigo-900 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-100 dark:hover:bg-indigo-900/40",
    dismiss: "text-indigo-900/60 hover:text-indigo-950 dark:text-slate-400 dark:hover:text-white",
  },
];

export function themeFor(round: number): ReminderTheme {
  return REMINDER_THEMES[Math.abs(round) % REMINDER_THEMES.length];
}

/**
 * The decorative layer over the banner. Each is a pure CSS gradient rather than an image, so it
 * costs nothing to ship and scales to any panel size.
 */
const PATTERNS: Record<PatternKey, CSSProperties> = {
  halftone: {
    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.9) 1.5px, transparent 1.6px)",
    backgroundSize: "12px 12px",
  },
  "graph-paper": {
    backgroundImage:
      "linear-gradient(to right, rgba(16,185,129,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,185,129,0.35) 1px, transparent 1px)",
    backgroundSize: "22px 22px",
  },
  confetti: {
    backgroundImage:
      "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.85) 3px, transparent 3.5px), radial-gradient(circle at 70% 60%, rgba(253,224,71,0.9) 2.5px, transparent 3px), radial-gradient(circle at 45% 85%, rgba(255,255,255,0.7) 2px, transparent 2.5px)",
    backgroundSize: "70px 70px, 90px 90px, 55px 55px",
  },
  // Alternating wedges radiating from behind the character's head.
  starburst: {
    backgroundImage:
      "repeating-conic-gradient(from 0deg at 22% 62%, rgba(255,255,255,0.22) 0deg 9deg, transparent 9deg 18deg)",
  },
  "speed-lines": {
    backgroundImage:
      "repeating-linear-gradient(105deg, rgba(255,255,255,0.28) 0px, rgba(255,255,255,0.28) 3px, transparent 3px, transparent 16px)",
  },
};

export function patternStyle(pattern: PatternKey): CSSProperties {
  return PATTERNS[pattern];
}
