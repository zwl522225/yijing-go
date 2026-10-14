import { analyzeGroups, groupAt } from "@/lib/go/analysis";
import type { Color, GameState, Move, MoveResult } from "@/lib/go/types";
import type { TermId } from "@/lib/learning/types";

export type CoachTurn = {
  actor: Color;
  moveNumber: number;
  kind: "capture" | "atari" | "placement" | "pass" | "end";
  summary: string;
  question: string;
  terms: TermId[];
};

/** Describe only an accepted, recorded turn; analysis never commits an attempted move. */
export function getCoachTurn(before: GameState, move: Move, result: MoveResult): CoachTurn | null {
  if (!result.ok) return null;
  const after = result.state, recorded = after.moves.at(-1);
  if (after.moves.length !== before.moves.length + 1 || !recorded) return null;
  if ("pass" in move ? !("pass" in recorded) : "pass" in recorded || recorded.x !== move.x || recorded.y !== move.y) return null;
  const actor = before.toPlay, name = actor === "black" ? "黑棋（你）" : "白棋（电脑）";
  const base = { actor, moveNumber: after.moves.length };
  if ("pass" in move) {
    const ended = after.consecutivePasses >= 2;
    return { ...base, kind: ended ? "end" : "pass",
      summary: `${name}停一手。${ended ? "双方连续停手，进入死子确认与计分。" : "交出回合，棋盘上的棋子没有变化。"}`,
      question: ended ? "计分前，哪些棋块需要确认是否为死子？" : "停手前，未安定的棋块和边界都检查过了吗？",
      terms: ended ? ["pass", "dead-stones", "scoring"] : ["pass"] };
  }
  const group = groupAt(after.board, after.size, move);
  if (!group || group.color !== actor) return null;
  const placement = `${name}落在（${move.x + 1}，${move.y + 1}）。`;
  const liberties = `落子后的棋块有 ${group.liberties.length} 口气。`;
  const captured = after.captures[actor] - before.captures[actor];
  if (captured > 0) return { ...base, kind: "capture", summary: `${placement}实际提掉对方 ${captured} 颗棋子。${liberties}`,
    question: "提子后，附近双方的棋块各有几口气？", terms: ["capture", "liberty"] };

  const newAtari = analyzeGroups(after.board, after.size).filter(current => {
    if (current.liberties.length !== 1) return false;
    let existed = false;
    for (const point of current.stones) {
      const previous = groupAt(before.board, before.size, point);
      if (!previous || previous.color !== current.color) continue;
      existed = true;
      if (previous.liberties.length !== 1) return true;
    }
    // A newly placed stone does not make its already-atari parent group newly atari.
    return !existed;
  });
  if (newAtari.length) {
    const own = newAtari.filter(current => current.color === actor).length, opponent = newAtari.length - own;
    return { ...base, kind: "atari", summary: `${placement}${liberties}${own ? `己方 ${own} 块棋新近只剩一口气。` : ""}${opponent ? `对方 ${opponent} 块棋新近只剩一口气。` : ""}`,
      question: "先数双方的气，能否逃出、连接或提子？", terms: ["atari", "liberty", "group"] };
  }
  return { ...base, kind: "placement", summary: `${placement}${liberties}`,
    question: "下一手前，附近棋块有几口气，哪些可以连接？", terms: ["liberty", "group", "connect"] };
}

/** Use this match's snapshots, including pass/ko history; never pair a pending black turn with an old white turn. */
export function getCoachRound(match: GameState): CoachTurn[] {
  if (match.past.length === 0) return [];
  let start = match.past.length - 1;
  while (start > 0 && match.past[start].toPlay !== "black") start--;
  const frameAt = (index: number): GameState => index === match.past.length ? match :
    { ...match.past[index], past: match.past.slice(0, index) };
  const turns: CoachTurn[] = [];
  for (let index = start; index < match.past.length && index <= start + 1; index++) {
    const before = frameAt(index), after = frameAt(index + 1), move = after.moves.at(-1);
    if (!move) continue;
    if (index > start && before.toPlay !== "white") break;
    const turn = getCoachTurn(before, move, { ok: true, state: after });
    if (turn) turns.push(turn);
  }
  return turns;
}
