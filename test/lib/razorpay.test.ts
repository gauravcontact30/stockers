/** @jest-environment node */

import { createHmac } from "node:crypto";
import {
  amountInPaise,
  createOrder,
  paymentCovers,
  razorpayConfigured,
  razorpayKeys,
  verifyPaymentSignature,
  verifyWebhookSignature,
  type RazorpayPayment,
} from "../../app/lib/razorpay";

const ENV_KEYS = [
  "STOCKERS_RAZORPAY_KEY_ID",
  "STOCKERS_RAZORPAY_KEY_SECRET",
  "STOCKERS_RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function clearRazorpayEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  jest.restoreAllMocks();
  clearRazorpayEnv();
});

afterAll(() => {
  clearRazorpayEnv();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value !== undefined) process.env[key] = value;
  }
});

describe("razorpay config", () => {
  it("reads and trims the configured Razorpay key pair", () => {
    process.env.RAZORPAY_KEY_ID = " rzp_test_public ";
    process.env.RAZORPAY_KEY_SECRET = " secret ";

    expect(razorpayKeys()).toEqual({ keyId: "rzp_test_public", keySecret: "secret" });
    expect(razorpayConfigured()).toBe(true);
  });

  it("prefers Stockers-specific credentials when both names are present", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_old";
    process.env.RAZORPAY_KEY_SECRET = "old_secret";
    process.env.STOCKERS_RAZORPAY_KEY_ID = "rzp_live_new";
    process.env.STOCKERS_RAZORPAY_KEY_SECRET = "new_secret";

    expect(razorpayKeys()).toEqual({ keyId: "rzp_live_new", keySecret: "new_secret" });
  });

  it("is not configured until both key id and secret are present", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_public";

    expect(razorpayKeys()).toBeNull();
    expect(razorpayConfigured()).toBe(false);
  });
});

describe("razorpay verification", () => {
  it("verifies checkout signatures against the configured key secret", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_public";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    const signature = createHmac("sha256", "secret").update("order_123|pay_456").digest("hex");

    expect(verifyPaymentSignature({ orderId: "order_123", paymentId: "pay_456", signature })).toBe(true);
    expect(verifyPaymentSignature({ orderId: "order_123", paymentId: "pay_456", signature: "bad" })).toBe(false);
  });

  it("verifies webhook signatures with the webhook secret", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
    const raw = JSON.stringify({ event: "payment.captured" });
    const signature = createHmac("sha256", "webhook_secret").update(raw).digest("hex");

    expect(verifyWebhookSignature(raw, signature)).toBe(true);
    expect(verifyWebhookSignature(raw, "bad")).toBe(false);
  });
});

describe("razorpay plan amounts", () => {
  it("charges the exact monthly and yearly amounts in paise", () => {
    expect(amountInPaise("starter", "monthly")).toBe(14900);
    expect(amountInPaise("starter", "yearly")).toBe(134100);
    expect(amountInPaise("pro", "yearly")).toBe(359100);
    expect(amountInPaise("elite", "yearly")).toBe(809100);
  });

  it("accepts only captured INR payments that cover the selected plan", () => {
    const payment: RazorpayPayment = {
      id: "pay_123",
      order_id: "order_123",
      status: "captured",
      amount: 359100,
      currency: "INR",
    };

    expect(paymentCovers(payment, "pro", "yearly")).toBe(true);
    expect(paymentCovers({ ...payment, amount: 359099 }, "pro", "yearly")).toBe(false);
    expect(paymentCovers({ ...payment, status: "authorized" }, "pro", "yearly")).toBe(false);
    expect(paymentCovers({ ...payment, currency: "USD" }, "pro", "yearly")).toBe(false);
  });
});

describe("razorpay order creation", () => {
  function configureKeys() {
    process.env.RAZORPAY_KEY_ID = "rzp_test_public";
    process.env.RAZORPAY_KEY_SECRET = "secret";
  }

  it("creates an order with the selected plan amount and subscription notes", async () => {
    configureKeys();
    const fetchMock = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "order_123", amount: 359100, currency: "INR", status: "created" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createOrder({ plan: "pro", cycle: "yearly", userId: "user_1", email: "asha@example.com" });

    expect(result).toEqual({
      ok: true,
      value: { id: "order_123", amount: 359100, currency: "INR", status: "created" },
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      amount: 359100,
      currency: "INR",
      notes: {
        userId: "user_1",
        email: "asha@example.com",
        plan: "pro",
        cycle: "yearly",
        brand: "StockersAI",
        website: "https://www.stockersai.com",
      },
    });
  });

  it("returns Razorpay's rejection status instead of hiding it as a generic null", async () => {
    configureKeys();
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              description: "Authentication failed",
              code: "BAD_REQUEST_ERROR",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as unknown as typeof fetch;

    const result = await createOrder({ plan: "starter", cycle: "monthly", userId: "user_1", email: "asha@example.com" });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: expect.stringContaining("Razorpay rejected the API key or secret"),
    });
    if (!result.ok) expect(result.error).toContain("Authentication failed");
  });
});
