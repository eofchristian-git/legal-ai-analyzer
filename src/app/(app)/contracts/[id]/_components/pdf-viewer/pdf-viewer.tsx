'use client';

/**
 * PDF Viewer Container — Feature 012 (T014)
 * Scroll container that renders PdfPageRenderer + OverlayManager per page.
 * Uses IntersectionObserver for lazy rendering (no react-window dependency).
 * Exposes scrollToPage(pageIndex, yOffset) via ref.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { PdfPageRenderer } from './pdf-page-renderer';
import { OverlayManager } from './overlay-manager';
import { usePdfNavigation } from './use-pdf-navigation';
import { useScrollSync } from './use-scroll-sync';
import type { ClausePdfMapping, FindingPdfMapping } from '@/types/pdf-viewer';

export interface PdfViewerHandle {
  scrollToPage: (pageIndex: number, yOffset: number) => void;
}

interface FindingProjectionInfo {
  appliedFallbackText?: string;
  notes?: string[];
  aiSummary?: string;
}

interface PdfViewerProps {
  pdfUrl: string;
  pageCount: number;
  clauseMappings: ClausePdfMapping[];
  findingMappings: FindingPdfMapping[];
  selectedClauseId?: string | null;
  /** Explicit navigation intent from a user click — triggers scroll. Key must increment on each click. */
  navigationTarget?: { clauseId: string; key: number } | null;
  findingProjections?: Map<string, FindingProjectionInfo>;
  onActiveClauseChange?: (clauseId: string | null) => void;
  scale?: number;
}

const DEFAULT_SCALE = 1.2;
const DEFAULT_PAGE_HEIGHT = 842;

// Per-page wrapper that observes intersection for lazy rendering
function PdfPage({
  index,
  pdfDocument,
  scale,
  dimensions,
  findingMappings,
  clauseMappings,
  findingProjections,
  pageRef,
}: {
  index: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDocument: any;
  scale: number;
  dimensions: { width: number; height: number };
  findingMappings: FindingPdfMapping[];
  clauseMappings: ClausePdfMapping[];
  findingProjections?: Map<string, FindingProjectionInfo>;
  pageRef?: (el: HTMLDivElement | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          // Keep rendered once visible (don't unrender on scroll out)
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={(el) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        pageRef?.(el);
      }}
      style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 8,
        paddingBottom: 8,
        // Reserve space even before visible
        minHeight: dimensions.height + 16,
      }}
    >
      <div
        className="relative shadow-md bg-white"
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        {visible && (
          <>
            <PdfPageRenderer
              pdfDocument={pdfDocument}
              pageIndex={index}
              scale={scale}
              width={dimensions.width}
              height={dimensions.height}
            />
            <OverlayManager
              pageIndex={index}
              findingMappings={findingMappings}
              clauseMappings={clauseMappings}
              scale={scale}
              findingProjections={findingProjections}
              pageWidth={dimensions.width / scale}
            />
          </>
        )}
      </div>
    </div>
  );
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
  {
    pdfUrl,
    pageCount,
    clauseMappings,
    findingMappings,
    selectedClauseId,
    navigationTarget,
    findingProjections,
    onActiveClauseChange,
    scale = DEFAULT_SCALE,
  },
  ref
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Suppress scroll-sync updates while a programmatic scroll is in flight
  const suppressScrollSyncRef = useRef(false);
  const suppressScrollSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    console.time('[PDF] Document ready');

    async function loadPdf() {
      try {
        setLoading(true);
        setLoadError(null);

        const pdfjsLib = await import('pdfjs-dist' as string);

        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          // Use CDN URL for the worker — resolves reliably in Next.js without extra config
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
        }

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        const dims: { width: number; height: number }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale });
          dims.push({ width: vp.width, height: vp.height });
        }

        if (cancelled) return;

        setPdfDocument(pdf);
        setPageDimensions(dims);
        console.timeEnd('[PDF] Document ready');
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load PDF');
        console.error('[PDF] Load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, scale]);

  // Scroll sync (notify parent of active clause based on scroll position)
  const { onVisibleRangeChange } = useScrollSync({
    clauseMappings,
    onActiveClauseChange: onActiveClauseChange ?? (() => {}),
  });

  // Track scroll position to compute visible pages
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || pageDimensions.length === 0) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollTop = el.scrollTop;
        const clientHeight = el.clientHeight;

        // Find first and last visible page
        let firstVisible = 0;
        let lastVisible = pageDimensions.length - 1;
        let cumulativeHeight = 0;
        let foundFirst = false;

        for (let i = 0; i < pageDimensions.length; i++) {
          const pageHeight = pageDimensions[i].height + 16;
          const pageTop = cumulativeHeight;
          const pageBottom = cumulativeHeight + pageHeight;

          if (!foundFirst && pageBottom > scrollTop) {
            firstVisible = i;
            foundFirst = true;
          }
          if (foundFirst && pageTop < scrollTop + clientHeight) {
            lastVisible = i;
          }
          cumulativeHeight += pageHeight;
        }

        // Don't update active clause while a programmatic scroll is in progress
        if (!suppressScrollSyncRef.current) {
          onVisibleRangeChange(firstVisible, lastVisible);
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [pageDimensions, onVisibleRangeChange]);

  // scrollToPage implementation
  const scrollToPage = useCallback(
    (pageIndex: number, yOffset: number) => {
      const el = scrollContainerRef.current;
      if (!el || pageDimensions.length === 0) return;

      // Suppress scroll-sync for 1.5 s so the programmatic scroll doesn't
      // immediately overwrite selectedClauseId with whatever clause happens
      // to be at the top of the screen mid-scroll.
      suppressScrollSyncRef.current = true;
      if (suppressScrollSyncTimerRef.current) clearTimeout(suppressScrollSyncTimerRef.current);
      suppressScrollSyncTimerRef.current = setTimeout(() => {
        suppressScrollSyncRef.current = false;
      }, 1500);

      // Calculate cumulative scroll offset to the target page
      let cumulative = 0;
      for (let i = 0; i < pageIndex && i < pageDimensions.length; i++) {
        cumulative += (pageDimensions[i].height ?? DEFAULT_PAGE_HEIGHT) + 16;
      }
      // Add y offset within the page (scaled)
      const pageTop = cumulative + 8 + yOffset * scale;
      el.scrollTo({ top: pageTop, behavior: 'smooth' });
    },
    [pageDimensions, scale]
  );

  // Navigation hook
  const { scrollToClause } = usePdfNavigation({ clauseMappings, scrollToPage });

  // Imperative handle for parent
  useImperativeHandle(ref, () => ({ scrollToPage }), [scrollToPage]);

  // Scroll only when there's an explicit navigation intent (user clicked a clause in the list).
  // We watch navigationTarget.key (a counter) — it increments only on user clicks,
  // NOT when scroll-sync updates selectedClauseId. This breaks the feedback loop.
  useEffect(() => {
    if (!navigationTarget || !pdfDocument) return;
    scrollToClause(navigationTarget.clauseId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationTarget?.key, pdfDocument]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading document…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex items-start gap-3 max-w-sm rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">Failed to load document: {loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto bg-muted/20"
      style={{ contain: 'strict' }}
    >
      {pdfDocument && pageDimensions.length > 0 &&
        Array.from({ length: pageCount }, (_, index) => (
          <PdfPage
            key={index}
            index={index}
            pdfDocument={pdfDocument}
            scale={scale}
            dimensions={pageDimensions[index] ?? { width: 600, height: DEFAULT_PAGE_HEIGHT }}
            findingMappings={findingMappings}
            clauseMappings={clauseMappings}
            findingProjections={findingProjections}
            pageRef={(el) => {
              pageRefs.current[index] = el;
            }}
          />
        ))
      }
    </div>
  );
});
