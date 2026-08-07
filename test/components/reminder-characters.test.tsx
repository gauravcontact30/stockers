import { render, screen } from "@testing-library/react";
import { CHARACTERS, CharacterArt, characterFor, speechScript } from "../../app/components/reminder-characters";

describe("characterFor", () => {
  it("cycles through the cast so a returning reminder is not the same one twice", () => {
    expect(characterFor(0)).toBe(CHARACTERS[0]);
    expect(characterFor(1)).toBe(CHARACTERS[1]);
    expect(characterFor(CHARACTERS.length)).toBe(CHARACTERS[0]);
  });

  it("handles a negative round without falling off the list", () => {
    expect(characterFor(-1)).toBe(CHARACTERS[1]);
  });
});

describe("CharacterArt", () => {
  it.each(CHARACTERS.map((character) => [character.key, character] as const))(
    "renders the %s as labelled inline art",
    (key, character) => {
      render(<CharacterArt character={character} />);
      expect(screen.getByRole("img", { name: `${character.name}, ${key} character` })).toBeInTheDocument();
    },
  );

  // The artwork is original rather than any trademarked comic or film character, so nothing here
  // should carry a real character's name.
  it("names no third-party character", () => {
    const text = JSON.stringify(CHARACTERS).toLowerCase();
    for (const name of ["spider", "he-man", "heman", "sabu", "pinky", "billu", "marvel"]) {
      expect(text).not.toContain(name);
    }
  });

  it("gives every character a name, a shout and a noise", () => {
    for (const character of CHARACTERS) {
      expect(character.name.length).toBeGreaterThan(0);
      expect(character.shout.length).toBeGreaterThan(0);
      expect(character.noise.length).toBeGreaterThan(0);
    }
  });

  /**
   * A bark and a mew have to be distinguishable by ear. They are not if every call is the same
   * waveform with the same bend, which is what shipping a bare frequency per character gave.
   */
  it("gives every character a call nothing else in the cast sounds like", () => {
    const shapes = CHARACTERS.map((c) => `${c.call.wave}-${c.call.bend.join(":")}-${c.call.pattern.length}`);
    expect(new Set(shapes).size).toBe(CHARACTERS.length);
  });

  it("keeps every call inside audible, non-startling bounds", () => {
    for (const character of CHARACTERS) {
      expect(character.call.tone).toBeGreaterThan(0);
      expect(character.call.pattern.length).toBeGreaterThan(0);
      expect(character.call.length).toBeGreaterThan(0);
      expect(character.call.volume).toBeGreaterThan(0);
      // This fires without being asked for, so it is never allowed to be loud.
      expect(character.call.volume).toBeLessThanOrEqual(0.25);
    }
  });

  // The dog falls in pitch, the cat rises then falls: the shapes are the point.
  it("shapes the dog's call as a fall and the cat's as a rise and fall", () => {
    const dog = CHARACTERS.find((c) => c.key === "dog")!;
    const cat = CHARACTERS.find((c) => c.key === "cat")!;

    expect(dog.call.bend[0]).toBeLessThan(1);
    expect(dog.call.pattern.length).toBe(2);
    expect(cat.call.bend[0]).toBeGreaterThan(1);
    expect(cat.call.bend[1]).toBeLessThan(1);
  });

  // Pitch and rate are what make a plain system voice read as a character, so every entry needs
  // values the Web Speech API will actually accept.
  it("gives every character a distinct, valid voice profile", () => {
    for (const character of CHARACTERS) {
      expect(character.voice.pitch).toBeGreaterThan(0);
      expect(character.voice.pitch).toBeLessThanOrEqual(2);
      expect(character.voice.rate).toBeGreaterThan(0.1);
      expect(character.voice.rate).toBeLessThanOrEqual(10);
    }

    const profiles = new Set(CHARACTERS.map((c) => `${c.voice.gender}-${c.voice.pitch}-${c.voice.rate}`));
    expect(profiles.size).toBe(CHARACTERS.length);
  });

  it("covers male, female and neutral voices so the cast does not all sound alike", () => {
    const genders = new Set(CHARACTERS.map((c) => c.voice.gender));
    expect(genders).toContain("male");
    expect(genders).toContain("female");
    expect(genders).toContain("any");
  });
});

describe("speechScript", () => {
  // The spoken line is built from what is rendered, so the voiceover can never say something the
  // modal does not show.
  it("reads the shout, the headline and the body as one line", () => {
    expect(speechScript(CHARACTERS[0], "Your free trial is nearly up", "You have 1 open market day left.")).toBe(
      "With great charts comes great responsibility! Your free trial is nearly up. You have 1 open market day left.",
    );
  });

  it("collapses stray whitespace so the voice does not pause oddly", () => {
    expect(speechScript(CHARACTERS[1], "  Headline  ", "Body\n  text.")).toBe(
      "Woof! Your trial is running out! Headline. Body text.",
    );
  });
});
