"use client";

import { useSyncExternalStore } from "react";
import { MapPin } from "lucide-react";

function subscribe() {
  return () => {};
}

function browserAgent() {
  return navigator.userAgent;
}

function serverAgent() {
  return "";
}

export function AddressLink({ address }: { address: string }) {
  const userAgent = useSyncExternalStore(subscribe, browserAgent, serverAgent);
  const query = encodeURIComponent(address);
  const webMap = `https://www.google.com/maps/search/?api=1&query=${query}`;
  let href = webMap;

  if (/Android/i.test(userAgent)) {
    href = /Chrome\//i.test(userAgent)
      ? `intent:0,0?q=${query}#Intent;scheme=geo;S.browser_fallback_url=${encodeURIComponent(webMap)};end`
      : `geo:0,0?q=${query}`;
  } else if (/iPhone|iPad|iPod|Macintosh/i.test(userAgent)) {
    href = `https://maps.apple.com/search?query=${query}`;
  }

  return <a className="address-link" href={href}><MapPin size={15} aria-hidden /><span>{address}</span></a>;
}
