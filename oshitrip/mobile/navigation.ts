import { useSyncExternalStore } from "react";
export function route() {
  return location.hash.startsWith("#/") ? location.hash.slice(1).split("#")[0] : "/";
}
function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
export function useRoute() { return useSyncExternalStore(subscribe, route, () => "/"); }
export function usePathname() { return useRoute().split("?")[0]; }
