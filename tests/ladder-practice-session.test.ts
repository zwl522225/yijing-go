import { describe, expect, it } from "vitest";
import { createLadderPracticeSession as create, applyLadderPracticeEvent as apply, type LadderPracticeSession, type LadderPracticeEvent } from "@/lib/learning/ladder-practice-session";
import { LADDER_PRACTICE_SCENARIOS } from "@/lib/learning/ladder-practice";
import { createPosition } from "@/lib/learning/positions";
import { playMove } from "@/lib/go/rules";
import { groupAt } from "@/lib/go/analysis";
const make = (id: "capture" | "helper" = "capture") => create(id, "session-1")!;
const event = (s: LadderPracticeSession, action: {
    kind: "move";
    point: {
        x: number;
        y: number;
    };
} | {
    kind: "reply" | "hint";
}): LadderPracticeEvent => ({ sessionId: s.sessionId, scenarioId: s.scenarioId, revision: s.revision, phase: s.phase, cursor: s.cursor, ...action });
const next = (s: LadderPracticeSession) => apply(s, event(s, s.phase === "reply" ? { kind: "reply" } : { kind: "move", point: s.scenario.moves[s.cursor].point }));
function freeze<T>(v: T): T { if (v && typeof v === "object") {
    Object.freeze(v);
    for (const x of Object.values(v))
        freeze(x);
} return v; }
describe("continuous ladder sessions", () => {
    it.each(["capture", "helper"] as const)("replays %s one action per event with exact history and per-step facts", id => {
        let s = make(id);
        let game = createPosition(s.scenario.initial);
        expect(s.phase).toBe("player");
        expect(s.stats).toHaveLength(id === "capture" ? 6 : 3);
        for (const [i, a] of s.scenario.moves.entries()) {
            const before = s;
            const r = playMove(game, a.point);
            if (!r.ok)
                throw Error(r.reason);
            game = r.state;
            s = next(freeze(s));
            expect(s.cursor).toBe(i + 1);
            expect(s.revision).toBe(i + 1);
            expect(s.game).toEqual(game);
            expect(s.facts.target).toEqual(groupAt(game.board, game.size, s.scenario.target));
            expect(s.actions[i]).toEqual({ actor: a.actor, point: a.point, facts: s.facts });
            expect(s.facts.captureDelta).toEqual({ black: game.captures.black - before.game.captures.black, white: game.captures.white - before.game.captures.white });
            expect(s.phase).toBe(i === s.scenario.moves.length - 1 ? "complete" : i % 2 === 0 ? "reply" : "player");
        }
        expect(s.stats.every(x => !x.usedHint && x.extraAttempts === 0)).toBe(true);
        expect(apply(s, event(s, { kind: "hint" }))).toBe(s);
        expect(apply(s, event(s, { kind: "reply" }))).toBe(s);
        if (id === "helper") {
            expect(s.feedback?.message).toContain("两口气");
            expect(s.feedback?.message).toContain("不代表无条件活棋");
            expect(s.feedback?.message).toContain("比较");
            expect(s.facts.captureDelta.black).toBe(0);
        }
        else
            expect(s.facts.captureDelta.black).toBe(6);
    });
    it("distinguishes legal off-route from actual illegal moves and counts each attempt once", () => {
        const s = freeze(make());
        const bad = event(s, { kind: "move", point: { x: 0, y: 0 } });
        const off = apply(s, bad);
        expect(off.feedback?.kind).toBe("off-route");
        expect(off.game).toBe(s.game);
        expect(off.stats[0].extraAttempts).toBe(1);
        expect(apply(off, bad)).toBe(off);
        const illegal = apply(off, event(off, { kind: "move", point: { x: 2, y: 2 } }));
        expect(illegal.feedback?.kind).toBe("illegal");
        expect(illegal.feedback?.reason).toBe("occupied");
        expect(illegal.stats[0].extraAttempts).toBe(2);
        expect(illegal.cursor).toBe(0);
        const oob = apply(illegal, event(illegal, { kind: "move", point: { x: -1, y: 0 } }));
        expect(oob.feedback?.reason).toBe("out_of_bounds");
        expect(oob.stats[0].extraAttempts).toBe(3);
    });
    it("caps hints, rejects stale events and never moves white automatically", () => {
        let s = make();
        const stale = event(s, { kind: "hint" });
        for (let n = 1; n <= 3; n++) {
            s = apply(freeze(s), event(s, { kind: "hint" }));
            expect(s.hints[0]).toBe(n);
            expect(s.stats[0].usedHint).toBe(true);
        }
        expect(apply(s, event(s, { kind: "hint" }))).toBe(s);
        expect(apply(s, stale)).toBe(s);
        s = next(s);
        expect(s.cursor).toBe(1);
        expect(s.game.toPlay).toBe("white");
        expect(apply(s, event(s, { kind: "hint" }))).toBe(s);
        expect(apply(s, event(s, { kind: "move", point: { x: 2, y: 3 } }))).toBe(s);
        const reply = event(s, { kind: "reply" });
        s = apply(s, reply);
        expect(s.cursor).toBe(2);
        expect(s.hints).toEqual([3, 0, 0, 0, 0, 0]);
        expect(apply(s, reply)).toBe(s);
        const fresh = make();
        expect(apply(fresh, reply)).toBe(fresh);
        const other = create("capture", "session-2")!;
        expect(apply(other, stale)).toBe(other);
    });
    it("returns fresh clones and refuses changed scenario exports and malformed factories", () => {
        const a = make(), b = make();
        expect(a).not.toBe(b);
        expect(a.scenario).not.toBe(b.scenario);
        a.game.board[0][0] = "white";
        expect(b.game.board[0][0]).toBeNull();
        expect(create("other", "s")).toBeNull();
        expect(create("capture", "")).toBeNull();
        expect(create("capture", "  ")).toBeNull();
        for (const value of [null, {}, [], { ...b.scenario, id: "helper" }])
            expect(create("capture", "s", value)).toBeNull();
        const duplicate = structuredClone(b.scenario);
        duplicate.initial.stones.push(duplicate.initial.stones[0]);
        expect(create("capture", "s", duplicate)).toBeNull();
        const wrong = structuredClone(b.scenario);
        wrong.moves[0].actor = "white";
        expect(create("capture", "s", wrong)).toBeNull();
        const oob = structuredClone(b.scenario);
        oob.moves[0].point.x = 7;
        expect(create("capture", "s", oob)).toBeNull();
        const exported = LADDER_PRACTICE_SCENARIOS[0];
        const saved = structuredClone(exported);
        try {
            exported.moves[0].point.x = 0;
            expect(make().scenario).toEqual(saved);
            expect(create("capture", "s", exported)).toBeNull();
        }
        finally {
            Object.assign(exported, saved);
        }
    });
    it("refuses malformed or inconsistent session fields without new explanations", () => {
        const base = make();
        const patches: unknown[] = [{ sessionId: "" }, { scenarioId: "x" }, { revision: -1 }, { revision: NaN }, { phase: "reply" }, { phase: "wat" }, { cursor: -1 }, { cursor: Infinity }, { cursor: 1 }, { hints: null }, { hints: [] }, { stats: null }, { stats: [] }, { hints: [-1, 0, 0, 0, 0, 0] }, { hints: [NaN, 0, 0, 0, 0, 0] }, { hints: [4, 0, 0, 0, 0, 0] }];
        for (const item of [null, {}, { usedHint: false, extraAttempts: -1 }, { usedHint: 1, extraAttempts: 0 }, { usedHint: true, extraAttempts: 0 }, { usedHint: false, extraAttempts: Infinity }, { usedHint: false, extraAttempts: 0.5 }])
            patches.push({ stats: [item, ...base.stats.slice(1)] });
        for (const p of patches) {
            const s = { ...base, ...p as object } as LadderPracticeSession;
            expect(apply(s, event(s, { kind: "hint" }))).toBe(s);
        }
        for (const key of ["sessionId", "scenarioId", "revision", "phase", "cursor", "hints", "stats"]) {
            const s = structuredClone(base);
            delete (s as unknown as Record<string, unknown>)[key];
            expect(apply(s, event(s, { kind: "hint" }))).toBe(s);
        }
        let active = next(next(base));
        for (const mutate of [(s: LadderPracticeSession) => s.game.history.push("fake"), (s: LadderPracticeSession) => s.game.past.pop(), (s: LadderPracticeSession) => s.actions[0].facts.captureDelta.black = 2, (s: LadderPracticeSession) => s.facts.target!.liberties.pop(), (s: LadderPracticeSession) => s.scenario.initial.stones.pop()]) {
            const s = structuredClone(active);
            mutate(s);
            expect(apply(s, event(s, { kind: "hint" }))).toBe(s);
        }
        active = apply(active, event(active, { kind: "hint" }));
        const old = event(active, { kind: "hint" });
        expect(apply(active, { ...old, cursor: 0 })).toBe(active);
        expect(apply(active, { ...old, phase: "reply" })).toBe(active);
    });
});
it("ignores malformed event points and unknown event kinds without counting an attempt", () => {
    const s = make();
    for (const point of [null, undefined, {}, [], { x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: 0.5, y: 0 }, { x: "0", y: 0 }]) {
        const e = { ...event(s, { kind: "hint" }), kind: "move", point } as unknown as LadderPracticeEvent;
        expect(apply(s, e)).toBe(s);
    }
    expect(apply(s, { ...event(s, { kind: "hint" }), kind: "other" } as unknown as LadderPracticeEvent)).toBe(s);
});
it.each([{ y: 2, x: 3 }, { x: 3, y: 2, extra: 1 }])("normalizes accepted caller points and continues with a matching reply: %j", point => {
    const start = make();
    const accepted = apply(start, event(start, { kind: "move", point }));
    expect(accepted.cursor).toBe(1);
    const replied = apply(accepted, event(accepted, { kind: "reply" }));
    expect(replied.cursor).toBe(2);
    expect(accepted.game.moves[0]).not.toBe(point);
    expect(Object.keys(accepted.game.moves[0])).toEqual(["x", "y"]);
    expect(Object.keys(accepted.actions[0].point)).toEqual(["x", "y"]);
    point.x = 0;
    point.y = 0;
    expect(accepted.game.moves[0]).toEqual({ x: 3, y: 2 });
    expect(accepted.actions[0].point).toEqual({ x: 3, y: 2 });
    expect(next(accepted).cursor).toBe(2);
    expect(replied.game.moves[1]).not.toBe(accepted.scenario.moves[1].point);
    expect(next(replied).cursor).toBe(3);
});
