import { RouteLink } from "../../route-navigation";
import { ArrowLeft } from "lucide-react";

export default function UnitNotFound() {
  return <main className="shell workspace">
    <section className="panel empty">
      <h1>Unit unavailable</h1>
      <p>This unit may have been removed or the link may be out of date.</p>
      <RouteLink href="/?tab=units" className="button"><ArrowLeft size={18} aria-hidden />Back to units</RouteLink>
    </section>
  </main>;
}
