import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "../../app/components/auth-form";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
}));

function mockFetchOnce(response: { ok: boolean; body: unknown }) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: response.ok,
      json: () => Promise.resolve(response.body),
    })
  ) as unknown as typeof fetch;
}

// Submits the form directly instead of clicking the submit button. Several validation tests
// intentionally use values that fail the browser's own native constraint validation (e.g. a
// too-short password against `minLength`), which would silently block a real button click
// before our JS handler ever ran. Dispatching the submit event directly bypasses that native
// check, the same way a real form submission via Enter/JS would for browsers that skip
// constraint validation, and lets us exercise the component's own validation logic in isolation.
function submitForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("form not found in the document");
  fireEvent.submit(form);
}

describe("AuthForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRefresh.mockClear();
  });

  describe("existing-session redirect", () => {
    it("redirects to /dashboard on mount when a valid-looking session already exists", () => {
      window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "stockers.user.email.signature", user: { name: "Jane" } }));
      render(<AuthForm mode="signin" />);
      expect(mockReplace).toHaveBeenCalledWith("/overview");
    });

    it("clears malformed stored auth instead of redirecting away from signin", () => {
      window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "stale-token", user: { name: "Jane" } }));
      render(<AuthForm mode="signin" />);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem("stockers-auth")).toBeNull();
    });

    it("does not redirect when no session exists", () => {
      render(<AuthForm mode="signin" />);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe("signin mode", () => {
    it("renders the sign-in heading and does not show signup-only fields", () => {
      render(<AuthForm mode="signin" />);
      expect(screen.getByText("Sign in to StockersAI")).toBeInTheDocument();
      expect(screen.queryByText("Full name")).not.toBeInTheDocument();
      expect(screen.queryByText("Confirm password")).not.toBeInTheDocument();
      expect(screen.queryByText("Subscription")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /instagram/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /facebook/i })).not.toBeInTheDocument();
      expect(screen.getByText("New to StockersAI?")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
    });

    it("marks the email field itself when the address is malformed", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signin" />);

      const email = screen.getByPlaceholderText("you@example.com");
      await user.type(email, "jane@localhost");
      await user.type(screen.getByPlaceholderText("••••••••"), "market2026");
      submitForm();

      expect(await screen.findByText("That doesn't look like an email address.")).toBeInTheDocument();
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("asks for a password rather than judging an existing one", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      submitForm();

      expect(await screen.findByText("Please enter your password.")).toBeInTheDocument();
    });

    /**
     * An account created under an older, looser policy still has a working password. Holding it to
     * today's strength rule at sign-in would lock its owner out of an account they own.
     */
    it("sends a short but existing password through to the server", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "stockers.user.email.short", user: { name: "Jane" } } });
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "old");
      submitForm();

      await screen.findByText("Signed in! Redirecting to your dashboard...");
      expect(global.fetch).toHaveBeenCalled();
    });

    it("signs in successfully, stores the session, and redirects to /dashboard", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "stockers.user.email.tok1", user: { name: "Jane", plan: "Pro" } } });
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "market2026");
      submitForm();

      expect(await screen.findByText("Signed in! Redirecting to your dashboard...")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/signin",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "jane@example.com", password: "market2026" }),
        })
      );
      expect(JSON.parse(window.localStorage.getItem("stockers-auth") ?? "{}")).toEqual({
        token: "stockers.user.email.tok1",
        user: { name: "Jane", plan: "Pro" },
      });
      expect(mockPush).toHaveBeenCalledWith("/overview");
    });

    // The regression this guards: storing the token in localStorage is not enough. Gated endpoints
    // read the session from the `stockers_session` cookie, so without this mirror a user who had
    // just signed in was still reported by the server as signed-out and lapsed.
    it("mirrors the session into the cookie the server actually reads", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "stockers.user.email.cookie", user: { name: "Jane", plan: "Pro" } } });
      render(<AuthForm mode="signin" />);

      // jsdom keeps cookies for the whole file, so an earlier sign-in may already have set one.
      document.cookie = "stockers_session=; path=/; max-age=0";
      expect(document.cookie).not.toContain("stockers_session");

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "market2026");
      submitForm();

      await screen.findByText("Signed in! Redirecting to your dashboard...");
      expect(document.cookie).toContain(`stockers_session=${encodeURIComponent("stockers.user.email.cookie")}`);
    });

    it("shows the server-provided error message when sign-in fails", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: false, body: { error: "Invalid credentials." } });
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "market2026");
      submitForm();

      expect(await screen.findByText("Invalid credentials.")).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
    });

    it("falls back to a generic error message when the failure response has no error field", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: false, body: {} });
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "market2026");
      submitForm();

      expect(await screen.findByText("Unable to complete request.")).toBeInTheDocument();
    });

    it("shows a network-error message when the fetch call rejects", async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "market2026");
      submitForm();

      expect(
        await screen.findByText("Network error. Please check your connection and try again.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
    });

    it("shows the 'Working...' disabled state while the request is in flight, and success leaves it in that state pending redirect", async () => {
      const user = userEvent.setup();
      let resolveFetch!: (value: unknown) => void;
      global.fetch = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      ) as unknown as typeof fetch;

      render(<AuthForm mode="signin" />);
      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "market2026");
      submitForm();

      expect(await screen.findByRole("button", { name: "Working..." })).toBeDisabled();

      resolveFetch({ ok: true, json: () => Promise.resolve({ token: "stockers.user.email.pending", user: { name: "Jane" } }) });

      // On success the component never resets `loading` (it navigates away via router.push
      // instead), so the button stays in its "Working..." disabled state — only the success
      // message and the redirect call are the observable signals here.
      expect(await screen.findByText("Signed in! Redirecting to your dashboard...")).toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith("/overview");
    });

    it("toggles the password visibility button", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signin" />);

      const passwordInput = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
      expect(passwordInput).toHaveAttribute("type", "password");

      await user.click(screen.getByRole("button", { name: "Show" }));
      expect(passwordInput).toHaveAttribute("type", "text");
      expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Hide" }));
      expect(passwordInput).toHaveAttribute("type", "password");
    });
  });

  describe("signup mode", () => {
    async function fillValidSignupForm(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByPlaceholderText("Aarav Sharma"), "Aarav Sharma");
      await user.type(screen.getByPlaceholderText("you@example.com"), "aarav@example.com");
      await user.type(screen.getByPlaceholderText("98765 43210"), "9876543210");
      const passwordFields = screen.getAllByPlaceholderText("••••••••");
      await user.type(passwordFields[0], "market2026");
      await user.type(passwordFields[1], "market2026");
    }

    it("renders the signup heading and signup-only fields", () => {
      render(<AuthForm mode="signup" />);
      expect(screen.getByText("Join StockersAI")).toBeInTheDocument();
      expect(screen.getByText("Full name")).toBeInTheDocument();
      expect(screen.getByText("Confirm password")).toBeInTheDocument();
      expect(screen.getByText("Mobile number")).toBeInTheDocument();
      // Signing up starts a free trial for everyone; the plan is chosen at checkout, where its
      // price and what it buys are both on screen.
      expect(screen.queryByText("Subscription")).not.toBeInTheDocument();
      expect(screen.getByText("Already have an account?")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    });

    it("toggles visibility for both the password and confirm-password fields together", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signup" />);

      const [passwordInput, confirmInput] = screen.getAllByPlaceholderText("••••••••") as HTMLInputElement[];
      expect(passwordInput).toHaveAttribute("type", "password");
      expect(confirmInput).toHaveAttribute("type", "password");

      await user.click(screen.getByRole("button", { name: "Show" }));
      expect(passwordInput).toHaveAttribute("type", "text");
      expect(confirmInput).toHaveAttribute("type", "text");
    });

    it("marks the name field when the name is implausibly short", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      await user.clear(screen.getByPlaceholderText("Aarav Sharma"));
      await user.type(screen.getByPlaceholderText("Aarav Sharma"), "A");
      submitForm();

      expect(await screen.findByText("That looks too short to be a name.")).toBeInTheDocument();
    });

    it("marks the confirmation field when the two passwords differ", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      const passwordFields = screen.getAllByPlaceholderText("••••••••");
      await user.clear(passwordFields[1]);
      await user.type(passwordFields[1], "market2027");
      submitForm();

      expect(await screen.findByText("The two passwords don't match.")).toBeInTheDocument();
    });

    it("marks the mobile field when the number could not be an Indian mobile", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      const mobile = screen.getByPlaceholderText("98765 43210");
      await user.clear(mobile);
      await user.type(mobile, "1234567890");
      submitForm();

      expect(await screen.findByText(/10-digit Indian mobile/)).toBeInTheDocument();
      expect(mobile).toHaveAttribute("aria-invalid", "true");
    });

    /**
     * A field is only marked once the visitor has finished with it. Turning an input red while
     * someone is still typing their address tells them they are wrong before they can be right.
     */
    it("says nothing while a field is still being typed into", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signup" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "aar");
      expect(screen.queryByText("That doesn't look like an email address.")).not.toBeInTheDocument();

      await user.tab();
      expect(await screen.findByText("That doesn't look like an email address.")).toBeInTheDocument();
    });

    // The summary says how much is wrong; the fields themselves say what.
    it("counts the problems in the summary above the button", async () => {
      render(<AuthForm mode="signup" />);
      submitForm();

      expect(await screen.findByText(/fields need your attention/)).toBeInTheDocument();
    });

    // A rejection from the server has to land on the field it is about.
    it("marks the email field when the server says the address is taken", async () => {
      const user = userEvent.setup();
      mockFetchOnce({
        ok: false,
        body: { error: "An account already exists for this email.", errors: { email: "This email is already registered." } },
      });
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      submitForm();

      expect(await screen.findByText("This email is already registered.")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("you@example.com")).toHaveAttribute("aria-invalid", "true");
    });

    /**
     * Sign-up confirms in a dialog and sends the reader to sign in; it does not open a session.
     *
     * It used to store the token, sync the cookie and push straight to the dashboard, which is why
     * nobody ever read what they had been given: the trial, its length and its end date all went
     * past in a redirect. Nothing is stored here now — no token, no cookie — and the account is
     * opened by an ordinary sign-in a moment later.
     */
    it("confirms the new account in a dialog instead of opening a session", async () => {
      const user = userEvent.setup();
      mockFetchOnce({
        ok: true,
        body: { token: "tok-2", user: { name: "Aarav Sharma", plan: "Starter" }, trialEndsOn: "2026-08-20" },
      });
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      submitForm();

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/free trial has started/)).toBeInTheDocument();
      // The address is echoed back so a typo is catchable before they try to sign in with it.
      expect(within(dialog).getByText("aarav@example.com")).toBeInTheDocument();

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Aarav Sharma",
            email: "aarav@example.com",
            mobile: "9876543210",
            password: "market2026",
            confirmPassword: "market2026",
          }),
        })
      );

      // No session: the token went nowhere and the dashboard was not opened.
      expect(window.localStorage.getItem("stockers-auth")).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("sends the new account to sign in, carrying the address it just registered", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "tok-2", user: { name: "Aarav Sharma" }, trialEndsOn: null } });
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      submitForm();

      await user.click(await screen.findByRole("button", { name: "Continue to sign in" }));

      // `replace`, not `push`: the sign-up form is not somewhere back should return to now that
      // the account exists.
      expect(mockReplace).toHaveBeenCalledWith("/signin?email=aarav%40example.com&welcome=1");
    });

    it("sends the mobile number it collected", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "tok-3", user: { name: "Aarav Sharma" } } });
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      submitForm();

      await screen.findByRole("dialog");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({
          body: JSON.stringify({
            name: "Aarav Sharma",
            email: "aarav@example.com",
            mobile: "9876543210",
            password: "market2026",
            confirmPassword: "market2026",
          }),
        })
      );
    });
  });

  describe("server errors on the fields they belong to", () => {
    /**
     * A wrong address and a wrong password get one message between them — saying which was wrong
     * tells anyone who asks whether an email has an account here. The email input is still marked
     * so the reader sees both fields are in question, but it carries no message of its own.
     */
    it("outlines the email without repeating the message when sign-in fails", async () => {
      const user = userEvent.setup();
      mockFetchOnce({
        ok: false,
        body: { error: "Invalid email or password.", errors: { email: " ", password: "Invalid email or password." } },
      });
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "wrongpass1");
      submitForm();

      expect(await screen.findAllByText("Invalid email or password.")).toHaveLength(2);
      expect(screen.getByPlaceholderText("you@example.com")).toHaveAttribute("aria-invalid", "true");
    });

    // A field being fixed should stop being marked by a stale answer from the server.
    it("clears a server error as soon as that field is edited", async () => {
      const user = userEvent.setup();
      mockFetchOnce({
        ok: false,
        body: { error: "An account already exists for this email.", errors: { email: "This email is already registered." } },
      });
      render(<AuthForm mode="signup" />);

      await user.type(screen.getByPlaceholderText("Aarav Sharma"), "Aarav Sharma");
      await user.type(screen.getByPlaceholderText("you@example.com"), "taken@example.com");
      await user.type(screen.getByPlaceholderText("98765 43210"), "9876543210");
      const passwords = screen.getAllByPlaceholderText("••••••••");
      await user.type(passwords[0], "market2026");
      await user.type(passwords[1], "market2026");
      submitForm();

      expect(await screen.findByText("This email is already registered.")).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText("you@example.com"), "x");
      expect(screen.queryByText("This email is already registered.")).not.toBeInTheDocument();
    });
  });
});
