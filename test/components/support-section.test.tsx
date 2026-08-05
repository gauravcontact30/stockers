import { render, screen } from "@testing-library/react";
import { SupportSection } from "../../app/components/support-section";

describe("SupportSection", () => {
  it("renders the heading, help list and the create-account link", () => {
    render(<SupportSection />);
    expect(screen.getByText("Get started in minutes")).toBeInTheDocument();
    expect(screen.getByText("Need help?")).toBeInTheDocument();
    expect(screen.getByText(/Live onboarding guidance/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Create account" });
    expect(link).toHaveAttribute("href", "/signup");
  });
});
