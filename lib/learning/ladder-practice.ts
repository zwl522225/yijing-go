import type { Color, Point } from "@/lib/go/types";
import type { PositionSpec } from "@/lib/learning/types";
import { STAGE_2_SHAPES } from "@/lib/learning/stage-2";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
export type LadderPracticeScenario = {
    id: "capture" | "helper";
    title: string;
    initial: PositionSpec;
    target: Point;
    moves: {
        actor: Color;
        point: Point;
    }[];
    hints: [
        string,
        string,
        string
    ][];
};
const capturePoints = [[3, 2], [2, 3], [3, 3], [2, 4], [3, 4], [2, 5], [3, 5], [2, 6], [3, 6], [1, 6], [0, 6]];
function scenario(id: LadderPracticeScenario["id"]): LadderPracticeScenario {
    const moves = (id === "capture" ? capturePoints : capturePoints.slice(0, 5)).map(([x, y], i) => ({ actor: (i % 2 ? "white" : "black") as Color, point: { x, y } }));
    return {
        id, title: id === "capture" ? "连续征吃到棋盘边" : "接应子改变征子路线",
        initial: structuredClone(id === "capture" ? STAGE_2_SHAPES.ladder : STAGE_2_SHAPES.ladderHelper),
        target: { x: 2, y: 2 }, moves,
        hints: moves.filter(m => m.actor === "black").map((m, i) => [
            id === "helper" && i === 2 ? "先观察白棋接到同伴后的气。" : "先数目标白棋现在的气。",
            id === "helper" && i === 2 ? "照原路线追一手，比较白棋还剩多少气。" : "沿示范路线封住目标白棋的一口气。",
            `黑棋下在（${m.point.x + 1}，${m.point.y + 1}）${id === "helper" && i === 2 ? "，这是比较实验，不保证叫吃。" : "。"}`,
        ]),
    };
}
export const LADDER_PRACTICE_SCENARIOS: LadderPracticeScenario[] = [scenario("capture"), scenario("helper")];
export function canStartLadderPractice(progress: LearningProgress): boolean {
    return progress.completedUnitIds.includes("s2-ladder") && isUnitUnlocked("s2-ladder", progress);
}
