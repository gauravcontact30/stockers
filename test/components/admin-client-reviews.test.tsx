import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminClientReviews } from "../../app/components/admin-client-reviews";

jest.mock("../../app/components/subscription-provider", () => ({
  authHeaders: () => ({ Authorization: "Bearer admin-token" }),
}));

const review = {
  id: "review_1",
  name: "Shivam Pandey",
  location: "Mainpuri - UP",
  role: "Research analyst",
  photo: "/uploads/client-reviews/review_1-profile.png",
  accent: "from-emerald-500 via-teal-300 to-sky-300",
  comment: "An excellent platform for AI-powered stock analysis.",
  signature: "Shivam",
  signatureImage: "/uploads/client-reviews/review_1-signature.png",
  rating: 5,
  createdAt: "2026-08-11T03:43:45.219Z",
};

const unsignedReview = { ...review, id: "review_2", name: "Gaurav Pandey", signatureImage: null, signature: "Gaurav" };

/**
 * jsdom ships no canvas implementation at all, and this screen is built on one: the profile is
 * re-cropped through a canvas and the signature is drawn on another. These stubs record what the
 * component asked the context to do, which is the only part worth asserting — the pixels are the
 * browser's job.
 */
type Ctx = Record<string, jest.Mock> & { lineWidth?: number; strokeStyle?: string };

function stubCanvas() {
  const context: Ctx = {
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  };

  HTMLCanvasElement.prototype.getContext = jest.fn(() => context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = jest.fn((callback: BlobCallback) => {
    callback(new Blob(["png"], { type: "image/png" }));
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

  // Pointer capture is part of the drawing path and jsdom implements none of it.
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);

  return context;
}

/** An <img> that reports a size as soon as a src is set, so `loadImage` resolves. */
function stubImageLoads({ fail = false } = {}) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 1000;
    naturalHeight = 500;
    set src(_value: string) {
      queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
    }
  }
  global.Image = FakeImage as unknown as typeof Image;
}

function stubObjectUrls() {
  const revoke = jest.fn();
  URL.createObjectURL = jest.fn(() => "blob:preview") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  return revoke;
}

/** Queues the responses the screen will receive, in order. */
function mockApi(...responses: { ok?: boolean; body: unknown }[]) {
  const fetchMock = jest.fn();
  for (const { ok = true, body } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const profileFile = () => new File(["photo"], "face.png", { type: "image/png" });

/** Fills the form to the point where it can be submitted, and picks a profile image. */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Client name/), "Shivam Pandey");
  await user.type(screen.getByLabelText(/Client review comment/), "A genuinely useful platform for research.");
  await user.upload(screen.getByLabelText(/Client profile image/), profileFile());
  await screen.findByAltText("Adjusted profile preview");
}

/**
 * Submits the form directly rather than by clicking the button.
 *
 * jsdom decides a `required` file input is still empty even after userEvent has put a file on it,
 * so a click is swallowed by constraint validation that a real browser would pass. The handler
 * under test is the same either way; only the gate in front of it is wrong here.
 */
function submitForm() {
  fireEvent.submit(screen.getByRole("button", { name: /Publish review|Publishing/ }).closest("form") as HTMLFormElement);
}

beforeEach(() => {
  stubCanvas();
  stubImageLoads();
  stubObjectUrls();
});

describe("AdminClientReviews", () => {
  it("says so while the published reviews are still loading", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<AdminClientReviews />);

    expect(screen.getByText("Loading client reviews...")).toBeInTheDocument();
  });

  it("lists what has been published, with its rating and signature", async () => {
    mockApi({ body: { reviews: [review] } });
    render(<AdminClientReviews />);

    expect(await screen.findByText("Shivam Pandey")).toBeInTheDocument();
    expect(screen.getByText("Research analyst, Mainpuri - UP")).toBeInTheDocument();
    expect(screen.getByText("1 live")).toBeInTheDocument();
    expect(screen.getByAltText("Shivam Pandey profile")).toHaveAttribute("src", review.photo);
    expect(screen.getByAltText("Shivam Pandey signature")).toHaveAttribute("src", review.signatureImage);
  });

  it("falls back to the typed signature when no signature image was uploaded", async () => {
    mockApi({ body: { reviews: [unsignedReview] } });
    render(<AdminClientReviews />);

    expect(await screen.findByText("Gaurav")).toBeInTheDocument();
    expect(screen.queryByAltText("Gaurav Pandey signature")).not.toBeInTheDocument();
  });

  // There is no built-in fallback review any more — the section leaves the landing page entirely
  // when nothing is published, and the admin has to be told that rather than the opposite.
  it("says the section stays off the page while nothing is published", async () => {
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);

    expect(await screen.findByText(/The review section stays off the landing page until one is/)).toBeInTheDocument();
    expect(screen.getByText("0 live")).toBeInTheDocument();
  });

  it("sends the admin's credentials when it loads", async () => {
    const api = mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);

    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith("/api/admin/client-reviews", {
      headers: { Authorization: "Bearer admin-token" },
    });
  });

  it("surfaces the service's own reason for refusing the list", async () => {
    mockApi({ ok: false, body: { error: "Admin access required." } });
    render(<AdminClientReviews />);

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
  });

  it("falls back to its own wording when the refusal carries none", async () => {
    mockApi({ ok: false, body: {} });
    render(<AdminClientReviews />);

    expect(await screen.findByText("Could not load client reviews.")).toBeInTheDocument();
  });

  it("reports a service it could not reach at all", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    render(<AdminClientReviews />);

    expect(await screen.findByText("Could not reach the client review service.")).toBeInTheDocument();
  });

  it("offers a free-text role only once Custom is chosen", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    expect(screen.queryByLabelText(/Custom role/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Role/), "Custom");
    expect(screen.getByLabelText(/Custom role/)).toBeInTheDocument();
  });

  it("shows the crop controls only once a profile image is picked", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText(/Client profile image/), profileFile());

    expect(await screen.findByAltText("Adjusted profile preview")).toHaveAttribute("src", "blob:preview");
    expect(screen.getByLabelText("Zoom")).toBeInTheDocument();
  });

  it("moves the preview as the crop is adjusted", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");
    await user.upload(screen.getByLabelText(/Client profile image/), profileFile());
    await screen.findByAltText("Adjusted profile preview");

    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Horizontal position"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Vertical position"), { target: { value: "-5" } });

    expect(screen.getByAltText("Adjusted profile preview")).toHaveStyle({
      transform: "translate(10%, -5%) scale(1.5)",
    });
  });

  // The object URL backing the preview has to be released when the picture is replaced, or every
  // re-pick leaks a blob for the life of the page.
  it("releases the previous preview URL when another image is picked", async () => {
    const user = userEvent.setup();
    const revoke = stubObjectUrls();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    await user.upload(screen.getByLabelText(/Client profile image/), profileFile());
    await screen.findByAltText("Adjusted profile preview");
    await user.upload(screen.getByLabelText(/Client profile image/), new File(["b"], "other.png", { type: "image/png" }));

    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:preview"));
  });

  it("moves the star rating with its slider", async () => {
    mockApi({ body: { reviews: [] } });
    const { container } = render(<AdminClientReviews />);
    await screen.findByText("0 live");

    fireEvent.change(screen.getByLabelText("Client star rating"), { target: { value: "3" } });

    // Three amber stars in the rating block, two grey.
    const stars = container.querySelectorAll("form svg");
    expect([...stars].filter((star) => star.classList.contains("fill-amber-400"))).toHaveLength(3);
  });

  it("draws a signature onto the canvas and clears it again", async () => {
    const user = userEvent.setup();
    const context = stubCanvas();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    const canvas = screen.getByLabelText("Draw client signature");
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    expect(context.beginPath).toHaveBeenCalled();
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Clear signature" }));
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 620, 220);
  });

  it("ignores pointer movement when no stroke is in progress", async () => {
    const context = stubCanvas();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    fireEvent.pointerMove(screen.getByLabelText("Draw client signature"), { pointerId: 1, clientX: 40, clientY: 30 });

    expect(context.lineTo).not.toHaveBeenCalled();
  });

  it("publishes the review and clears the form", async () => {
    const user = userEvent.setup();
    const api = mockApi({ body: { reviews: [] } }, { body: { reviews: [review] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    await fillForm(user);
    submitForm();

    expect(await screen.findByText("Client review published on the landing page.")).toBeInTheDocument();
    expect(await screen.findByText("Shivam Pandey")).toBeInTheDocument();

    const [, init] = api.mock.calls[1];
    expect(init.method).toBe("POST");
    const sent = init.body as FormData;
    expect(sent.get("rating")).toBe("5");
    expect(sent.get("role")).toBe("Investor");
    // The profile is re-uploaded as the cropped canvas export, not the file the admin chose.
    expect((sent.get("profile") as File).name).toBe("profile-adjusted.png");
  });

  it("sends the drawn signature in place of an uploaded one", async () => {
    const user = userEvent.setup();
    const api = mockApi({ body: { reviews: [] } }, { body: { reviews: [review] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    const canvas = screen.getByLabelText("Draw client signature");
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    await fillForm(user);
    submitForm();

    await screen.findByText("Client review published on the landing page.");
    const sent = api.mock.calls[1][1].body as FormData;
    expect((sent.get("signatureImage") as File).name).toBe("signature-live.png");
  });

  it("sends the typed custom role rather than the word Custom", async () => {
    const user = userEvent.setup();
    const api = mockApi({ body: { reviews: [] } }, { body: { reviews: [review] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    await user.selectOptions(screen.getByLabelText(/^Role/), "Custom");
    await user.type(screen.getByLabelText(/Custom role/), "  Family office  ");
    await fillForm(user);
    submitForm();

    await screen.findByText("Client review published on the landing page.");
    expect((api.mock.calls[1][1].body as FormData).get("role")).toBe("Family office");
  });

  it("refuses to publish without a profile image, and says why", async () => {
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    submitForm();

    expect(await screen.findByText("Could not upload the client review.")).toBeInTheDocument();
  });

  it("surfaces the reason the service rejected a publish", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } }, { ok: false, body: { error: "Comment must be at least 20 characters." } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    await fillForm(user);
    submitForm();

    expect(await screen.findByText("Comment must be at least 20 characters.")).toBeInTheDocument();
  });

  it("falls back to its own wording when a rejected publish carries no reason", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } }, { ok: false, body: {} });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    await fillForm(user);
    submitForm();

    expect(await screen.findByText("Could not save the client review.")).toBeInTheDocument();
  });

  it("deletes a published review", async () => {
    const user = userEvent.setup();
    const api = mockApi({ body: { reviews: [review] } }, { body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("Shivam Pandey");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Client review removed from the landing page.")).toBeInTheDocument();
    const [, init] = api.mock.calls[1];
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ id: "review_1" });
  });

  it("surfaces the reason a delete was refused", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [review] } }, { ok: false, body: { error: "That review is already gone." } });
    render(<AdminClientReviews />);
    await screen.findByText("Shivam Pandey");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("That review is already gone.")).toBeInTheDocument();
  });

  it("falls back to its own wording when a refused delete carries no reason", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [review] } }, { ok: false, body: {} });
    render(<AdminClientReviews />);
    await screen.findByText("Shivam Pandey");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Could not delete the client review.")).toBeInTheDocument();
  });

  it("reports a delete it could not send at all", async () => {
    const user = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ reviews: [review] }) })
      .mockRejectedValueOnce(new Error("offline"));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<AdminClientReviews />);
    await screen.findByText("Shivam Pandey");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Could not reach the client review service.")).toBeInTheDocument();
  });

  // Each of the three endpoints answers with a list; a body without one leaves the screen empty
  // rather than throwing on `undefined.map`.
  it("treats a response with no list as an empty one", async () => {
    const user = userEvent.setup();
    mockApi({ body: {} }, { body: {} });
    render(<AdminClientReviews />);

    expect(await screen.findByText("0 live")).toBeInTheDocument();

    await fillForm(user);
    submitForm();

    expect(await screen.findByText("Client review published on the landing page.")).toBeInTheDocument();
    expect(screen.getByText("0 live")).toBeInTheDocument();
  });

  it("treats a delete response with no list as an empty one", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [review] } }, { body: {} });
    render(<AdminClientReviews />);
    await screen.findByText("Shivam Pandey");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Client review removed from the landing page.")).toBeInTheDocument();
    expect(screen.getByText("0 live")).toBeInTheDocument();
  });

  it("drops the preview when the picker is cleared", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    const picker = screen.getByLabelText(/Client profile image/) as HTMLInputElement;
    await user.upload(picker, profileFile());
    await screen.findByAltText("Adjusted profile preview");

    fireEvent.change(picker, { target: { files: [] } });

    await waitFor(() => expect(screen.queryByAltText("Adjusted profile preview")).not.toBeInTheDocument());
  });

  it("says so when the chosen image cannot be read", async () => {
    const user = userEvent.setup();
    stubImageLoads({ fail: true });
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    await fillForm(user);
    submitForm();

    expect(await screen.findByText("Could not upload the client review.")).toBeInTheDocument();
  });

  it("says so when the browser gives it no drawing surface", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");
    await fillForm(user);

    HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    submitForm();

    expect(await screen.findByText("Could not upload the client review.")).toBeInTheDocument();
  });

  it("says so when the cropped image cannot be exported", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");
    await fillForm(user);

    HTMLCanvasElement.prototype.toBlob = jest.fn((callback: BlobCallback) => {
      callback(null);
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;
    submitForm();

    expect(await screen.findByText("Could not upload the client review.")).toBeInTheDocument();
  });

  it("does nothing when asked to clear a signature it cannot reach", async () => {
    const user = userEvent.setup();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    const context = stubCanvas();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    await user.click(screen.getByRole("button", { name: "Clear signature" }));

    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it("starts no stroke when there is no drawing surface", async () => {
    const context = stubCanvas();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    fireEvent.pointerDown(screen.getByLabelText("Draw client signature"), { pointerId: 1, clientX: 5, clientY: 5 });

    expect(context.beginPath).not.toHaveBeenCalled();
  });

  // The surface can go away mid-stroke — the stroke is already in progress, so the guard inside
  // the move handler is a different one from the guard that starts it.
  it("stops drawing when the surface goes away mid-stroke", async () => {
    const context = stubCanvas();
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    const canvas = screen.getByLabelText("Draw client signature");
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    expect(context.beginPath).toHaveBeenCalled();

    HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 20 });

    expect(context.lineTo).not.toHaveBeenCalled();
  });

  it("releases nothing when the pointer was never captured", async () => {
    stubCanvas();
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    const release = Element.prototype.releasePointerCapture as jest.Mock;
    mockApi({ body: { reviews: [] } });
    render(<AdminClientReviews />);
    await screen.findByText("0 live");

    fireEvent.pointerUp(screen.getByLabelText("Draw client signature"), { pointerId: 1 });

    expect(release).not.toHaveBeenCalled();
  });
});
