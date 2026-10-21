import { createGame, passTurn, playMove } from "@/lib/go/rules";
import { scoreArea } from "@/lib/go/scoring";
import type { Color, GameSnapshot, GameState, Move, StoneSetup } from "@/lib/go/types";

export type SgfEnding =
  | { kind: "ongoing" }
  | { kind: "resigned"; resigned: "black" }
  | { kind: "scored"; deadStones: readonly string[] };

export type SgfExportResult =
  | { ok: true; content: string; size: 9 | 13 | 19; moves: number }
  | { ok: false; error: string };

type SgfNode = readonly (readonly [string, readonly string[]])[];
type SgfTextResult = { ok: true; content: string } | { ok: false; error: string };

const MAX_BYTES = 1024 * 1024;

/** Shared text encoding and byte-limit boundary; values never become SGF syntax. */
export function serializeSgf(nodes: readonly SgfNode[]): SgfTextResult {
  const escape = (value: string) => value
    .replace(/\r\n|\n\r|\r/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\]/g, "\\]");
  const content = `(${nodes.map((node) => `;${node.map(([name, values]) =>
    name + values.map((value) => `[${escape(value)}]`).join(""),
  ).join("")}`).join("")})`;
  return new TextEncoder().encode(content).byteLength > MAX_BYTES
    ? { ok: false, error: "棋谱超过 1 MiB，无法导出。" }
    : { ok: true, content };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function color(value: unknown): value is Color {
  return value === "black" || value === "white";
}

function validMove(value: unknown, size: number): value is Move {
  if (!record(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "pass") return value.pass === true;
  return keys.length === 2 && keys.includes("x") && keys.includes("y") &&
    typeof value.x === "number" && typeof value.y === "number" &&
    Number.isInteger(value.x) && Number.isInteger(value.y) &&
    value.x >= 0 && value.x < size && value.y >= 0 && value.y < size;
}

function validFrame(value: unknown): value is GameSnapshot {
  if (!record(value) || ![9, 13, 19].includes(value.size as number) ||
    !color(value.toPlay) || !Array.isArray(value.board) || value.board.length !== value.size ||
    !Array.isArray(value.moves) || !Array.isArray(value.history) ||
    !record(value.captures) || Object.keys(value.captures).length !== 2 ||
    !Number.isSafeInteger(value.consecutivePasses) ||
    (value.consecutivePasses as number) < 0 || (value.consecutivePasses as number) > 2) return false;
  for (const player of ["black", "white"]) {
    if (!Number.isSafeInteger(value.captures[player]) || (value.captures[player] as number) < 0) return false;
  }
  for (const row of value.board) {
    if (!Array.isArray(row) || row.length !== value.size) return false;
    for (const cell of row) if (cell !== null && !color(cell)) return false;
  }
  for (const action of value.moves) if (!validMove(action, value.size as number)) return false;
  for (const hash of value.history) if (typeof hash !== "string") return false;
  return true;
}

function sameMove(a: Move, b: Move): boolean {
  return "pass" in a ? "pass" in b : !("pass" in b) && a.x === b.x && a.y === b.y;
}

function sameFrame(a: GameSnapshot, b: GameSnapshot): boolean {
  return a.size === b.size && a.toPlay === b.toPlay &&
    a.consecutivePasses === b.consecutivePasses &&
    a.captures.black === b.captures.black && a.captures.white === b.captures.white &&
    a.board.every((row, y) => row.every((cell, x) => cell === b.board[y][x])) &&
    a.history.length === b.history.length && a.history.every((hash, i) => hash === b.history[i]) &&
    a.moves.length === b.moves.length && a.moves.every((action, i) => sameMove(action, b.moves[i]));
}

function validEnding(value: unknown): value is SgfEnding {
  if (!record(value)) return false;
  return value.kind === "ongoing" ||
    (value.kind === "resigned" && value.resigned === "black") ||
    (value.kind === "scored" && Array.isArray(value.deadStones));
}

function point(x: number, y: number): string {
  return String.fromCharCode(97 + x, 97 + y);
}

/** Validate every retained frame with the rules engine before encoding the main line. */
export function createSgf(state: GameState, ending: SgfEnding): SgfExportResult {
  const invalid = (): SgfExportResult => ({ ok: false, error: "对局记录不完整或已损坏，无法导出整盘棋谱。" });
  try {
    if (!validEnding(ending)) return { ok: false, error: "对局结束信息无效，无法导出。" };
    if (!validFrame(state) || !Array.isArray(state.past) || state.past.length !== state.moves.length) return invalid();
    const root = state.past[0] ?? state;
    if (!validFrame(root)) return invalid();
    const stones: StoneSetup[] = [];
    const blackSetup: string[] = [];
    const whiteSetup: string[] = [];
    for (let y = 0; y < root.size; y++) {
      for (let x = 0; x < root.size; x++) {
        const stone = root.board[y][x];
        if (stone === null) continue;
        stones.push([stone, x, y]);
        (stone === "black" ? blackSetup : whiteSetup).push(point(x, y));
      }
    }
    let replay = createGame({ size: root.size, stones, toPlay: root.toPlay });
    // A root with actions, captures, passes, or inherited history is not a proven start.
    if (!sameFrame(root, replay)) return invalid();
    const rootNode: [string, string[]][] = [
      ["FF", ["4"]], ["GM", ["1"]], ["CA", ["UTF-8"]], ["AP", ["YijingGo:0.1.0"]],
      ["SZ", [String(root.size)]], ["KM", ["7.5"]], ["RU", ["Chinese"]],
      ["PB", ["玩家"]], ["PW", ["电脑"]],
    ];
    if (blackSetup.length) rootNode.push(["AB", blackSetup]);
    if (whiteSetup.length) rootNode.push(["AW", whiteSetup]);
    if (root.toPlay === "white") rootNode.push(["PL", ["W"]]);
    const nodes: [string, string[]][][] = [rootNode];
    for (let i = 0; i < state.moves.length; i++) {
      const target = i + 1 === state.moves.length ? state : state.past[i + 1];
      if (!validFrame(target) || replay.consecutivePasses >= 2) return invalid();
      const action = state.moves[i];
      const player = replay.toPlay === "black" ? "B" : "W";
      if ("pass" in action) {
        replay = passTurn(replay);
        nodes.push([[player, [""]]]);
      } else {
        const next = playMove(replay, action);
        if (!next.ok) return invalid();
        replay = next.state;
        nodes.push([[player, [point(action.x, action.y)]]]);
      }
      if (!sameFrame(target, replay)) return invalid();
      // Replay owns this state; retained input history is never mutated or copied here.
      replay.past = [];
    }
    if (ending.kind === "ongoing" && state.moves.length === 0) {
      return { ok: false, error: "先下一手再导出棋谱。" };
    }
    if (ending.kind === "resigned") rootNode.push(["RE", ["W+R"]]);
    if (ending.kind === "scored") {
      if (state.consecutivePasses !== 2) return { ok: false, error: "双方连续停手并确认计分后才能导出计分结果。" };
      const dead = new Set<string>();
      for (const key of ending.deadStones) {
        if (typeof key !== "string" || !/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(key)) return invalid();
        const [x, y] = key.split(",").map(Number);
        if (x >= state.size || y >= state.size || !state.board[y][x]) return invalid();
        dead.add(key);
      }
      const score = scoreArea(state.board, dead);
      rootNode.push(["RE", [`${score.winner === "black" ? "B" : "W"}+${score.margin}`]]);
      if (dead.size) {
        const marks = [...dead].map((key) => key.split(",").map(Number))
          .sort(([ax, ay], [bx, by]) => ay - by || ax - bx)
          .map(([x, y]) => point(x, y));
        nodes[nodes.length - 1].push(["MA", marks], ["C", ["叉号为本游戏确认的死子；结果按中国面积规则计分。"]]);
      }
    }
    const result = serializeSgf(nodes);
    return result.ok ? { ...result, size: state.size as 9 | 13 | 19, moves: state.moves.length } : result;
  } catch {
    return invalid();
  }
}
