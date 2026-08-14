/**
 * Structured data, rendered into the page as JSON-LD.
 *
 * The schemas themselves live in `lib/seo` as plain objects; this only puts one on the page. It is
 * a Server Component with no state and no interactivity — the script tag it writes is read by
 * crawlers and never by the browser, so nothing about it needs to reach the client bundle.
 */
export function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Escaped, and the escape is not decoration.
      //
      // JSON.stringify does not escape `<`, so any string in the graph containing `</script>` ends
      // the tag early and everything after it is parsed as HTML — the classic JSON-in-HTML
      // injection. The values here come from our own modules today, but `lib/policy` and the plan
      // labels are the kind of thing that gets wired to a database eventually, and by then nobody
      // will remember this tag was the reason it mattered. `<` is valid inside a JSON string
      // and parses back to `<`, so the data is unchanged and the tag cannot be broken out of.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
    />
  );
}
