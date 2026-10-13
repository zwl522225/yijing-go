import { legalMoves, playMove } from "@/lib/go/rules";
import type { Board, Color, GameState, Move, Point } from "@/lib/go/types";

export type Difficulty = "beginner" | "intermediate" | "challenge";

type Candidate = {
  move: Point;
  score: number;
  captures: number;
  state: GameState;
};

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function randomFromSeed(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function adjacent(size: number, point: Point): Point[] {
  return DIRECTIONS.map(([dx, dy]) => ({ x: point.x + dx, y: point.y + dy })).filter(
    ({ x, y }) => x >= 0 && y >= 0 && x < size && y < size,
  );
}

function groupLiberties(board: Board, start: Point): number {
  const color = board[start.y][start.x];
  const seen = new Set<string>();
  const liberties = new Set<string>();
  const stack = [start];

  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const next of adjacent(board.length, point)) {
      const value = board[next.y][next.x];
      if (value === null) liberties.add(`${next.x},${next.y}`);
      else if (value === color) stack.push(next);
    }
  }

  return liberties.size;
}

function shapeScore(board: Board, move: Point, color: Color): number {
  const size = board.length;
  const neighbors = adjacent(size, move);
  const friendly = neighbors.filter(({ x, y }) => board[y][x] === color).length;
  const occupied = neighbors.filter(({ x, y }) => board[y][x] !== null).length;
  const center = (size - 1) / 2;
  const distanceToCenter = Math.abs(move.x - center) + Math.abs(move.y - center);
  const edgeDistance = Math.min(move.x, move.y, size - 1 - move.x, size - 1 - move.y);
  const onEfficientLine = edgeDistance === 2 || edgeDistance === 3;
  const onEdge = edgeDistance === 0;

  return friendly * 11 + occupied * 2 - distanceToCenter * 0.18 + (onEfficientLine ? 3 : 0) - (onEdge ? 12 : 0);
}

function evaluateCandidate(state: GameState, move: Point): Candidate | null {
  const result = playMove(state, move);
  if (!result.ok) return null;

  const captures = result.state.captures[state.toPlay] - state.captures[state.toPlay];
  const liberties = groupLiberties(result.state.board, move);
  const selfAtariPenalty = liberties === 1 && captures === 0 ? 120 : 0;

  return {
    move,
    state: result.state,
    captures,
    score:
      captures * 1_000 +
      liberties * 7 +
      shapeScore(state.board, move, state.toPlay) -
      selfAtariPenalty,
  };
}

function rankedCandidates(state: GameState): Candidate[] {
  return legalMoves(state)
    .map((move) => evaluateCandidate(state, move))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((left, right) => right.score - left.score || left.move.y - right.move.y || left.move.x - right.move.x);
}

function chooseFrom(candidates: Candidate[], count: number, seed: number): Point {
  const pool = candidates.slice(0, Math.max(1, Math.min(count, candidates.length)));
  const random = randomFromSeed(seed);
  return pool[Math.floor(random() * pool.length)].move;
}

function challengeCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.slice(0, 10).map((candidate) => {
    const replies = rankedCandidates(candidate.state).slice(0, 8);
    const strongestReply = replies.reduce(
      (worst, reply) => Math.max(worst, reply.captures * 700 + reply.score * 0.12),
      0,
    );
    return { ...candidate, score: candidate.score - strongestReply };
  }).sort((left, right) => right.score - left.score);
}

export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  seed = Date.now(),
): Move {
  const candidates = rankedCandidates(state);
  if (candidates.length === 0) return { pass: true };

  const bestCapture = candidates[0].captures;
  if (bestCapture > 0) {
    const captures = candidates.filter((candidate) => candidate.captures === bestCapture);
    return chooseFrom(captures, difficulty === "beginner" ? 3 : 1, seed);
  }

  if (difficulty === "beginner") return chooseFrom(candidates, 12, seed);
  if (difficulty === "intermediate") return chooseFrom(candidates, 5, seed);

  return chooseFrom(challengeCandidates(candidates), 2, seed);
}

export function suggestMoves(state: GameState, limit = 3): Point[] {
  return rankedCandidates(state)
    .slice(0, Math.max(0, limit))
    .map(({ move }) => move);
}
