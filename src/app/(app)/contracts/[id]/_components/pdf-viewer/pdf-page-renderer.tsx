'use client';

/**
 * PDF Page Renderer — Feature 012 (T011)
 * Renders a single PDF page onto a <canvas> element using pdfjs-dist.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PdfPageRendererProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDocument: any; // pdfjs PDFDocumentProxy
  pageIndex: number; // 0-based
  scale: number;
  width: number;
  height: number;
  onRenderComplete?: (pageIndex: number) => void;
}

export function PdfPageRenderer({
  pdfDocument,
  pageIndex,
  scale,
  width,
  height,
  onRenderComplete,
}: PdfPageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      if (!pdfDocument || !canvasRef.current) return;

      // Cancel any in-progress render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      try {
        setRendering(true);
        setError(null);

        const page = await pdfDocument.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match the viewport
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        if (!cancelled) {
          setRendering(false);
          onRenderComplete?.(pageIndex);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Render error';
        if (msg.includes('Rendering cancelled')) {
          // Expected — ignore
          return;
        }
        setError(msg);
        setRendering(false);
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDocument, pageIndex, scale]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={canvasRef} className="block" />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-destructive p-2 text-center">
          Page render error
        </div>
      )}
    </div>
  );
}
