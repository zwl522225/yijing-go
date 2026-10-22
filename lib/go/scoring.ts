import type { Board, Color, Point } from "@/lib/go/types";

export type PlayerAreaScore = {
  stones: number;
  territory: number;
  area: number;
  total: number;
};

export type AreaScore = {
  black: PlayerAreaScore;
  white: PlayerAreaScore;
  dead: Record<Color, number>;
  neutral: number;
  komi: number;
  winner: Color;
  margin: number;
};

export type AreaPointKind =
  | "black-stone"
  | "white-stone"
  | "black-territory"
  | "white-territory"
  | "neutral";
export type AreaRegion = { id: number; points: Point[]; borders: Color[]; owner: Color | null };
export type AreaPoint = { kind: AreaPointKind; regionId: number | null };
export type AreaAnalysis = {
  board: Board;
  removed: { point: Point; color: Color }[];
  points: AreaPoint[][];
  regions: AreaRegion[];
  score: AreaScore;
};

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function neighbors(size: number, { x, y }: Point): Point[] {
  return DIRECTIONS.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter(
    ({ x: nextX, y: nextY }) =>
      nextX >= 0 && nextY >= 0 && nextX < size && nextY < size,
  );
}

function floodEmpty(board: Board, start: Point, visited: Set<string>) {
  const points: Point[] = [];
  const borders = new Set<Color>();
  const stack = [start];

  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = `${point.x},${point.y}`;
    if (visited.has(key)) continue;

    visited.add(key);
    points.push(point);

    for (const neighbor of neighbors(board.length, point)) {
      const value = board[neighbor.y][neighbor.x];
      if (value === null) stack.push(neighbor);
      else borders.add(value);
    }
  }

  return { points, borders };
}

// Shared preparation also lets the read-only validator check original dead-stone facts.
export function prepareAreaBoard(source: Board, deadStones: Set<string>) {
  const board = source.map((row) => [...row]);
  const dead: Record<Color, number> = { black: 0, white: 0 };
  const removed: AreaAnalysis["removed"] = [];

  for (const key of deadStones) {
    const [x, y] = key.split(",").map(Number);
    const color = board[y]?.[x];
    if (!color) continue;
    dead[color] += 1;
    board[y][x] = null;
    removed.push({ point: { x, y }, color });
  }

  return { board, dead, removed };
}

export function analyzeArea(
  source: Board,
  deadStones: Set<string>,
  komi = 7.5,
): AreaAnalysis {
  const { board, dead, removed } = prepareAreaBoard(source, deadStones);
  const points: AreaPoint[][] = board.map((row) => row.map((value) => ({
    kind: value ? `${value}-stone` : "neutral",
    regionId: null,
  })));
  const regions: AreaRegion[] = [];

  const stones: Record<Color, number> = { black: 0, white: 0 };
  const territory: Record<Color, number> = { black: 0, white: 0 };
  let neutral = 0;

  for (const row of board) {
    for (const value of row) if (value) stones[value] += 1;
  }

  const visited = new Set<string>();
  for (let y = 0; y < source.length; y += 1) {
    for (let x = 0; x < source.length; x += 1) {
      if (board[y][x] !== null || visited.has(`${x},${y}`)) continue;
      const region = floodEmpty(board, { x, y }, visited);
      const owner = region.borders.size === 1 ? [...region.borders][0] : null;
      const id = regions.length;
      regions.push({ id, points: region.points, borders: [...region.borders], owner });
      for (const point of region.points) {
        points[point.y][point.x] = { kind: owner ? `${owner}-territory` : "neutral", regionId: id };
      }
      if (owner) {
        territory[owner] += region.points.length;
      } else {
        neutral += region.points.length;
      }
    }
  }

  const blackArea = stones.black + territory.black;
  const whiteArea = stones.white + territory.white;
  const blackTotal = blackArea;
  const whiteTotal = whiteArea + komi;
  const winner: Color = blackTotal > whiteTotal ? "black" : "white";

  const score: AreaScore = {
    black: {
      stones: stones.black,
      territory: territory.black,
      area: blackArea,
      total: blackTotal,
    },
    white: {
      stones: stones.white,
      territory: territory.white,
      area: whiteArea,
      total: whiteTotal,
    },
    dead,
    neutral,
    komi,
    winner,
    margin: Math.abs(blackTotal - whiteTotal),
  };

  return { board, removed, points, regions, score };
}

export function scoreArea(source: Board, deadStones: Set<string>, komi = 7.5): AreaScore {
  return analyzeArea(source, deadStones, komi).score;
}
