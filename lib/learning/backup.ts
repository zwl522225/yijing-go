import { CURRICULUM, CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { DEFAULT_ASSISTS, DEFAULT_GRADUATION, isGraduated, type LearningProgress } from "@/lib/learning/progress";
import { createLessonResume, restoreLessonResume, type LessonResume } from "@/lib/learning/session-resume";
import { TERM_IDS, type LessonUnitId, type StageId, type TermId } from "@/lib/learning/types";

export const MAX_LEARNING_BACKUP_BYTES = 1048576;

export type LearningBackupData = {
  exportedAt: string;
  learning: Omit<LearningProgress, "assists">;
  lessonResume: LessonResume | null;
};

export type LearningBackupSummary = {
  exportedAt: string;
  completedCount: number;
  quizScores: LearningProgress["bestQuizScores"];
  termCount: number;
  resume: null | { unitId: LessonUnitId; title: string; exerciseIndex: number; exerciseCount: number };
};

export type LearningBackupResult =
  | { ok: true; data: LearningBackupData; summary: LearningBackupSummary; warnings: string[] }
  | { ok: false; error: string };

const FORMAT = "yijing-go-learning-backup";
const unitIds = new Set<string>(CURRICULUM.map(unit => unit.id));
const quizzes = CURRICULUM.filter(unit => unit.kind === "quiz");
const quizStageIds = new Set<string>(quizzes.map(unit => unit.stageId));
const questionIds = new Set<string>(quizzes.flatMap(unit => unit.questions.map(question => question.id)));
const termIds = new Set<string>(TERM_IDS);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isTermStatus(value: unknown): value is "seen" | "practiced" | "mastered" {
  return value === "seen" || value === "practiced" || value === "mastered";
}

type Ignored = { count: number };

function readIds(value: unknown, registry: Set<string>, strict: boolean, ignored: Ignored): string[] | null {
  if (!Array.isArray(value)) return strict ? null : [];
  if (strict && (value.length > registry.size || !value.every(isId))) return null;
  const ids = new Set<string>();
  for (const id of value) {
    if (isId(id) && registry.has(id)) ids.add(id);
    else ignored.count++;
  }
  return [...ids];
}

/** Strict boundaries apply to foreign files; export also tolerates old browser-save entries. */
function readLearning(value: unknown, strict: boolean, ignored: Ignored): LearningBackupData["learning"] | null {
  if (!isObject(value)) return null;
  const completedUnitIds = readIds(value.completedUnitIds, unitIds, strict, ignored) as LessonUnitId[] | null;
  const wrongQuestionIds = readIds(value.wrongQuestionIds, questionIds, strict, ignored);
  if (!completedUnitIds || !wrongQuestionIds) return null;

  const bestQuizScores: LearningProgress["bestQuizScores"] = {};
  if (isObject(value.bestQuizScores)) {
    const entries = Object.entries(value.bestQuizScores);
    if (strict && (entries.length > quizStageIds.size || entries.some(([id, score]) => !isId(id) || !isScore(score)))) return null;
    for (const [id, score] of entries) {
      if (quizStageIds.has(id) && isScore(score)) bestQuizScores[id as StageId] = score;
      else ignored.count++;
    }
  } else if (strict) return null;

  const termStates: LearningProgress["termStates"] = {};
  if (isObject(value.termStates)) {
    const entries = Object.entries(value.termStates);
    if (strict && (entries.length > termIds.size || entries.some(([id, status]) => !isId(id) || !isTermStatus(status)))) return null;
    for (const [id, status] of entries) {
      if (termIds.has(id) && isTermStatus(status)) termStates[id as TermId] = status;
      else ignored.count++;
    }
  } else if (strict) return null;

  const graduation = { ...DEFAULT_GRADUATION };
  if (isObject(value.graduation)) {
    for (const key of Object.keys(graduation) as (keyof typeof graduation)[]) {
      const event = value.graduation[key];
      if (typeof event === "boolean") graduation[key] = event;
      else if (strict) return null;
    }
  } else if (strict) return null;

  const learning = { completedUnitIds, bestQuizScores, wrongQuestionIds, termStates, graduation };
  if (!isGraduated({ ...learning, assists: { ...DEFAULT_ASSISTS } })) {
    learning.completedUnitIds = completedUnitIds.filter(id => id !== "s3-graduation");
  }
  return learning;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = parts;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] &&
    Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 &&
    (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59)) &&
    Number.isFinite(Date.parse(value));
}

function readResume(value: unknown, learning: LearningBackupData["learning"]) {
  return restoreLessonResume(value, { ...learning, assists: { ...DEFAULT_ASSISTS } });
}

/** Produces a portable whitelist snapshot without settings, game state or external writes. */
export function createLearningBackup(progress: LearningProgress, resume: LessonResume | null, now = new Date()): string {
  const learning = readLearning(progress, false, { count: 0 });
  if (!learning) throw new Error("无法生成学习记录备份。");
  const session = readResume(resume, learning);
  const lessonResume = session ? createLessonResume(session) : null;
  return JSON.stringify({ format: FORMAT, version: 1, exportedAt: now.toISOString(), learning, ...(lessonResume ? { lessonResume } : {}) });
}

/** Parses and previews only: callers explicitly decide whether and where to save the result. */
export function parseLearningBackup(raw: string): LearningBackupResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_LEARNING_BACKUP_BYTES) {
    return { ok: false, error: "学习备份大小不能超过 1 MiB。" };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "无法读取学习备份，请选择有效的 JSON 文件。" };
  }
  if (!isObject(value) || value.format !== FORMAT || value.version !== 1) {
    return { ok: false, error: "文件不是受支持的学习备份格式或版本。" };
  }
  if (!isIsoDate(value.exportedAt)) return { ok: false, error: "学习备份日期无效或缺少时区。" };
  const ignored = { count: 0 };
  const learning = readLearning(value.learning, true, ignored);
  if (!learning) return { ok: false, error: "学习记录字段类型、数值或数量不符合要求。" };

  const warnings: string[] = [];
  if (ignored.count > 0) warnings.push(`已忽略 ${ignored.count} 项未知学习记录。`);
  const session = readResume(value.lessonResume, learning);
  const lessonResume = session ? createLessonResume(session) : null;
  if (Object.hasOwn(value, "lessonResume") && !lessonResume) {
    warnings.push("续学位置无法使用，仍可恢复其余学习记录。");
  }
  const unit = session ? CURRICULUM_BY_ID.get(session.unitId) : null;
  const data = { exportedAt: value.exportedAt, learning, lessonResume };
  const summary: LearningBackupSummary = {
    exportedAt: value.exportedAt,
    completedCount: learning.completedUnitIds.length,
    quizScores: { ...learning.bestQuizScores },
    termCount: Object.keys(learning.termStates).length,
    resume: session && unit?.kind === "lesson" ? {
      unitId: unit.id, title: unit.title, exerciseIndex: session.exerciseIndex, exerciseCount: unit.exercises.length,
    } : null,
  };
  return { ok: true, data, summary, warnings };
}
