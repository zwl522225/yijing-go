import { describe, expect, it } from "vitest";
import { getCoachTurn } from "@/lib/go/coach";
import { analyzeReview, getReviewMoments } from "@/lib/go/review";
import { createGame, passTurn, playMove } from "@/lib/go/rules";
import type { GameSnapshot, GameState, Move, Point } from "@/lib/go/types";

function accepted(before: GameState, point: Point): GameState {
  const result = playMove(before, point);
  if (!result.ok) throw new Error(`Fixture move rejected: ${result.reason}`);
  return result.state;
}

function sequence(initial: GameState, moves: Move[]): GameState {
  return moves.reduce((state, move) => "pass" in move ? passTurn(state) : accepted(state, move), initial);
}

function turnAt(match: GameState, frame: number) {
  const step = analyzeReview(match).steps[frame];
  expect(step.status).toBe("verified");
  if (step.status !== "verified") throw new Error("Expected a verified turn");
  return step.turn;
}

function koCapture(): GameState {
  return accepted(createGame({ size: 5, stones: [
    ["white", 2, 1], ["white", 1, 2], ["white", 3, 2], ["white", 2, 3],
    ["black", 1, 1], ["black", 2, 0], ["black", 3, 1],
  ] }), { x: 2, y: 2 });
}

describe("verified sequential review analysis", () => {
  it("keeps the opening separate and matches real accepted ordinary turns without mutating inputs", () => {
    expect(analyzeReview(createGame({ size: 5 }))).toEqual({ steps: [{ status: "opening" }], moments: [] });
    const initial = createGame({ size: 5 });
    const first = accepted(initial, { x: 2, y: 2 });
    const match = accepted(first, { x: 4, y: 4 });
    const original = structuredClone(match);
    const analysis = analyzeReview(match);
    expect(analysis.steps).toEqual([
      { status: "opening" },
      { status: "verified", turn: getCoachTurn(initial, { x: 2, y: 2 }, { ok: true, state: first }) },
      { status: "verified", turn: getCoachTurn(first, { x: 4, y: 4 }, { ok: true, state: match }) },
    ]);
    expect(turnAt(match, 1).summary).toContain("4 口气");
    expect(turnAt(match, 2)).toMatchObject({ actor: "white", moveNumber: 2, summary: expect.stringContaining("（5，5）") });
    expect(match).toEqual(original);
    expect(analysis.steps.every(step => !("board" in step) && !("state" in step) && !("past" in step))).toBe(true);
  });

  it.each(["black", "white"] as const)("verifies a real %s capture from a setup position", actor => {
    const opponent = actor === "black" ? "white" : "black";
    const match = accepted(createGame({ size: 5, toPlay: actor, stones: [
      [opponent, 2, 2], [actor, 1, 2], [actor, 2, 1], [actor, 2, 3],
    ] }), { x: 3, y: 2 });
    expect(turnAt(match, 1)).toMatchObject({ actor, kind: "capture", terms: ["capture", "liberty"] });
    expect(turnAt(match, 1).summary).toContain("实际提掉对方 1 颗棋子");
    expect(analyzeReview(match).moments[0]).toMatchObject({ color: actor, kind: "capture", termId: "capture", unitId: "s1-atari-capture" });
  });

  it.each([
    { label: "own", initial: createGame({ size: 5, toPlay: "white", stones: [["black", 1, 0]] }), move: { x: 0, y: 0 }, own: true, opponent: false },
    { label: "opponent", initial: createGame({ size: 5, stones: [["white", 2, 2], ["black", 1, 2], ["black", 2, 1]] }), move: { x: 2, y: 3 }, own: false, opponent: true },
    { label: "both", initial: createGame({ size: 5, stones: [["white", 1, 0], ["black", 1, 1]] }), move: { x: 0, y: 0 }, own: true, opponent: true },
  ])("uses shared facts for newly atari $label groups", ({ initial, move, own, opponent }) => {
    const match = accepted(initial, move), turn = turnAt(match, 1);
    expect(turn.kind).toBe("atari");
    expect(turn.summary.includes("己方 1 块棋新近只剩一口气")).toBe(own);
    expect(turn.summary.includes("对方 1 块棋新近只剩一口气")).toBe(opponent);
    expect(analyzeReview(match).moments[0]).toMatchObject({ kind: turn.kind, consequence: turn.summary, direction: turn.question, termId: "atari" });
  });

  it.each(["black", "white"] as const)("does not invent new %s atari when an already-atari group extends", actor => {
    const match = sequence(createGame({ size: 5, toPlay: actor }), [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { pass: true }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]);
    expect(turnAt(match, 5)).toMatchObject({ actor, kind: "placement", summary: expect.stringContaining("1 口气") });
    expect(turnAt(match, 5).summary).not.toContain("新近");
    expect(analyzeReview(match).moments.some(moment => moment.frame === 5 && moment.kind === "atari")).toBe(false);
  });

  it("verifies one pass and two-pass ending, keeping the ending in the three selected moments", () => {
    const match = sequence(createGame({ size: 5 }), [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { pass: true }, { pass: true },
    ]);
    expect(turnAt(match, 5)).toMatchObject({ kind: "pass", actor: "black", summary: expect.stringContaining("棋子没有变化") });
    expect(turnAt(match, 6)).toMatchObject({ kind: "end", actor: "white", summary: expect.stringContaining("进入死子确认与计分") });
    const analysis = analyzeReview(match);
    expect(analysis.moments).toHaveLength(3);
    expect(analysis.moments.at(-1)).toMatchObject({ frame: 6, kind: "end", unitId: "s1-pass-ending", termId: "pass" });
    for (const moment of analysis.moments) {
      const turn = turnAt(match, moment.frame);
      expect(moment.consequence).toBe(turn.summary);
      expect(moment.direction).toBe(turn.question);
      expect(moment.color).toBe(turn.actor);
    }
    expect(getReviewMoments(match)).toEqual(analysis.moments);
  });

  it("preserves real ko history in the earliest snapshot and rejects an illegal recapture", () => {
    const captured = koCapture();
    const initial = { ...captured, past: [] };
    const legal = passTurn(initial);
    expect(analyzeReview(legal).steps.map(step => step.status)).toEqual(["opening", "verified"]);
    expect(turnAt(legal, 1)).toMatchObject({ actor: "white", moveNumber: 2, kind: "pass" });
    expect(playMove(initial, { x: 2, y: 1 })).toEqual({ ok: false, reason: "ko" });
    const fabricated: GameState = { ...captured.past[0], moves: [...captured.moves, { x: 2, y: 1 }], past: [initial] };
    expect(analyzeReview(fabricated)).toEqual({ steps: [{ status: "opening" }, { status: "unavailable" }], moments: [] });
  });

  it("prioritizes verified captures and atari while retaining the two-pass ending", () => {
    const match = sequence(createGame({ size: 5, stones: [["white", 0, 0], ["black", 1, 0]] }), [
      { x: 0, y: 1 }, { x: 4, y: 4 }, { x: 3, y: 4 }, { pass: true }, { pass: true },
    ]);
    expect(analyzeReview(match).moments.map(moment => [moment.frame, moment.kind])).toEqual([
      [1, "capture"], [3, "atari"], [5, "end"],
    ]);
  });

  const tamperCases: [string, (snapshot: GameSnapshot) => void][] = [
    ["size", snapshot => { snapshot.size = 7; }],
    ["board", snapshot => { snapshot.board[3][3] = "black"; }],
    ["toPlay", snapshot => { snapshot.toPlay = "white"; }],
    ["black captures", snapshot => { snapshot.captures.black++; }],
    ["white captures", snapshot => { snapshot.captures.white++; }],
    ["history entry", snapshot => { snapshot.history[0] = "tampered"; }],
    ["history length", snapshot => { snapshot.history.push("tampered"); }],
    ["earlier move", snapshot => { snapshot.moves[0] = { x: 4, y: 4 }; }],
    ["missing earlier move", snapshot => { snapshot.moves[0] = undefined as unknown as Move; }],
    ["last move", snapshot => { snapshot.moves[1] = { x: 4, y: 4 }; }],
    ["missing move", snapshot => { snapshot.moves.pop(); }],
    ["consecutive passes", snapshot => { snapshot.consecutivePasses = 1; }],
  ];
  it.each(tamperCases)("rejects tampered %s and all later frames while retaining the verified prefix", (_, tamper) => {
    const match = structuredClone(sequence(createGame({ size: 5 }), [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 4 }]));
    tamper(match.past[2]);
    const original = structuredClone(match), analysis = analyzeReview(match);
    expect(analysis.steps.map(step => step.status)).toEqual(["opening", "verified", "unavailable", "unavailable"]);
    expect(analysis.moments.map(moment => moment.frame)).toEqual([1]);
    expect(match).toEqual(original);
  });

  it("rejects an occupied action and never promotes its fabricated snapshot into a highlight", () => {
    const match = accepted(createGame({ size: 5, stones: [["black", 0, 0]] }), { x: 2, y: 2 });
    match.moves[0] = { x: 0, y: 0 };
    expect(analyzeReview(match)).toEqual({ steps: [{ status: "opening" }, { status: "unavailable" }], moments: [] });
  });

  it("accepts structurally identical snapshots despite property insertion order", () => {
    const first = accepted(createGame({ size: 5 }), { x: 2, y: 2 });
    const match = accepted(first, { x: 4, y: 4 });
    match.past[1].captures = { white: 0, black: 0 };
    match.past[1].moves[0] = { y: 2, x: 2 };
    expect(analyzeReview(match).steps.map(step => step.status)).toEqual(["opening", "verified", "verified"]);
  });
});
