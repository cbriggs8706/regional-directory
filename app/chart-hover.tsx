"use client";

import { useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";

type ChartDetails = { name: string; context: string; value: string };
type ChartPointer = PointerEvent<SVGGraphicsElement>;

export function pointerChartX(event: ChartPointer) {
  const matrix = event.currentTarget.getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).x : event.clientX;
}

export function useChartHover() {
  const [active, setActive] = useState<(ChartDetails & { x: number; y: number }) | null>(null);

  function hide() {
    setActive(null);
  }

  function bind(details: ChartDetails | ((event: ChartPointer) => ChartDetails)) {
    function update(event: ChartPointer) {
      const content = typeof details === "function" ? details(event) : details;
      setActive({ ...content, x: event.clientX, y: event.clientY });
    }
    return { onPointerEnter: update, onPointerMove: update, onPointerLeave: hide };
  }

  const tooltip = active && createPortal(<div className="chart-hover" role="tooltip" style={{
    left: Math.min(active.x + 12, Math.max(8, window.innerWidth - 256)),
    top: active.y + 115 > window.innerHeight ? active.y - 12 : active.y + 12,
    transform: active.y + 115 > window.innerHeight ? "translateY(-100%)" : undefined,
  }}>
    <strong>{active.name}</strong>
    <span>{active.context}</span>
    <strong>{active.value}</strong>
  </div>, document.body);

  return { bind, hide, tooltip };
}
