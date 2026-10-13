import type { Difficulty } from "@/lib/go/ai";
import { BOARD_SIZES } from "@/lib/go/types";
import type { BoardSize, GameSnapshot, GameState, Move } from "@/lib/go/types";
import type { SoundscapeCategory } from "@/lib/audio/soundscapes";
import { createDefaultProgress, DEFAULT_ASSISTS, DEFAULT_GRADUATION, isGraduated } from "@/lib/learning/progress";
import type { GraduationProgress, LearningAssists, LearningProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS, TERM_IDS } from "@/lib/learning/types";
import type { LessonUnitId, StageId, TermId, TermStatus } from "@/lib/learning/types";

const SAVE_VERSION = 3;
// Retained solely for reading historical saves created by the original six lessons.
type LessonId = "liberties" | "capture" | "suicide" | "ko" | "eyes" | "scoring";
export const SAVE_KEY = "yijing-go-save";

export type ScorePhase = "dead-stones" | "score-review" | "final";
export type ScoringSave = { phase: ScorePhase; deadStones: string[]; outcome: string | null; graduationEligible: boolean };
export type SaveData = {
  game: GameState;
  learning: LearningProgress;
  difficulty: Difficulty;
  volume: number;
  category: SoundscapeCategory;
  scoring?: ScoringSave;
  confirmMoves?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type LegacySnapshot = Omit<GameSnapshot, "size">;
type LegacyGameState = LegacySnapshot & { past: LegacySnapshot[] };

function isBoardSize(value: unknown): value is BoardSize {
  return typeof value === "number" && BOARD_SIZES.some((size) => size === value);
}

function isMove(value: unknown, size: number): value is Move {
  if (!isObject(value)) return false;
  if (value.pass === true) return true;
  return (
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    Number(value.x) >= 0 &&
    Number(value.x) < size &&
    Number(value.y) >= 0 &&
    Number(value.y) < size
  );
}

function hasSnapshotFields(value: Record<string, unknown>, size: number): boolean {
  const board = value.board;
  const captures = value.captures;
  return (
    Array.isArray(board) &&
    board.length === size &&
    board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every((cell) => cell === null || cell === "black" || cell === "white"),
    ) &&
    (value.toPlay === "black" || value.toPlay === "white") &&
    isObject(captures) &&
    typeof captures.black === "number" &&
    typeof captures.white === "number" &&
    Array.isArray(value.history) &&
    value.history.every((entry) => typeof entry === "string") &&
    Array.isArray(value.moves) &&
    value.moves.every((move) => isMove(move, size)) &&
    Number.isInteger(value.consecutivePasses)
  );
}

function isSnapshot(value: unknown): value is GameSnapshot {
  return isObject(value) && isBoardSize(value.size) && hasSnapshotFields(value, value.size);
}

function isLegacySnapshot(value: unknown): value is LegacySnapshot {
  return isObject(value) && !("size" in value) && hasSnapshotFields(value, 19);
}

function isGameState(value: unknown): value is GameState {
  if (!isObject(value)) return false;
  const past = value.past;
  return isSnapshot(value) && Array.isArray(past) &&
    past.every((snapshot) => isSnapshot(snapshot) && snapshot.size === value.size);
}

function isLegacyGameState(value: unknown): value is LegacyGameState {
  if (!isObject(value)) return false;
  const past = value.past;
  return isLegacySnapshot(value) && Array.isArray(past) && past.every(isLegacySnapshot);
}

export const LEGACY_LESSON_MAP: Readonly<Record<LessonId, LessonUnitId>> = Object.freeze({
  liberties: "s1-liberties-groups",
  capture: "s1-atari-capture",
  suicide: "s1-suicide-exception",
  ko: "s1-ko-threat",
  eyes: "s2-two-eyes",
  scoring: "s1-pass-ending",
});

export function getLegacyCompletedLessons(progress: LearningProgress): LessonId[] {
  return (Object.keys(LEGACY_LESSON_MAP) as LessonId[]).filter((id) =>
    progress.completedUnitIds.includes(LEGACY_LESSON_MAP[id]));
}

export function recordLegacyLessonCompletion(progress: LearningProgress, id: LessonId): LearningProgress {
  const mappedId = LEGACY_LESSON_MAP[id];
  if (progress.completedUnitIds.includes(mappedId)) return progress;
  return { ...progress, completedUnitIds: [...progress.completedUnitIds, mappedId] };
}

const unitIds = new Set<string>(LESSON_UNIT_IDS);
const termIds = new Set<string>(TERM_IDS);
const stageIds = new Set<string>(["stage-1", "stage-2", "stage-3"]);

function migrateLegacyLessons(value: unknown): LearningProgress {
  const completedUnitIds = Array.isArray(value)
    ? [...new Set(value.filter((id): id is LessonId =>
      typeof id === "string" && Object.hasOwn(LEGACY_LESSON_MAP, id))
      .map((id) => LEGACY_LESSON_MAP[id]))]
    : [];
  return { ...createDefaultProgress(), completedUnitIds };
}

function sanitizeLearning(value: unknown): LearningProgress {
  if (!isObject(value)) return createDefaultProgress();
  const completedUnitIds = Array.isArray(value.completedUnitIds)
    ? [...new Set(value.completedUnitIds.filter((id): id is LessonUnitId =>
      typeof id === "string" && unitIds.has(id)))]
    : [];
  const bestQuizScores: LearningProgress["bestQuizScores"] = {};
  if (isObject(value.bestQuizScores)) {
    for (const [key, score] of Object.entries(value.bestQuizScores)) {
      if (stageIds.has(key) && typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100) {
        bestQuizScores[key as StageId] = score;
      }
    }
  }
  const wrongQuestionIds = Array.isArray(value.wrongQuestionIds)
    ? [...new Set(value.wrongQuestionIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  const termStates: LearningProgress["termStates"] = {};
  if (isObject(value.termStates)) {
    for (const [key, status] of Object.entries(value.termStates)) {
      if (termIds.has(key) && (status === "seen" || status === "practiced" || status === "mastered")) {
        termStates[key as TermId] = status as TermStatus;
      }
    }
  }
  const assists: LearningAssists = { ...DEFAULT_ASSISTS };
  if (isObject(value.assists)) {
    for (const key of Object.keys(assists) as (keyof LearningAssists)[]) {
      if (typeof value.assists[key] === "boolean") assists[key] = value.assists[key];
    }
  }
  const graduation: GraduationProgress = { ...DEFAULT_GRADUATION };
  if (isObject(value.graduation)) {
    for (const key of Object.keys(graduation) as (keyof GraduationProgress)[]) {
      if (typeof value.graduation[key] === "boolean") graduation[key] = value.graduation[key];
    }
  }
  const progress = { completedUnitIds, bestQuizScores, wrongQuestionIds, termStates, assists, graduation };
  if (!isGraduated(progress)) progress.completedUnitIds = completedUnitIds.filter(id=>id!=="s3-graduation");
  return progress;
}

function hasSaveSettings(value: Record<string, unknown>): boolean {
  return (
    (value.difficulty === "beginner" || value.difficulty === "intermediate" || value.difficulty === "challenge") &&
    typeof value.volume === "number" &&
    Number.isFinite(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1 &&
    (value.category === "pop" || value.category === "instrumental")
  );
}

function isCurrentGameAndSettings(value: unknown): value is Omit<SaveData, "learning"> & Record<string, unknown> {
  if (!isObject(value)) return false;
  return isGameState(value.game) && hasSaveSettings(value);
}

function isLegacySaveData(value: unknown): value is Record<string, unknown> & { game: LegacyGameState } {
  return isObject(value) && isLegacyGameState(value.game) && hasSaveSettings(value);
}

function migrateVersion1(value: unknown): SaveData | null {
  if (!isLegacySaveData(value)) return null;
  return {
    difficulty: value.difficulty as Difficulty,
    volume: value.volume as number,
    category: value.category as SoundscapeCategory,
    learning: migrateLegacyLessons(value.lessonIds),
    confirmMoves: false,
    game: {
      ...value.game,
      size: 19,
      past: value.game.past.map((snapshot) => ({ ...snapshot, size: 19 })),
    },
  };
}

function migrateVersion2(value: unknown): SaveData | null {
  if (!isCurrentGameAndSettings(value)) return null;
  return {
    game: value.game,
    difficulty: value.difficulty,
    volume: value.volume,
    category: value.category,
    learning: migrateLegacyLessons(value.lessonIds),
    confirmMoves: false,
  };
}

function decodeVersion3(value: unknown): SaveData | null {
  if (!isCurrentGameAndSettings(value)) return null;
  return {
    game: value.game,
    difficulty: value.difficulty,
    volume: value.volume,
    category: value.category,
    learning: sanitizeLearning(value.learning),
    confirmMoves: value.confirmMoves === true,
    ...(isObject(value.scoring) ? { scoring: sanitizeScoring(value.scoring, value.game) } : {}),
  };
}

function sanitizeScoring(value: Record<string, unknown>, game: GameState): ScoringSave {
  const terminal = game.consecutivePasses >= 2;
  const outcome = value.outcome === "你已认输，白方获胜" ? value.outcome : null;
  const phase: ScorePhase = outcome ? "final" : terminal && (value.phase === "score-review" || value.phase === "final") ? value.phase : "dead-stones";
  const deadStones = terminal && Array.isArray(value.deadStones)
    ? [...new Set(value.deadStones.filter((key): key is string => {
      if (typeof key !== "string" || !/^\d+,\d+$/.test(key)) return false;
      const [x,y] = key.split(",").map(Number);
      return x < game.size && y < game.size && game.board[y][x] !== null;
    }))] : [];
  return { phase, deadStones, outcome, graduationEligible: terminal && !outcome && game.size === 9 && value.graduationEligible === true };
}

export function encodeSave(data: SaveData): string {
  const { game, learning, difficulty, volume, category, scoring, confirmMoves } = data;
  return JSON.stringify({ version: SAVE_VERSION, data: { game, learning, difficulty, volume, category, confirmMoves: confirmMoves === true, ...(scoring ? {scoring} : {}) } });
}

export function decodeSave(raw: string): SaveData | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    if (parsed.version === 1) return migrateVersion1(parsed.data);
    if (parsed.version === 2) return migrateVersion2(parsed.data);
    if (parsed.version === SAVE_VERSION) return decodeVersion3(parsed.data);
    return null;
  } catch {
    return null;
  }
}
