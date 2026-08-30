import { renderPostHtml } from "../../app/lib/blog-markdown";

describe("renderPostHtml", () => {
  it("renders headings", () => {
    expect(renderPostHtml("# Hello")).toContain("<h1>Hello</h1>");
  });

  it("renders paragraphs and bold text", () => {
    const html = renderPostHtml("This is **bold** text.");
    expect(html).toContain("<p>This is <strong>bold</strong> text.</p>");
  });

  it("renders links", () => {
    const html = renderPostHtml("[StockersAI](https://stockersai.com)");
    expect(html).toContain('<a href="https://stockersai.com">StockersAI</a>');
  });

  it("renders lists", () => {
    const html = renderPostHtml("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
  });
});
