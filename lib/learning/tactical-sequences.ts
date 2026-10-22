import type { Point } from "@/lib/go/types";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import { STAGE_2_SHAPES } from "@/lib/learning/stage-2";
import type { PositionSpec } from "@/lib/learning/types";

export type TacticalHints = [string, string, string];
export type TacticalBranch = {
  id: string;
  label: string;
  reply: Point;
  second: Point;
  secondHints: TacticalHints;
};
export type TacticalSequence = {
  id: "net" | "snapback";
  title: string;
  unitId: "s2-net" | "s2-snapback";
  initial: PositionSpec;
  target: Point;
  first: Point;
  firstHints: TacticalHints;
  branches: TacticalBranch[];
};

export const TACTICAL_SEQUENCES: TacticalSequence[] = [
  {
    id: "net", title: "枷吃：先布网，再收口", unitId: "s2-net",
    initial: STAGE_2_SHAPES.net, target: {x:3,y:3}, first: {x:4,y:4},
    firstHints: ["先看目标白棋的两条局部出口。", "不必立即打吃，试着同时照看右、下两侧。", "黑棋下在（5，5）。"],
    branches: [
      { id: "right", label: "看白棋向右延出（5，4）", reply: {x:4,y:3}, second: {x:3,y:4}, secondHints: ["重新数延出后整组白棋的气。", "它的最后一口气在下方。", "黑棋下在（4，5）。"] },
      { id: "down", label: "看白棋向下延出（4，5）", reply: {x:3,y:4}, second: {x:4,y:3}, secondHints: ["重新数延出后整组白棋的气。", "它的最后一口气在右方。", "黑棋下在（5，4）。"] },
    ],
  },
  {
    id: "snapback", title: "倒扑：先弃子，再反提", unitId: "s2-snapback",
    initial: STAGE_2_SHAPES.snapback, target: {x:1,y:1}, first: {x:0,y:2},
    firstHints: ["先观察白棋旁边的边线空点。", "这一手先投入一子，观察白棋提子后的变化。", "黑棋下在（1，3）。"],
    branches: [
      { id: "capture", label: "看白棋在（1，2）提掉这一子", reply: {x:0,y:1}, second: {x:0,y:2}, secondHints: ["查看白棋提子后整组棋的气。", "最后一口气正是刚才黑子被提走的位置。", "黑棋回到（1，3）。"] },
    ],
  },
];

export function canStartTacticalSequence(scenario: TacticalSequence, progress: LearningProgress): boolean {
  return progress.completedUnitIds.includes(scenario.unitId) && isUnitUnlocked(scenario.unitId, progress);
}
