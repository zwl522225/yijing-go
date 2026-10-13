import { passTurn, playMove } from "@/lib/go/rules";
import { groupAt } from "@/lib/go/analysis";
import type { BoardSize, GameState, MoveError, Point } from "@/lib/go/types";
import { createPosition } from "@/lib/learning/positions";
import type { DemoFrame } from "@/lib/learning/types";

export type DemoResult = {
  before: GameState;
  state: GameState;
  actionText: string;
  targetPoints: Point[];
  attemptedPoint?: Point;
  rejection?: string;
};

const REJECTIONS: Record<MoveError, string> = {
  occupied: "这里已有棋子，不能重复落子。",
  suicide: "落子后无气，也没有提子，属于禁入点。",
  ko: "这一手会重复之前的棋形，不能立即提回，请先在别处落子。",
  out_of_bounds: "尝试的位置超出棋盘范围。",
  finished: "双方已连续停手，棋局已终局，不能继续落子。",
};

function groupPoints(state: GameState, point: Point): Point[] {
  return groupAt(state.board,state.size,point)?.stones ?? [];
}

/** Each frame owns a pre-action position and its complete replay history. */
export function resolveDemoFrame(size: BoardSize, frame: DemoFrame, choices: readonly {id: string; label: string}[] = []): DemoResult {
  const before = createPosition({size, ...frame});
  const result: DemoResult = {before, state: before, actionText: "", targetPoints: []};
  const action = frame.move;
  if (!action) return result;
  const color = before.toPlay === "black" ? "黑棋" : "白棋";
  if (action.kind === "move") {
    const played = playMove(before, action.point);
    const actionText = `${color}尝试在第 ${action.point.x + 1} 列、第 ${action.point.y + 1} 行落子。`;
    return played.ok
      ? {...result, state: played.state, actionText: `${color}已在第 ${action.point.x + 1} 列、第 ${action.point.y + 1} 行落子。`}
      : {...result, actionText, attemptedPoint: action.point, rejection: REJECTIONS[played.reason]};
  }
  if (action.kind === "pass") {
    return before.consecutivePasses >= 2
      ? {...result, actionText: `${color}尝试停一手。`, rejection: "双方已连续停手，棋局已终局。"}
      : {...result, state: passTurn(before), actionText: `${color}停一手，交出回合。`};
  }
  if (action.kind === "choice") {
    return {...result, actionText: `选择说明：${choices.find(choice => choice.id === action.choiceId)?.label ?? frame.caption}`};
  }
  const targetPoints = groupPoints(before, action.point);
  return {
    ...result,
    targetPoints,
    actionText: action.kind === "mark-dead" ? "死子目标已圈出，棋子保留在棋盘上，供终局确认。" : "所选棋块已圈出，选择棋块不会落子或改变回合。",
    ...(targetPoints.length ? {} : {rejection: "目标位置没有可选棋子。"}),
  };
}
