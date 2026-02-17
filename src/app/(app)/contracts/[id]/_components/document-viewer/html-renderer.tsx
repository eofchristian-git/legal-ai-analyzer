'use client';

// Feature 008: Interactive Document Viewer & Redline Export
// HTML content renderer with proper sanitization

import React from 'react';
import DOMPurify from 'isomorphic-dompurify';

interface HTMLRendererProps {
  html: string;
  pageNum: number;
}

export function HTMLRenderer({ html, pageNum }: HTMLRendererProps) {
  // Sanitize HTML before rendering (defense in depth)
  const sanitizedHTML = React.useMemo(() => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'div', 'span', 'br', 'hr',
        'strong', 'em', 'u', 'i', 'b', 's', 'del', 'ins',
        'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
        'img', 'a',
        'article', 'section', 'aside', 'header', 'footer', 'main',
        'blockquote', 'pre', 'code',
      ],
      ALLOWED_ATTR: [
        'class', 'id', 'style',
        'data-clause-id', 'data-clause-number', 'data-finding-id',
        'data-page', 'data-page-number', 'data-position',
        'href', 'target', 'rel',
        'src', 'alt', 'title', 'width', 'height',
        'colspan', 'rowspan',
      ],
      KEEP_CONTENT: true,
    });
  }, [html]);

  return (
    <div 
      className="document-content prose prose-sm max-w-none"
      data-page-number={pageNum}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
      style={{
        lineHeight: '1.6',
        fontSize: '14px',
      }}
    />
  );
}
