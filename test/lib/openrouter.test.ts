/** @jest-environment node */

import { aiConfigured, aiModel, chatJson, chatStream, extractJsonObject, usageFromStreamPayload } from "../../app/lib/openrouter";
import { heldInMemory, listAiCalls, resetAiTelemetry } from "../../app/lib/ai-telemetry";

const KEY = "OPENROUTER_API_KEY";
const MODEL = "OPENROUTER_MODEL";

/** Every call in this process's ring, oldest first. */
async function recorded() {
  return (await listAiCalls("1970-01-01")).calls;
}

function completion(content: string, usage?: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) }),
  } as unknown as Response;
}

let fetchMock: jest.Mock;
let warn: jest.SpyInstance;

beforeEach(() => {
  resetAiTelemetry();
  process.env[KEY] = "test-key";
  delete process.env[MODEL];
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  // The client logs the underlying cause of a failure; the suite drives failures deliberately.
  warn = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  delete process.env[KEY];
  delete process.env[MODEL];
});

describe("configuration", () => {
  it("reports the key as configured only when one is actually set", () => {
    expect(aiConfigured()).toBe(true);
    process.env[KEY] = "   ";
    expect(aiConfigured()).toBe(false);
    delete process.env[KEY];
    expect(aiConfigured()).toBe(false);
  });

  it("reads the model per call rather than freezing it at import", () => {
    expect(aiModel()).toBe("openai/gpt-4.1-mini");
    process.env[MODEL] = "anthropic/claude-sonnet-5";
    expect(aiModel()).toBe("anthropic/claude-sonnet-5");
  });
});

describe("extractJsonObject", () => {
  it("finds the object a model wrapped in prose", () => {
    expect(extractJsonObject('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
  });

  it("returns nothing for a reply carrying no object", () => {
    expect(extractJsonObject("no JSON here")).toBeNull();
  });

  it("returns nothing rather than throwing on an object that will not parse", () => {
    expect(extractJsonObject("{not valid json}")).toBeNull();
  });
});

describe("chatJson", () => {
  const options = { feature: "board-read", system: "sys", user: "usr", parse: (text: string) => extractJsonObject(text) };

  it("returns what the parser made of the reply and records the call as good", async () => {
    fetchMock.mockResolvedValue(completion('{"headline":"ok"}', { prompt_tokens: 120, completion_tokens: 30, cost: 0.00042 }));

    await expect(chatJson(options)).resolves.toEqual({ headline: "ok" });

    const [entry] = await recorded();
    expect(entry).toMatchObject({
      feature: "board-read",
      model: "openai/gpt-4.1-mini",
      outcome: "ok",
      status: 200,
      promptTokens: 120,
      completionTokens: 30,
      costUsd: 0.00042,
      streamed: false,
    });
    expect(entry.ms).toBeGreaterThanOrEqual(0);
  });

  it("asks OpenRouter to report what the call cost", async () => {
    fetchMock.mockResolvedValue(completion("{}"));
    await chatJson(options);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.usage).toEqual({ include: true });
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it("records a reply it could not use as a fallback, not as a success", async () => {
    fetchMock.mockResolvedValue(completion("I'm afraid I can't help with that.", { prompt_tokens: 90, cost: 0.0001 }));

    await expect(chatJson(options)).resolves.toBeNull();

    const [entry] = await recorded();
    // The call still arrived and was still billed, so its duration and cost are kept. It is the
    // gap between `ok` and `unusable` that is the finding.
    expect(entry).toMatchObject({ outcome: "unusable", status: 200, promptTokens: 90, costUsd: 0.0001 });
  });

  it("records an empty completion as unusable without calling the parser", async () => {
    const parse = jest.fn();
    fetchMock.mockResolvedValue(completion(""));

    await expect(chatJson({ ...options, parse })).resolves.toBeNull();

    expect(parse).not.toHaveBeenCalled();
    expect((await recorded())[0].outcome).toBe("unusable");
  });

  it("records a refused request with its status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as unknown as Response);

    await expect(chatJson(options)).resolves.toBeNull();

    expect((await recorded())[0]).toMatchObject({
      outcome: "failed",
      status: 429,
      error: "OpenRouter responded with 429",
    });
  });

  it("records a network failure, which has no status at all", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    await expect(chatJson(options)).resolves.toBeNull();

    expect((await recorded())[0]).toMatchObject({ outcome: "failed", status: null, error: "socket hang up" });
  });

  it("attempts nothing and spends nothing when there is no key", async () => {
    delete process.env[KEY];

    await expect(chatJson(options)).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await recorded())[0]).toMatchObject({ outcome: "unconfigured", model: null, ms: null });
  });

  it("records the model it was asked for rather than the default", async () => {
    fetchMock.mockResolvedValue(completion("{}"));
    await chatJson({ ...options, model: "meta-llama/llama-4" });

    expect((await recorded())[0].model).toBe("meta-llama/llama-4");
  });

  it("keeps a missing usage block as unknown rather than as zero", async () => {
    fetchMock.mockResolvedValue(completion("{}"));
    await chatJson(options);

    // A zero here would be indistinguishable from a call that genuinely consumed nothing.
    expect((await recorded())[0]).toMatchObject({ promptTokens: null, completionTokens: null, costUsd: null });
  });
});

describe("usageFromStreamPayload", () => {
  it("finds the usage block a stream reports in its final chunk", () => {
    expect(usageFromStreamPayload('{"usage":{"cost":0.5}}')).toEqual({ cost: 0.5 });
  });

  it("has nothing to report for a content chunk", () => {
    expect(usageFromStreamPayload('{"choices":[{"delta":{"content":"hi"}}]}')).toBeNull();
  });

  it("has nothing to report for a payload split across chunks", () => {
    expect(usageFromStreamPayload('{"usa')).toBeNull();
  });
});

describe("chatStream", () => {
  const options = { feature: "board-read", system: "sys", user: "usr" };

  function stream() {
    return { ok: true, status: 200, body: new ReadableStream() } as unknown as Response;
  }

  it("asks for usage to be reported on the stream", async () => {
    fetchMock.mockResolvedValue(stream());
    await chatStream(options);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("records nothing until the caller settles, because the outcome is not known yet", async () => {
    fetchMock.mockResolvedValue(stream());

    const handle = await chatStream(options);
    expect(heldInMemory()).toBe(0);

    handle?.settle("ok", { prompt_tokens: 10, completion_tokens: 5, cost: 0.002 });

    expect((await recorded())[0]).toMatchObject({
      outcome: "ok",
      streamed: true,
      promptTokens: 10,
      completionTokens: 5,
      costUsd: 0.002,
    });
  });

  it("settles once however many times the caller asks", async () => {
    fetchMock.mockResolvedValue(stream());

    const handle = await chatStream(options);
    handle?.settle("ok");
    handle?.settle("failed");

    const calls = await recorded();
    expect(calls).toHaveLength(1);
    expect(calls[0].outcome).toBe("ok");
  });

  it("records a stream that never opened, without a handle to settle", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, body: null } as unknown as Response);

    await expect(chatStream(options)).resolves.toBeNull();
    expect((await recorded())[0]).toMatchObject({ outcome: "failed", status: 503, streamed: true });
  });

  it("records a stream that opened with no body as a failure", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: null } as unknown as Response);

    await expect(chatStream(options)).resolves.toBeNull();
    expect((await recorded())[0].outcome).toBe("failed");
  });

  it("attempts nothing when there is no key", async () => {
    delete process.env[KEY];

    await expect(chatStream(options)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await recorded())[0]).toMatchObject({ outcome: "unconfigured", streamed: true });
  });
});
