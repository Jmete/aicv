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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

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
        // offsetHeight stays stable even when preview uses CSS transforms.
        const measuredHeight = el.offsetHeight || el.getBoundingClientRect().height;
        measurements.push({
          id: def.id,
          height: measuredHeight,
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

  // Observe element height changes so pagination updates when content reflows
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      scheduleRecalculate();
    });
    resizeObserverRef.current = observer;

    for (const element of elementsRef.current.values()) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, [scheduleRecalculate]);

  // Recalculate when dependencies change
  useEffect(() => {
    scheduleRecalculate();
  }, [scheduleRecalculate]);

  // Create a ref callback for measuring elements
  const measureRef = useCallback(
    (id: string) => {
      return (el: HTMLElement | null) => {
        const previous = elementsRef.current.get(id);
        if (previous && resizeObserverRef.current) {
          resizeObserverRef.current.unobserve(previous);
        }
        if (el) {
          elementsRef.current.set(id, el);
          resizeObserverRef.current?.observe(el);
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
