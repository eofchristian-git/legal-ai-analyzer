'use client';

// Feature 008: Interactive Document Viewer & Redline Export
// Main document viewer container with virtualized scrolling

import React, { useState, useRef, useEffect } from 'react';
import { VariableSizeList } from 'react-window';
import { HTMLRenderer } from './html-renderer';
import { HighlightLayer } from './highlight-layer';
import type { DocumentViewerProps } from '@/types/document-viewer';

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
  const listRef = useRef<VariableSizeList>(null);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([1]));
  const [viewerHeight, setViewerHeight] = useState(800); // Default height

  // Set viewer height on mount (client-side only)
  useEffect(() => {
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

  // Calculate page height (fixed for now, would be dynamic in production)
  const getItemSize = (index: number) => {
    return 1200; // Fixed height per page
  };

  // Handle scroll events to load pages progressively
  const handleScroll = ({ scrollOffset }: { scrollOffset: number }) => {
    const currentPage = Math.floor(scrollOffset / 1200) + 1;
    
    // Load surrounding pages
    const pagesToLoad = new Set(loadedPages);
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(pageCount, currentPage + 2); i++) {
      pagesToLoad.add(i);
    }
    
    if (pagesToLoad.size !== loadedPages.size) {
      setLoadedPages(pagesToLoad);
    }
  };

  // Render a single page
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const pageNum = index + 1;
    const isLoaded = loadedPages.has(pageNum);

    return (
      <div style={style}>
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
  };

  return (
    <div className="w-full h-full bg-gray-100">
      {htmlContent ? (
        <VariableSizeList
          ref={listRef}
          height={viewerHeight}
          itemCount={pages.length}
          itemSize={getItemSize}
          width="100%"
          overscanCount={2}
          onScroll={handleScroll}
        >
          {Row}
        </VariableSizeList>
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
