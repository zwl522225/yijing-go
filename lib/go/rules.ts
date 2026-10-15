import type {
  Board,
  BoardSize,
  Color,
  GameSnapshot,
  GameState,
  MoveResult,
  Point,
  StoneSetup,
} from "@/lib/go/types";

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function other(color: Color): Color {
  return color === "black" ? "white" : "black";
}

export function emptyBoard(size: BoardSize): Board {
  return Array.from({ length: size }, () =>
    Array<Color | null>(size).fill(null),
  );
}

export function hashBoard(board: Board): string {
  return board
    .map((row) => row.map((cell) => cell?.[0] ?? ".").join(""))
    .join("/");
}

export type CreateGameOptions = {
  size?: BoardSize;
  stones?: StoneSetup[];
  toPlay?: Color;
};

export function createGame(
  { size = 19, stones = [], toPlay = "black" }: CreateGameOptions = {},
): GameState {
  const board = emptyBoard(size);
  for (const [color, x, y] of stones) {
    if (!inBounds({ x, y }, size)) {
      throw new RangeError(`Stone at (${x}, ${y}) is outside the ${size}-line board`);
    }
    board[y][x] = color;
  }

  return {
    size,
    board,
    toPlay,
    captures: { black: 0, white: 0 },
    history: [hashBoard(board)],
    moves: [],
    consecutivePasses: 0,
    past: [],
  };
}

function inBounds({ x, y }: Point, size: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && y >= 0 && x < size && y < size
  );
}

function neighbors({ x, y }: Point, size: number): Point[] {
  return DIRECTIONS.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter(
    (point) => inBounds(point, size),
  );
}

function collectGroup(board: Board, start: Point) {
  const color = board[start.y][start.x];
  const stones: Point[] = [];
  const liberties = new Set<string>();
  const seen = new Set<string>();
  const stack = [start];

  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;

    seen.add(key);
    stones.push(point);

    for (const neighbor of neighbors(point, board.length)) {
      const value = board[neighbor.y][neighbor.x];
      if (value === null) liberties.add(`${neighbor.x},${neighbor.y}`);
      else if (value === color) stack.push(neighbor);
    }
  }

  return { stones, liberties };
}

function snapshot(state: GameState): GameSnapshot {
  return {
    size: state.size,
    board: state.board,
    toPlay: state.toPlay,
    captures: state.captures,
    history: state.history,
    moves: state.moves,
    consecutivePasses: state.consecutivePasses,
  };
}

export function playMove(state: GameState, point: Point): MoveResult {
  if (!inBounds(point, state.size)) return { ok: false, reason: "out_of_bounds" };
  if (state.consecutivePasses >= 2) return { ok: false, reason: "finished" };
  if (state.board[point.y][point.x] !== null) {
    return { ok: false, reason: "occupied" };
  }

  const board = state.board.map((row) => [...row]);
  board[point.y][point.x] = state.toPlay;
  let captured = 0;

  for (const neighbor of neighbors(point, state.size)) {
    if (board[neighbor.y][neighbor.x] !== other(state.toPlay)) continue;
    const group = collectGroup(board, neighbor);
    if (group.liberties.size !== 0) continue;

    captured += group.stones.length;
    for (const stone of group.stones) board[stone.y][stone.x] = null;
  }

  if (collectGroup(board, point).liberties.size === 0) {
    return { ok: false, reason: "suicide" };
  }

  const hash = hashBoard(board);
  if (state.history.includes(hash)) return { ok: false, reason: "ko" };

  return {
    ok: true,
    state: {
      size: state.size,
      board,
      toPlay: other(state.toPlay),
      captures: {
        ...state.captures,
        [state.toPlay]: state.captures[state.toPlay] + captured,
      },
      history: [...state.history, hash],
      moves: [...state.moves, point],
      consecutivePasses: 0,
      past: [...state.past, snapshot(state)],
    },
  };
}

export function passTurn(state: GameState): GameState {
  if (state.consecutivePasses >= 2) return state;

  return {
    ...state,
    toPlay: other(state.toPlay),
    history: [...state.history, hashBoard(state.board)],
    moves: [...state.moves, { pass: true }],
    consecutivePasses: state.consecutivePasses + 1,
    past: [...state.past, snapshot(state)],
  };
}

export function undoRound(state: GameState): GameState {
  // The human plays black. Before White replies, only Black's pending move
  // belongs to the current round; keep the preceding completed round intact.
  const steps = Math.min(state.toPlay === "white" ? 1 : 2, state.past.length);
  if (steps === 0) return state;

  const restored = state.past[state.past.length - steps];
  return {
    ...restored,
    past: state.past.slice(0, -steps),
  };
}

export function legalMoves(state: GameState): Point[] {
  const moves: Point[] = [];

  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      if (playMove(state, { x, y }).ok) moves.push({ x, y });
    }
  }

  return moves;
}
