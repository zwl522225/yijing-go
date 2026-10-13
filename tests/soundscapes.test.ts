import { describe, expect, it } from "vitest";

import { TRACKS, midiToHz } from "@/lib/audio/soundscapes";

describe("TRACKS", () => {
  it("contains pop ambience and instrumental tracks", () => {
    expect(new Set(TRACKS.map((track) => track.category))).toEqual(
      new Set(["pop", "instrumental"]),
    );
    expect(
      TRACKS.every(
        (track) => track.notes.length >= 8 && track.bpm >= 56 && track.bpm <= 104,
      ),
    ).toBe(true);
  });

  it("uses unique ids and playable note values", () => {
    expect(new Set(TRACKS.map((track) => track.id)).size).toBe(TRACKS.length);
    expect(TRACKS.every((track) => track.notes.every((note) => note >= 40 && note <= 84))).toBe(true);
  });

  it("converts concert A to 440 Hz", () => {
    expect(midiToHz(69)).toBe(440);
  });
});
