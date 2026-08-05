import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackToTop } from "../../app/components/back-to-top";

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, writable: true, configurable: true });
}

describe("BackToTop", () => {
  afterEach(() => {
    setScrollY(0);
  });

  it("is hidden (not visible styling) when the page has not scrolled past the threshold", () => {
    setScrollY(0);
    render(<BackToTop />);
    const button = screen.getByRole("button", { name: "Back to top" });
    expect(button).toHaveClass("pointer-events-none");
    expect(button).toHaveClass("opacity-0");
  });

  it("becomes visible once scrollY exceeds 600 and hides again once scrolled back up", () => {
    setScrollY(0);
    render(<BackToTop />);
    const button = screen.getByRole("button", { name: "Back to top" });

    setScrollY(700);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(button).toHaveClass("opacity-100");

    setScrollY(0);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(button).toHaveClass("opacity-0");
  });

  it("scrolls to top when clicked", async () => {
    const user = userEvent.setup();
    render(<BackToTop />);
    const button = screen.getByRole("button", { name: "Back to top" });
    await user.click(button);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("removes the scroll listener on unmount", () => {
    const removeSpy = jest.spyOn(window, "removeEventListener");
    const { unmount } = render(<BackToTop />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
