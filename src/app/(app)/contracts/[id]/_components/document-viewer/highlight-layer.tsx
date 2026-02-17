'use client';

// Feature 008: Interactive Document Viewer & Redline Export
// Finding highlights overlay with color coding and tooltips

import React, { useState } from 'react';
import type { FindingPosition, ClausePosition } from '@/types/document-viewer';

interface HighlightLayerProps {
  findingPositions: FindingPosition[];
  clausePositions: ClausePosition[];
  selectedClauseId?: string | null;
  onFindingClick?: (findingId: string, clauseId: string) => void;
}

export function HighlightLayer({
  findingPositions,
  clausePositions,
  selectedClauseId,
  onFindingClick,
}: HighlightLayerProps) {
  const [hoveredFinding, setHoveredFinding] = useState<string | null>(null);

  // Determine highlight color based on risk level
  // Note: Risk level would come from finding data, using placeholder for now
  const getHighlightColor = (findingId: string): string => {
    // In production, lookup finding by ID to get actual risk level
    // For now, use random color distribution
    const colors = {
      RED: 'rgba(239, 68, 68, 0.2)',    // red-500 with opacity
      YELLOW: 'rgba(251, 191, 36, 0.2)', // yellow-400 with opacity
      GREEN: 'rgba(34, 197, 94, 0.2)',   // green-500 with opacity
    };
    
    // Placeholder: alternate colors
    const hash = findingId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const riskLevels = ['RED', 'YELLOW', 'GREEN'];
    const risk = riskLevels[hash % 3] as keyof typeof colors;
    
    return colors[risk];
  };

  const getBorderColor = (findingId: string): string => {
    const colors = {
      RED: 'rgb(239, 68, 68)',
      YELLOW: 'rgb(251, 191, 36)',
      GREEN: 'rgb(34, 197, 94)',
    };
    
    const hash = findingId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const riskLevels = ['RED', 'YELLOW', 'GREEN'];
    const risk = riskLevels[hash % 3] as keyof typeof colors;
    
    return colors[risk];
  };

  const handleFindingClick = (finding: FindingPosition) => {
    if (onFindingClick) {
      onFindingClick(finding.findingId, finding.clauseId);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Clause highlight (if selected) */}
      {selectedClauseId && clausePositions.map((clause) => {
        if (clause.clauseId !== selectedClauseId) return null;
        
        return (
          <div
            key={clause.clauseId}
            className="absolute border-2 border-blue-400 bg-blue-50 bg-opacity-10 rounded"
            style={{
              left: `${clause.x}px`,
              top: `${clause.y}px`,
              width: `${clause.width}px`,
              height: `${clause.height}px`,
            }}
          />
        );
      })}

      {/* Finding highlights */}
      {findingPositions.map((finding) => {
        const isHovered = hoveredFinding === finding.findingId;
        
        return (
          <div
            key={finding.findingId}
            className="absolute rounded pointer-events-auto cursor-pointer transition-all duration-150"
            style={{
              left: `${finding.x}px`,
              top: `${finding.y}px`,
              width: `${finding.width}px`,
              height: `${finding.height}px`,
              backgroundColor: getHighlightColor(finding.findingId),
              border: isHovered ? `2px solid ${getBorderColor(finding.findingId)}` : '1px solid transparent',
              zIndex: isHovered ? 20 : 10,
              transform: isHovered ? 'scale(1.02)' : 'scale(1)',
            }}
            onMouseEnter={() => setHoveredFinding(finding.findingId)}
            onMouseLeave={() => setHoveredFinding(null)}
            onClick={() => handleFindingClick(finding)}
            title="Click to view finding details" // Simple tooltip for now
          >
            {/* Tooltip on hover */}
            {isHovered && (
              <div 
                className="absolute left-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap z-50"
                style={{ minWidth: '200px' }}
              >
                <div className="font-semibold mb-1">Finding ID: {finding.findingId.substring(0, 8)}...</div>
                <div className="text-gray-300">Click to view details in findings panel</div>
                {/* In production, load and display finding summary here */}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
