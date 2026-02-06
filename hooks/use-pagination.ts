"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaperSize, PageMargins } from "@/lib/resume-defaults";
import {
  getPageDimensions,
  assignElementsToPages,
  type ElementMeasurement,
  type PageAssignment,
  type PageDimensions,
} from "@/lib/pagination-utils";

export interface UsePaginationOptions {
  paperSize: PaperSize;
  margins: PageMargins;
  debounceMs?: number;
  elementGap?: number; // Gap between elements in pixels (e.g., 16 for space-y-4)
  headerElementGap?: number; // Optional smaller gap after headers
}

export interface ElementDefinition {
  id: string;
  isHeader?: boolean;
}

export interface UsePaginationResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  measureRef: (id: string) => (el: HTMLElement | null) => void;
  pages: PageAssignment[];
  pageDimensions: PageDimensions | null;
  containerWidth: number;
  recalculate: () => void;
  setElements: (elements: ElementDefinition[]) => void;
}

/**
 * Hook that measures element heights and assigns them to pages
 * based on paper dimensions and margins
 */
export function usePagination(
  options: UsePaginationOptions
): UsePaginationResult {
  const {
    paperSize,
    margins,
    debounceMs = 100,
    elementGap = 0,
    headerElementGap = elementGap,
  } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const elementDefsRef = useRef<ElementDefinition[]>([]);

  const [containerWidth, setContainerWidth] = useState(0);
  const [pages, setPages] = useState<PageAssignment[]>([
    { pageIndex: 0, elements: [] },
  ]);
  const [pageDimensions, setPageDimensions] = useState<PageDimensions | null>(
    null
  );

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalculate = useCallback(() => {
    if (!containerRef.current || containerWidth === 0) return;

    const dimensions = getPageDimensions(containerWidth, paperSize, margins);
    setPageDimensions(dimensions);

    // Measure all registered elements in order
    const measurements: ElementMeasurement[] = [];
    for (const def of elementDefsRef.current) {
      const el = elementsRef.current.get(def.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        measurements.push({
          id: def.id,
          height: rect.height,
          isHeader: def.isHeader,
        });
      }
    }

    const newPages = assignElementsToPages(
      measurements,
      dimensions.contentHeightPx,
      elementGap,
      headerElementGap
    );
    setPages(newPages);
  }, [containerWidth, paperSize, margins, elementGap, headerElementGap]);

  const scheduleRecalculate = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      recalculate();
    }, debounceMs);
  }, [recalculate, debounceMs]);

  // Set elements in a specific order
  const setElements = useCallback(
    (elements: ElementDefinition[]) => {
      elementDefsRef.current = elements;
      scheduleRecalculate();
    },
    [scheduleRecalculate]
  );

  // Observe container width changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width !== containerWidth) {
          setContainerWidth(width);
        }
      }
    });

    observer.observe(container);
    setContainerWidth(container.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [containerWidth]);

  // Recalculate when dependencies change
  useEffect(() => {
    scheduleRecalculate();
  }, [scheduleRecalculate]);

  // Create a ref callback for measuring elements
  const measureRef = useCallback(
    (id: string) => {
      return (el: HTMLElement | null) => {
        if (el) {
          elementsRef.current.set(id, el);
        } else {
          elementsRef.current.delete(id);
        }
        scheduleRecalculate();
      };
    },
    [scheduleRecalculate]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    containerRef,
    measureRef,
    pages,
    pageDimensions,
    containerWidth,
    recalculate,
    setElements,
  };
}
