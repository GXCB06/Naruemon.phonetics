import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentKeys, loadLesson } from "./content.ts";
import { parseManifest, pickReferenceVoice, referenceUrl, referenceVoices, sameTextIds } from "./reference.ts";

const manifest = parseManifest({
  clips: { a: ["f", "m"], b: ["m"], c: ["f"], junk: "f", bad: ["x", "f", "f"] },
});

describe("reference manifest", () => {
  it("reads leniently: unknown voices and malformed entries are dropped", () => {
    expect(referenceVoices(manifest, "a")).toEqual(["f", "m"]);
    expect(referenceVoices(manifest, "junk")).toEqual([]);
    expect(referenceVoices(manifest, "bad")).toEqual(["f"]);
    expect(referenceVoices(manifest, "missing")).toEqual([]);
    expect(referenceVoices(manifest, "constructor")).toEqual([]);
    for (const broken of [null, 3, "x", {}, { clips: [] }, { clips: null }]) expect(parseManifest(broken)).toEqual({ clips: {} });
  });

  it("picks the preferred voice, falls back to the other, else null (placeholder)", () => {
    expect(pickReferenceVoice(manifest, "a")).toBe("f");
    expect(pickReferenceVoice(manifest, "a", "m")).toBe("m");
    expect(pickReferenceVoice(manifest, "b", "f")).toBe("m");
    expect(pickReferenceVoice(manifest, "missing")).toBeNull();
  });

  it("with fairWith, only picks a voice every listed sentence has", () => {
    expect(pickReferenceVoice(manifest, "a", "f", ["b"])).toBe("m");
    expect(pickReferenceVoice(manifest, "c", "f", ["b"])).toBeNull();
    expect(pickReferenceVoice(manifest, "a", "f", ["missing"])).toBeNull();
  });

  it("names files the way tools/make-tts.ts writes them", () => {
    expect(referenceUrl("tags-1-harry")).toBe("/audio/tags-1-harry--f.mp3");
    expect(referenceUrl("tags-1-harry", "m")).toBe("/audio/tags-1-harry--m.mp3");
  });
});

describe("sameTextIds", () => {
  const all = contentKeys().flatMap((k) => {
    const [u, l] = k.split("/");
    return loadLesson(u, l)!.sentences;
  });
  const find = (id: string) => all.find((s) => s.id === id)!;

  it("finds the other reading of a tag question, not the same reading in another lesson", () => {
    const twins = sameTextIds(find("tags-1-harry"), all); // sure
    expect(twins).toContain("tags-2-harry"); // asking
    expect(twins).not.toContain("tags-3-harry"); // also sure
    expect(sameTextIds(find("falling-1-book-table"), all)).toEqual([]);
  });
});

describe("public/audio/manifest.json", () => {
  it("only lists clips that exist, for sentences that exist", () => {
    if (!existsSync("public/audio/manifest.json")) return;
    const m = parseManifest(JSON.parse(readFileSync("public/audio/manifest.json", "utf8")));
    for (const [id, voices] of Object.entries(m.clips)) {
      for (const v of voices) expect(existsSync(`public${referenceUrl(id, v)}`), `${id}--${v}`).toBe(true);
    }
  });
});
