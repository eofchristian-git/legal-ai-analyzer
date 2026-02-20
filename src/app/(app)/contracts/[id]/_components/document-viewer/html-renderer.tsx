'use client';

/**
 * @deprecated Feature 008 — HTML Renderer (DEPRECATED)
 * Replaced by Feature 009: ONLYOFFICE viewer handles rendering natively.
 * Retained for backward compatibility with legacy contracts.
 */
// Feature 008: Interactive Document Viewer & Redline Export
// HTML content renderer with proper sanitization and client-side highlights

import React, { useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import type { HighlightFinding, HighlightClause } from '@/types/document-viewer';

interface HTMLRendererProps {
  html: string;
  pageNum: number;
  selectedClauseId?: string | null;
  onFindingClick?: (findingId: string, clauseId: string) => void;
  highlightFindings?: HighlightFinding[];
  highlightClauses?: HighlightClause[];
  /** Called after clause markers are injected so the parent can re-observe them */
  onClauseMarkersApplied?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip basic markdown so we can search Claude-formatted clauseText in plain DOM text */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Collect all text nodes under a root element */
function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  return nodes;
}

/** Check whether a text node is already inside a span with the given attribute */
function isInsideAttribute(node: Text, attr: string, root: HTMLElement): boolean {
  let el = node.parentElement;
  while (el && el !== root) {
    if (el.hasAttribute(attr)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Wrap the first occurrence of `searchStr` inside a text node with a new span.
 * Returns true when a match was wrapped.
 */
function wrapFirstMatch(
  textNodes: Text[],
  searchStr: string,
  buildSpan: () => HTMLSpanElement,
  skipAttr: string,
  root: HTMLElement
): boolean {
  const lower = searchStr.toLowerCase();
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const idx = text.toLowerCase().indexOf(lower);
    if (idx === -1) continue;
    if (isInsideAttribute(textNode, skipAttr, root)) continue;

    const parent = textNode.parentNode;
    if (!parent) continue;

    const endIdx = Math.min(idx + searchStr.length, text.length);
    const before = text.substring(0, idx);
    const matched = text.substring(idx, endIdx);
    const after = text.substring(endIdx);

    const span = buildSpan();
    span.textContent = matched;

    if (before) parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(span, textNode);
    if (after) parent.insertBefore(document.createTextNode(after), textNode);
    parent.removeChild(textNode);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Clause markers (data-clause-id)
// ---------------------------------------------------------------------------

function applyClauseMarkers(container: HTMLElement, clauses: HighlightClause[]): void {
  // Remove any previously injected clause markers
  container.querySelectorAll('[data-clause-id]').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  for (const clause of clauses) {
    // Search candidates in order of reliability:
    // 1. clauseNumber ("3.1", "Article V") — appears verbatim in document
    // 2. clauseName — may appear as a heading
    // 3. first 80 chars of clauseText with markdown stripped
    const candidates: string[] = [];
    if (clause.clauseNumber?.trim()) candidates.push(clause.clauseNumber.trim());
    if (clause.clauseName?.trim()) candidates.push(clause.clauseName.trim().substring(0, 50));
    const stripped = stripMarkdown(clause.clauseText || '');
    if (stripped.length >= 20) candidates.push(stripped.substring(0, 80));

    for (const searchStr of candidates) {
      if (searchStr.length < 3) continue;
      const textNodes = collectTextNodes(container);
      const found = wrapFirstMatch(
        textNodes,
        searchStr,
        () => {
          const span = document.createElement('span');
          span.setAttribute('data-clause-id', clause.clauseId);
          span.setAttribute('data-clause-number', clause.clauseNumber || '');
          return span;
        },
        'data-clause-id',
        container
      );
      if (found) break;
    }
  }
}

// ---------------------------------------------------------------------------
// Finding highlights (data-finding-id)
// ---------------------------------------------------------------------------

function applyFindingHighlights(container: HTMLElement, findings: HighlightFinding[]): void {
  // Remove any previously injected finding highlights
  container.querySelectorAll('[data-finding-id]').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  for (const finding of findings) {
    const excerpt = finding.excerpt?.trim();
    if (!excerpt || excerpt.length < 10) continue;

    const buildSpan = () => {
      const span = document.createElement('span');
      span.setAttribute('data-finding-id', finding.findingId);
      span.setAttribute('data-clause-id', finding.clauseId);
      span.setAttribute('data-risk', finding.riskLevel || 'GREEN');
      return span;
    };

    // Try full excerpt first (highlights all the text).
    // Fall back to first 60 chars when inline tags split the text node
    // so the full string doesn't appear in any single text node.
    const fullExcerpt = excerpt.substring(0, 400);
    const shortExcerpt = excerpt.substring(0, 60);

    const found = wrapFirstMatch(
      collectTextNodes(container),
      fullExcerpt,
      buildSpan,
      'data-finding-id',
      container
    );

    if (!found) {
      wrapFirstMatch(
        collectTextNodes(container),
        shortExcerpt,
        buildSpan,
        'data-finding-id',
        container
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HTMLRenderer({
  html,
  pageNum,
  selectedClauseId,
  onFindingClick,
  highlightFindings,
  highlightClauses,
  onClauseMarkersApplied,
}: HTMLRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
        'data-clause-id', 'data-clause-number', 'data-finding-id', 'data-risk',
        'data-page', 'data-page-number', 'data-position',
        'href', 'target', 'rel',
        'src', 'alt', 'title', 'width', 'height',
        'colspan', 'rowspan',
      ],
      KEEP_CONTENT: true,
    });
  }, [html]);

  // Apply clause markers first (findings may fall back to clause scroll)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const timer = setTimeout(() => {
      if (highlightClauses?.length) {
        applyClauseMarkers(container, highlightClauses);
      }
      // Notify parent so IntersectionObserver can re-observe new elements
      onClauseMarkersApplied?.();
    }, 30);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanitizedHTML, highlightClauses]);

  // Apply finding highlights after clause markers (so they don't conflict)
  useEffect(() => {
    if (!containerRef.current || !highlightFindings?.length) return;
    const container = containerRef.current;

    const timer = setTimeout(() => {
      if (container) applyFindingHighlights(container, highlightFindings);
    }, 80);

    return () => clearTimeout(timer);
  }, [sanitizedHTML, highlightFindings]);

  // Click delegation for [data-finding-id] spans
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onFindingClick) return;
      const target = e.target as HTMLElement;
      const findingEl = target.closest('[data-finding-id]') as HTMLElement | null;
      if (findingEl) {
        const findingId = findingEl.getAttribute('data-finding-id');
        const clauseId = findingEl.getAttribute('data-clause-id');
        if (findingId && clauseId) {
          e.stopPropagation();
          onFindingClick(findingId, clauseId);
        }
      }
    },
    [onFindingClick]
  );

  const activeClauseStyle = selectedClauseId
    ? `[data-clause-id="${selectedClauseId}"]:not([data-finding-id]) {
        background-color: rgba(59, 130, 246, 0.08);
        border-left: 3px solid rgb(59, 130, 246);
        padding-left: 6px;
        margin-left: -6px;
        border-radius: 2px;
        transition: background-color 0.2s ease;
      }`
    : '';

  return (
    <>
      <style>{`
        [data-finding-id] {
          cursor: pointer;
          border-radius: 2px;
          transition: background-color 0.15s ease;
        }
        [data-finding-id][data-risk="RED"] {
          background-color: rgba(239, 68, 68, 0.18);
          border-bottom: 2px solid rgb(239, 68, 68);
        }
        [data-finding-id][data-risk="RED"]:hover {
          background-color: rgba(239, 68, 68, 0.30);
        }
        [data-finding-id][data-risk="YELLOW"] {
          background-color: rgba(251, 191, 36, 0.20);
          border-bottom: 2px solid rgb(234, 179, 8);
        }
        [data-finding-id][data-risk="YELLOW"]:hover {
          background-color: rgba(251, 191, 36, 0.32);
        }
        [data-finding-id][data-risk="GREEN"] {
          background-color: rgba(34, 197, 94, 0.14);
          border-bottom: 2px solid rgb(22, 163, 74);
        }
        [data-finding-id][data-risk="GREEN"]:hover {
          background-color: rgba(34, 197, 94, 0.24);
        }

        /* Legal document typography */
        .document-content {
          font-family: 'Times New Roman', Georgia, serif;
          color: #1a1a1a;
          line-height: 1.75;
          font-size: 14px;
        }
        .document-content p { margin-bottom: 0.8em; text-align: justify; }
        .document-content h1 {
          font-size: 1.35em; font-weight: bold;
          margin: 1.2em 0 0.6em; text-align: center;
          text-transform: uppercase; letter-spacing: 0.03em;
        }
        .document-content h2 { font-size: 1.15em; font-weight: bold; margin: 1em 0 0.4em; }
        .document-content h3 { font-size: 1.05em; font-weight: bold; margin: 0.8em 0 0.3em; }
        .document-content h4,
        .document-content h5,
        .document-content h6 { font-size: 1em; font-weight: bold; margin: 0.6em 0 0.25em; }
        .document-content ul, .document-content ol { margin: 0.5em 0 0.5em 1.8em; }
        .document-content li { margin-bottom: 0.3em; }
        .document-content table {
          width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9em;
        }
        .document-content th, .document-content td {
          border: 1px solid #ccc; padding: 6px 10px;
          text-align: left; vertical-align: top;
        }
        .document-content th { background-color: #f3f4f6; font-weight: bold; }
        .document-content blockquote {
          border-left: 3px solid #d1d5db; padding-left: 1em;
          margin: 0.8em 0; color: #4b5563; font-style: italic;
        }
        .pdf-page { background: white; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
      `}</style>
      {activeClauseStyle && <style>{activeClauseStyle}</style>}
      <div
        ref={containerRef}
        className="document-content"
        data-page-number={pageNum}
        dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
        onClick={handleClick}
      />
    </>
  );
}
