# Blog workflow design

Date: 2026-08-30
Status: Approved by user, pending implementation plan

## Summary

Add a blog subsystem to StockersAI: a public `/blog` listing and `/blog/[slug]`
detail page, a "Blog" link in the header nav, an admin authoring/moderation UI,
and removal of the landing page's "Client reviews" section. Posts move through
an explicit `draft -> approved -> published` workflow; only `published` posts
are ever visible to the public.

## Non-goals

- No new user role. Create/approve/publish all stay behind the existing
  `admin` role — this mirrors how every other admin surface in the app works
  (`admin/users`, `admin/client-reviews`) and avoids adding a role dimension
  the rest of the app doesn't have.
- No file-backend fallback for blog posts. Unlike `store.ts`'s users table,
  blog posts require Supabase to be configured; there is no JSON-file
  fallback. This was an explicit tradeoff (see decision log) — local dev
  without Supabase credentials will not have a working blog admin.
- No WYSIWYG editor. Authoring is a plain Markdown textarea.
- No HTML sanitization pass on rendered Markdown. Authors are always admins,
  who already have strictly more powerful levers elsewhere in the admin panel
  (raw log access, user role changes, feature-flag kill switches), so a
  compromised admin session is not meaningfully more dangerous via a blog
  post body than via those existing surfaces.
- No cover-image upload. Cover image is a plain URL field (admin pastes a
  link to an already-hosted image) — this sidesteps the filesystem-write
  problem that `client-reviews.ts` already has in production (see its own
  header comment on serverless read-only directories) without introducing a
  new file-storage integration.

## Data model

New Supabase table `blog_posts`, defined in `supabase/schema.sql` next to the
existing `users` table, with RLS enabled and no policies granting the `anon`
role anything — reached only through the service-role key from server code,
exactly like `users`.

| column | type | notes |
|---|---|---|
| `id` | text, PK | `post_<time36>_<rand8hex>`, same shape as `AppUser.id` |
| `title` | text, not null | |
| `slug` | text, unique, not null | URL segment; auto-suggested from title, admin-editable |
| `excerpt` | text, not null | short summary shown in the list view |
| `cover_image_url` | text, nullable | |
| `body_markdown` | text, not null | |
| `author_name` | text, not null | free text byline, no FK — there's no author role |
| `status` | text, not null | `draft` \| `approved` \| `published` |
| `created_at` | timestamptz, not null | |
| `updated_at` | timestamptz, not null | bumped on every edit |
| `approved_at` | timestamptz, nullable | set on draft->approved |
| `published_at` | timestamptz, nullable | set on approved->published, cleared on unpublish |
| `created_by` | text, nullable | admin user id, for the audit trail |

## Workflow / state machine

```
draft --approve--> approved --publish--> published
  ^                    |                     |
  |                    v                     v
  +---------------  reject             unpublish
```

Valid transitions only: `draft -> approved`, `approved -> published`,
`approved -> draft` (reject), `published -> draft` (unpublish). No direct
`draft -> published` — this is the explicit two-step gate the user asked for.
Content fields (`title`, `excerpt`, `cover_image_url`, `body_markdown`) are
editable in any state; editing does not change `status`.

Every transition and content edit is recorded with the existing
`logAuditEvent` helper (see `admin/users/route.ts` for the pattern), tagged
with `useCase: "Blog administration"`.

## Routes

**Public (no auth, server components, direct `lib/blog.ts` calls — no API
route needed for reads):**
- `app/blog/page.tsx` — lists posts where `status = published`, ordered by
  `published_at desc`.
- `app/blog/[slug]/page.tsx` — single post; calls `notFound()` if the slug
  doesn't exist or isn't `published` (prevents guessing draft URLs).

**Admin:**
- `app/(admin)/posts/page.tsx` — renders `<SuperAdminDashboard active="blog" />`,
  a new tab alongside the existing Reviews/Users/etc. tabs.
  Path is `/posts`, not `/blog`, because the `(admin)` route group carries no
  URL prefix — an admin page named `/blog` would collide with the public
  route at the same path.
  `/posts` is added to `ADMIN_ROUTE_PATHS` in `lib/section-routes.ts` so
  `isAdminPath` and the traffic-exclusion trackers pick it up, same as every
  other admin page.
- `app/api/admin/blog/route.ts` — `requireAdmin` gate mirrored from
  `admin/users/route.ts` (checks `user.role === "admin"`):
  - `GET` — every post, any status, newest `updated_at` first.
  - `POST` — creates a `draft` (title, excerpt, cover_image_url, body_markdown,
    author_name in the body; slug derived from title server-side, ensuring
    uniqueness by suffixing `-2`, `-3`, ... on collision).
  - `PATCH` — id in body; either a content edit (any subset of the editable
    fields) or a `{ action: "approve" | "publish" | "reject" | "unpublish" }`
    transition, validated against the state machine above and rejected with
    400 if not a legal transition from the post's current status.
  - `DELETE` — id in body.

## Header nav change

`navLinks` in `app/page.tsx` gets one more entry — `{ href: "/blog", label:
"Blog" }` — added directly to the array, not routed through
`HOME_SECTION_ROUTES`/`visitorNavOrder`, because Blog is a standalone page,
not an anchor section rendered inline on the landing page the way Pricing or
Accuracy are. `MobileNav` already accepts a generic `{href,label}[]`, so no
changes needed there.

## Client reviews section

`<StreamedClientReviews />` is removed from `LandingStack` in `app/page.tsx`.
The component, its API routes, and its data file are left in place —
hiding, not deleting, since there's no request to remove the underlying
feature, only to stop showing it on the landing page.

## Rendering

No Markdown library exists in the repo yet. Adding `marked` (small, zero
dependencies) to `package.json`, used only in the public post page to render
`body_markdown` to HTML before `dangerouslySetInnerHTML`.

## Admin UI

New `app/components/admin-blog.tsx`, structurally mirroring
`app/components/admin-client-reviews.tsx`: a table of posts (title, status
badge, updated date, author) with row actions gated by current status
(Edit always; Approve only from `draft`; Publish only from `approved`;
Reject only from `approved`; Unpublish only from `published`; Delete always),
plus a create form (title, excerpt, cover image URL, author name, Markdown
textarea). `super-admin-dashboard.tsx` gets `"blog"` added to its tab-id
union, a nav entry pointing at `/posts`, and a case in its render switch.

## Testing

- `test/lib/blog.test.ts` — the state-machine transition function: every
  legal transition succeeds and sets the right timestamp; every illegal one
  (e.g. `draft -> published`) is rejected.
- `test/lib/admin-blog-route.test.ts` — the API route's `requireAdmin` gate
  (non-admin gets 403; admin gets through), following the shape of the
  existing `test/lib/admin-users-route.test.ts`.

## Decision log

- Single admin role, not a new author role — user's explicit choice, to
  avoid adding a role dimension the rest of the app doesn't have.
- Supabase-only storage, no file-backend fallback — user's explicit choice,
  trading local-dev-without-credentials support for simpler code (one
  backend instead of two kept in sync).
- Markdown over plain text or WYSIWYG — user's explicit choice, balancing
  authoring expressiveness against implementation cost.
- No sanitization pass on rendered Markdown — proposed and confirmed with
  the user given the existing admin trust model.
- Cover image as a URL field rather than an upload — not asked directly, but
  follows from avoiding the same serverless-filesystem-write problem
  `client-reviews.ts` already documents having, without pulling in a new
  file-storage integration to solve it for this feature alone.
