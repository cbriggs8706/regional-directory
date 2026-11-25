"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ComponentProps, type ReactNode } from "react";

type Navigate = (href: string, options?: { replace?: boolean; scroll?: boolean }) => void;
const NavigationContext = createContext<Navigate | null>(null);

export function RouteNavigation({ children, loading }: { children: ReactNode; loading: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string, { replace, scroll }: NonNullable<Parameters<Navigate>[1]> = {}) {
    if (pending) return;
    startTransition(() => {
      if (replace) router.replace(href, { scroll });
      else router.push(href, { scroll });
    });
  }

  return <NavigationContext.Provider value={navigate}>
    <div inert={pending}>{children}</div>
    {pending && <div className="route-loading-overlay">{loading}</div>}
  </NavigationContext.Provider>;
}

export function useRouteNavigation() {
  return useContext(NavigationContext)!;
}

export function RouteLink({ href, onNavigate, replace, scroll, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const navigate = useRouteNavigation();
  return <Link {...props} href={href} replace={replace} scroll={scroll} onNavigate={(event) => {
    let cancelled = false;
    onNavigate?.({ preventDefault: () => { cancelled = true; } });
    if (cancelled) {
      event.preventDefault();
      return;
    }

    const target = new URL(href, window.location.href);
    if (target.pathname === window.location.pathname && target.search === window.location.search) return;
    event.preventDefault();
    navigate(href, { replace, scroll });
  }} />;
}
