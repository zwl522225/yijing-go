import { analyzeGroups, groupAt, type GroupAnalysis } from "@/lib/go/analysis";
import { playMove } from "@/lib/go/rules";
import type { Color, GameState, MoveError, Point } from "@/lib/go/types";
import { createPosition, isPointOnBoard, isValidSetupMove } from "@/lib/learning/positions";
import type { TacticalBranch, TacticalSequence } from "@/lib/learning/tactical-sequences";

export type TacticalPhase = "first" | "reply" | "second" | "complete";
export type TacticalFacts = {
  target: GroupAnalysis | null;
  invested: GroupAnalysis | null;
  captures: GameState["captures"];
  captureDelta: GameState["captures"];
};
export type TacticalFeedback = {
  kind: "step" | "illegal" | "off-route" | "hint";
  message: string;
  reason?: MoveError;
};
export type TacticalAction = {
  phase: Exclude<TacticalPhase, "complete">;
  actor: Color;
  point: Point;
  facts: TacticalFacts;
};
export type TacticalSession = {
  sessionId: string;
  scenarioId: TacticalSequence["id"];
  revision: number;
  phase: TacticalPhase;
  scenario: TacticalSequence;
  game: GameState;
  selectedBranchId: string | null;
  hints: {first: number; second: number};
  feedback: TacticalFeedback | null;
  facts: TacticalFacts;
  actions: TacticalAction[];
};
export type TacticalEvent = {sessionId:string;scenarioId:string;revision:number;phase:TacticalPhase} & (
  {kind:"move";point:Point}|{kind:"reply";branchId:string}|{kind:"hint"}
);

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const point = (v: unknown): v is Point => record(v) && isPointOnBoard(v as Point, 7);
const hints = (v: unknown) => Array.isArray(v) && v.length === 3 && [0, 1, 2].every(index => text(v[index]));

/** Check data before createGame, whose setup API intentionally permits replacing stones. */
function validShape(value: unknown): value is TacticalSequence {
  if (!record(value) || !["net", "snapback"].includes(value.id as string) || !text(value.title)) return false;
  if (value.unitId !== (value.id === "net" ? "s2-net" : "s2-snapback")) return false;
  if (!point(value.target) || !point(value.first) || !hints(value.firstHints)) return false;
  const position = value.initial;
  if (!record(position) || position.size !== 7 || !["black", "white"].includes(position.toPlay as string) || !Array.isArray(position.stones)) return false;
  const occupied = new Set<string>();
  for (const stone of position.stones) {
    if (!Array.isArray(stone) || stone.length !== 3 || !["black", "white"].includes(stone[0]) || !point({x:stone[1], y:stone[2]})) return false;
    const key = `${stone[1]},${stone[2]}`;
    if (occupied.has(key)) return false;
    occupied.add(key);
  }
  if (position.setupMoves !== undefined && (!Array.isArray(position.setupMoves) || !position.setupMoves.every(move => isValidSetupMove(move, 7)))) return false;
  if (!Array.isArray(value.branches) || value.branches.length !== (value.id === "net" ? 2 : 1)) return false;
  const ids = new Set<string>();
  const replies = new Set<string>();
  for (const branch of value.branches) {
    if (!record(branch) || !text(branch.id) || !text(branch.label) || !point(branch.reply) || !point(branch.second) || !hints(branch.secondHints)) return false;
    const replyKey = `${branch.reply.x},${branch.reply.y}`;
    if (ids.has(branch.id) || replies.has(replyKey)) return false;
    ids.add(branch.id);
    replies.add(replyKey);
  }
  return true;
}

export function getTacticalFacts(game: GameState, scenario: TacticalSequence, previous: GameState = game): TacticalFacts {
  const target = groupAt(game.board, game.size, scenario.target);
  const invested = groupAt(game.board, game.size, scenario.first);
  return {
    target: target?.color === "white" ? target : null,
    invested: invested?.color === "black" ? invested : null,
    captures: {...game.captures},
    captureDelta: {
      black: game.captures.black - previous.captures.black,
      white: game.captures.white - previous.captures.white,
    },
  };
}

const targetHas = (facts: TacticalFacts, stones: number, liberties: number) =>
  facts.target?.stones.length === stones && facts.target.liberties.length === liberties;
const deltaIs = (facts: TacticalFacts, black: number, white: number) =>
  facts.captureDelta.black === black && facts.captureDelta.white === white;
const retains = (before: GroupAnalysis | null, after: GroupAnalysis | null) =>
  !!before && !!after && before.stones.every(p => after.stones.some(q => samePoint(p, q)));

/** The point selects a route; these real group/capture facts justify each transition. */
function validTransition(scenario: TacticalSequence, phase: Exclude<TacticalPhase, "complete">, before: GameState, after: GameState, branch?: TacticalBranch): boolean {
  const facts = getTacticalFacts(after, scenario, before);
  const prior = getTacticalFacts(before, scenario);
  if (after.toPlay !== (phase === "reply" ? "black" : "white")) return false;
  if (phase === "first") {
    if (!deltaIs(facts, 0, 0) || !retains(prior.target, facts.target)) return false;
    return scenario.id === "net"
      ? targetHas(facts, 1, 2)
      : targetHas(facts, 2, 1) && facts.invested?.stones.length === 1 && facts.invested.liberties.length === 1;
  }
  if (!branch) return false;
  if (phase === "reply") {
    return retains(prior.target, facts.target) &&
      targetHas(facts, scenario.id === "net" ? 2 : 3, 1) &&
      samePoint(facts.target!.liberties[0], branch.second) &&
      facts.target!.stones.some(p => samePoint(p, branch.reply)) &&
      (scenario.id === "net"
        ? deltaIs(facts, 0, 0)
        : deltaIs(facts, 0, 1) && after.board[scenario.first.y][scenario.first.x] === null && samePoint(branch.second, scenario.first));
  }
  return prior.target !== null && facts.target === null &&
    deltaIs(facts, prior.target.stones.length, 0) &&
    prior.target.stones.length === (scenario.id === "net" ? 2 : 3) &&
    prior.target.stones.every(p => after.board[p.y][p.x] === null);
}

export function createTacticalSession(value: unknown, sessionId: string): TacticalSession | null {
  try {
    if (!text(sessionId) || !validShape(value)) return null;
    const scenario = structuredClone(value);
    const game = createPosition(scenario.initial);
    const initialTarget = groupAt(game.board, game.size, scenario.target);
    if (game.toPlay !== "black" || game.consecutivePasses >= 2 || initialTarget?.color !== "white" ||
      initialTarget.stones.length !== (scenario.id === "net" ? 1 : 2) ||
      analyzeGroups(game.board, game.size).some(group => group.liberties.length === 0)) return null;
    const first = playMove(game, scenario.first);
    if (!first.ok || !validTransition(scenario, "first", game, first.state)) return null;
    // Every branch is checked up front, including those the learner never selects.
    for (const branch of scenario.branches) {
      const reply = playMove(first.state, branch.reply);
      if (!reply.ok || !validTransition(scenario, "reply", first.state, reply.state, branch)) return null;
      const second = playMove(reply.state, branch.second);
      if (!second.ok || !validTransition(scenario, "second", reply.state, second.state, branch)) return null;
    }
    return {
      sessionId, scenarioId: scenario.id, revision: 0, phase: "first", scenario, game,
      selectedBranchId: null, hints: {first:0, second:0}, feedback: null,
      facts: getTacticalFacts(game, scenario), actions: [],
    };
  } catch {
    return null;
  }
}

const ILLEGAL_MESSAGES: Record<MoveError, string> = {
  occupied: "这里已有棋子，请找空交叉点。",
  suicide: "此处落子后无气且不能提子，是禁入点。",
  ko: "这手会重复之前的棋形，请先走别处。",
  out_of_bounds: "请在七路棋盘内落子。",
  finished: "棋局已经终局。",
};

function stepMessage(scenario: TacticalSequence, phase: Exclude<TacticalPhase, "complete">, facts: TacticalFacts): string {
  if (phase === "second") return `这条示范变化完成：黑棋本手提掉${facts.captureDelta.black}颗白子，目标棋组已从棋盘移除。`;
  const target = `目标白棋现有${facts.target!.stones.length}颗子、${facts.target!.liberties.length}口气`;
  if (phase === "reply") return `白棋本手提掉${facts.captureDelta.white}颗黑子；${target}。`;
  const invested = scenario.id === "snapback" ? `投入的黑子现有${facts.invested!.liberties.length}口气；` : "";
  return `${invested}${target}；黑棋本手提子${facts.captureDelta.black}颗。`;
}

export function applyTacticalEvent(session: TacticalSession, event: TacticalEvent): TacticalSession {
  if (!event || event.sessionId !== session.sessionId || event.scenarioId !== session.scenarioId ||
    event.revision !== session.revision || event.phase !== session.phase || session.phase === "complete") return session;
  const {phase, scenario, game} = session;
  const branch = scenario.branches.find(b => b.id === session.selectedBranchId);
  if (event.kind === "hint") {
    if (phase === "reply" || session.hints[phase] >= 3) return session;
    const nextLevel = session.hints[phase] + 1;
    const stageHints = phase === "first" ? scenario.firstHints : branch?.secondHints;
    if (!stageHints) return session;
    return {...session, revision:session.revision + 1, hints:{...session.hints, [phase]:nextLevel},
      feedback:{kind:"hint", message:stageHints[nextLevel - 1]}};
  }
  let selected = branch;
  let played: Point;
  if (event.kind === "reply") {
    if (phase !== "reply") return session;
    selected = scenario.branches.find(b => b.id === event.branchId);
    if (!selected) return session;
    played = {...selected.reply};
  } else if (event.kind === "move") {
    if (phase === "reply") return session;
    // The rules API expects a point object; malformed input has the same bounds error.
    if (!isPointOnBoard(event.point, game.size)) return {...session, revision:session.revision + 1,
      feedback:{kind:"illegal", reason:"out_of_bounds", message:ILLEGAL_MESSAGES.out_of_bounds}};
    played = {...event.point};
  } else return session;
  const result = playMove(game, played);
  if (!result.ok) return {...session, revision:session.revision + 1,
    feedback:{kind:"illegal", reason:result.reason, message:ILLEGAL_MESSAGES[result.reason]}};
  const expected = phase === "first" ? scenario.first : phase === "reply" ? selected?.reply : selected?.second;
  if (!expected || !samePoint(played, expected)) return {...session, revision:session.revision + 1,
    feedback:{kind:"off-route", message:"这手合法，但不在本次示范路线中"}};
  if (!validTransition(scenario, phase, game, result.state, selected)) return session;
  const facts = getTacticalFacts(result.state, scenario, game);
  return {
    ...session, revision:session.revision + 1, phase:phase === "first" ? "reply" : phase === "reply" ? "second" : "complete",
    game: result.state, selectedBranchId: selected?.id ?? null, facts,
    feedback:{kind:"step", message:stepMessage(scenario, phase, facts)},
    actions:[...session.actions, {phase, actor:game.toPlay, point:{...played}, facts}],
  };
}
