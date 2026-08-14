"use client";

import { useEffect } from "react";
import type { HomeSectionId } from "../lib/section-routes";

export function ScrollToSection({ id }: { id: HomeSectionId }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [id]);

  return null;
}
