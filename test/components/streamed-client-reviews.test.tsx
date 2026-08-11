import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import {
  ClientReviewsFallback,
  ClientReviewsPayload,
  StreamedClientReviews,
} from "../../app/components/streamed-client-reviews";
import { ClientReviewsCarousel } from "../../app/components/client-reviews-carousel";
import { listClientReviews } from "../../app/lib/client-reviews";

jest.mock("../../app/lib/client-reviews", () => ({
  listClientReviews: jest.fn(),
}));

const reviews = listClientReviews as jest.MockedFunction<typeof listClientReviews>;

const review = {
  id: "review_1",
  name: "Shivam Pandey",
  location: "Mainpuri - UP",
  role: "Research analyst",
  photo: "/uploads/client-reviews/review_1-profile.png",
  accent: "from-emerald-500 via-teal-300 to-sky-300",
  comment: "An excellent platform for AI-powered stock analysis, with clear and specific calls.",
  signature: "Shivam",
  signatureImage: "/uploads/client-reviews/review_1-signature.png",
  rating: 5,
  createdAt: "2026-08-11T03:43:45.219Z",
};

beforeEach(() => {
  reviews.mockResolvedValue([review]);
});

describe("ClientReviewsFallback", () => {
  it("holds a section of the same shape so the streamed-in reviews do not shift the page", () => {
    const { container } = render(<ClientReviewsFallback />);

    expect(container.querySelector("section")).toBeInTheDocument();
    // The eyebrow and title bars, then five per skeleton card — the portrait, two identity lines
    // and two lines of comment — across three cards.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(17);
  });
});

describe("ClientReviewsPayload", () => {
  it("hands the published reviews to the carousel", async () => {
    const element = await ClientReviewsPayload();

    expect(element.type).toBe(ClientReviewsCarousel);
    expect(element.props.reviews).toEqual([review]);
  });

  it("renders what the admin published, and nothing invented alongside it", async () => {
    render(await ClientReviewsPayload());

    expect(await screen.findByText("Shivam Pandey")).toBeInTheDocument();
    expect(screen.getByText(/An excellent platform/)).toBeInTheDocument();
    expect(screen.getByAltText("Shivam Pandey reviewer profile")).toBeInTheDocument();
  });

  // The section is meant to disappear rather than pad itself with a sample testimonial.
  it("renders nothing at all when nothing has been published", async () => {
    reviews.mockResolvedValue([]);
    const { container } = render(await ClientReviewsPayload());

    expect(container).toBeEmptyDOMElement();
  });
});

describe("StreamedClientReviews", () => {
  it("puts the reviews behind their own boundary, with the skeleton as the fallback", () => {
    const element = StreamedClientReviews();

    expect(element.type).toBe(Suspense);
    expect(element.props.children.type).toBe(ClientReviewsPayload);

    const { container } = render(element.props.fallback);
    expect(container.querySelector("section")).toBeInTheDocument();
  });
});
