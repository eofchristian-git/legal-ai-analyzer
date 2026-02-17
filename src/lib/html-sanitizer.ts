// Feature 008: Interactive Document Viewer & Redline Export
// HTML sanitization wrapper using DOMPurify

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Allows safe tags and attributes needed for document rendering
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    // Allow safe tags
    ALLOWED_TAGS: [
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Text formatting
      'p', 'div', 'span', 'br', 'hr',
      'strong', 'em', 'u', 'i', 'b', 's', 'del', 'ins',
      // Lists
      'ul', 'ol', 'li',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      // Media
      'img',
      // Links
      'a',
      // Semantic
      'article', 'section', 'aside', 'header', 'footer', 'main',
      'blockquote', 'pre', 'code',
    ],
    
    // Allow safe attributes
    ALLOWED_ATTR: [
      // General
      'class', 'id', 'style',
      // Document viewer data attributes
      'data-clause-id', 'data-clause-number', 'data-finding-id',
      'data-page', 'data-page-number', 'data-position',
      // Links
      'href', 'target', 'rel',
      // Images
      'src', 'alt', 'title', 'width', 'height',
      // Tables
      'colspan', 'rowspan',
    ],
    
    // Allow data URIs for images (base64 embedded images from Word/PDF)
    // and other safe protocols (http, https, mailto, etc.)
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    
    // Keep HTML structure
    KEEP_CONTENT: true,
    
    // Return as string
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    
    // Allow style attributes for positioning (needed for PDF rendering)
    ALLOW_UNKNOWN_PROTOCOLS: false,
    
    // Forbid dangerous tags
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    
    // Forbid dangerous attributes
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover',
      'onfocus', 'onblur', 'onchange', 'onsubmit',
    ],
  });
}

/**
 * Sanitize HTML with strict mode (for user-generated content)
 * More restrictive than default sanitization
 */
export function sanitizeHTMLStrict(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a'],
    ALLOWED_ATTR: ['href', 'class'],
    ALLOWED_URI_REGEXP: /^https?:/i,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Check if HTML contains potentially dangerous content
 * Returns true if content appears safe, false if suspicious
 */
export function validateHTML(html: string): { safe: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for script tags
  if (/<script/i.test(html)) {
    issues.push('Contains script tags');
  }
  
  // Check for event handlers
  if (/on\w+\s*=/i.test(html)) {
    issues.push('Contains event handler attributes');
  }
  
  // Check for javascript: protocol
  if (/javascript:/i.test(html)) {
    issues.push('Contains javascript: protocol');
  }
  
  // Check for data URIs that aren't images
  const dataUriMatch = html.match(/data:(?!image\/)/i);
  if (dataUriMatch) {
    issues.push('Contains non-image data URIs');
  }
  
  return {
    safe: issues.length === 0,
    issues,
  };
}

/**
 * Strip all HTML tags, leaving only text content
 * Useful for previews and search indexing
 */
export function stripHTML(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
  
  // Replace multiple whitespaces with single space
  return sanitized.replace(/\s+/g, ' ').trim();
}
