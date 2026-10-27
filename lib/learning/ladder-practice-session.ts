import { groupAt, type GroupAnalysis } from "@/lib/go/analysis";
import { playMove } from "@/lib/go/rules";
import type { Color, GameState, MoveError, Point } from "@/lib/go/types";
import { createPosition, isPointOnBoard } from "@/lib/learning/positions";
import { LADDER_PRACTICE_SCENARIOS, type LadderPracticeScenario } from "@/lib/learning/ladder-practice";
export type LadderPracticePhase = "player" | "reply" | "complete";
export type LadderPracticeFacts = {
    target: GroupAnalysis | null;
    captures: Record<Color, number>;
    captureDelta: Record<Color, number>;
};
export type LadderPracticeSession = {
    sessionId: string;
    scenarioId: LadderPracticeScenario["id"];
    revision: number;
    phase: LadderPracticePhase;
    cursor: number;
    scenario: LadderPracticeScenario;
    game: GameState;
    actions: {
        actor: Color;
        point: Point;
        facts: LadderPracticeFacts;
    }[];
    facts: LadderPracticeFacts;
    hints: number[];
    stats: {
        usedHint: boolean;
        extraAttempts: number;
    }[];
    feedback: {
        kind: "step" | "illegal" | "off-route" | "hint";
        message: string;
        reason?: MoveError;
    } | null;
};
export type LadderPracticeEvent = {
    sessionId: string;
    scenarioId: string;
    revision: number;
    phase: LadderPracticePhase;
    cursor: number;
} & ({
    kind: "move";
    point: Point;
} | {
    kind: "reply";
} | {
    kind: "hint";
});
// Snapshot before consumers can mutate the public catalog. Defaults and validation use this baseline.
const trusted = structuredClone(LADDER_PRACTICE_SCENARIOS);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const key = (p: Point) => `${p.x},${p.y}`;
const pointSet = (p: Point[]) => p.map(key).sort();
function factsFor(game: GameState, scenario: LadderPracticeScenario, previous = game): LadderPracticeFacts {
    return { target: groupAt(game.board, game.size, scenario.target), captures: { ...game.captures }, captureDelta: { black: game.captures.black - previous.captures.black, white: game.captures.white - previous.captures.white } };
}
function step(game: GameState, point: Point): GameState {
    const result = playMove(game, point);
    if (!result.ok)
        throw Error(result.reason);
    return result.state;
}
function validateScenario(id: string, value: unknown): LadderPracticeScenario {
    const source = trusted.find(s => s.id === id);
    if (!source || !equal(value, source))
        throw Error("invalid scenario");
    const s = structuredClone(source);
    const occupied = new Set<string>();
    for (const [, x, y] of s.initial.stones) {
        const p = { x, y };
        if (!isPointOnBoard(p, s.initial.size) || occupied.has(key(p)))
            throw Error("invalid shape");
        occupied.add(key(p));
    }
    let game = createPosition(s.initial);
    for (const [i, move] of s.moves.entries()) {
        if (move.actor !== game.toPlay || !isPointOnBoard(move.point, game.size))
            throw Error("invalid actor or move");
        game = step(game, move.point);
        const target = groupAt(game.board, game.size, s.target);
        if (game.past.length !== i + 1 || game.moves.length !== i + 1 || game.history.length !== i + 2)
            throw Error("history");
        if (s.id === "capture") {
            if (i === 10) {
                if (target !== null || game.captures.black !== 6 || game.captures.white !== 0)
                    throw Error("capture");
                for (const p of [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 2, y: 5 }, { x: 2, y: 6 }, { x: 1, y: 6 }])
                    if (game.board[p.y][p.x] !== null)
                        throw Error("captured stones");
            }
            else if (!target || target.stones.length !== Math.floor((i + 1) / 2) + 1 || target.liberties.length !== (i === 9 || i % 2 === 0 ? 1 : 2) || game.captures.black !== 0 || game.captures.white !== 0)
                throw Error("ladder");
            if (i === 9 && !equal(target?.liberties, [{ x: 0, y: 6 }]))
                throw Error("edge");
        }
        else {
            if (game.captures.black !== 0 || game.captures.white !== 0)
                throw Error("helper captures");
            if (i >= 3 && (!target || target.stones.length !== 4 || !equal(pointSet(target.liberties), pointSet(i === 3 ? [{ x: 3, y: 4 }, { x: 3, y: 5 }, { x: 2, y: 6 }] : [{ x: 3, y: 5 }, { x: 2, y: 6 }]))))
                throw Error("helper liberties");
        }
    }
    return s;
}
export function createLadderPracticeSession(scenarioId: string, sessionId: string, optionalScenario?: unknown): LadderPracticeSession | null {
    try {
        if (typeof sessionId !== "string" || !sessionId.trim())
            return null;
        const source = trusted.find(s => s.id === scenarioId);
        const scenario = validateScenario(scenarioId, optionalScenario === undefined ? source : optionalScenario);
        const game = createPosition(scenario.initial);
        return { sessionId, scenarioId: scenario.id, revision: 0, phase: "player", cursor: 0, scenario, game, actions: [], facts: factsFor(game, scenario), hints: scenario.hints.map(() => 0), stats: scenario.hints.map(() => ({ usedHint: false, extraAttempts: 0 })), feedback: null };
    }
    catch {
        return null;
    }
}
/** Replay the accepted prefix, including snapshots and each action's own facts. */
function intact(s: LadderPracticeSession): boolean {
    try {
        if (!s || typeof s.sessionId !== "string" || !s.sessionId.trim() || !Number.isSafeInteger(s.revision) || s.revision < 0 || !Number.isSafeInteger(s.cursor) || s.cursor < 0)
            return false;
        const scenario = validateScenario(s.scenarioId, s.scenario);
        const count = scenario.hints.length;
        if (s.cursor > scenario.moves.length || s.phase !== (s.cursor === scenario.moves.length ? "complete" : s.cursor % 2 === 0 ? "player" : "reply") || !Array.isArray(s.actions) || s.actions.length !== s.cursor)
            return false;
        if (!Array.isArray(s.hints) || !Array.isArray(s.stats) || s.hints.length !== count || s.stats.length !== count)
            return false;
        let expectedRevision = s.cursor;
        for (let i = 0; i < count; i++) {
            const h = s.hints[i], stat = s.stats[i];
            if (!Number.isInteger(h) || h < 0 || h > 3 || !stat || typeof stat.usedHint !== "boolean" || stat.usedHint !== (h > 0) || !Number.isSafeInteger(stat.extraAttempts) || stat.extraAttempts < 0)
                return false;
            if (i > Math.floor(s.cursor / 2) && (h !== 0 || stat.extraAttempts !== 0))
                return false;
            expectedRevision += h + stat.extraAttempts;
        }
        if (!Number.isSafeInteger(expectedRevision) || s.revision !== expectedRevision)
            return false;
        let game = createPosition(scenario.initial);
        let facts = factsFor(game, scenario);
        for (let i = 0; i < s.cursor; i++) {
            const a = scenario.moves[i];
            const previous = game;
            game = step(game, a.point);
            facts = factsFor(game, scenario, previous);
            if (!equal(s.actions[i], { actor: a.actor, point: a.point, facts }))
                return false;
        }
        return equal(game, s.game) && equal(facts, s.facts);
    }
    catch {
        return false;
    }
}
const errorMessage: Record<MoveError, string> = { occupied: "这里已有棋子。", suicide: "这手没有气且不能提子，是禁入点。", ko: "这手会重复之前的棋形，不能立即回提。", out_of_bounds: "请在七路棋盘内落子。", finished: "棋局已经终局。" };
function explanation(s: LadderPracticeSession, facts: LadderPracticeFacts, nextCursor: number): string {
    if (s.scenarioId === "helper" && nextCursor === 5)
        return `按原路线下这手比较实验被接受：白棋仍有${facts.target?.liberties.length === 2 ? "两" : facts.target?.liberties.length}口气，没有被叫吃，本手提掉${facts.captureDelta.black}颗白子；这不代表无条件活棋。`;
    if (s.scenarioId === "helper" && nextCursor === 4)
        return `白棋连接接应子，${facts.target?.stones.length}颗白棋有${facts.target?.liberties.length}口气；原征子路线需要重新判断。`;
    if (!facts.target)
        return `本手提掉${facts.captureDelta.black}颗白子，连续征吃示范完成。`;
    if (nextCursor === 10)
        return `白棋延到边上后仍只剩${facts.target.liberties.length}口气（${facts.target.liberties[0].x + 1}，${facts.target.liberties[0].y + 1}），请黑棋完成最后一手。`;
    return `目标白棋现有${facts.target.stones.length}颗棋子、${facts.target.liberties.length}口气。${nextCursor % 2 ? "请点击查看白棋应手。" : "请继续黑棋下一手。"}`;
}
export function applyLadderPracticeEvent(s: LadderPracticeSession, e: LadderPracticeEvent): LadderPracticeSession {
    if (!s || !e || e.sessionId !== s.sessionId || e.scenarioId !== s.scenarioId || e.revision !== s.revision || e.phase !== s.phase || e.cursor !== s.cursor || !intact(s) || s.phase === "complete" || s.revision === Number.MAX_SAFE_INTEGER)
        return s;
    const update = (patch: Partial<LadderPracticeSession>): LadderPracticeSession => ({ ...s, revision: s.revision + 1, ...patch });
    const index = Math.floor(s.cursor / 2);
    if (e.kind === "hint") {
        if (s.phase !== "player" || s.hints[index] >= 3)
            return s;
        return update({ hints: s.hints.map((h, i) => i === index ? h + 1 : h), stats: s.stats.map((v, i) => i === index ? { ...v, usedHint: true } : v), feedback: { kind: "hint", message: s.scenario.hints[index][s.hints[index]] } });
    }
    if ((e.kind !== "move" || s.phase !== "player") && (e.kind !== "reply" || s.phase !== "reply"))
        return s;
    if (e.kind === "move" && (!e.point || typeof e.point !== "object" || Array.isArray(e.point) || !Number.isSafeInteger(e.point.x) || !Number.isSafeInteger(e.point.y)))
        return s;
    const expected = s.scenario.moves[s.cursor];
    const suppliedPoint = e.kind === "move" ? e.point : expected.point;
    // The rules engine retains moves in history; never pass caller or scenario objects.
    const point: Point = { x: suppliedPoint.x, y: suppliedPoint.y };
    const result = isPointOnBoard(point, s.game.size) ? playMove(s.game, point) : { ok: false as const, reason: "out_of_bounds" as const };
    if (!result.ok || !same(point, expected.point)) {
        if (s.phase !== "player" || s.stats[index].extraAttempts === Number.MAX_SAFE_INTEGER)
            return s;
        return update({ stats: s.stats.map((v, i) => i === index ? { ...v, extraAttempts: v.extraAttempts + 1 } : v), feedback: result.ok ? { kind: "off-route", message: "这手合法，但不在本次示范路线中。" } : { kind: "illegal", reason: result.reason, message: errorMessage[result.reason] } });
    }
    const facts = factsFor(result.state, s.scenario, s.game);
    const cursor = s.cursor + 1;
    return update({ cursor, game: result.state, phase: cursor === s.scenario.moves.length ? "complete" : cursor % 2 ? "reply" : "player", facts, actions: [...s.actions, { actor: s.game.toPlay, point: { ...point }, facts: structuredClone(facts) }], feedback: { kind: "step", message: explanation(s, facts, cursor) } });
}
