import type { PaperSize, PageMargins } from "./resume-defaults";
import { PAPER_DIMENSIONS } from "./resume-defaults";

export interface PageDimensions {
  pageHeightPx: number;
  contentHeightPx: number;
  marginTopPx: number;
  marginBottomPx: number;
}

export interface ElementMeasurement {
  id: string;
  height: number;
  isHeader?: boolean;
}

export interface PageAssignment {
  pageIndex: number;
  elements: ElementMeasurement[];
}

/**
 * Calculate page dimensions in pixels based on container width and paper settings
 */
export function getPageDimensions(
  containerWidth: number,
  paperSize: PaperSize,
  margins: PageMargins
): PageDimensions {
  const { width: paperWidthMm, height: paperHeightMm } =
    PAPER_DIMENSIONS[paperSize];

  // Calculate page height maintaining aspect ratio
  const pageHeightPx = containerWidth * (paperHeightMm / paperWidthMm);

  // Convert mm margins to pixels
  const pxPerMm = containerWidth / paperWidthMm;
  const marginTopPx = margins.top * pxPerMm;
  const marginBottomPx = margins.bottom * pxPerMm;

  // Usable content height
  const contentHeightPx = pageHeightPx - marginTopPx - marginBottomPx;

  return {
    pageHeightPx,
    contentHeightPx,
    marginTopPx,
    marginBottomPx,
  };
}

/**
 * Assign elements to pages based on their measured heights
 * Implements orphan prevention: if a header fits but its first content doesn't,
 * the header moves to the next page
 *
 * @param measurements - Array of element measurements with heights
 * @param contentHeightPx - Available content height per page in pixels
 * @param elementGap - Gap between elements in pixels (e.g., 16 for space-y-4)
 */
export function assignElementsToPages(
  measurements: ElementMeasurement[],
  contentHeightPx: number,
  elementGap: number = 0
): PageAssignment[] {
  if (measurements.length === 0) {
    return [{ pageIndex: 0, elements: [] }];
  }

  const pages: PageAssignment[] = [];
  let currentPage: PageAssignment = { pageIndex: 0, elements: [] };
  let currentHeight = 0;

  for (let i = 0; i < measurements.length; i++) {
    const element = measurements[i];
    const nextElement = measurements[i + 1];

    // Add gap for elements after the first on current page
    const gapHeight = currentPage.elements.length > 0 ? elementGap : 0;

    // Check if element + gap fits on current page
    if (currentHeight + gapHeight + element.height <= contentHeightPx) {
      // Orphan prevention: if this is a header and there's a next element
      // that wouldn't fit (including the gap between header and next element), move header to next page
      if (
        element.isHeader &&
        nextElement &&
        currentHeight + gapHeight + element.height + elementGap + nextElement.height > contentHeightPx
      ) {
        // Start new page with the header (no gap for first element)
        if (currentPage.elements.length > 0) {
          pages.push(currentPage);
        }
        currentPage = {
          pageIndex: pages.length,
          elements: [element],
        };
        currentHeight = element.height;
      } else {
        // Element fits, add to current page
        currentPage.elements.push(element);
        currentHeight += gapHeight + element.height;
      }
    } else {
      // Element doesn't fit, start new page (no gap for first element on new page)
      if (currentPage.elements.length > 0) {
        pages.push(currentPage);
      }
      currentPage = {
        pageIndex: pages.length,
        elements: [element],
      };
      // For oversized elements, still track height for subsequent elements
      currentHeight = Math.min(element.height, contentHeightPx);
    }
  }

  // Don't forget the last page
  if (currentPage.elements.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [{ pageIndex: 0, elements: [] }];
}
