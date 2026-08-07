import { CHARACTERS } from "../../app/components/reminder-characters";
import { REMINDER_THEMES, patternStyle, themeFor, type PatternKey } from "../../app/components/reminder-themes";

describe("themeFor", () => {
  it("walks the themes in order and wraps around", () => {
    expect(themeFor(0)).toBe(REMINDER_THEMES[0]);
    expect(themeFor(1)).toBe(REMINDER_THEMES[1]);
    expect(themeFor(REMINDER_THEMES.length)).toBe(REMINDER_THEMES[0]);
  });

  // The round counter only ever climbs, but a negative must not index off the end of the array.
  it("handles a negative round", () => {
    expect(themeFor(-1)).toBe(REMINDER_THEMES[1]);
  });

  /**
   * The whole point of the theme rotation: the reminder should not look the same twice in a row,
   * and with five themes against six characters it takes thirty appearances to repeat a pairing.
   */
  it("pairs a different theme with a different character on every appearance for thirty rounds", () => {
    const seen = new Set<string>();
    for (let round = 0; round < 30; round++) {
      seen.add(`${themeFor(round).key}/${CHARACTERS[round % CHARACTERS.length].key}`);
    }
    expect(seen.size).toBe(30);
    // Round 30 is where it comes back around.
    expect(themeFor(30).key).toBe(themeFor(0).key);
  });
});

describe("REMINDER_THEMES", () => {
  it("gives every theme its own key, entrance and idle motion", () => {
    expect(new Set(REMINDER_THEMES.map((theme) => theme.key)).size).toBe(REMINDER_THEMES.length);
    expect(new Set(REMINDER_THEMES.map((theme) => theme.entrance)).size).toBe(REMINDER_THEMES.length);
    expect(new Set(REMINDER_THEMES.map((theme) => theme.pattern)).size).toBe(REMINDER_THEMES.length);
  });

  // A theme with a dark body and a light-mode-only text colour would render black on black.
  it("names its own text colours rather than inheriting the panel's", () => {
    for (const theme of REMINDER_THEMES) {
      expect(theme.heading).toMatch(/text-/);
      expect(theme.text).toMatch(/text-/);
      expect(theme.muted).toMatch(/text-/);
    }
  });
});

describe("patternStyle", () => {
  it.each<PatternKey>(["halftone", "graph-paper", "confetti", "starburst", "speed-lines"])(
    "returns a pure-CSS backdrop for %s",
    (pattern) => {
      expect(patternStyle(pattern).backgroundImage).toEqual(expect.any(String));
    },
  );

  it("draws each pattern differently", () => {
    const drawn = REMINDER_THEMES.map((theme) => patternStyle(theme.pattern).backgroundImage);
    expect(new Set(drawn).size).toBe(REMINDER_THEMES.length);
  });
});
