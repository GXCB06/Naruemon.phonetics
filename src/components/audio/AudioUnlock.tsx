"use client";

import { useEffect } from "react";
import { installAudioUnlock } from "./webAudio";

/** Mounted once in the root layout: unlocks sound on the first tap (iPad/iPhone). Renders nothing. */
export function AudioUnlock() {
  useEffect(() => installAudioUnlock(), []);
  return null;
}
