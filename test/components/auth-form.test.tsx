import { fireEvent, render, screen } from "@testing-library/react";
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
  });

  describe("existing-session redirect", () => {
    it("redirects to /dashboard on mount when a session already exists", () => {
      window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "t", user: { name: "Jane" } }));
      render(<AuthForm mode="signin" />);
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });

    it("does not redirect when no session exists", () => {
      render(<AuthForm mode="signin" />);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe("signin mode", () => {
    it("renders the sign-in heading and does not show signup-only fields", () => {
      render(<AuthForm mode="signin" />);
      expect(screen.getByText("Sign in to Stockers.AI")).toBeInTheDocument();
      expect(screen.queryByText("Full name")).not.toBeInTheDocument();
      expect(screen.queryByText("Confirm password")).not.toBeInTheDocument();
      expect(screen.queryByText("Subscription")).not.toBeInTheDocument();
      expect(screen.getByText("New to Stockers.AI?")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
    });

    it("shows a validation error for an invalid email address", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signin" />);

      // "jane@localhost" satisfies the browser's own (looser) native email validation, but not
      // the component's stricter EMAIL_PATTERN (which requires a dot in the domain) — so this
      // exercises the component's own regex check rather than getting blocked earlier.
      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@localhost");
      await user.type(screen.getByPlaceholderText("••••••••"), "password123");
      submitForm();

      expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("shows a validation error when the password is too short", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "123");
      submitForm();

      expect(await screen.findByText("Password must be at least 6 characters.")).toBeInTheDocument();
    });

    it("signs in successfully, stores the session, and redirects to /dashboard", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "tok-1", user: { name: "Jane", plan: "Pro" } } });
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "password123");
      submitForm();

      expect(await screen.findByText("Signed in! Redirecting to your dashboard...")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/signin",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "jane@example.com", password: "password123" }),
        })
      );
      expect(JSON.parse(window.localStorage.getItem("stockers-auth") ?? "{}")).toEqual({
        token: "tok-1",
        user: { name: "Jane", plan: "Pro" },
      });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    it("shows the server-provided error message when sign-in fails", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: false, body: { error: "Invalid credentials." } });
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "password123");
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
      await user.type(screen.getByPlaceholderText("••••••••"), "password123");
      submitForm();

      expect(await screen.findByText("Unable to complete request.")).toBeInTheDocument();
    });

    it("shows a network-error message when the fetch call rejects", async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
      render(<AuthForm mode="signin" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
      await user.type(screen.getByPlaceholderText("••••••••"), "password123");
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
      await user.type(screen.getByPlaceholderText("••••••••"), "password123");
      submitForm();

      expect(await screen.findByRole("button", { name: "Working..." })).toBeDisabled();

      resolveFetch({ ok: true, json: () => Promise.resolve({ token: "t", user: { name: "Jane" } }) });

      // On success the component never resets `loading` (it navigates away via router.push
      // instead), so the button stays in its "Working..." disabled state — only the success
      // message and the redirect call are the observable signals here.
      expect(await screen.findByText("Signed in! Redirecting to your dashboard...")).toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
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
      const passwordFields = screen.getAllByPlaceholderText("••••••••");
      await user.type(passwordFields[0], "password123");
      await user.type(passwordFields[1], "password123");
    }

    it("renders the signup heading and signup-only fields", () => {
      render(<AuthForm mode="signup" />);
      expect(screen.getByText("Join Stockers.AI")).toBeInTheDocument();
      expect(screen.getByText("Full name")).toBeInTheDocument();
      expect(screen.getByText("Confirm password")).toBeInTheDocument();
      expect(screen.getByText("Subscription")).toBeInTheDocument();
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

    it("shows a validation error when the full name is missing or too short", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signup" />);

      await user.type(screen.getByPlaceholderText("you@example.com"), "aarav@example.com");
      const passwordFields = screen.getAllByPlaceholderText("••••••••");
      await user.type(passwordFields[0], "password123");
      await user.type(passwordFields[1], "password123");
      await user.type(screen.getByPlaceholderText("Aarav Sharma"), "A");
      submitForm();

      expect(await screen.findByText("Please enter your full name.")).toBeInTheDocument();
    });

    it("shows a validation error when the passwords do not match", async () => {
      const user = userEvent.setup();
      render(<AuthForm mode="signup" />);

      await user.type(screen.getByPlaceholderText("Aarav Sharma"), "Aarav Sharma");
      await user.type(screen.getByPlaceholderText("you@example.com"), "aarav@example.com");
      const passwordFields = screen.getAllByPlaceholderText("••••••••");
      await user.type(passwordFields[0], "password123");
      await user.type(passwordFields[1], "password456");
      submitForm();

      expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    });

    it("signs up successfully with the selected plan, stores the session, and redirects", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "tok-2", user: { name: "Aarav Sharma", plan: "Pro" } } });
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      await user.selectOptions(screen.getByDisplayValue("Starter"), "Pro");
      submitForm();

      expect(await screen.findByText("Account created! Redirecting to your dashboard...")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Aarav Sharma",
            email: "aarav@example.com",
            password: "password123",
            plan: "Pro",
          }),
        })
      );
      expect(JSON.parse(window.localStorage.getItem("stockers-auth") ?? "{}")).toEqual({
        token: "tok-2",
        user: { name: "Aarav Sharma", plan: "Pro" },
      });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    it("defaults the plan to Starter when not changed", async () => {
      const user = userEvent.setup();
      mockFetchOnce({ ok: true, body: { token: "tok-3", user: { name: "Aarav Sharma" } } });
      render(<AuthForm mode="signup" />);

      await fillValidSignupForm(user);
      submitForm();

      await screen.findByText("Account created! Redirecting to your dashboard...");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({
          body: JSON.stringify({
            name: "Aarav Sharma",
            email: "aarav@example.com",
            password: "password123",
            plan: "Starter",
          }),
        })
      );
    });
  });
});
