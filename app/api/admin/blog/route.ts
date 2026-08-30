import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createPost, deletePost, listAllPosts, transitionBlogPost, updatePost, type BlogPostEdit } from "../../../lib/blog";
import { BLOG_TRANSITION_ACTIONS, type BlogTransitionAction } from "../../../lib/blog-post";
import { logAuditEvent } from "../../../lib/application-logger";
import { userFromRequest, type AppUser } from "../../../lib/store";

async function requireAdmin(request: Request): Promise<AppUser | null> {
  const user = await userFromRequest(request);
  return user && user.role === "admin" ? user : null;
}

const forbidden = () => NextResponse.json({ error: "Admin access required." }, { status: 403 });

function revalidatePublicPages(slug: string) {
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();
  return NextResponse.json({ posts: await listAllPosts() });
}

type CreateBody = { title?: unknown; excerpt?: unknown; coverImageUrl?: unknown; bodyMarkdown?: unknown; authorName?: unknown };

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { title, excerpt, coverImageUrl, bodyMarkdown, authorName } = body;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (typeof excerpt !== "string" || !excerpt.trim()) {
    return NextResponse.json({ error: "An excerpt is required." }, { status: 400 });
  }
  if (typeof bodyMarkdown !== "string" || bodyMarkdown.trim().length < 20) {
    return NextResponse.json({ error: "Post body must be at least 20 characters." }, { status: 400 });
  }
  if (typeof authorName !== "string" || !authorName.trim()) {
    return NextResponse.json({ error: "An author name is required." }, { status: 400 });
  }

  const post = await createPost({
    title: title.trim(),
    excerpt: excerpt.trim(),
    coverImageUrl: typeof coverImageUrl === "string" && coverImageUrl.trim() ? coverImageUrl.trim() : null,
    bodyMarkdown,
    authorName: authorName.trim(),
    createdBy: admin.id,
  });

  logAuditEvent({
    useCase: "Blog administration",
    operation: "blog.create",
    message: "Admin created a blog post draft.",
    userId: admin.id,
    statusCode: 200,
    path: new URL(request.url).pathname,
    method: request.method,
    metadata: { postId: post.id, slug: post.slug },
  });

  return NextResponse.json({ ok: true, post, posts: await listAllPosts() });
}

type PatchBody = {
  id?: unknown;
  action?: unknown;
  title?: unknown;
  excerpt?: unknown;
  coverImageUrl?: unknown;
  bodyMarkdown?: unknown;
  authorName?: unknown;
};

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { id, action } = body;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "A post id is required." }, { status: 400 });
  }

  if (typeof action === "string" && action) {
    if (!BLOG_TRANSITION_ACTIONS.includes(action as BlogTransitionAction)) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const updated = await transitionBlogPost(id, action as BlogTransitionAction);
    if (!updated) {
      return NextResponse.json(
        { error: "That action is not valid for the post's current status, or the post doesn't exist." },
        { status: 400 },
      );
    }

    logAuditEvent({
      useCase: "Blog administration",
      operation: `blog.${action}`,
      message: `Admin ${action}d a blog post.`,
      userId: admin.id,
      statusCode: 200,
      path: new URL(request.url).pathname,
      method: request.method,
      metadata: { postId: updated.id, slug: updated.slug, status: updated.status },
    });

    revalidatePublicPages(updated.slug);
    return NextResponse.json({ ok: true, post: updated, posts: await listAllPosts() });
  }

  const { title, excerpt, coverImageUrl, bodyMarkdown, authorName } = body;
  const patch: BlogPostEdit = {};
  if (typeof title === "string" && title.trim()) patch.title = title.trim();
  if (typeof excerpt === "string" && excerpt.trim()) patch.excerpt = excerpt.trim();
  if (typeof coverImageUrl === "string") patch.coverImageUrl = coverImageUrl.trim() || null;
  if (typeof bodyMarkdown === "string" && bodyMarkdown.trim().length >= 20) patch.bodyMarkdown = bodyMarkdown;
  if (typeof authorName === "string" && authorName.trim()) patch.authorName = authorName.trim();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const updated = await updatePost(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "No such post." }, { status: 404 });
  }

  logAuditEvent({
    useCase: "Blog administration",
    operation: "blog.edit",
    message: "Admin edited a blog post.",
    userId: admin.id,
    statusCode: 200,
    path: new URL(request.url).pathname,
    method: request.method,
    metadata: { postId: updated.id, changedFields: Object.keys(patch) },
  });

  if (updated.status === "published") revalidatePublicPages(updated.slug);
  return NextResponse.json({ ok: true, post: updated, posts: await listAllPosts() });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "A post id is required." }, { status: 400 });
  }

  const deleted = await deletePost(body.id);
  if (!deleted) {
    return NextResponse.json({ error: "No such post." }, { status: 404 });
  }

  logAuditEvent({
    useCase: "Blog administration",
    operation: "blog.delete",
    message: "Admin deleted a blog post.",
    userId: admin.id,
    statusCode: 200,
    path: new URL(request.url).pathname,
    method: request.method,
    metadata: { postId: body.id },
  });

  revalidatePath("/blog");
  return NextResponse.json({ ok: true, posts: await listAllPosts() });
}
