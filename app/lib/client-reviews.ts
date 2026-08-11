import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { type ClientReview } from "./client-review";

const dataPath = path.join(process.cwd(), "app", "data", "client-reviews.json");
const uploadDir = path.join(process.cwd(), "public", "uploads", "client-reviews");
const publicPrefix = "/uploads/client-reviews";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const ACCENTS = [
  "from-rose-500 via-orange-300 to-amber-300",
  "from-emerald-500 via-teal-300 to-sky-300",
  "from-sky-500 via-indigo-300 to-violet-300",
  "from-fuchsia-500 via-rose-300 to-orange-300",
  "from-cyan-500 via-blue-300 to-emerald-300",
  "from-violet-500 via-purple-300 to-pink-300",
] as const;

async function ensureStore() {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  try {
    await fs.access(dataPath);
  } catch {
    await fs.writeFile(dataPath, "[]", "utf8");
  }
  await fs.mkdir(uploadDir, { recursive: true });
}

function stringField(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function extensionFor(file: File): string | null {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return byType[file.type] ?? null;
}

async function saveImage(file: File, id: string, kind: "profile" | "signature"): Promise<string> {
  const extension = extensionFor(file);
  if (!extension) throw new Error(`${kind} image must be JPG, PNG, WebP, GIF or SVG.`);
  if (file.size <= 0) throw new Error(`${kind} image is empty.`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${kind} image must be 3 MB or smaller.`);

  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `${id}-${kind}.${extension}`;
  const target = path.join(uploadDir, filename);
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
  return `${publicPrefix}/${filename}`;
}

/**
 * Reads the published reviews from disk, every time.
 *
 * There was a module-level cache here, and it was the reason a freshly published review did not
 * appear on the site. It was populated on first read and never expired: the only thing that ever
 * refreshed it was a write in the *same* process. A deployment runs more than one process — and
 * serverless runs many — so an instance that had already served the landing page went on serving
 * the old list indefinitely, and whether a visitor saw a new review came down to which instance
 * answered them. Reading a small JSON file is cheap next to that, and freshness is now controlled
 * where it belongs: Next caches the rendered page, and publishing revalidates it.
 */
async function readUploadedReviews(): Promise<ClientReview[]> {
  await ensureStore();
  const raw = await fs.readFile(dataPath, "utf8");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((review): review is ClientReview => {
      if (!review || typeof review !== "object") return false;
      const item = review as Partial<ClientReview>;
      return Boolean(item.id && item.name && item.photo && item.comment && item.rating);
    });
  } catch {
    return [];
  }
}

async function writeUploadedReviews(reviews: ClientReview[]) {
  await ensureStore();
  await fs.writeFile(dataPath, JSON.stringify(reviews, null, 2), "utf8");
}

/** Every review the admin has published, newest first. Nothing is invented to pad the list. */
export async function listClientReviews(): Promise<ClientReview[]> {
  return readUploadedReviews();
}

export async function createClientReview(form: FormData): Promise<ClientReview> {
  const name = stringField(form, "name");
  const location = stringField(form, "location");
  const role = stringField(form, "role");
  const comment = stringField(form, "comment");
  const signature = stringField(form, "signature") || name.split(" ")[0] || "Client";
  const rating = Number(stringField(form, "rating"));
  const profile = form.get("profile");
  const signatureImage = form.get("signatureImage");

  if (!name) throw new Error("Client name is required.");
  if (!comment || comment.length < 20) throw new Error("Client review comment must be at least 20 characters.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Star rating must be between 1 and 5.");
  if (!(profile instanceof File)) throw new Error("Client profile image is required.");

  const id = `review_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const uploaded = await readUploadedReviews();
  const review: ClientReview = {
    id,
    name,
    location: location || "India",
    role: role || "Investor",
    photo: await saveImage(profile, id, "profile"),
    accent: ACCENTS[uploaded.length % ACCENTS.length],
    comment,
    signature,
    signatureImage: signatureImage instanceof File && signatureImage.size > 0 ? await saveImage(signatureImage, id, "signature") : null,
    rating,
    createdAt: new Date().toISOString(),
  };

  await writeUploadedReviews([review, ...uploaded]);
  return review;
}

export async function deleteClientReview(id: string): Promise<boolean> {
  const uploaded = await readUploadedReviews();
  const target = uploaded.find((review) => review.id === id);
  const next = uploaded.filter((review) => review.id !== id);
  if (!target || next.length === uploaded.length) return false;

  await writeUploadedReviews(next);

  for (const url of [target.photo, target.signatureImage].filter(Boolean) as string[]) {
    if (!url.startsWith(publicPrefix)) continue;
    const file = path.join(process.cwd(), "public", url);
    await fs.unlink(file).catch(() => undefined);
  }

  return true;
}
