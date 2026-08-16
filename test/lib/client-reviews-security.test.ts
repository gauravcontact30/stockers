/** @jest-environment node */

import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

async function loadInTempStore() {
  jest.resetModules();
  const root = await mkdtemp(join(tmpdir(), "stockers-reviews-"));
  process.env.STOCKERS_CLIENT_REVIEWS_FILE = join(root, "reviews.json");
  process.env.STOCKERS_CLIENT_REVIEWS_UPLOAD_DIR = join(root, "uploads");
  process.env.STOCKERS_CLIENT_REVIEWS_PUBLIC_PREFIX = "/test-uploads";
  const module = await import("../../app/lib/client-reviews");
  return { root, createClientReview: module.createClientReview };
}

function formWith(file: File): FormData {
  const form = new FormData();
  form.set("name", "Aarav Mehta");
  form.set("location", "Mumbai");
  form.set("role", "Investor");
  form.set("comment", "This is a realistic client review comment.");
  form.set("signature", "Aarav");
  form.set("rating", "5");
  form.set("profile", file);
  return form;
}

afterEach(() => {
  delete process.env.STOCKERS_CLIENT_REVIEWS_FILE;
  delete process.env.STOCKERS_CLIENT_REVIEWS_UPLOAD_DIR;
  delete process.env.STOCKERS_CLIENT_REVIEWS_PUBLIC_PREFIX;
});

describe("client review upload security", () => {
  it("rejects SVG uploads rather than storing active markup under public uploads", async () => {
    const { root, createClientReview } = await loadInTempStore();
    const svg = new File(["<svg><script>alert(1)</script></svg>"], "bad.svg", { type: "image/svg+xml" });

    await expect(createClientReview(formWith(svg))).rejects.toThrow("profile image must be JPG, PNG, WebP or GIF");
    await rm(root, { recursive: true, force: true });
  });

  it("rejects files whose bytes do not match the claimed image type", async () => {
    const { root, createClientReview } = await loadInTempStore();
    const spoofed = new File(["not a real png"], "bad.png", { type: "image/png" });

    await expect(createClientReview(formWith(spoofed))).rejects.toThrow("profile image file contents do not match its type");
    await rm(root, { recursive: true, force: true });
  });

  it("stores a valid signed image under the configured public prefix", async () => {
    const { root, createClientReview } = await loadInTempStore();
    const png = new File([PNG_BYTES], "review.png", { type: "image/png" });

    const review = await createClientReview(formWith(png));

    expect(review.photo).toMatch(/^\/test-uploads\/aarav-mehta-stockersai-review-profile-[a-f0-9]{8}\.png$/);
    await rm(root, { recursive: true, force: true });
  });
});
