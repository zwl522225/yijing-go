import { createPosition, isPointOnBoard, isValidSetupMove } from "@/lib/learning/positions";
import { applyLessonAction } from "@/lib/learning/evaluate";
import type { BoardSize } from "@/lib/go/types";
import { LESSON_UNIT_IDS, TERM_IDS } from "@/lib/learning/types";
import type { CurriculumUnit, Exercise, GlossaryEntry, LessonAction, PositionSpec, StageId } from "@/lib/learning/types";

const STAGE_SIZE: Record<StageId, BoardSize> = { "stage-1": 5, "stage-2": 7, "stage-3": 9 };
const BOARD_SIZES = [5, 7, 9, 13, 19];
const lessonUnitIds = new Set<string>(LESSON_UNIT_IDS);
const termIdsCatalog = new Set<string>(TERM_IDS);
const isColor = (value: unknown): boolean => value === "black" || value === "white";
const isNonemptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const identifierContext = (value: unknown, fallback: string): string => isNonemptyString(value) ? value : fallback;
const identifierLabel = (value: unknown): string => typeof value === "string" ? value : "<invalid>";

function validatePosition(spec: PositionSpec, context: string, errors: string[]): boolean {
  if (!spec || typeof spec !== "object") {
    errors.push(`${context}: missing position`);
    return false;
  }
  let valid = true;
  if (!BOARD_SIZES.includes(spec.size)) {
    errors.push(`${context}: invalid board size`);
    valid = false;
  }
  if (!isColor(spec.toPlay)) {
    errors.push(`${context}: toPlay must be black or white`);
    valid = false;
  }
  if (!Array.isArray(spec.stones)) {
    errors.push(`${context}: stones must be an array`);
    valid = false;
  } else {
    for (const [index, stone] of spec.stones.entries()) {
      if (!Array.isArray(stone) || stone.length !== 3) {
        errors.push(`${context}/stones/${index}: invalid stone tuple`);
        valid = false;
        continue;
      }
      if (!isColor(stone[0])) {
        errors.push(`${context}/stones/${index}: stone color must be black or white`);
        valid = false;
      }
      if (BOARD_SIZES.includes(spec.size) && !isPointOnBoard({ x: stone[1], y: stone[2] }, spec.size)) {
        errors.push(`${context}/stones/${index}: stone is out of bounds`);
        valid = false;
      }
    }
  }
  if (spec.setupMoves !== undefined) {
    if (!Array.isArray(spec.setupMoves)) {
      errors.push(`${context}/setupMoves: must be an array`);
      valid = false;
    } else {
      for (const [index, action] of spec.setupMoves.entries()) {
        const path = `${context}/setupMoves/${index}`;
        if (!isValidSetupMove(action, spec.size)) {
          errors.push(`${path}: setup move is invalid or out of bounds`);
          valid = false;
        }
      }
    }
  }
  if (!valid) return false;
  try {
    createPosition(spec);
    return true;
  } catch (error) {
    errors.push(`${context}: invalid position (${String(error)})`);
    return false;
  }
}

function validateFrames(frames: unknown, size: BoardSize, context: string, errors: string[]): void {
  if (!Array.isArray(frames)) {
    errors.push(`${context}: frames must be an array`);
    return;
  }
  for (const [index, frame] of frames.entries()) {
    const path = `${context}/${index}`;
    if (!frame || typeof frame !== "object") {
      errors.push(`${path}: invalid frame`);
      continue;
    }
    validatePosition({ size, stones: frame.stones, toPlay: frame.toPlay, setupMoves: frame.setupMoves }, path, errors);
    if (frame.move !== undefined) validateAction(frame.move, size, `${path}/move`, errors);
  }
}

function validateAction(action: LessonAction, size: BoardSize, context: string, errors: string[]): void {
  if (!action || typeof action !== "object" || !["move", "pass", "select-group", "mark-dead", "choice"].includes(action.kind)) {
    errors.push(`${context}: action kind has no task control`);
    return;
  }
  if (["move", "select-group", "mark-dead"].includes(action.kind)) {
    if (!("point" in action) || !isPointOnBoard(action.point, size)) errors.push(`${context}: expected point is out of bounds`);
  }
  if (action.kind === "choice" && !isNonemptyString(action.choiceId)) {
    errors.push(`${context}: choice action requires a choiceId task control`);
  }
}

function validateExercise(exercise: Exercise, context: string, errors: string[], requireNoInitialHint = false, expectedSize?: BoardSize): void {
  if (!exercise || typeof exercise !== "object") {
    errors.push(`${context}: invalid exercise`);
    return;
  }
  const positionValid = validatePosition(exercise.position, context, errors);
  if (expectedSize !== undefined && exercise.position?.size !== expectedSize) {
    errors.push(`${context}: position size must match the unit board size ${expectedSize}`);
  }
  const size = exercise.position?.size ?? expectedSize ?? 5;
  validateAction(exercise.expected, size, context, errors);
  const hints = Array.isArray(exercise.hints) ? exercise.hints : [];
  if (!Array.isArray(exercise.hints)) errors.push(`${context}/hints: must be an array`);
  const levels = hints.map((hint) => hint?.level);
  if (levels.length !== 3 || levels.join(",") !== "1,2,3") errors.push(`${context}: hint levels must be exactly 1, 2, 3`);
  for (const [index, hint] of hints.entries()) {
    if (!hint || typeof hint !== "object") {
      errors.push(`${context}/hints/${index}: invalid hint`);
      continue;
    }
    if (hint.points !== undefined && !Array.isArray(hint.points)) {
      errors.push(`${context}/hints/${index}/points: must be an array`);
      continue;
    }
    for (const point of hint.points ?? []) {
      if (!isPointOnBoard(point, size)) errors.push(`${context}/hints/${index}: hinted point is out of bounds`);
    }
  }
  if (requireNoInitialHint && exercise.initialHintLevel !== 0) errors.push(`${context}: quiz initialHintLevel must be 0`);
  if (exercise.choices !== undefined && !Array.isArray(exercise.choices)) {
    errors.push(`${context}/choices: must be an array`);
  }
  const choices = Array.isArray(exercise.choices) ? exercise.choices : [];
  const choiceIds = new Set<string>();
  for (const [index, choice] of choices.entries()) {
    if (!choice || typeof choice !== "object" || !isNonemptyString(choice.id)) {
      errors.push(`${context}/choices/${index}: invalid choice`);
      continue;
    }
    if (choiceIds.has(choice.id)) errors.push(`${context}: duplicate choice ID: ${choice.id}`);
    choiceIds.add(choice.id);
  }
  if (exercise.expected?.kind === "choice") {
    const choiceId = exercise.expected.choiceId;
    if (!choiceIds.has(choiceId)) {
      errors.push(`${context}: expected choice ${identifierLabel(choiceId)} is missing from choices`);
    }
  } else if (choices.length) {
    errors.push(`${context}: non-choice action cannot rely on choices`);
  }
  if (typeof exercise.errors?.wrong_answer !== "string" || !exercise.errors.wrong_answer) {
    errors.push(`${context}: wrong_answer message is required`);
  }
  if (positionValid && exercise.expected && !errors.some((message) => message.startsWith(`${context}: expected point`))) {
    try {
      if (!applyLessonAction(exercise, exercise.position, exercise.expected).completed) {
        errors.push(`${context}: expected action cannot complete from initial position`);
      }
    } catch (error) {
      errors.push(`${context}: expected action cannot complete (${String(error)})`);
    }
  }
}

export function validateLearningCatalog(units: readonly CurriculumUnit[], terms: readonly GlossaryEntry[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(units)) errors.push("units: must be an array");
  if (!Array.isArray(terms)) errors.push("terms: must be an array");
  const catalogUnits: readonly CurriculumUnit[] = Array.isArray(units) ? units : [];
  const catalogTerms: readonly GlossaryEntry[] = Array.isArray(terms) ? terms : [];
  const unitIds = new Set<string>();
  const termIds = new Set<string>();
  const orders = new Set<string>();
  const exerciseIds = new Set<string>();
  const registerExerciseId = (exercise: Exercise, context: string): void => {
    if (!exercise || typeof exercise !== "object" || !isNonemptyString(exercise.id)) {
      errors.push(`${context}: invalid exercise ID`);
      return;
    }
    if (exerciseIds.has(exercise.id)) errors.push(`${context}: duplicate exercise ID: ${exercise.id}`);
    exerciseIds.add(exercise.id);
  };

  for (const [index, unit] of catalogUnits.entries()) {
    if (!unit || typeof unit !== "object") {
      errors.push(`units/${index}: invalid unit`);
      continue;
    }
    if (unit.kind !== "lesson" && unit.kind !== "quiz" && unit.kind !== "graduation") {
      errors.push(`units/${index}/kind: must be lesson, quiz, or graduation`);
    }
    if (!isNonemptyString(unit.id) || !lessonUnitIds.has(unit.id)) {
      errors.push(`units/${index}/id: must be a known lesson unit ID`);
    } else {
      if (unitIds.has(unit.id)) errors.push(`duplicate unit ID: ${unit.id}`);
      unitIds.add(unit.id);
    }
    const validStage = Object.prototype.hasOwnProperty.call(STAGE_SIZE, unit.stageId);
    if (!validStage) errors.push(`units/${index}/stageId: must be stage-1, stage-2, or stage-3`);
    const validOrder = Number.isInteger(unit.order) && unit.order > 0;
    if (!validOrder) errors.push(`units/${index}/order: must be a positive integer`);
    if (validStage && validOrder) {
      const orderKey = `${unit.stageId}:${unit.order}`;
      if (orders.has(orderKey)) errors.push(`units/${index}/order: duplicate order in ${unit.stageId}: ${unit.order}`);
      orders.add(orderKey);
    }
    if (!BOARD_SIZES.includes(unit.boardSize)) {
      errors.push(`units/${index}/boardSize: must be a supported board size`);
    } else if (validStage && unit.boardSize !== STAGE_SIZE[unit.stageId]) {
      errors.push(`units/${index}/boardSize: ${unit.stageId} board size must be ${STAGE_SIZE[unit.stageId]}`);
    }
  }
  for (const [index, term] of catalogTerms.entries()) {
    if (!term || typeof term !== "object") {
      errors.push(`terms/${index}: invalid term`);
      continue;
    }
    if (!isNonemptyString(term.id) || !termIdsCatalog.has(term.id)) {
      errors.push(`terms/${index}/id: must be a known term ID`);
    } else {
      if (termIds.has(term.id)) errors.push(`duplicate term ID: ${term.id}`);
      termIds.add(term.id);
    }
  }

  for (const [unitIndex, unit] of catalogUnits.entries()) {
    if (!unit || typeof unit !== "object") continue;
    const unitContext = identifierContext(unit.id, `units/${unitIndex}`);
    if (!Array.isArray(unit.terms)) errors.push(`${unitContext}/terms: must be an array`);
    else for (const id of unit.terms) if (!termIds.has(id)) errors.push(`${unitContext}: unknown term ${identifierLabel(id)}`);
    if (unit.kind === "lesson") {
      validateFrames(unit.demo, unit.boardSize, `${unitContext}/demo`, errors);
      if (!Array.isArray(unit.exercises)) errors.push(`${unitContext}/exercises: must be an array`);
      const exercises = Array.isArray(unit.exercises) ? unit.exercises : [];
      if (exercises.length !== 3) errors.push(`${unitContext}: ordinary lesson needs exactly three exercises`);
      if (exercises.map((item) => item?.initialHintLevel).join(",") !== "2,1,0") {
        errors.push(`${unitContext}: initialHintLevel sequence must be 2, 1, 0`);
      }
      exercises.forEach((item, index) => {
        registerExerciseId(item, unitContext);
        validateExercise(item, `${unitContext}/${identifierContext(item?.id, `exercises/${index}`)}`, errors, false, unit.boardSize);
      });
    } else if (unit.kind === "quiz") {
      validateFrames(unit.demo, unit.boardSize, `${unitContext}/demo`, errors);
      if (!Array.isArray(unit.questions)) errors.push(`${unitContext}/questions: must be an array`);
      const questions = Array.isArray(unit.questions) ? unit.questions : [];
      if (questions.length !== 5) errors.push(`${unitContext}: quiz needs exactly five questions`);
      if (unit.passingScore !== 80) errors.push(`${unitContext}: passingScore must be 80`);
      questions.forEach((item, index) => {
        registerExerciseId(item, unitContext);
        const questionContext = `${unitContext}/${identifierContext(item?.id, `questions/${index}`)}`;
        if (item && !termIds.has(item.termId)) errors.push(`${questionContext}: unknown term ${identifierLabel(item.termId)}`);
        validateExercise(item, questionContext, errors, true, unit.boardSize);
      });
    } else if (unit.kind === "graduation") {
      if (unit.stageId !== "stage-3" || unit.boardSize !== 9 || unit.requiredBoardSize !== 9) {
        errors.push(`${unitContext}: graduation requires stage-3 and boardSize/requiredBoardSize 9`);
      }
    }
  }

  for (const [termIndex, term] of catalogTerms.entries()) {
    if (!term || typeof term !== "object") continue;
    const termContext = identifierContext(term.id, `terms/${termIndex}`);
    if (!Array.isArray(term.lessonIds)) errors.push(`${termContext}/lessonIds: must be an array`);
    else for (const id of term.lessonIds) if (!unitIds.has(id)) errors.push(`${termContext}: unknown lesson ${identifierLabel(id)}`);
    if (!Array.isArray(term.relatedTermIds)) errors.push(`${termContext}/relatedTermIds: must be an array`);
    else for (const id of term.relatedTermIds) if (!termIds.has(id)) errors.push(`${termContext}: unknown related term ${identifierLabel(id)}`);
    const animation = term.animation;
    if (!animation || typeof animation !== "object") {
      errors.push(`${termContext}/animation: invalid animation`);
    } else {
      validatePosition(animation.position, `${termContext}/animation`, errors);
      validateFrames(animation.frames, animation.position?.size ?? 5, `${termContext}/animation/frames`, errors);
    }
    registerExerciseId(term.practice, termContext);
    validateExercise(term.practice, `${termContext}/practice`, errors);
  }
  return errors;
}

export function assertValidLearningCatalog(units: readonly CurriculumUnit[], terms: readonly GlossaryEntry[]): void {
  const errors = validateLearningCatalog(units, terms);
  if (errors.length) throw new Error(`Invalid learning catalog:\n${errors.join("\n")}`);
}
