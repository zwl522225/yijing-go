import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import type { LessonUnitId, StageId, TermId, TermStatus } from "@/lib/learning/types";

export type LearningAssists = {
  showLiberties: boolean;
  showAtari: boolean;
  showCoordinates: boolean;
  explainMoves: boolean;
  autoOpenTerms: boolean;
};

export type GraduationProgress = {
  completedNineLineGame: boolean;
  enteredScoring: boolean;
  confirmedDeadStones: boolean;
  finalizedScore: boolean;
};

export type LearningProgress = {
  completedUnitIds: LessonUnitId[];
  bestQuizScores: Partial<Record<StageId, number>>;
  wrongQuestionIds: string[];
  termStates: Partial<Record<TermId, TermStatus>>;
  assists: LearningAssists;
  graduation: GraduationProgress;
};

export const DEFAULT_ASSISTS: Readonly<LearningAssists> = Object.freeze({
  showLiberties: false,
  showAtari: false,
  showCoordinates: false,
  explainMoves: false,
  autoOpenTerms: false,
});

export const DEFAULT_GRADUATION: Readonly<GraduationProgress> = Object.freeze({
  completedNineLineGame: false,
  enteredScoring: false,
  confirmedDeadStones: false,
  finalizedScore: false,
});

export const DEFAULT_PROGRESS: Readonly<LearningProgress> = Object.freeze({
  completedUnitIds: [],
  bestQuizScores: {},
  wrongQuestionIds: [],
  termStates: {},
  assists: DEFAULT_ASSISTS,
  graduation: DEFAULT_GRADUATION,
});

export function createDefaultProgress(): LearningProgress {
  return {
    completedUnitIds: [],
    bestQuizScores: {},
    wrongQuestionIds: [],
    termStates: {},
    assists: { ...DEFAULT_ASSISTS },
    graduation: { ...DEFAULT_GRADUATION },
  };
}

const CHECKPOINTS: Partial<Record<StageId, LessonUnitId>> = {
  "stage-1": "s1-checkpoint",
  "stage-2": "s2-checkpoint",
};
const STAGE_TWO_START = LESSON_UNIT_IDS.indexOf("s2-connect-cut");
const STAGE_THREE_START = LESSON_UNIT_IDS.indexOf("s3-corner-side-center");

export function isGraduated(progress: LearningProgress): boolean {
  return Object.values(progress.graduation).every(Boolean) &&
    isUnitUnlocked("s3-graduation", progress);
}

export function isUnitUnlocked(id: LessonUnitId, progress: LearningProgress): boolean {
  const index = LESSON_UNIT_IDS.indexOf(id);
  if (index < 0) return false;
  if (index === 0) return true;
  if (index >= STAGE_TWO_START && !(
    progress.completedUnitIds.includes("s1-checkpoint") &&
    (progress.bestQuizScores["stage-1"] ?? 0) >= 80
  )) return false;
  if (index >= STAGE_THREE_START && !(
    progress.completedUnitIds.includes("s2-checkpoint") &&
    (progress.bestQuizScores["stage-2"] ?? 0) >= 80
  )) return false;
  const previous = LESSON_UNIT_IDS[index - 1];
  return progress.completedUnitIds.includes(previous);
}

export function completeUnit(progress: LearningProgress, id: LessonUnitId): LearningProgress {
  if (id === "s1-checkpoint" || id === "s2-checkpoint") return progress;
  if (id === "s3-graduation" && !isGraduated(progress)) return progress;
  if (!isUnitUnlocked(id, progress) || progress.completedUnitIds.includes(id)) return progress;
  return { ...progress, completedUnitIds: [...progress.completedUnitIds, id] };
}

export function recordQuizScore(
  progress: LearningProgress,
  stageId: StageId,
  score: number,
  wrongQuestionIds: readonly string[],
): LearningProgress {
  if (!Number.isFinite(score) || score < 0 || score > 100) return progress;
  const checkpoint = CHECKPOINTS[stageId];
  if (!checkpoint || !isUnitUnlocked(checkpoint, progress)) return progress;
  const best = Math.max(progress.bestQuizScores[stageId] ?? 0, score);
  const completedUnitIds = best >= 80 && !progress.completedUnitIds.includes(checkpoint)
    ? [...progress.completedUnitIds, checkpoint]
    : progress.completedUnitIds;
  return {
    ...progress,
    completedUnitIds,
    bestQuizScores: { ...progress.bestQuizScores, [stageId]: best },
    wrongQuestionIds: [...new Set([...progress.wrongQuestionIds, ...wrongQuestionIds])],
  };
}

const TERM_LEVEL: Record<TermStatus, number> = { seen: 0, practiced: 1, mastered: 2 };

export function advanceTermStatus(current: TermStatus | undefined, next: TermStatus): TermStatus {
  return current && TERM_LEVEL[current] >= TERM_LEVEL[next] ? current : next;
}

export function getRecommendedUnit(progress: LearningProgress): LessonUnitId | null {
  return LESSON_UNIT_IDS.find((id) =>
    (id === "s3-graduation" ? !isGraduated(progress) : !progress.completedUnitIds.includes(id)) && isUnitUnlocked(id, progress)) ?? null;
}

export function recordGraduationEvent(
  progress: LearningProgress,
  event: keyof GraduationProgress,
): LearningProgress {
  const graduation = { ...progress.graduation, [event]: true };
  const updated = { ...progress, graduation };
  return completeUnit(updated, "s3-graduation");
}
