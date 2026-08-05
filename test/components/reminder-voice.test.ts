import {
  classifyVoice,
  englishVoices,
  onVoicesReady,
  pickVoice,
  speak,
  stopSpeaking,
  type VoiceProfile,
} from "../../app/components/reminder-voice";

type StubVoice = { name: string; lang: string };

function voice(name: string, lang = "en-US"): StubVoice {
  return { name, lang };
}

function stubSpeech(voices: StubVoice[] = [], overrides: Record<string, unknown> = {}) {
  const speech = {
    getVoices: jest.fn(() => voices),
    speak: jest.fn(),
    cancel: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    ...overrides,
  };

  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = speech;
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
    text: string;
    pitch = 1;
    rate = 1;
    lang = "";
    voice: unknown = null;
    constructor(text: string) {
      this.text = text;
    }
  };

  return speech;
}

const heroic: VoiceProfile = { gender: "male", pitch: 0.6, rate: 0.88 };

afterEach(() => {
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
});

describe("classifyVoice", () => {
  it("recognises common male and female system voices", () => {
    expect(classifyVoice("Microsoft David - English (United States)")).toBe("male");
    expect(classifyVoice("Microsoft Zira - English (United States)")).toBe("female");
    expect(classifyVoice("Google UK English Male")).toBe("male");
    expect(classifyVoice("Samantha")).toBe("female");
    expect(classifyVoice("Microsoft Ravi - English (India)")).toBe("male");
    expect(classifyVoice("Microsoft Heera - English (India)")).toBe("female");
  });

  // "female" contains "male", so testing male first would misclassify every explicitly female
  // voice — this pins the ordering.
  it("reads an explicitly female label as female, not male", () => {
    expect(classifyVoice("Google UK English Female")).toBe("female");
  });

  it("returns unknown for a voice it cannot place", () => {
    expect(classifyVoice("Voice 42")).toBe("unknown");
  });
});

describe("englishVoices", () => {
  it("keeps only English voices, since the reminder text is English", () => {
    stubSpeech([voice("Zira"), voice("Heera", "en-IN"), voice("Kalpana", "hi-IN")]);
    expect(englishVoices().map((v) => v.name)).toEqual(["Zira", "Heera"]);
  });

  it("returns nothing when the browser has no speech support", () => {
    expect(englishVoices()).toEqual([]);
  });

  it("returns nothing when the voice list cannot be read", () => {
    stubSpeech([], {
      getVoices: () => {
        throw new Error("blocked");
      },
    });
    expect(englishVoices()).toEqual([]);
  });

  it("tolerates a voice with no language tag", () => {
    stubSpeech([{ name: "Mystery" } as StubVoice]);
    expect(englishVoices()).toEqual([]);
  });
});

describe("pickVoice", () => {
  const voices = [voice("David"), voice("Zira"), voice("Mark")] as unknown as SpeechSynthesisVoice[];

  it("prefers a voice matching the requested gender", () => {
    expect(pickVoice(voices, heroic, 0)?.name).toBe("David");
    expect(pickVoice(voices, { ...heroic, gender: "female" }, 0)?.name).toBe("Zira");
  });

  // The whole point is that consecutive reminders don't sound identical.
  it("rotates through the matching voices", () => {
    expect(pickVoice(voices, heroic, 0)?.name).toBe("David");
    expect(pickVoice(voices, heroic, 1)?.name).toBe("Mark");
    expect(pickVoice(voices, heroic, 2)?.name).toBe("David");
  });

  it("takes any voice when the profile asks for any", () => {
    expect(pickVoice(voices, { ...heroic, gender: "any" }, 1)?.name).toBe("Zira");
  });

  // Many Linux installs ship a single voice; asking for a female one must not silence the modal.
  it("falls back to any voice when none match the requested gender", () => {
    const only = [voice("Voice 42")] as unknown as SpeechSynthesisVoice[];
    expect(pickVoice(only, heroic, 0)?.name).toBe("Voice 42");
  });

  it("returns null when there are no voices at all", () => {
    expect(pickVoice([], heroic, 0)).toBeNull();
  });

  it("handles a negative rotation", () => {
    expect(pickVoice(voices, heroic, -1)?.name).toBe("Mark");
  });
});

describe("speak", () => {
  it("reads the text with the character's pitch, rate and voice", () => {
    const speech = stubSpeech([voice("David"), voice("Zira")]);
    expect(speak("Renew your plan", heroic, 0)).toBe(true);

    expect(speech.speak).toHaveBeenCalledTimes(1);
    const utterance = speech.speak.mock.calls[0][0];
    expect(utterance.text).toBe("Renew your plan");
    expect(utterance.pitch).toBe(0.6);
    expect(utterance.rate).toBe(0.88);
    expect(utterance.voice.name).toBe("David");
    expect(utterance.lang).toBe("en-US");
  });

  // Two voices talking over each other would be worse than silence.
  it("cancels anything still being read first", () => {
    const speech = stubSpeech([voice("David")]);
    speak("Hello", heroic, 0);
    expect(speech.cancel).toHaveBeenCalled();
  });

  it("still speaks when the machine has no voices installed", () => {
    const speech = stubSpeech([]);
    expect(speak("Hello", heroic, 0)).toBe(true);
    expect(speech.speak.mock.calls[0][0].voice).toBeNull();
  });

  it("declines empty text", () => {
    const speech = stubSpeech([voice("David")]);
    expect(speak("   ", heroic, 0)).toBe(false);
    expect(speech.speak).not.toHaveBeenCalled();
  });

  // Speech is decorative: a browser without it must not break the reminder.
  it("reports failure when speech synthesis is unavailable", () => {
    expect(speak("Hello", heroic, 0)).toBe(false);
  });

  it("reports failure when the utterance constructor is missing", () => {
    stubSpeech([voice("David")]);
    delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
    expect(speak("Hello", heroic, 0)).toBe(false);
  });

  it("reports failure when the browser refuses to speak", () => {
    stubSpeech([voice("David")], {
      speak: () => {
        throw new Error("blocked");
      },
    });
    expect(speak("Hello", heroic, 0)).toBe(false);
  });
});

describe("stopSpeaking", () => {
  it("cancels in-flight speech", () => {
    const speech = stubSpeech();
    stopSpeaking();
    expect(speech.cancel).toHaveBeenCalled();
  });

  it("is a no-op without speech support", () => {
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("onVoicesReady", () => {
  // Chrome returns an empty voice list on first call and fires this event when the real one loads.
  it("subscribes to the voices-loaded event and unsubscribes on teardown", () => {
    const speech = stubSpeech();
    const callback = jest.fn();

    const off = onVoicesReady(callback);
    expect(speech.addEventListener).toHaveBeenCalledWith("voiceschanged", callback);

    off();
    expect(speech.removeEventListener).toHaveBeenCalledWith("voiceschanged", callback);
  });

  it("returns a safe no-op when the browser has no speech support", () => {
    expect(() => onVoicesReady(jest.fn())()).not.toThrow();
  });

  it("returns a safe no-op when the API has no event support", () => {
    stubSpeech([], { addEventListener: undefined });
    expect(() => onVoicesReady(jest.fn())()).not.toThrow();
  });

  it("tolerates an API that can subscribe but not unsubscribe", () => {
    stubSpeech([], { removeEventListener: undefined });
    expect(() => onVoicesReady(jest.fn())()).not.toThrow();
  });
});
