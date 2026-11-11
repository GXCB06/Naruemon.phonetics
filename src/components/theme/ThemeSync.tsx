"use client";

import { useEffect } from "react";
import { applyTheme, useTheme } from "./useTheme";

/** Mounted once in the root layout: keeps the browser-bar colour in step with the saved theme on every page. Renders nothing. */
export function ThemeSync() {
  const theme = useTheme();
  useEffect(() => applyTheme(theme), [theme]);
  return null;
}
