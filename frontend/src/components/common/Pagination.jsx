/**
 * Data Table Pagination Controller
 * ================================
 * Provides responsive pagination navigation with count statistics,
 * previous/next page triggers, and bounds enforcement.
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({
  count,
  pageSize = 20,
  currentPage = 1,
  onPageChange
}) {
  // Compute total available pages based on record count and page size
  const totalPages = Math.ceil(count / pageSize) || 1;

  // If entire dataset fits on a single page, suppress pagination controls
  if (totalPages <= 1) {
    return null;
  }

  // Calculate slice boundaries for display
  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, count);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200 sm:px-6">
      
      {/* Mobile-optimized pagination buttons */}
      <div className="flex justify-between flex-1 sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="relative inline-flex items-center px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="relative inline-flex items-center px-4 py-2 ml-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>

      {/* Desktop pagination summary and page indicators */}
      <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-slate-600">
            Showing <span className="font-semibold text-slate-900">{startRecord}</span> to{' '}
            <span className="font-semibold text-slate-900">{endRecord}</span> of{' '}
            <span className="font-semibold text-slate-900">{count}</span> records
          </p>
        </div>

        <div>
          <nav className="inline-flex -space-x-px rounded-md shadow-xs" aria-label="Pagination">
            {/* Previous Page Trigger */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-2 py-1.5 text-slate-500 rounded-l-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Current Page Counter */}
            <span className="relative inline-flex items-center px-3.5 py-1.5 text-xs font-semibold text-slate-700 border-y border-slate-300 bg-slate-50">
              Page {currentPage} of {totalPages}
            </span>

            {/* Next Page Trigger */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center px-2 py-1.5 text-slate-500 rounded-r-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
