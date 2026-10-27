import { describe, expect, it } from "vitest";
import { LADDER_PRACTICE_SCENARIOS, canStartLadderPractice } from "@/lib/learning/ladder-practice";
import { STAGE_2_SHAPES } from "@/lib/learning/stage-2";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createPosition } from "@/lib/learning/positions";
import { playMove } from "@/lib/go/rules";
import { groupAt } from "@/lib/go/analysis";
const points = (value: {
    x: number;
    y: number;
}[]) => value.map(p => `${p.x},${p.y}`).sort();
describe("continuous ladder routes", () => {
    it("clones the existing seven-line shapes and provides six / three hint triples", () => {
        expect(LADDER_PRACTICE_SCENARIOS.map(s => s.id)).toEqual(["capture", "helper"]);
        for (const [i, s] of LADDER_PRACTICE_SCENARIOS.entries()) {
            expect(s.initial).toEqual(i ? STAGE_2_SHAPES.ladderHelper : STAGE_2_SHAPES.ladder);
            expect(s.initial).not.toBe(i ? STAGE_2_SHAPES.ladderHelper : STAGE_2_SHAPES.ladder);
            expect(s.target).toEqual({ x: 2, y: 2 });
            expect(s.hints).toHaveLength(i ? 3 : 6);
            expect(s.hints.every(h => h.length === 3 && h.every(Boolean))).toBe(true);
        }
    });
    it("replays all eleven capture moves including the edge white extension with one liberty", () => {
        const s = LADDER_PRACTICE_SCENARIOS[0];
        let game = createPosition(s.initial);
        expect(s.moves.map(m => [m.actor, m.point.x, m.point.y])).toEqual([["black", 3, 2], ["white", 2, 3], ["black", 3, 3], ["white", 2, 4], ["black", 3, 4], ["white", 2, 5], ["black", 3, 5], ["white", 2, 6], ["black", 3, 6], ["white", 1, 6], ["black", 0, 6]]);
        for (const [i, action] of s.moves.entries()) {
            expect(game.toPlay).toBe(action.actor);
            const r = playMove(game, action.point);
            expect(r.ok).toBe(true);
            if (!r.ok)
                throw Error(r.reason);
            game = r.state;
            const target = groupAt(game.board, game.size, s.target);
            if (i < 10) {
                expect(target?.stones).toHaveLength(Math.floor((i + 1) / 2) + 1);
                expect(target?.liberties).toHaveLength(i === 9 || i % 2 === 0 ? 1 : 2);
            }
            if (i === 9)
                expect(target?.liberties).toEqual([{ x: 0, y: 6 }]);
        }
        expect(groupAt(game.board, 7, s.target)).toBeNull();
        expect(game.captures).toEqual({ black: 6, white: 0 });
        for (const p of [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 2, y: 5 }, { x: 2, y: 6 }, { x: 1, y: 6 }])
            expect(game.board[p.y][p.x]).toBeNull();
        expect(game.moves).toHaveLength(11);
        expect(game.past).toHaveLength(11);
        expect(game.history).toHaveLength(12);
    });
    it("helper connects four stones with three liberties, then comparison leaves two and captures none", () => {
        const s = LADDER_PRACTICE_SCENARIOS[1];
        let game = createPosition(s.initial);
        for (const [i, a] of s.moves.entries()) {
            const r = playMove(game, a.point);
            expect(r.ok).toBe(true);
            if (!r.ok)
                throw Error(r.reason);
            game = r.state;
            if (i >= 3) {
                const t = groupAt(game.board, 7, s.target)!;
                expect(t.stones).toHaveLength(4);
                expect(points(t.liberties)).toEqual(points(i === 3 ? [{ x: 3, y: 4 }, { x: 3, y: 5 }, { x: 2, y: 6 }] : [{ x: 3, y: 5 }, { x: 2, y: 6 }]));
            }
        }
        expect(game.captures).toEqual({ black: 0, white: 0 });
        expect(game.moves).toHaveLength(5);
    });
    it("requires completion plus the existing checkpoint, score and preceding-unit gate", () => {
        const p = createDefaultProgress();
        expect(canStartLadderPractice(p)).toBe(false);
        p.completedUnitIds = ["s2-ladder"];
        expect(canStartLadderPractice(p)).toBe(false);
        p.completedUnitIds.push("s1-checkpoint", "s2-connect-cut");
        p.bestQuizScores["stage-1"] = 79;
        expect(canStartLadderPractice(p)).toBe(false);
        p.bestQuizScores["stage-1"] = 80;
        expect(canStartLadderPractice(p)).toBe(true);
        p.completedUnitIds = p.completedUnitIds.filter(id => id !== "s2-ladder");
        expect(canStartLadderPractice(p)).toBe(false);
    });
});
