import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import { createLearningSession, submitLearningAction, type AcceptedLessonAction, type LearningSession } from "@/lib/learning/session";
import type { LessonAction, LessonUnit, LessonUnitId } from "@/lib/learning/types";

export type { AcceptedLessonAction } from "@/lib/learning/session";
export type LessonResume = {
  version: 1;
  unitId: LessonUnitId;
  signature: string;
  acceptedActions: AcceptedLessonAction[];
  hintLevel: number;
};

function signature(unit: LessonUnit): string {
  return JSON.stringify([unit.id, unit.boardSize, unit.exercises]);
}

function copyAction(action: LessonAction): LessonAction {
  return "point" in action ? { ...action, point: { ...action.point } } : { ...action };
}

export function createLessonResume(session: LearningSession): LessonResume | null {
  const unit = CURRICULUM_BY_ID.get(session.unitId);
  if (unit?.kind !== "lesson" || session.completed) return null;
  return {
    version: 1, unitId: unit.id, signature: signature(unit),
    acceptedActions: session.acceptedActions.map(entry => ({ ...entry, action: copyAction(entry.action) })),
    hintLevel: session.hintLevel,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isHintLevel(value: unknown, minimum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= 3;
}

function readAction(value: unknown, size: number): LessonAction | null {
  if (!isObject(value)) return null;
  if (value.kind === "pass") return hasOnlyKeys(value, ["kind"]) ? { kind: "pass" } : null;
  if (value.kind === "choice") {
    return hasOnlyKeys(value, ["kind", "choiceId"]) && typeof value.choiceId === "string" && value.choiceId.length > 0 && value.choiceId.length <= 256
      ? { kind: "choice", choiceId: value.choiceId } : null;
  }
  if (value.kind !== "move" && value.kind !== "select-group" && value.kind !== "mark-dead") return null;
  if (!hasOnlyKeys(value, ["kind", "point"]) || !isObject(value.point) || !hasOnlyKeys(value.point, ["x", "y"])) return null;
  const { x, y } = value.point;
  return Number.isInteger(x) && Number.isInteger(y) && Number(x) >= 0 && Number(x) < size && Number(y) >= 0 && Number(y) < size
    ? { kind: value.kind, point: { x: Number(x), y: Number(y) } } : null;
}

/** Rebuild through the rules engine; restoring never awards progress or retains feedback. */
export function restoreLessonResume(value: unknown, progress: LearningProgress): LearningSession | null {
  if (!isObject(value) || value.version !== 1 || typeof value.unitId !== "string" || value.unitId.length > 128) return null;
  const unit = CURRICULUM_BY_ID.get(value.unitId as LessonUnitId);
  if (unit?.kind !== "lesson" || !isUnitUnlocked(unit.id, progress) || value.signature !== signature(unit)) return null;
  if (!Array.isArray(value.acceptedActions) || value.acceptedActions.length >= unit.exercises.length) return null;
  let session = createLearningSession(unit.id);
  for (const entry of value.acceptedActions) {
    const exercise = session.exercise;
    if (!exercise || !isObject(entry) || !hasOnlyKeys(entry, ["exerciseId", "action", "hintLevel"]) || entry.exerciseId !== exercise.id || !isHintLevel(entry.hintLevel, exercise.initialHintLevel)) return null;
    const action = readAction(entry.action, session.state.size);
    if (!action) return null;
    session = submitLearningAction({ ...session, hintLevel: entry.hintLevel }, action);
    if (!session.feedback?.completed || session.completed) return null;
    // Clear immediately so each subsequent previous snapshot is clean as well.
    session = { ...session, feedback: null, feedbackExerciseId: undefined };
  }
  if (!session.exercise || !isHintLevel(value.hintLevel, session.exercise.initialHintLevel)) return null;
  return { ...session, hintLevel: value.hintLevel };
}
