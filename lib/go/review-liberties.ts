import { groupAt } from "@/lib/go/analysis";
import { BOARD_SIZES } from "@/lib/go/types";
import type { Board, BoardSize, Color, Point } from "@/lib/go/types";

export type ReviewLibertyState = {
  board: Board;
  size: BoardSize;
};

export type ReviewGroupInspection =
  | { kind: "group"; point: Point; color: Color; stones: Point[]; liberties: Point[]; description: string }
  | { kind: "empty"; point: Point; description: string }
  | { kind: "unavailable"; description: string };

const unavailable = (): ReviewGroupInspection => ({ kind: "unavailable", description: "查气暂不可用" });
const validColor = (value: unknown): value is Color => value === "black" || value === "white";
const validSize = (value: unknown): value is BoardSize => BOARD_SIZES.some(size => size === value);
const validPoint = (value: unknown, size: BoardSize): value is Point => {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as Partial<Point>;
  return Number.isInteger(x) && Number.isInteger(y) && x! >= 0 && y! >= 0 && x! < size && y! < size;
};

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

/** Reads a selected group's current board facts; it does not verify review history or move legality. */
export function inspectReviewGroup(state: ReviewLibertyState, point: Point): ReviewGroupInspection {
  try {
    if (typeof state !== "object" || state === null) return unavailable();
    const { size, board } = state;
    if (!validSize(size) || !validBoard(board, size) || !validPoint(point, size)) return unavailable();

    const selected = { x: point.x, y: point.y };
    if (board[selected.y][selected.x] === null) {
      return {
        kind: "empty",
        point: selected,
        description: `（${selected.x + 1}，${selected.y + 1}）这是空点，请点一颗棋子。`,
      };
    }

    const group = groupAt(board, size, selected);
    if (!group || group.liberties.length === 0) return unavailable();

    const colorName = group.color === "black" ? "黑棋" : "白棋";
    const libertyCount = group.liberties.length;
    const atariNote = libertyCount === 1
      ? "仅剩一口气（打吃）；这块棋尚未被提净，也不保证下一手可以提子。"
      : "";
    return {
      kind: "group",
      point: selected,
      color: group.color,
      stones: group.stones.map(stone => ({ x: stone.x, y: stone.y })),
      liberties: group.liberties.map(liberty => ({ x: liberty.x, y: liberty.y })),
      description: `${colorName}（${selected.x + 1}，${selected.y + 1}）这一块共${group.stones.length}颗子，有${libertyCount}口气。同一空点即使接触本块多颗棋子，也只算一口气；斜角不直接连接。${atariNote}`,
    };
  } catch {
    return unavailable();
  }
}
