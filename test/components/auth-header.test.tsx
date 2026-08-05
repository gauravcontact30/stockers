import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../app/lib/theme-provider";
import { AuthHeader } from "../../app/components/auth-header";

describe("AuthHeader", () => {
  it("renders the logo link, back-to-home link and the theme toggle", () => {
    render(
      <ThemeProvider>
        <AuthHeader />
      </ThemeProvider>
    );

    const homeLinks = screen.getAllByRole("link");
    expect(homeLinks[0]).toHaveAttribute("href", "/");
    expect(screen.getByText("Stockers")).toBeInTheDocument();

    const backLink = screen.getByRole("link", { name: "← Back to home" });
    expect(backLink).toHaveAttribute("href", "/");

    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });
});
