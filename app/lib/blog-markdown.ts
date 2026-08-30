import { marked } from "marked";

/**
 * Renders a post's Markdown body to HTML.
 *
 * No sanitization pass on the output — every author is an admin, and an admin already has strictly
 * more powerful levers elsewhere in the dashboard (raw log access, role changes, feature kill
 * switches) than anything a blog post body could do. See the design spec's decision log.
 */
export function renderPostHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
