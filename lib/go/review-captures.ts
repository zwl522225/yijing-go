import { BOARD_SIZES } from "@/lib/go/types";
import type { Board, BoardSize, Color, GameSnapshot, Point } from "@/lib/go/types";

const validColor = (value: unknown): value is Color => value === "black" || value === "white";
const validSize = (value: unknown): value is BoardSize => BOARD_SIZES.some(size => size === value);
const validCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

function validBoard(value: unknown, size: BoardSize): value is Board {
  if (!Array.isArray(value) || value.length !== size) return false;
  for (let y = 0; y < size; y += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, y)) return false;
    const row: unknown = value[y];
    if (!Array.isArray(row) || row.length !== size) return false;
    for (let x = 0; x < size; x += 1) {
      if (!Object.prototype.hasOwnProperty.call(row, x)) return false;
      const cell: unknown = row[x];
      if (cell !== null && !validColor(cell)) return false;
    }
  }
  return true;
}

function validFacts(state: GameSnapshot): boolean {
  return validSize(state.size) && validColor(state.toPlay) && validBoard(state.board, state.size) &&
    validCount(state.captures.black) && validCount(state.captures.white);
}

/** Derives positions only from an accepted, fully verified pair; this does not validate history. */
export function deriveCapturedPoints(before: GameSnapshot, after: GameSnapshot): Point[] | null {
  if (before.size !== after.size || !validFacts(before) || !validFacts(after)) return null;
  const captured = after.captures[before.toPlay] - before.captures[before.toPlay];
  if (!validCount(captured)) return null;
  const opponent = before.toPlay === "black" ? "white" : "black";
  const points: Point[] = [];
  for (let y = 0; y < before.size; y += 1) {
    for (let x = 0; x < before.size; x += 1) {
      if (before.board[y][x] === opponent && after.board[y][x] === null) points.push({ x, y });
    }
  }
  return points.length === captured ? points : null;
}
