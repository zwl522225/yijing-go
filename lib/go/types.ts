export type Color = "black" | "white";
export const BOARD_SIZES = [5, 7, 9, 13, 19] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];
export type StoneSetup = [Color, number, number];

export type Point = {
  x: number;
  y: number;
};

export type Board = (Color | null)[][];
export type Move = Point | { pass: true };

export type GameSnapshot = {
  size: BoardSize;
  board: Board;
  toPlay: Color;
  captures: Record<Color, number>;
  history: string[];
  moves: Move[];
  consecutivePasses: number;
};

export type GameState = GameSnapshot & {
  past: GameSnapshot[];
};

export type MoveError = "out_of_bounds" | "occupied" | "suicide" | "ko" | "finished";

export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: MoveError };
