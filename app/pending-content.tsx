"use client";

import { Suspense, use, type ReactNode } from "react";

export function SectionSkeleton({ label, chart, id }: { label: string; chart?: boolean; id?: string }) {
  return <div id={id} className="panel skeleton-panel" role="status">
    <span className="visually-hidden">Loading {label}…</span>
    <span className="skeleton-block skeleton-line" aria-hidden="true" />
    <span className="skeleton-block skeleton-line" aria-hidden="true" />
    <span className={chart ? "skeleton-block skeleton-chart" : "skeleton-block skeleton-line"} aria-hidden="true" />
  </div>;
}

function ResolvedContent<T>({ data, children }: { data: Promise<T>; children: (value: T) => ReactNode }) {
  return children(use(data));
}

export function PendingContent<T>({ data, fallback, children }: {
  data: Promise<T>; fallback: ReactNode; children: (value: T) => ReactNode;
}) {
  return <Suspense fallback={fallback}>
    <ResolvedContent data={data}>{children}</ResolvedContent>
  </Suspense>;
}
