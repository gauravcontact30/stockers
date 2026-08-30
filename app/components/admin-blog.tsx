"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlogPost, BlogPostStatus, BlogTransitionAction } from "../lib/blog-post";
import { authHeaders } from "./subscription-provider";

const STATUS_STYLE: Record<BlogPostStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  approved: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const ACTIONS_FOR_STATUS: Record<BlogPostStatus, { action: BlogTransitionAction; label: string }[]> = {
  draft: [{ action: "approve", label: "Approve" }],
  approved: [
    { action: "publish", label: "Publish" },
    { action: "reject", label: "Reject" },
  ],
  published: [{ action: "unpublish", label: "Unpublish" }],
};

function inputClassName() {
  return "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
}

export function AdminBlog() {
  const formRef = useRef<HTMLFormElement>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/blog", { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not load blog posts.");
        return;
      }
      setPosts(data.posts ?? []);
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state updates happen after the async request resolves.
    load();
  }, [load]);

  const submitDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: form.get("title"),
          excerpt: form.get("excerpt"),
          coverImageUrl: form.get("coverImageUrl"),
          bodyMarkdown: form.get("bodyMarkdown"),
          authorName: form.get("authorName"),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not create the blog post.");
        return;
      }
      setPosts(data.posts ?? []);
      formRef.current?.reset();
      setMessage("Draft created.");
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (post: BlogPost, action: BlogTransitionAction) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/blog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: post.id, action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not update the post.");
        return;
      }
      setPosts(data.posts ?? []);
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (post: BlogPost) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/blog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: post.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not delete the post.");
        return;
      }
      setPosts(data.posts ?? []);
      setMessage("Post deleted.");
    } catch {
      setError("Could not reach the blog service.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading blog posts...</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <form ref={formRef} onSubmit={submitDraft} className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Write a post</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Saves as a draft. Approve, then publish it from the list once it&apos;s ready for the blog.
        </p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Title
          <input name="title" required className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Excerpt
          <input name="excerpt" required className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Author name
          <input name="authorName" required className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Cover image URL (optional)
          <input name="coverImageUrl" type="url" placeholder="https://..." className={inputClassName()} />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Body (Markdown)
          <textarea name="bodyMarkdown" required rows={10} className={inputClassName()} />
        </label>

        {error && (
          <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {message}
          </p>
        )}

        <button type="submit" disabled={busy} className="mt-5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "Saving..." : "Create draft"}
        </button>
      </form>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Posts</h2>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {posts.length} total
          </span>
        </div>

        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No posts yet. Write one on the left.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {posts.map((post) => (
              <div key={post.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">{post.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{post.authorName} · /blog/{post.slug}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[post.status]}`}>{post.status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{post.excerpt}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ACTIONS_FOR_STATUS[post.status].map(({ action, label }) => (
                    <button
                      key={action}
                      type="button"
                      disabled={busy}
                      onClick={() => transition(post, action)}
                      className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-300"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(post)}
                    className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-400 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
