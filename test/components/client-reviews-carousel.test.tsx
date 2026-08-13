import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientReviewsCarousel } from "../../app/components/client-reviews-carousel";
import { type ClientReview } from "../../app/lib/client-review";

function review(overrides: Partial<ClientReview> = {}): ClientReview {
  return {
    id: "r1",
    name: "Meera Iyer",
    location: "Chennai",
    role: "Long-term investor",
    photo: "/uploads/client-reviews/meera-profile.png",
    accent: "from-sky-500 to-cyan-300",
    comment: "The sector board is the first thing I open every morning.",
    signature: "Meera",
    rating: 5,
    ...overrides,
  };
}

const three = [
  review({ id: "a", name: "Meera Iyer", comment: "First opinion." }),
  review({ id: "b", name: "Rohan Das", comment: "Second opinion." }),
  review({ id: "c", name: "Anita Rao", comment: "Third opinion." }),
];

/** Which slide is on screen, read off the pager rather than the transform. */
function current() {
  return screen.getAllByRole("button", { name: /Go to review/ }).findIndex(
    (dot) => dot.getAttribute("aria-current") === "true",
  );
}

afterEach(() => {
  jest.useRealTimers();
});

describe("ClientReviewsCarousel", () => {
  it("renders nothing at all when no reviews have been published", () => {
    const { container } = render(<ClientReviewsCarousel reviews={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one review at a time, with the rest hidden from assistive technology", () => {
    render(<ClientReviewsCarousel reviews={three} />);

    const slides = screen.getAllByRole("group", { hidden: true });
    expect(slides).toHaveLength(3);
    expect(slides[0]).toHaveAttribute("aria-hidden", "false");
    expect(slides[1]).toHaveAttribute("aria-hidden", "true");
    expect(slides[2]).toHaveAttribute("aria-hidden", "true");
  });

  it("advances on its own and wraps around at the end", () => {
    jest.useFakeTimers();
    render(<ClientReviewsCarousel reviews={three} />);

    expect(current()).toBe(0);

    act(() => void jest.advanceTimersByTime(6000));
    expect(current()).toBe(1);

    act(() => void jest.advanceTimersByTime(6000));
    expect(current()).toBe(2);

    act(() => void jest.advanceTimersByTime(6000));
    expect(current()).toBe(0);
  });

  it("pauses autoplay while the visitor is reading and resumes after", () => {
    jest.useFakeTimers();
    const { container } = render(<ClientReviewsCarousel reviews={three} />);
    const stage = container.querySelector("[aria-roledescription='carousel']")!.parentElement!;

    fireEvent.mouseEnter(stage);
    act(() => void jest.advanceTimersByTime(20000));
    expect(current()).toBe(0);

    fireEvent.mouseLeave(stage);
    act(() => void jest.advanceTimersByTime(6000));
    expect(current()).toBe(1);
  });

  it("pauses when a control takes keyboard focus, and resumes when it leaves", () => {
    jest.useFakeTimers();
    const { container } = render(<ClientReviewsCarousel reviews={three} />);
    const stage = container.querySelector("[aria-roledescription='carousel']")!.parentElement!;

    fireEvent.focus(stage);
    act(() => void jest.advanceTimersByTime(20000));
    expect(current()).toBe(0);

    fireEvent.blur(stage);
    act(() => void jest.advanceTimersByTime(6000));
    expect(current()).toBe(1);
  });

  it("never starts a timer for a single review", () => {
    jest.useFakeTimers();
    render(<ClientReviewsCarousel reviews={[review()]} />);

    act(() => void jest.advanceTimersByTime(60000));
    expect(screen.getByText("The sector board is the first thing I open every morning.")).toBeInTheDocument();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("steps forward and backward from the arrows, wrapping in both directions", async () => {
    const user = userEvent.setup();
    render(<ClientReviewsCarousel reviews={three} />);

    await user.click(screen.getByRole("button", { name: "Previous review" }));
    expect(current()).toBe(2);

    await user.click(screen.getByRole("button", { name: "Next review" }));
    expect(current()).toBe(0);
  });

  it("jumps straight to a review from its pager dot", async () => {
    const user = userEvent.setup();
    render(<ClientReviewsCarousel reviews={three} />);

    await user.click(screen.getByRole("button", { name: "Go to review 3: Anita Rao" }));
    expect(current()).toBe(2);
  });

  it("hides the controls when there is only one review", () => {
    render(<ClientReviewsCarousel reviews={[review()]} />);

    expect(screen.queryByRole("button", { name: /Go to review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next review" })).not.toBeInTheDocument();
  });

  it("falls back to the last review when the list shrinks past the active slide", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClientReviewsCarousel reviews={three} />);

    await user.click(screen.getByRole("button", { name: "Go to review 3: Anita Rao" }));
    expect(current()).toBe(2);

    // The admin deletes two reviews while the page is open.
    rerender(<ClientReviewsCarousel reviews={[three[0]]} />);
    expect(screen.getByText("First opinion.")).toBeInTheDocument();
  });

  it("shows the reviewer's identity, photo and verified mark", () => {
    render(<ClientReviewsCarousel reviews={[review()]} />);

    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();
    expect(screen.getByText("Long-term investor, Chennai")).toBeInTheDocument();
    // Through the image optimiser rather than served raw: these are phone-camera uploads drawn
    // into a 90px circle, and the original files run to hundreds of kilobytes each.
    expect(screen.getByAltText("Meera Iyer reviewer profile")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent("/uploads/client-reviews/meera-profile.png")),
    );
    expect(screen.getByRole("img", { name: "Verified reviewer" })).toBeInTheDocument();
  });

  it("averages the ratings and counts them", () => {
    render(
      <ClientReviewsCarousel reviews={[review({ id: "a", rating: 5 }), review({ id: "b", rating: 4 })]} />,
    );

    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText(/2 verified reviews/)).toBeInTheDocument();
  });

  it("uses the singular noun for a lone review", () => {
    render(<ClientReviewsCarousel reviews={[review()]} />);
    expect(screen.getByText(/1 verified review/)).toBeInTheDocument();
  });

  it("calls out how many reviews are rated five stars", () => {
    render(
      <ClientReviewsCarousel
        reviews={[review({ id: "a", rating: 5 }), review({ id: "b", rating: 5 }), review({ id: "c", rating: 3 })]}
      />,
    );

    expect(screen.getByText(/2 rated 5★/)).toBeInTheDocument();
  });

  it("omits the five-star line when nothing is rated five", () => {
    render(<ClientReviewsCarousel reviews={[review({ rating: 4 })]} />);

    expect(screen.queryByText(/rated 5★/)).not.toBeInTheDocument();
    expect(screen.getByText("4.0")).toBeInTheDocument();
  });

  it("fills exactly as many stars as the review's rating", () => {
    render(<ClientReviewsCarousel reviews={[review({ rating: 3 })]} />);

    const slide = screen.getByRole("group", { hidden: true });
    const stars = within(slide).getByLabelText("3 out of 5 stars").querySelectorAll("svg");
    expect(stars).toHaveLength(5);
    expect([...stars].filter((star) => star.classList.contains("fill-amber-400"))).toHaveLength(3);
  });

  describe("the signature", () => {
    it("uses the uploaded image, blended so its white background falls away", () => {
      render(<ClientReviewsCarousel reviews={[review({ signatureImage: "/uploads/sig.png" })]} />);

      const image = screen.getByAltText("Meera Iyer signature");
      expect(image).toHaveAttribute("src", "/uploads/sig.png");
      expect(image.className).toContain("mix-blend-multiply");
      expect(image.className).toContain("dark:invert");
      expect(screen.queryByRole("img", { name: "Meera signature" })).not.toBeInTheDocument();
    });

    it("falls back to a drawn mark when nothing was uploaded", () => {
      render(<ClientReviewsCarousel reviews={[review()]} />);

      expect(screen.getByRole("img", { name: "Meera signature" })).toBeInTheDocument();
      expect(screen.queryByAltText("Meera Iyer signature")).not.toBeInTheDocument();
    });

    it("labels the mark so it reads as a signature rather than as decoration", () => {
      render(<ClientReviewsCarousel reviews={[review()]} />);
      expect(screen.getByText("Signed")).toBeInTheDocument();
    });
  });
});
