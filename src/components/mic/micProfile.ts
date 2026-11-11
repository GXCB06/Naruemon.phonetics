"use client";

import { MIC_PROFILE_KEY, parseMicProfile, type MicProfile } from "@/lib/audio/micProfile";

/** The result of this device's last mic check (null = never checked, or storage is blocked). */
export function loadMicProfile(): MicProfile | null {
  try {
    return parseMicProfile(window.localStorage.getItem(MIC_PROFILE_KEY));
  } catch {
    return null;
  }
}

export function saveMicProfile(profile: MicProfile): void {
  try {
    window.localStorage.setItem(MIC_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // private mode: the check just is not remembered, and Myna asks again next time
  }
}
