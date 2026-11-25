import { BookOpen, LoaderCircle } from "lucide-react";

export default function Loading() {
  return <div className="directory-layout">
    <div className="directory-content">
      <header className="site-header">
        <div className="shell header-inner">
          <div className="brand"><span className="brand-icon"><BookOpen size={22} aria-hidden /></span>Regional Directory</div>
        </div>
      </header>
      <main className="shell workspace">
        <div className="route-loading-status" role="status"><LoaderCircle className="loading-spinner" size={24} aria-hidden />Loading page…</div>
        <div className="route-skeleton" aria-hidden="true">
          <span className="skeleton-block skeleton-heading" />
          <div className="panel skeleton-panel">
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line" />
          </div>
          <div className="panel skeleton-panel">
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line" />
          </div>
        </div>
      </main>
    </div>
  </div>;
}
