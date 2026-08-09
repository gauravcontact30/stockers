import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SubscribeButton,
  checkoutOptions,
  loadCheckoutScript,
  type OrderResponse,
} from "../../app/components/razorpay-checkout";
import { SubscriptionProvider } from "../../app/components/subscription-provider";

jest.setTimeout(30000);

const ORDER: OrderResponse = {
  orderId: "order_test123",
  amount: 79900,
  currency: "INR",
  keyId: "rzp_test_key",
  plan: "pro",
  cycle: "monthly",
  name: "Asha",
  email: "asha@example.com",
};

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type Handlers = { handler: (result: unknown) => void; modal: { ondismiss: () => void } };

/**
 * Stands in for Razorpay's hosted checkout.
 *
 * The real thing opens an iframe and takes a card; what matters here is the contract around it —
 * what it is opened with, and what the panel does with what it hands back.
 */
function mockCheckout() {
  const opened: { options: Record<string, unknown> }[] = [];

  (window as unknown as { Razorpay: unknown }).Razorpay = function (options: Record<string, unknown>) {
    opened.push({ options });
    return { open: () => {} };
  };

  return opened;
}

/** The success and dismiss callbacks the panel handed to checkout. */
const handlersOf = (options: Record<string, unknown>) => options as unknown as Handlers;

function mockApi({
  orderStatus = 200,
  verifyStatus = 200,
  orderBody = ORDER as unknown,
  verifyBody = { ok: true } as unknown,
} = {}) {
  const calls: { url: string; body: unknown }[] = [];

  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });

    if (String(url).endsWith("/order")) {
      return Promise.resolve({ ok: orderStatus === 200, status: orderStatus, json: () => Promise.resolve(orderBody) });
    }
    if (String(url).endsWith("/verify")) {
      return Promise.resolve({ ok: verifyStatus === 200, status: verifyStatus, json: () => Promise.resolve(verifyBody) });
    }
    // The subscription provider's own status call.
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ signedIn: true, locks: {} }) });
  }) as unknown as typeof fetch;

  return calls;
}

const button = (props: Partial<Parameters<typeof SubscribeButton>[0]> = {}) => (
  <SubscribeButton plan="pro" cycle="monthly" label="Choose Pro" className="btn" {...props} />
);

beforeEach(() => {
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  document.querySelectorAll(`script[src="${CHECKOUT_SRC}"]`).forEach((node) => node.remove());
});

describe("checkoutOptions", () => {
  it("opens checkout for the order the server priced, never for a price from here", () => {
    const onSuccess = jest.fn();
    const onDismiss = jest.fn();
    const options = checkoutOptions(ORDER, { onSuccess, onDismiss });

    expect(options).toMatchObject({
      key: "rzp_test_key",
      amount: 79900,
      currency: "INR",
      order_id: "order_test123",
      name: "StockersAI",
      description: "Pro plan - ₹399/month, billed monthly",
      prefill: { name: "Asha", email: "asha@example.com" },
    });
    expect(options.handler).toBe(onSuccess);
  });

  it("shows the annual billed amount and effective monthly price on the annual cycle", () => {
    const options = checkoutOptions({ ...ORDER, cycle: "yearly" }, { onSuccess: jest.fn(), onDismiss: jest.fn() });
    expect(options.description).toBe("Pro plan - ₹299/month, ₹3,591 billed yearly");
  });
});

describe("loadCheckoutScript", () => {
  it("does nothing when the gateway is already loaded", async () => {
    (window as unknown as { Razorpay: unknown }).Razorpay = function () {};

    await expect(loadCheckoutScript()).resolves.toBe(true);
    expect(document.querySelector(`script[src="${CHECKOUT_SRC}"]`)).toBeNull();
  });

  it("adds the script once and resolves when it loads", async () => {
    const pending = loadCheckoutScript();
    const script = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`)!;
    expect(script).not.toBeNull();

    // A second call while the first is still in flight reuses the tag rather than adding another.
    const second = loadCheckoutScript();
    expect(document.querySelectorAll(`script[src="${CHECKOUT_SRC}"]`)).toHaveLength(1);

    (window as unknown as { Razorpay: unknown }).Razorpay = function () {};
    script.onload?.(new Event("load"));
    script.dispatchEvent(new Event("load"));

    await expect(pending).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  // A script that loads but leaves no global behind is a blocked or stubbed gateway; treating it
  // as loaded would call a constructor that is not there.
  it("reports a script that loads without bringing the gateway with it", async () => {
    const pending = loadCheckoutScript();
    document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`)!.onload?.(new Event("load"));
    await expect(pending).resolves.toBe(false);

    const second = loadCheckoutScript();
    document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`)!.dispatchEvent(new Event("load"));
    await expect(second).resolves.toBe(false);
  });

  it("reports a script that fails to load rather than hanging", async () => {
    const pending = loadCheckoutScript();
    const script = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`)!;

    script.onerror?.(new Event("error"));
    await expect(pending).resolves.toBe(false);

    const second = loadCheckoutScript();
    document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`)!.dispatchEvent(new Event("error"));
    await expect(second).resolves.toBe(false);
  });
});

describe("SubscribeButton", () => {
  it("opens Razorpay for the plan and cycle on screen, then confirms the payment", async () => {
    const user = userEvent.setup();
    const calls = mockApi();
    const opened = mockCheckout();
    render(button({ cycle: "yearly" }));

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => expect(opened).toHaveLength(1));
    expect(calls[0]).toEqual({ url: "/api/payments/razorpay/order", body: { plan: "pro", cycle: "yearly" } });

    // Razorpay reports back through the handler it was given.
    handlersOf(opened[0].options).handler({
      razorpay_order_id: "order_test123",
      razorpay_payment_id: "pay_test456",
      razorpay_signature: "sig",
    });

    expect(await screen.findByText("Subscribed — thank you")).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      url: "/api/payments/razorpay/verify",
      body: {
        razorpay_order_id: "order_test123",
        razorpay_payment_id: "pay_test456",
        razorpay_signature: "sig",
        plan: "pro",
        cycle: "yearly",
      },
    });
  });

  it("goes back to the button when the customer closes the payment window", async () => {
    const user = userEvent.setup();
    mockApi();
    const opened = mockCheckout();
    render(button());

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => expect(opened).toHaveLength(1));

    handlersOf(opened[0].options).modal.ondismiss();

    // Closing the window is a decision, not an error: no message, and the button works again.
    expect(await screen.findByRole("button", { name: "Choose Pro" })).toBeEnabled();
    expect(screen.queryByText(/couldn't/i)).not.toBeInTheDocument();
  });

  it("reports a gateway that will not open an order", async () => {
    const user = userEvent.setup();
    mockApi({ orderStatus: 503, orderBody: { error: "Card payments aren't switched on yet." } });
    mockCheckout();
    render(button());

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));

    expect(await screen.findByText("Card payments aren't switched on yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Pro" })).toBeEnabled();
  });

  it("falls back to its own message when the server sends none", async () => {
    const user = userEvent.setup();
    mockApi({ orderStatus: 500, orderBody: {} });
    mockCheckout();
    render(button());

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));
    expect(await screen.findByText("Couldn't start the payment.")).toBeInTheDocument();
  });

  it("says so when the payment window itself cannot be loaded", async () => {
    const user = userEvent.setup();
    mockApi();
    render(button());

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));

    // The script tag is added, then fails — as it would behind a blocker or offline.
    await waitFor(() => expect(document.querySelector(`script[src="${CHECKOUT_SRC}"]`)).not.toBeNull());
    document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`)!.onerror?.(new Event("error"));

    expect(await screen.findByText(/Couldn't load the payment window/)).toBeInTheDocument();
  });

  // The money may already have left the customer's account, so this must never read as "nothing
  // happened" — the webhook credits it regardless.
  it("tells the customer their payment is still recorded when confirmation fails", async () => {
    const user = userEvent.setup();
    mockApi({ verifyStatus: 400, verifyBody: { error: "That payment could not be verified." } });
    const opened = mockCheckout();
    render(button());

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => expect(opened).toHaveLength(1));

    handlersOf(opened[0].options).handler({
      razorpay_order_id: "order_test123",
      razorpay_payment_id: "pay_test456",
      razorpay_signature: "sig",
    });

    expect(await screen.findByText(/still recorded/)).toBeInTheDocument();
    expect(screen.getByText(/could not be verified/)).toBeInTheDocument();
  });

  it("falls back to its own message when confirmation fails without one", async () => {
    const user = userEvent.setup();
    mockApi({ verifyStatus: 500, verifyBody: {} });
    const opened = mockCheckout();
    render(button());

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => expect(opened).toHaveLength(1));

    handlersOf(opened[0].options).handler({
      razorpay_order_id: "order_test123",
      razorpay_payment_id: "pay_test456",
      razorpay_signature: "sig",
    });

    expect(await screen.findByText(/We couldn't confirm that payment/)).toBeInTheDocument();
  });

  it("says it is confirming while the server checks the payment", async () => {
    const user = userEvent.setup();
    let settle: (() => void) | null = null;

    global.fetch = jest.fn((url: string) => {
      if (String(url).endsWith("/order")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ORDER) });
      }
      return new Promise((resolve) => {
        settle = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      });
    }) as unknown as typeof fetch;

    const opened = mockCheckout();
    render(button());

    await user.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => expect(opened).toHaveLength(1));

    handlersOf(opened[0].options).handler({
      razorpay_order_id: "order_test123",
      razorpay_payment_id: "pay_test456",
      razorpay_signature: "sig",
    });

    expect(await screen.findByRole("button", { name: "Confirming…" })).toBeDisabled();

    await waitFor(() => expect(settle).not.toBeNull());
    settle!();
    expect(await screen.findByText("Subscribed — thank you")).toBeInTheDocument();
  });

  it("renders without styling when a caller passes none", () => {
    mockApi();
    render(<SubscribeButton plan="starter" cycle="monthly" label="Choose Starter" />);

    expect(screen.getByRole("button", { name: "Choose Starter" })).toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign up instead of into a checkout", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ signedIn: false, locks: {} }) }),
    ) as unknown as typeof fetch;

    render(
      <SubscriptionProvider>
        <SubscribeButton plan="elite" cycle="monthly" label="Choose Elite" className="btn" />
      </SubscriptionProvider>,
    );

    expect(await screen.findByRole("link", { name: "Choose Elite" })).toHaveAttribute(
      "href",
      "/signup?subscribe=1&plan=elite&cycle=monthly",
    );
  });
});
