"use client";

import { useEffect } from "react";
import { playTap } from "@/components/learn/chime";

/** What counts as pressable. */
const PRESSABLE = 'button, a[href], [role="button"], [role="radio"], [role="switch"], [role="tab"], summary';

/**
 * Myna's tap sound for the whole app: a soft click when any button, link, card or toggle is pressed, so the app feels the same
 * everywhere. It starts on pointer-down (inside the learner's tap, which iPad needs) and follows the sound-effects switch in More.
 * A control that makes its own sound (an answer card that plays a clip, a speaker, a microphone button, the CHECK button that
 * answers with a ding or a buzz) opts out with data-sfx="none", on itself or on a container.
 */
export function SfxClicks() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const el = (e.target as Element | null)?.closest?.(PRESSABLE);
      if (!el) return;
      if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return;
      if (el.closest('[data-sfx="none"]')) return;
      playTap();
    };
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, []);
  return null;
}
