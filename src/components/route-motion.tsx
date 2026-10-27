"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Animate the new view without remounting forms or delaying navigation. */
export function RouteMotion() {
  const pathname = usePathname();
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const content = document.getElementById("main-content");
    const animation = content?.animate(
      [{ opacity: 0.65, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => { if (reducedMotion.matches) animation?.cancel(); };
    reducedMotion.addEventListener("change", cancel);
    return () => { animation?.cancel(); reducedMotion.removeEventListener("change", cancel); };
  }, [pathname]);
  return null;
}
