import { passTurn, playMove } from "@/lib/go/rules";
import { groupAt } from "@/lib/go/analysis";
import type { GameState, Point } from "@/lib/go/types";
import { createPosition, isPointOnBoard } from "@/lib/learning/positions";
import type { Exercise, LessonAction, PositionSpec } from "@/lib/learning/types";

export type ExerciseResult = {
  completed: boolean;
  retryable: boolean;
  message: string;
  nextState: GameState;
};

function sameGroup(state: GameState, actual: Point, expected: Point): boolean {
  return groupAt(state.board,state.size,expected)?.stones.some(point=>point.x===actual.x && point.y===actual.y) ?? false;
}

export function applyLessonAction(exercise: Exercise, current: PositionSpec | GameState, action: LessonAction): ExerciseResult {
  const state = "board" in current ? current : createPosition(current);
  const failure = (message: string): ExerciseResult => ({ completed: false, retryable: true, message, nextState: state });
  const success = (nextState: GameState): ExerciseResult => ({ completed: true, retryable: false, message: exercise.success, nextState });
  const expected = exercise.expected;

  if (action.kind === "move") {
    if (!isPointOnBoard(action.point, state.size)) return failure(exercise.errors.out_of_bounds ?? "out_of_bounds");
    const result = playMove(state, action.point);
    if (!result.ok) {
      return failure(exercise.errors[result.reason] ?? result.reason);
    }
    return expected.kind === "move" && action.point.x === expected.point.x && action.point.y === expected.point.y
      ? success(result.state) : failure(exercise.errors.wrong_answer);
  }
  if (action.kind !== expected.kind) return failure(exercise.errors.wrong_answer);
  if (action.kind === "pass") return state.consecutivePasses < 2 ? success(passTurn(state)) : failure(exercise.errors.wrong_answer);
  if (action.kind === "choice") return action.choiceId === (expected as Extract<LessonAction, { kind: "choice" }>).choiceId
    ? success(state) : failure(exercise.errors.wrong_answer);
  if (action.kind === "mark-dead" && state.consecutivePasses < 2) {
    return failure("双方连续停手后才能标记死子。");
  }
  if (action.kind === "select-group" || action.kind === "mark-dead") {
    return sameGroup(state, action.point, (expected as Extract<LessonAction, { kind: "select-group" | "mark-dead" }>).point)
      ? success(state) : failure(exercise.errors.wrong_answer);
  }
  return failure(exercise.errors.wrong_answer);
}
