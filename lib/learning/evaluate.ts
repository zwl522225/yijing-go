import { passTurn, playMove } from "@/lib/go/rules";
import { groupAt } from "@/lib/go/analysis";
import type { GameState, Point } from "@/lib/go/types";
import { createPosition, isPointOnBoard } from "@/lib/learning/positions";
import type { Exercise, LessonAction, LessonErrorKey, PositionSpec } from "@/lib/learning/types";

export type ExerciseFailure = {
  kind: "rule" | "goal" | "action";
  reason: LessonErrorKey | "wrong_action";
  point?: Point;
  nextStep: string;
};

export type ExerciseResult = {
  completed: boolean;
  retryable: boolean;
  message: string;
  nextState: GameState;
  failure?: ExerciseFailure;
};

const RULE_NEXT_STEP = {
  occupied: "选择空交叉点重试。",
  suicide: "先数相邻空交叉点，再检查能否连接或提子。",
  ko: "先在别处找合法落点，再检查能否提回。",
  out_of_bounds: "在当前棋盘内的交叉点操作。",
  finished: "双方已连续停手，接下来确认死子并核对计分。",
} as const;
const ACTION_NEXT_STEP: Record<LessonAction["kind"], string> = {
  move: "按当前任务在棋盘交叉点落子。",
  pass: "使用当前任务的停一手按钮。",
  choice: "阅读当前任务，再选择一个答案。",
  "select-group": "按当前任务选择棋盘上的棋块。",
  "mark-dead": "按当前任务标记死子棋块。",
};

function sameGroup(state: GameState, actual: Point, expected: Point): boolean {
  return groupAt(state.board,state.size,expected)?.stones.some(point=>point.x===actual.x && point.y===actual.y) ?? false;
}

export function applyLessonAction(exercise: Exercise, current: PositionSpec | GameState, action: LessonAction): ExerciseResult {
  const state = "board" in current ? current : createPosition(current);
  const point = "point" in action ? { ...action.point } : undefined;
  const failure = (message: string, kind: ExerciseFailure["kind"] = "goal",
    reason: ExerciseFailure["reason"] = "wrong_answer", nextStep = "重新检查当前任务；需要时查看已有提示。"): ExerciseResult => ({
      completed: false, retryable: true, message, nextState: state,
      failure: { kind, reason, ...(point ? { point } : {}), nextStep },
    });
  const success = (nextState: GameState): ExerciseResult => ({ completed: true, retryable: false, message: exercise.success, nextState });
  const expected = exercise.expected;
  const wrongAction = () => failure(exercise.errors.wrong_answer, "action", "wrong_action", ACTION_NEXT_STEP[expected.kind]);

  if (action.kind === "move") {
    if (!isPointOnBoard(action.point, state.size)) return failure(exercise.errors.out_of_bounds ?? "out_of_bounds", "rule", "out_of_bounds", RULE_NEXT_STEP.out_of_bounds);
    const result = playMove(state, action.point);
    if (!result.ok) {
      return failure(exercise.errors[result.reason] ?? result.reason, "rule", result.reason, RULE_NEXT_STEP[result.reason]);
    }
    if (expected.kind !== "move") return wrongAction();
    return action.point.x === expected.point.x && action.point.y === expected.point.y
      ? success(result.state) : failure(exercise.errors.wrong_answer);
  }
  if (action.kind !== expected.kind) return wrongAction();
  if (action.kind === "pass") return state.consecutivePasses < 2 ? success(passTurn(state)) : failure(exercise.errors.wrong_answer, "rule", "finished", RULE_NEXT_STEP.finished);
  if (action.kind === "choice") return action.choiceId === (expected as Extract<LessonAction, { kind: "choice" }>).choiceId
    ? success(state) : failure(exercise.errors.wrong_answer);
  if (action.kind === "mark-dead" && state.consecutivePasses < 2) {
    return failure("双方连续停手后才能标记死子。", "action", "wrong_action", "双方连续停手后，再按任务标记死子。");
  }
  if (action.kind === "select-group" || action.kind === "mark-dead") {
    return sameGroup(state, action.point, (expected as Extract<LessonAction, { kind: "select-group" | "mark-dead" }>).point)
      ? success(state) : failure(exercise.errors.wrong_answer);
  }
  return failure(exercise.errors.wrong_answer);
}
