"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientReview } from "../lib/client-review";
import { authHeaders } from "./subscription-provider";

const ROLE_OPTIONS = [
  "Investor",
  "Swing trader",
  "Long-term investor",
  "ETF investor",
  "Portfolio tracker",
  "Active investor",
  "Dividend tracker",
  "Research analyst",
  "Custom",
];

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 20 20"
          className={`h-4 w-4 ${index < value ? "fill-amber-400 text-amber-400" : "fill-slate-300 text-slate-300 dark:fill-slate-700 dark:text-slate-700"}`}
          aria-hidden="true"
        >
          <path d="m10 1.7 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8Z" />
        </svg>
      ))}
    </div>
  );
}

function fileInputClassName() {
  return "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-rose-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
}

function FileField({ name, label }: { name: string; label: string }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {label}
      <input
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className={fileInputClassName()}
      />
    </label>
  );
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export image."))), "image/png", 0.95);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the uploaded profile image."));
    image.src = url;
  });
}

export function AdminClientReviews() {
  const formRef = useRef<HTMLFormElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [reviews, setReviews] = useState<ClientReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [role, setRole] = useState("Investor");
  const [customRole, setCustomRole] = useState("");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState<string | null>(null);
  const [profileZoom, setProfileZoom] = useState(1);
  const [profileX, setProfileX] = useState(0);
  const [profileY, setProfileY] = useState(0);
  const [signatureDrawn, setSignatureDrawn] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/client-reviews", { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not load client reviews.");
        return;
      }
      setReviews(data.reviews ?? []);
    } catch {
      setError("Could not reach the client review service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state updates happen after the async request resolves.
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    };
  }, [profilePreviewUrl]);

  const pickProfile = (file: File | null) => {
    if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    setProfileFile(file);
    setProfilePreviewUrl(file ? URL.createObjectURL(file) : null);
    setProfileZoom(1);
    setProfileX(0);
    setProfileY(0);
  };

  const adjustedProfileBlob = async () => {
    if (!profileFile || !profilePreviewUrl) throw new Error("Client profile image is required.");

    const image = await loadImage(profilePreviewUrl);
    const outputSize = 512;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the profile image.");

    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, outputSize, outputSize);

    const baseScale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight);
    const scale = baseScale * profileZoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (outputSize - width) / 2 + (profileX / 100) * outputSize;
    const y = (outputSize - height) / 2 + (profileY / 100) * outputSize;
    context.drawImage(image, x, y, width, height);

    return blobFromCanvas(canvas);
  };

  const signatureBlob = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !signatureDrawn) return null;
    return blobFromCanvas(canvas);
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDrawn(false);
  };

  const signaturePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startSignature = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const point = signaturePoint(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#9f1239";
    context.beginPath();
    context.moveTo(point.x, point.y);
    setSignatureDrawn(true);
  };

  const moveSignature = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = signaturePoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopSignature = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const form = new FormData(event.currentTarget);
      form.set("rating", String(rating));
      form.set("role", role === "Custom" ? customRole.trim() : role);
      form.set("profile", await adjustedProfileBlob(), "profile-adjusted.png");
      const drawnSignature = await signatureBlob();
      if (drawnSignature) form.set("signatureImage", drawnSignature, "signature-live.png");

      const response = await fetch("/api/admin/client-reviews", {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not save the client review.");
        return;
      }
      setReviews(data.reviews ?? []);
      formRef.current?.reset();
      setRating(5);
      setRole("Investor");
      setCustomRole("");
      pickProfile(null);
      clearSignature();
      setMessage("Client review published on the landing page.");
    } catch {
      setError("Could not upload the client review.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (review: ClientReview) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/client-reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: review.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not delete the client review.");
        return;
      }
      setReviews(data.reviews ?? []);
      setMessage("Client review removed from the landing page.");
    } catch {
      setError("Could not reach the client review service.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading client reviews...</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <form ref={formRef} onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Upload client review</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Add the client comment, profile image, signature image and star rating. Once saved, it appears in the landing page review carousel.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Client name
            <input name="name" required className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 outline-none ring-rose-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 outline-none ring-rose-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          {role === "Custom" && (
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Custom role
              <input value={customRole} onChange={(event) => setCustomRole(event.target.value)} placeholder="Type role manually" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 outline-none ring-rose-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </label>
          )}
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Location
            <input name="location" placeholder="India" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 outline-none ring-rose-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Signature text
            <input name="signature" placeholder="Shown if no signature image is uploaded" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 outline-none ring-rose-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </label>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Client review comment
          <textarea
            name="comment"
            required
            minLength={20}
            rows={5}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 outline-none ring-rose-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Client profile image
            <input
              name="profile"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              required
              onChange={(event) => pickProfile(event.target.files?.[0] ?? null)}
              className={fileInputClassName()}
            />
          </label>
          <FileField name="signatureImage" label="Client signature image" />
        </div>

        {profilePreviewUrl && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex justify-center md:w-36">
                <div className="relative h-28 w-28 overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-inner dark:border-rose-500/30 dark:bg-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL for upload preview. */}
                  <img
                    src={profilePreviewUrl}
                    alt="Adjusted profile preview"
                    className="h-full w-full object-cover"
                    style={{
                      transform: `translate(${profileX}%, ${profileY}%) scale(${profileZoom})`,
                      transformOrigin: "center",
                    }}
                  />
                </div>
              </div>
              <div className="grid min-w-0 flex-1 gap-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Zoom
                  <input type="range" min={1} max={2.4} step={0.05} value={profileZoom} onChange={(event) => setProfileZoom(Number(event.target.value))} className="mt-1 w-full accent-rose-600" />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Horizontal position
                  <input type="range" min={-35} max={35} step={1} value={profileX} onChange={(event) => setProfileX(Number(event.target.value))} className="mt-1 w-full accent-rose-600" />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Vertical position
                  <input type="range" min={-35} max={35} step={1} value={profileY} onChange={(event) => setProfileY(Number(event.target.value))} className="mt-1 w-full accent-rose-600" />
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Live signature</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Draw here to use it instead of the uploaded signature image.</p>
            </div>
            <button type="button" onClick={clearSignature} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300">
              Clear signature
            </button>
          </div>
          <canvas
            ref={signatureCanvasRef}
            width={620}
            height={220}
            onPointerDown={startSignature}
            onPointerMove={moveSignature}
            onPointerUp={stopSignature}
            onPointerCancel={stopSignature}
            className="mt-3 h-40 w-full touch-none rounded-2xl border border-dashed border-rose-300 bg-white dark:border-rose-500/35"
            aria-label="Draw client signature"
          />
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/25 dark:bg-amber-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Star rating</p>
              <Stars value={rating} />
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
              className="w-full accent-rose-600 sm:max-w-56"
              aria-label="Client star rating"
            />
          </div>
        </div>

        {error && <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        {message && <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}

        <button type="submit" disabled={busy} className="mt-5 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50">
          {busy ? "Publishing..." : "Publish review"}
        </button>
      </form>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Uploaded reviews</h2>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {reviews.length} live
          </span>
        </div>

        {reviews.length === 0 ? (
          // There are no built-in fallback reviews any more — see the note in ../lib/client-review:
          // the landing page used to pad the rotation with an invented testimonial, and now shows
          // only what has actually been published. Telling an admin otherwise would have them
          // believe the section is populated when it is not on the page at all.
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No client reviews published yet. The review section stays off the landing page until one is.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded profile photos are stored in public/uploads. */}
                  <img src={review.photo} alt={`${review.name} profile`} className="h-16 w-16 rounded-2xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{review.name}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{review.role}, {review.location}</p>
                      </div>
                      <Stars value={review.rating} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{review.comment}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      {review.signatureImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- uploaded signature images are stored in public/uploads.
                        <img src={review.signatureImage} alt={`${review.name} signature`} className="h-10 max-w-32 object-contain" />
                      ) : (
                        <span className="text-sm italic text-slate-500 dark:text-slate-400">{review.signature}</span>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(review)}
                        className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-400 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
