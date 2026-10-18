import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/** Convierte Markdown a HTML y lo sanea: el contenido lo escriben usuarios. */
export function markdownSeguro(texto: string): string {
  const html = marked.parse(texto, { async: false, gfm: true, breaks: true });
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "img"]),
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
  });
}
