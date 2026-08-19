// The sign-in form as a visitor actually gets it: with no "Forgot password?" entry point.
//
// Its own file rather than a case inside `./auth-form.test.tsx`, because that file mocks
// `app/lib/auth-features` on so the recovery flow stays covered — a `jest.mock` is per-file, so the
// default has to be checked somewhere the module is real. Both halves matter: the link is gone, and
// the panel behind it cannot be reached by any other route.

import { render, screen } from "@testing-library/react";
import { AuthForm } from "../../app/components/auth-form";
import { PASSWORD_RECOVERY_ENABLED } from "../../app/lib/auth-features";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

describe("AuthForm without password recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the recovery entry point switched off", () => {
    expect(PASSWORD_RECOVERY_ENABLED).toBe(false);
  });

  it("does not offer 'Forgot password?' on the sign-in form", () => {
    render(<AuthForm mode="signin" />);

    expect(screen.queryByText("Forgot password?")).not.toBeInTheDocument();
    expect(screen.queryByText("Step 1 of 2 - where should the code go?")).not.toBeInTheDocument();
    expect(screen.queryByText("Send me a code")).not.toBeInTheDocument();
  });

  it("still signs a reader in, so hiding the link cost the form nothing else", () => {
    render(<AuthForm mode="signin" />);

    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  // The sign-up form never carried the link, and must not start carrying it either way the flag goes.
  it("leaves the sign-up form as it was", () => {
    render(<AuthForm mode="signup" />);
    expect(screen.queryByText("Forgot password?")).not.toBeInTheDocument();
  });
});
