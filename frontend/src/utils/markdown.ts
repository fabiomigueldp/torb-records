// frontend/src/utils/markdown.ts

import DOMPurify from 'dompurify';

/**
 * Parses a markdown string for **bold** and [link text](url) syntax
 * and converts it to HTML.
 * Links will open in a new tab.
 * Uses DOMPurify to sanitize the output.
 * @param markdownText The markdown text to parse.
 * @returns Sanitized HTML string.
 */
export const parseSimpleMarkdown = (markdownText: string): string => {
  if (!markdownText) {
    return '';
  }

  let html = markdownText;

  // Escape HTML special characters first to prevent XSS from markdown content itself
  // before we insert our own HTML tags.
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*|__(.*?)__/g, (match, g1, g2) => `<strong>${g1 || g2}</strong>`);

  // Links: [link text](url)
  // Ensure that the URL part is not overly greedy and handles parentheses in URL correctly (basic).
  // For URLs, we are a bit more careful and try to ensure it's a http/https URL.
  html = html.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Sanitize the generated HTML to prevent XSS if the input somehow bypasses the initial escaping
  // or if more complex markdown features were to be added later.
  // DOMPurify is configured to allow <strong> and <a> tags with specific attributes.
  const cleanHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ['strong', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel']
  });

  return cleanHtml;
};
