/** What a blog post is, and the states it can be in. */
export type BlogPostStatus = "draft" | "approved" | "published";

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string | null;
  bodyMarkdown: string;
  authorName: string;
  status: BlogPostStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  createdBy: string | null;
};

/**
 * The only moves a post can make: draft -> approved -> published, with `reject` and `unpublish`
 * as the ways back. There is no `draft -> published` action — publishing always passes through an
 * approval step first.
 */
export type BlogTransitionAction = "approve" | "publish" | "reject" | "unpublish";

export const BLOG_TRANSITION_ACTIONS: BlogTransitionAction[] = ["approve", "publish", "reject", "unpublish"];
