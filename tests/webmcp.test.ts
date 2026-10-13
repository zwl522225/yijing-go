import { describe, expect, it } from "vitest";

import {
  parseDifficultyInput,
  parseLearningUnitInput,
  parseGlossaryInput,
  parseMoveInput,
  parseMusicInput,
  parseStartGameInput,
} from "@/lib/webmcp";

describe("WebMCP input validation", () => {
  it("accepts valid move and settings inputs", () => {
    expect(parseMoveInput({ x: 3, y: 16 })).toEqual({ x: 3, y: 16 });
    expect(parseDifficultyInput({ difficulty: "challenge" })).toEqual({ difficulty: "challenge" });
    expect(parseLearningUnitInput({ unitId: "s1-atari-capture" })).toEqual({ unitId: "s1-atari-capture" });
    expect(parseMusicInput({ playing: true, category: "pop" })).toEqual({ playing: true, category: "pop" });
  });

  it("rejects out-of-range, unknown, or extra values", () => {
    expect(() => parseMoveInput({ x: 30, y: 0 })).toThrow(TypeError);
    expect(() => parseDifficultyInput({ difficulty: "master" })).toThrow(TypeError);
    expect(() => parseLearningUnitInput({ unitId: "s1-atari-capture", extra: true })).toThrow(TypeError);
    expect(() => parseMusicInput({ playing: "yes" })).toThrow(TypeError);
  });

  it("rejects non-string difficulty values in both difficulty and start-game inputs", () => {
    expect(() => parseDifficultyInput({ difficulty: ["beginner"] })).toThrow(TypeError);
    expect(() => parseStartGameInput({ difficulty: ["beginner"], boardSize: 9 })).toThrow(TypeError);
  });

  it("rejects lesson IDs that only match after string coercion", () => {
    expect(() => parseLearningUnitInput({ unitId: ["capture"] })).toThrow(TypeError);
    expect(() => parseLearningUnitInput({ unitId: new String("capture") })).toThrow(TypeError);
  });

  it("accepts a selected game size and defaults omitted size to 19", () => {
    expect(parseStartGameInput({ difficulty: "beginner", boardSize: 9 })).toEqual({
      difficulty: "beginner",
      boardSize: 9,
    });
    expect(parseStartGameInput({ difficulty: "beginner" })).toEqual({
      difficulty: "beginner",
      boardSize: 19,
    });
  });

  it("rejects unsupported sizes and extra start-game fields", () => {
    expect(() => parseStartGameInput({ difficulty: "beginner", boardSize: 11 })).toThrow(TypeError);
    expect(() => parseStartGameInput({ difficulty: "beginner", extra: true })).toThrow(TypeError);
  });

  it("validates moves against the supplied board size", () => {
    expect(parseMoveInput({ x: 8, y: 8 }, 9)).toEqual({ x: 8, y: 8 });
    expect(() => parseMoveInput({ x: 9, y: 8 }, 9)).toThrow(TypeError);
    expect(parseMoveInput({ x: 18, y: 18 }, 19)).toEqual({ x: 18, y: 18 });
  });
});


describe("strict curriculum and glossary input",()=>{
  it("accepts current own primitive IDs",()=>{
    expect(parseLearningUnitInput({unitId:"s1-liberties-groups"})).toEqual({unitId:"s1-liberties-groups"});
    expect(parseGlossaryInput({termId:"liberty"})).toEqual({termId:"liberty"});
  });
  it.each([[], null, {}, {termId:["liberty"]}, {termId:new String("liberty")}, {termId:"unknown"}, {termId:"liberty",extra:1}, Object.create({termId:"liberty"}), JSON.parse('{"termId":"liberty","__proto__":{}}')])("rejects unsafe term input %j",input=>{
    expect(()=>parseGlossaryInput(input)).toThrow(TypeError);
  });
  it("rejects accessors without executing them, symbols and prototype changes",()=>{
    const getter=()=>{throw new Error("must not execute");};
    for(const input of [Object.defineProperty({},"termId",{get:getter,enumerable:true}),Object.assign({termId:"liberty"},{[Symbol("extra")]:1}),Object.assign(Object.create(null),{termId:"liberty"})])
      expect(()=>parseGlossaryInput(input)).toThrow(TypeError);
    for(const input of [{lessonId:"capture"},{unitId:"capture"},{unitId:"s1-liberties-groups",constructor:1},Object.create({unitId:"s1-liberties-groups"})])
      expect(()=>parseLearningUnitInput(input)).toThrow(TypeError);
  });
});
