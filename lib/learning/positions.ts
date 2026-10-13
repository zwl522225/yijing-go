import { createGame, passTurn, playMove } from "@/lib/go/rules";
import type { BoardSize, GameState, Move, Point } from "@/lib/go/types";
import type { PositionSpec } from "@/lib/learning/types";

export function createPosition(spec: PositionSpec): GameState {
  let state = createGame({ size: spec.size, stones: spec.stones, toPlay: spec.toPlay });
  if (spec.setupMoves === undefined) return state;
  if (!Array.isArray(spec.setupMoves)) throw new Error("setupMoves must be an array");
  for (const [index, action] of spec.setupMoves.entries()) {
    if (!isValidSetupMove(action, state.size)) throw new Error(`Illegal setup move ${index}: invalid action`);
    if ("pass" in action) {
      if (state.consecutivePasses >= 2) throw new Error(`Illegal setup move ${index}: finished`);
      state = passTurn(state);
    } else {
      const result = playMove(state, action);
      if (!result.ok) throw new Error(`Illegal setup move ${index}: ${result.reason}`);
      state = result.state;
    }
  }
  return state;
}

export function isValidSetupMove(value: unknown, size: BoardSize): value is Move {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "pass") return (value as { pass?: unknown }).pass === true;
  return keys.length === 2 && keys.includes("x") && keys.includes("y") && isPointOnBoard(value as Point, size);
}

export function isPointOnBoard(point: Point, size: BoardSize): boolean {
  return point !== null && typeof point === "object" &&
    Number.isInteger(point.x) && Number.isInteger(point.y) &&
    point.x >= 0 && point.y >= 0 && point.x < size && point.y < size;
}
