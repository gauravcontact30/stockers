import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../app/lib/theme-provider";
import { ThemeToggle } from "../../app/components/theme-toggle";

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
}

describe("ThemeToggle", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("renders the light-mode sun icon and label when the html element has no dark class", () => {
    renderToggle();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });

  it("renders the dark-mode moon icon and label when the html element has the dark class", () => {
    document.documentElement.classList.add("dark");
    renderToggle();
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });

  it("toggles the html class and button label when clicked", async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = screen.getByRole("button", { name: "Switch to dark mode" });
    await user.click(button);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
