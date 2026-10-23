import { describe, expect, it } from "vitest";
import { getCoachTurn } from "@/lib/go/coach";
import { analyzeReview } from "@/lib/go/review";
import { deriveCapturedPoints } from "@/lib/go/review-captures";
import { createGame, passTurn, playMove } from "@/lib/go/rules";
import type { BoardSize, Color, GameSnapshot, GameState, Move, Point } from "@/lib/go/types";

function accepted(before: GameState, point: Point): GameState {
  const result = playMove(before, point);
  if (!result.ok) throw new Error(`Fixture move rejected: ${result.reason}`);
  return result.state;
}

function sequence(initial: GameState, moves: Move[]): GameState {
  return moves.reduce((state, move) => "pass" in move ? passTurn(state) : accepted(state, move), initial);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe("verified review capture positions", () => {
  it.each(["black", "white"] as const)("records the exact corner stone captured by %s from a setup", actor => {
    const opponent = actor === "black" ? "white" : "black";
    const before = createGame({ size: 5, toPlay: actor, stones: [[opponent, 0, 0], [actor, 1, 0]] });
    const match = accepted(before, { x: 0, y: 1 });
    expect(analyzeReview(match).steps).toMatchObject([
      { status: "opening" },
      { status: "verified", turn: { actor, kind: "capture" }, capturedPoints: [{ x: 0, y: 0 }] },
    ]);
    expect(match.captures[actor] - before.captures[actor]).toBe(1);
  });

  it("records an entire multi-stone group along the edge only once", () => {
    const match = accepted(createGame({ size: 5, stones: [
      ["white", 0, 0], ["white", 1, 0], ["black", 0, 1], ["black", 1, 1], ["black", 3, 0],
    ] }), { x: 2, y: 0 });
    expect(analyzeReview(match).steps[1]).toMatchObject({
      status: "verified", turn: { actor: "black", kind: "capture" },
      capturedPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    });
    expect(match.captures.black).toBe(2);
  });

  it("collects disjoint groups in row then column order", () => {
    const match = accepted(createGame({ size: 5, stones: [
      ["white", 2, 1], ["white", 1, 2], ["black", 2, 0], ["black", 1, 1],
      ["black", 3, 1], ["black", 0, 2], ["black", 1, 3],
    ] }), { x: 2, y: 2 });
    expect(analyzeReview(match).steps[1]).toMatchObject({
      status: "verified", capturedPoints: [{ x: 2, y: 1 }, { x: 1, y: 2 }],
    });
    expect(match.captures.black).toBe(2);
  });

  it("separates an empty-board history's capture from ordinary moves and both passes", () => {
    const match = sequence(createGame({ size: 5 }), [
      { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { pass: true }, { pass: true },
    ]);
    expect(analyzeReview(match).steps).toMatchObject([
      { status: "opening" },
      { status: "verified", capturedPoints: [] },
      { status: "verified", capturedPoints: [] },
      { status: "verified", capturedPoints: [{ x: 0, y: 0 }] },
      { status: "verified", turn: { kind: "pass" }, capturedPoints: [] },
      { status: "verified", turn: { kind: "end" }, capturedPoints: [] },
    ]);
  });

  it("retains a legal ko capture but supplies no facts for a forbidden recapture or its continuation", () => {
    const captured = accepted(createGame({ size: 5, stones: [
      ["white", 2, 1], ["white", 1, 2], ["white", 3, 2], ["white", 2, 3],
      ["black", 1, 1], ["black", 2, 0], ["black", 3, 1],
    ] }), { x: 2, y: 2 });
    expect(playMove(captured, { x: 2, y: 1 })).toEqual({ ok: false, reason: "ko" });
    const fabricated: GameState = { ...captured, moves: [...captured.moves, { x: 2, y: 1 }], past: [...captured.past, captured] };
    const analysis = analyzeReview(passTurn(fabricated));
    expect(analysis.steps[1]).toMatchObject({ status: "verified", capturedPoints: [{ x: 2, y: 1 }] });
    expect(analysis.steps.slice(2)).toEqual([{ status: "unavailable" }, { status: "unavailable" }]);
  });

  it("keeps a verified capture prefix and withholds all facts after a damaged snapshot", () => {
    const match = sequence(createGame({ size: 5, stones: [["white", 0, 0], ["black", 1, 0]] }), [
      { x: 0, y: 1 }, { x: 4, y: 4 }, { x: 3, y: 4 },
    ]);
    match.past[2].captures.white++;
    const analysis = analyzeReview(match);
    expect(analysis.steps[1]).toMatchObject({ status: "verified", capturedPoints: [{ x: 0, y: 0 }] });
    expect(analysis.steps.slice(2)).toEqual([{ status: "unavailable" }, { status: "unavailable" }]);
    expect(analysis.moments.map(moment => moment.frame)).toEqual([1]);
  });

  it("reads frozen history and returns coordinate objects isolated from input and later analyses", () => {
    const match = freeze(sequence(createGame({ size: 5 }), [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }]));
    const original = structuredClone(match);
    const step = analyzeReview(match).steps[3];
    expect(step).toMatchObject({ status: "verified", capturedPoints: [{ x: 0, y: 0 }] });
    if (step.status !== "verified" || !step.capturedPoints) throw new Error("Expected capture facts");
    const points = step.capturedPoints;
    points[0].x = 4;
    points.push({ x: 3, y: 3 });
    expect(match).toEqual(original);
    expect(analyzeReview(match).steps[3]).toMatchObject({ capturedPoints: [{ x: 0, y: 0 }] });
  });

  it("retains the original verified explanation when capture facts cannot be derived", () => {
    const before = createGame({ size: 5, stones: [["white", 0, 0], ["black", 1, 0]] });
    before.captures.black = 0.5;
    const captured = accepted(before, { x: 0, y: 1 });
    const match = accepted(captured, { x: 4, y: 4 });
    const analysis = analyzeReview(match);
    expect(analysis.steps[1]).toEqual({
      status: "verified", capturedPoints: null,
      turn: getCoachTurn(before, { x: 0, y: 1 }, { ok: true, state: captured }),
    });
    expect(analysis.steps[2]).toEqual({
      status: "verified", capturedPoints: null,
      turn: getCoachTurn(captured, { x: 4, y: 4 }, { ok: true, state: match }),
    });
    expect(analysis.moments).toHaveLength(2);
    expect(analysis.moments[0]).toMatchObject({ frame: 1, color: "black", kind: "capture" });
  });
});

describe("capture derivation consistency guards", () => {
  function capturePair() {
    const before = createGame({ size: 5, stones: [["white", 0, 0], ["black", 1, 0]] });
    return { before, after: accepted(before, { x: 0, y: 1 }) };
  }

  it.each([0, 2, -1, 0.5, NaN, Infinity])("withholds the entire list when the actor counter is inconsistent: %s", count => {
    const { before, after } = capturePair();
    after.captures.black = count;
    expect(deriveCapturedPoints(before, after)).toBeNull();
  });

  it("checks the actor's actual increment rather than its total or the opponent's count", () => {
    const { before } = capturePair();
    before.captures = { black: 7, white: 3 };
    const after = accepted(before, { x: 0, y: 1 });
    expect(deriveCapturedPoints(before, after)).toEqual([{ x: 0, y: 0 }]);
    after.captures.black = 7;
    after.captures.white = 4;
    expect(deriveCapturedPoints(before, after)).toBeNull();
  });

  const invalidStates: [string, (state: GameSnapshot) => void][] = [
    ["different supported size", state => { state.size = 7; }],
    ["unsupported size", state => { state.size = 6 as BoardSize; }],
    ["fractional size", state => { state.size = 5.5 as BoardSize; }],
    ["short board", state => { state.board.pop(); }],
    ["short row", state => { state.board[0].pop(); }],
    ["missing row", state => { Reflect.deleteProperty(state.board, 0); }],
    ["missing cell", state => { Reflect.deleteProperty(state.board[0], 0); }],
    ["inherited row", state => {
      const row = state.board[0];
      Reflect.deleteProperty(state.board, 0);
      Object.setPrototypeOf(state.board, Object.create(Array.prototype, { 0: { value: row } }));
    }],
    ["inherited cell", state => {
      const cell = state.board[0][0];
      Reflect.deleteProperty(state.board[0], 0);
      Object.setPrototypeOf(state.board[0], Object.create(Array.prototype, { 0: { value: cell } }));
    }],
    ["invalid cell", state => { state.board[0][0] = "red" as Color; }],
    ["invalid actor", state => { state.toPlay = "red" as Color; }],
    ["negative counter", state => { state.captures.black = -1; }],
    ["fractional counter", state => { state.captures.black = 0.5; }],
    ["nonfinite opponent counter", state => { state.captures.white = Infinity; }],
  ];
  it.each(invalidStates)("withholds facts for an invalid before or after %s", (_, damage) => {
    for (const target of ["before", "after"] as const) {
      const { before, after } = capturePair();
      damage(target === "before" ? before : after);
      expect(deriveCapturedPoints(before, after)).toBeNull();
    }
  });

  it("rejects a negative increment even when both cumulative counters are nonnegative", () => {
    const { before, after } = capturePair();
    before.captures.black = 2;
    after.captures.black = 1;
    expect(deriveCapturedPoints(before, after)).toBeNull();
  });
});
