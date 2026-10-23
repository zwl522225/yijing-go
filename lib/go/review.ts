import { getCoachTurn, type CoachTurn } from "@/lib/go/coach";
import { deriveCapturedPoints } from "@/lib/go/review-captures";
import { passTurn, playMove } from "@/lib/go/rules";
import type { Color, GameSnapshot, GameState, Move, Point } from "@/lib/go/types";
import type { LessonUnitId, TermId } from "@/lib/learning/types";

export type ReviewMoment = {
  frame:number; color:Color; kind:"capture"|"atari"|"pass"|"end"|"placement";
  choice:string; consequence:string; direction:string; unitId:LessonUnitId; termId:TermId;
};
export type ReviewStep = { status: "opening" } | { status: "verified"; turn: CoachTurn; capturedPoints: Point[] | null } | { status: "unavailable" };
export type ReviewAnalysis = { steps: ReviewStep[]; moments: ReviewMoment[] };

/** Frames borrow immutable snapshots; review never writes into them or the match. */
export function getReviewFrames(match:GameState): GameState[] {
  return [...match.past.map((snapshot,index) => ({...snapshot,past:match.past.slice(0,index)})),match];
}
function sameMove(left: Move, right: Move): boolean {
  if (!right || typeof right !== "object") return false;
  return "pass" in left ? "pass" in right && left.pass === right.pass :
    !("pass" in right) && left.x === right.x && left.y === right.y;
}

/** Compare the whole recorded snapshot, independently of object property order. */
function sameSnapshot(actual: GameSnapshot, recorded: GameSnapshot): boolean {
  return actual.size === recorded.size && actual.toPlay === recorded.toPlay &&
    actual.consecutivePasses === recorded.consecutivePasses &&
    actual.captures.black === recorded.captures.black && actual.captures.white === recorded.captures.white &&
    actual.board.length === recorded.board.length && actual.board.every((row, y) =>
      row.length === recorded.board[y].length && row.every((cell, x) => cell === recorded.board[y][x])) &&
    actual.history.length === recorded.history.length && actual.history.every((hash, i) => hash === recorded.history[i]) &&
    actual.moves.length === recorded.moves.length && actual.moves.every((move, i) => sameMove(move, recorded.moves[i]));
}

function momentFor(frame: number, move: Move, turn: CoachTurn): ReviewMoment {
  const actor = turn.actor === "black" ? "黑棋（你）" : "白棋（电脑）";
  const links: Record<CoachTurn["kind"], { unitId: LessonUnitId; termId: TermId }> = {
    capture: { unitId: "s1-atari-capture", termId: "capture" },
    atari: { unitId: "s1-atari-capture", termId: "atari" },
    end: { unitId: "s1-pass-ending", termId: "pass" },
    pass: { unitId: "s1-pass-ending", termId: "pass" },
    placement: { unitId: "s1-liberties-groups", termId: "liberty" },
  };
  return { frame, color: turn.actor, kind: turn.kind,
    choice: "pass" in move ? `${actor}停一手` : `${actor}落在（${move.x + 1}，${move.y + 1}）`,
    consequence: turn.summary, direction: turn.question, ...links[turn.kind] };
}

function selectMoments(moments: ReviewMoment[]): ReviewMoment[] {
  const priority={capture:0,atari:1,end:2,pass:3,placement:4};
  const end=moments.find(moment=>moment.kind==="end");
  const ranked=moments.filter(moment=>moment!==end).sort((a,b)=>priority[a.kind]-priority[b.kind] || a.frame-b.frame);
  return [...ranked.slice(0,end ? 2 : 3),...(end ? [end] : [])].sort((a,b)=>a.frame-b.frame);
}

/** Replay once from the original setup/history. Keep facts, never a second history of full states. */
export function analyzeReview(match: GameState): ReviewAnalysis {
  const steps: ReviewStep[] = [{ status: "opening" }], moments: ReviewMoment[] = [];
  let replay: GameState = { ...(match.past[0] ?? match), past: [] };
  let available = true;
  for (let frame = 1; frame <= match.past.length; frame++) {
    const recorded = frame === match.past.length ? match : match.past[frame];
    const move = recorded.moves.at(-1);
    if (!available || !move || recorded.moves.length !== replay.moves.length + 1) {
      available = false;
      steps.push({ status: "unavailable" });
      continue;
    }
    const result = "pass" in move ? { ok: true as const, state: passTurn(replay) } : playMove(replay, move);
    const turn = result.ok && sameSnapshot(result.state, recorded) ? getCoachTurn(replay, move, result) : null;
    if (!turn || !result.ok) {
      available = false;
      steps.push({ status: "unavailable" });
      continue;
    }
    steps.push({ status: "verified", turn, capturedPoints: deriveCapturedPoints(replay, result.state) });
    moments.push(momentFor(frame, move, turn));
    // Engine snapshots are useful for live undo, but analysis needs only its current state.
    replay = { ...result.state, past: [] };
  }
  return { steps, moments: selectMoments(moments) };
}

export function getReviewMoments(match: GameState): ReviewMoment[] {
  return analyzeReview(match).moments;
}
