import { prepareAreaBoard, type AreaAnalysis } from "@/lib/go/scoring";
import type { Board, Color, Point } from "@/lib/go/types";

export type AreaAnalysisContext = { source: Board; deadStones: Set<string> };

const isColor = (value: unknown): value is Color => value === "black" || value === "white";
const keyOf = ({ x, y }: Point) => `${x},${y}`;
const adjacent = ({ x, y }: Point) => [
  { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 },
];
const validPoint = (point: Point, size: number) => point &&
  Number.isInteger(point.x) && Number.isInteger(point.y) &&
  point.x >= 0 && point.y >= 0 && point.x < size && point.y < size;
function square(value: unknown, size: number): value is unknown[][] {
  if (!Array.isArray(value) || value.length !== size) return false;
  for (let y = 0; y < size; y++) {
    const row = value[y];
    if (!Array.isArray(row) || row.length !== size) return false;
    for (let x = 0; x < size; x++) if (!(x in row)) return false;
  }
  return true;
}

/** Checks display facts without replacing or repairing the scoring result. */
export function validateAreaAnalysis(
  analysis: unknown,
  expectedSize: number,
  context?: AreaAnalysisContext,
): analysis is AreaAnalysis {
  if (!analysis || typeof analysis !== "object" || !Number.isInteger(expectedSize) || expectedSize <= 0) return false;
  const a = analysis as AreaAnalysis;
  if (!square(a.board, expectedSize) || !square(a.points, expectedSize) ||
      !Array.isArray(a.regions) || !Array.isArray(a.removed) || !a.score) return false;
  const stones = { black: 0, white: 0 };
  const territory = { black: 0, white: 0 };
  let neutral = 0;
  const regionIds = new Set<number>();
  const members = new Set<string>();

  for (const region of a.regions) {
    if (!region || !Number.isInteger(region.id) || region.id < 0 || regionIds.has(region.id) ||
        !Array.isArray(region.points) || !region.points.length || !Array.isArray(region.borders) ||
        !(region.owner === null || isColor(region.owner))) return false;
    regionIds.add(region.id);
    const regionMembers = new Set<string>();
    const borders = new Set<Color>();
    for (const point of region.points) {
      if (!validPoint(point, expectedSize)) return false;
      const key = keyOf(point);
      const fact = a.points[point.y][point.x];
      if (members.has(key) || a.board[point.y][point.x] !== null || !fact || fact.regionId !== region.id ||
          fact.kind !== (region.owner ? `${region.owner}-territory` : "neutral")) return false;
      members.add(key);
      regionMembers.add(key);
      for (const neighbor of adjacent(point).filter((p) => validPoint(p, expectedSize))) {
        const value = a.board[neighbor.y][neighbor.x];
        if (isColor(value)) borders.add(value);
        else if (value !== null || a.points[neighbor.y][neighbor.x]?.regionId !== region.id) return false;
      }
    }
    // Membership alone would accept two disconnected regions accidentally merged into one.
    const reached = new Set<string>();
    const stack = [region.points[0]];
    while (stack.length) {
      const point = stack.pop()!;
      const key = keyOf(point);
      if (reached.has(key)) continue;
      reached.add(key);
      for (const next of adjacent(point)) {
        if (regionMembers.has(keyOf(next)) && !reached.has(keyOf(next))) stack.push(next);
      }
    }
    if (reached.size !== regionMembers.size || region.borders.length !== borders.size ||
        new Set(region.borders).size !== borders.size || Array.from(region.borders).some((color) => !borders.has(color)) ||
        region.owner !== (borders.size === 1 ? [...borders][0] : null)) return false;
    if (region.owner) territory[region.owner] += region.points.length;
    else neutral += region.points.length;
  }

  for (let y = 0; y < expectedSize; y++) {
    for (let x = 0; x < expectedSize; x++) {
      const value = a.board[y][x];
      const fact = a.points[y][x];
      if (!fact) return false;
      if (isColor(value)) {
        if (fact.kind !== `${value}-stone` || fact.regionId !== null) return false;
        stones[value]++;
      } else if (value !== null || !members.has(`${x},${y}`)) return false;
    }
  }

  const dead = { black: 0, white: 0 };
  const removedKeys = new Set<string>();
  for (const removed of a.removed) {
    if (!removed || !validPoint(removed.point, expectedSize) || !isColor(removed.color)) return false;
    const key = keyOf(removed.point);
    if (removedKeys.has(key) || a.board[removed.point.y][removed.point.x] !== null) return false;
    removedKeys.add(key);
    dead[removed.color]++;
  }
  const score = a.score;
  if (!score.dead || !Number.isFinite(score.komi) || score.neutral !== neutral) return false;
  for (const color of ["black", "white"] as const) {
    const player = score[color];
    const area = stones[color] + territory[color];
    if (!player || player.stones !== stones[color] || player.territory !== territory[color] ||
        player.area !== area || player.total !== area + (color === "white" ? score.komi : 0) ||
        score.dead[color] !== dead[color]) return false;
  }
  if (score.winner !== (score.black.total > score.white.total ? "black" : "white") ||
      score.margin !== Math.abs(score.black.total - score.white.total)) return false;

  if (context) {
    if (!square(context.source, expectedSize) ||
        context.source.some((row) => row.some((value) => value !== null && !isColor(value))) ||
        !(context.deadStones instanceof Set) ||
        Array.from(context.deadStones).some((key) => typeof key !== "string")) return false;
    const expected = prepareAreaBoard(context.source, context.deadStones);
    if (expected.removed.length !== a.removed.length ||
        expected.removed.some(({ point, color }) => !a.removed.some((r) => keyOf(r.point) === keyOf(point) && r.color === color)) ||
        expected.board.some((row, y) => row.some((value, x) => value !== a.board[y][x]))) return false;
  }
  return true;
}

export function describeAreaPoint(analysis: AreaAnalysis, point: Point): string | null {
  const size = analysis?.board?.length;
  if (!validateAreaAnalysis(analysis, size) || !validPoint(point, size)) return null;
  const fact = analysis.points[point.y][point.x];
  const coordinate = `第${point.x + 1}列，第${point.y + 1}行：`;
  if (fact.kind === "black-stone" || fact.kind === "white-stone") {
    const color = fact.kind === "black-stone" ? "黑" : "白";
    return `${coordinate}这是一颗计入${color}方的棋子，不是空地；这不代表系统独立证明了它的死活。`;
  }
  const region = analysis.regions.find(({ id }) => id === fact.regionId)!;
  const classification = region.owner === "black" ? "黑方空点" : region.owner === "white" ? "白方空点" : "未归属点";
  const boundary = region.owner ? `只接触${region.owner === "black" ? "黑" : "白"}方棋子边界` :
    region.borders.length === 2 ? "接触黑白双方棋子边界，不计入任一方空点" : "没有棋子边界，不计入任一方空点";
  const removed = analysis.removed.find(({ point: p }) => p.x === point.x && p.y === point.y);
  const note = removed ? `原${removed.color === "black" ? "黑" : "白"}子已按确认结果移除，此点现在按实际空区归属处理；移除后不一定成为对方的地。` : "";
  return `${coordinate}${classification}；所在连通空区共${region.points.length}个空点，${boundary}。${note}`;
}
