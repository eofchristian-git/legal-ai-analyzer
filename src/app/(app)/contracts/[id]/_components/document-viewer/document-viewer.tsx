'use client';

// Feature 008: Interactive Document Viewer & Redline Export
// Main document viewer container with virtualized scrolling

import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { HTMLRenderer } from './html-renderer';
import { HighlightLayer } from './highlight-layer';
import type { DocumentViewerProps } from '@/types/document-viewer';

// Dynamic import for react-window to avoid SSR issues
const List = dynamic(
  () => import('react-window').then((mod: any) => mod.List),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><div className="text-gray-400">Loading...</div></div> }
) as any;

export function DocumentViewer({
  contractId,
  htmlContent,
  pageCount,
  clausePositions,
  findingPositions,
  selectedClauseId,
  onClauseClick,
  onFindingClick,
}: DocumentViewerProps) {
  const listRef = useRef<any>(null);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([1]));
  const [viewerHeight, setViewerHeight] = useState(800); // Default height
  const [isClient, setIsClient] = useState(false);

  // Set viewer height on mount (client-side only)
  useEffect(() => {
    setIsClient(true);
    
    if (typeof window !== 'undefined') {
      setViewerHeight(window.innerHeight - 200);
      
      // Update on resize
      const handleResize = () => {
        setViewerHeight(window.innerHeight - 200);
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Split HTML into pages (simple implementation - production would use actual page breaks)
  const pages = React.useMemo(() => {
    // For now, render as single page
    // Production would parse HTML and split by page-break-after or data-page-number attributes
    return [htmlContent];
  }, [htmlContent]);

  // Handle scroll events to load pages progressively
  const handleScroll = (event: any) => {
    if (event.scrollOffset) {
      const scrollOffset = event.scrollOffset;
      const currentPage = Math.floor(scrollOffset / 1200) + 1;
      
      // Load surrounding pages
      const pagesToLoad = new Set(loadedPages);
      for (let i = Math.max(1, currentPage - 1); i <= Math.min(pageCount, currentPage + 2); i++) {
        pagesToLoad.add(i);
      }
      
      if (pagesToLoad.size !== loadedPages.size) {
        setLoadedPages(pagesToLoad);
      }
    }
  };

  // Render a single page
  const Row = React.forwardRef<HTMLDivElement, any>(({ index, ...props }, ref) => {
    const pageNum = index + 1;
    const isLoaded = loadedPages.has(pageNum);

    return (
      <div ref={ref} {...props}>
        {isLoaded ? (
          <div className="relative bg-white shadow-lg rounded-sm p-8 mx-auto" style={{ maxWidth: '800px' }}>
            {/* HTML Content */}
            <HTMLRenderer 
              html={pages[index]} 
              pageNum={pageNum}
            />
            
            {/* Finding Highlights Overlay */}
            <HighlightLayer
              findingPositions={findingPositions.filter(f => f.page === pageNum)}
              clausePositions={clausePositions.filter(c => c.page === pageNum)}
              selectedClauseId={selectedClauseId}
              onFindingClick={onFindingClick}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading page {pageNum}...</div>
          </div>
        )}
      </div>
    );
  });

  // Show loading state during SSR or while client is mounting
  if (!isClient) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
        <div className="text-gray-400">Loading document viewer...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-100">
      {htmlContent ? (
        <List
          listRef={listRef}
          defaultHeight={viewerHeight}
          rowCount={pages.length}
          rowHeight={1200}
          overscanCount={2}
          onScroll={handleScroll}
          rowComponent={Row}
          rowProps={{}}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-gray-400 mb-2">Document not available</div>
            <div className="text-sm text-gray-500">
              The document has not been converted yet or conversion failed.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
