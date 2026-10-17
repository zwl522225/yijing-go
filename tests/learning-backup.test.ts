import { describe, expect, it } from "vitest";
import { MAX_LEARNING_BACKUP_BYTES, createLearningBackup, parseLearningBackup } from "@/lib/learning/backup";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { completeUnit, createDefaultProgress, isGraduated, recordQuizScore, type LearningProgress } from "@/lib/learning/progress";
import { createLearningSession, revealNextHint, submitLearningAction } from "@/lib/learning/session";
import { createLessonResume, restoreLessonResume } from "@/lib/learning/session-resume";
import { TERM_IDS } from "@/lib/learning/types";

const now = new Date("2026-10-17T01:00:00.000Z");
const quizzes = CURRICULUM.filter(unit => unit.kind === "quiz");
const questionIds = quizzes.flatMap(unit => unit.questions.map(question => question.id));
const learning = () => learningFrom(createDefaultProgress());
const envelope = () => ({ format: "yijing-go-learning-backup", version: 1, exportedAt: now.toISOString(), learning: learning() });
const decode = (value: unknown) => parseLearningBackup(JSON.stringify(value));
const successful = (value: unknown) => {
  const result = decode(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result;
};
const secondTask = () => {
  const first = createLearningSession("s1-intersections-turns");
  return revealNextHint(submitLearningAction(first, first.exercise!.expected));
};
function genuineProgress(): LearningProgress {
  let progress = createDefaultProgress();
  for (const unit of CURRICULUM) {
    if (unit.stageId !== "stage-1") break;
    progress = unit.kind === "quiz"
      ? recordQuizScore(progress, unit.stageId, 90, [unit.questions[0].id])
      : completeUnit(progress, unit.id);
  }
  return { ...progress, termStates: { liberty: "mastered", intersection: "seen" }, graduation: { ...progress.graduation, completedNineLineGame: true } };
}

describe("learning backup codec", () => {
  it("roundtrips genuine course progress and the second task's actual actions, board and expanded hints", () => {
    const progress = genuineProgress();
    const session = secondTask();
    const resume = createLessonResume(session)!;
    const before = structuredClone({ progress, resume });
    const raw = createLearningBackup(progress, resume, now);
    const result = parseLearningBackup(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.learning).toEqual(learningFrom(progress));
    expect(result.data.lessonResume).toEqual(resume);
    const restored = restoreLessonResume(result.data.lessonResume, { ...result.data.learning, assists: progress.assists })!;
    expect(restored.state).toEqual(session.state);
    expect(restored.exerciseIndex).toBe(1);
    expect(restored.hintLevel).toBe(session.hintLevel);
    expect(restored.feedback).toBeNull();
    expect(result.summary).toEqual({ exportedAt: now.toISOString(), completedCount: progress.completedUnitIds.length, quizScores: { "stage-1": 90 }, termCount: 2,
      resume: { unitId: session.unitId, title: CURRICULUM[0].title, exerciseIndex: 1, exerciseCount: CURRICULUM[0].kind === "lesson" ? CURRICULUM[0].exercises.length : 0 } });
    expect(result.warnings).toEqual([]);
    expect({ progress, resume }).toEqual(before);
  });

  it("accepts an empty fresh record and exports only the specified top-level and learning fields", () => {
    const raw = createLearningBackup(createDefaultProgress(), null, now);
    expect(JSON.parse(raw)).toEqual(envelope());
    expect(successful(envelope()).data).toEqual({ exportedAt: now.toISOString(), learning: learning(), lessonResume: null });
  });

  it("sanitizes legacy unknown entries and sensitive extras on export without invoking their serialization", () => {
    const progress = genuineProgress();
    const dirty = { ...progress, completedUnitIds: [...progress.completedUnitIds, "legacy"], bestQuizScores: { ...progress.bestQuizScores, "stage-3": 100 },
      wrongQuestionIds: [...progress.wrongQuestionIds, "legacy-question"], termStates: { ...progress.termStates, legacy: "seen" }, game: { token: "secret" }, account: "private", path: "C:/private", toJSON() { throw new Error("must not execute"); } };
    const resume = { ...createLessonResume(secondTask())!, state: { secret: "secret" }, token: "private" };
    const raw = createLearningBackup(dirty as unknown as LearningProgress, resume, now);
    expect(raw).not.toMatch(/secret|private|legacy|assists|stage-3|token|account/);
    const result = parseLearningBackup(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.learning).toEqual(learningFrom(progress));
  });

  it("ignores unknown IDs with a count warning, deduplicates known IDs and detaches all output objects", () => {
    const value = envelope();
    value.learning.completedUnitIds = ["s1-intersections-turns", "s1-intersections-turns", "unknown"] as typeof value.learning.completedUnitIds;
    value.learning.wrongQuestionIds = [questionIds[0], questionIds[0], "unknown-question"];
    value.learning.bestQuizScores = { "stage-1": 25, "stage-3": 90 };
    value.learning.termStates = { liberty: "seen", unknown: "mastered" } as typeof value.learning.termStates;
    const result = successful(value);
    expect(result.data.learning.completedUnitIds).toEqual(["s1-intersections-turns"]);
    expect(result.data.learning.wrongQuestionIds).toEqual([questionIds[0]]);
    expect(result.data.learning.bestQuizScores).toEqual({ "stage-1": 25 });
    expect(result.data.learning.termStates).toEqual({ liberty: "seen" });
    expect(result.warnings.join(" ")).toMatch(/4/);
    result.data.learning.graduation.completedNineLineGame = true;
    result.summary.quizScores["stage-1"] = 99;
    expect(result.data.learning.bestQuizScores["stage-1"]).toBe(25);
    expect(value.learning.graduation.completedNineLineGame).toBe(false);
  });

  it("ignores deeply nested extra objects and sensitive fields at every accepted level", () => {
    const raw = JSON.stringify({ ...envelope(), learning: { ...learning(), assists: { autoOpenTerms: true }, account: { token: "secret" }, graduation: { ...learning().graduation, token: "secret" } }, game: { board: [] }, feedback: "secret", __proto__: null });
    const deep = `${raw.slice(0, -1)},"extra":${"[".repeat(5000)}0${"]".repeat(5000)}}`;
    const result = parseLearningBackup(deep);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.learning).toEqual(learning());
      expect(Object.keys(result.data)).toEqual(["exportedAt", "learning", "lessonResume"]);
    }
  });

  it.each([null, [], {}, { format: "feedback", version: 1 }, { version: 3, data: {} }, { ...envelope(), format: "other" }, { ...envelope(), version: 2 }, { ...envelope(), version: "1" }])("rejects a foreign or missing envelope %#", value => {
    expect(decode(value).ok).toBe(false);
  });
  it.each(["", " ", "{broken", "null"])('rejects invalid text %j', raw => expect(parseLearningBackup(raw).ok).toBe(false));

  it.each([undefined, null, 0, "2026-10-17", "2026-10-17T01:00:00", "2026-02-29T00:00:00Z", "2024-02-30T00:00:00Z", "2026-04-31T00:00:00Z", "2026-13-01T00:00:00Z", "2026-00-01T00:00:00Z", "2026-01-00T00:00:00Z", "2026-10-17T24:00:00Z", "2026-10-17T00:60:00Z", "2026-10-17T00:00:60Z", "2026-10-17T00:00:00+24:00", "2026-10-17T00:00:00+08:60", " 2026-10-17T00:00:00Z", "2026-10-17T00:00:00Z "])("rejects an invalid or timezone-free date %#", exportedAt => {
    expect(decode({ ...envelope(), exportedAt }).ok).toBe(false);
  });
  it.each(["2024-02-29T00:00:00Z", "2026-10-17T08:30:12.123+08:00", "2026-10-17T08:30:12-05:30"])("accepts a valid explicit timezone %s", exportedAt => {
    expect(successful({ ...envelope(), exportedAt }).data.exportedAt).toBe(exportedAt);
  });

  it.each(["completedUnitIds", "bestQuizScores", "wrongQuestionIds", "termStates", "graduation"])("rejects missing required learning field %s", key => {
    const data = { ...learning() } as Record<string, unknown>;
    delete data[key];
    expect(decode({ ...envelope(), learning: data }).ok).toBe(false);
  });
  it.each([
    { completedUnitIds: {} }, { completedUnitIds: [1] }, { completedUnitIds: [""] }, { completedUnitIds: ["x".repeat(129)] },
    { wrongQuestionIds: null }, { wrongQuestionIds: [{}] }, { wrongQuestionIds: [""] }, { wrongQuestionIds: ["x".repeat(129)] },
    { bestQuizScores: [] }, { bestQuizScores: { "stage-1": "80" } }, { bestQuizScores: { unknown: null } }, { bestQuizScores: { unknown: -1 } }, { bestQuizScores: { unknown: 101 } }, { bestQuizScores: { ["x".repeat(129)]: 90 } }, { bestQuizScores: { "": 90 } },
    { termStates: null }, { termStates: { liberty: "other" } }, { termStates: { unknown: {} } }, { termStates: { ["x".repeat(129)]: "seen" } }, { termStates: { "": "seen" } },
    { graduation: [] }, { graduation: {} }, { graduation: { ...learning().graduation, enteredScoring: 1 } },
    { completedUnitIds: new Array(CURRICULUM.length + 1).fill("s1-intersections-turns") },
    { wrongQuestionIds: new Array(questionIds.length + 1).fill(questionIds[0]) },
    { bestQuizScores: { "stage-1": 80, "stage-2": 80, "stage-3": 80 } },
    { termStates: Object.fromEntries(Array.from({ length: TERM_IDS.length + 1 }, (_, i) => [`unknown-${i}`, "seen"])) },
  ])("rejects malformed values before filtering unknown IDs and enforces raw capacities %#", patch => {
    expect(decode({ ...envelope(), learning: { ...learning(), ...patch } }).ok).toBe(false);
  });
  it.each([null, [], "learning", 1])("rejects invalid learning containers %#", value => expect(decode({ ...envelope(), learning: value }).ok).toBe(false));

  it("rejects non-finite JSON numbers including exponents before they can become scores", () => {
    const raw = JSON.stringify({ ...envelope(), learning: { ...learning(), bestQuizScores: { "stage-1": 1 } } });
    expect(parseLearningBackup(raw.replace('"stage-1":1', '"stage-1":1e999')).ok).toBe(false);
  });
  it("accepts inclusive number, ID and raw registry capacity boundaries", () => {
    const value = { ...envelope(), learning: { ...learning(), completedUnitIds: CURRICULUM.map(unit => unit.id), wrongQuestionIds: [...questionIds], bestQuizScores: { "stage-1": 0, "stage-2": 100 }, termStates: Object.fromEntries(TERM_IDS.map(id => [id, "practiced"])) } };
    expect(decode(value).ok).toBe(true);
    expect(successful({ ...envelope(), learning: { ...learning(), completedUnitIds: ["x".repeat(128)] } }).warnings.join(" ")).toMatch(/1/);
  });

  it("checks the UTF-8 byte limit before parsing and accepts exactly one MiB", () => {
    expect(MAX_LEARNING_BACKUP_BYTES).toBe(1048576);
    const raw = JSON.stringify({ ...envelope(), padding: "" });
    const exact = raw.replace('"padding":""', `"padding":"${"x".repeat(MAX_LEARNING_BACKUP_BYTES - new TextEncoder().encode(raw).length)}"`);
    expect(new TextEncoder().encode(exact).length).toBe(MAX_LEARNING_BACKUP_BYTES);
    expect(parseLearningBackup(exact).ok).toBe(true);
    const oversized = parseLearningBackup(`${exact} `);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toMatch(/1\s?MiB|大小|过大/);
    const multibyteInvalidJson = '中'.repeat(Math.ceil(MAX_LEARNING_BACKUP_BYTES / 3));
    expect(multibyteInvalidJson.length).toBeLessThan(MAX_LEARNING_BACKUP_BYTES);
    const result = parseLearningBackup(multibyteInvalidJson);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1\s?MiB|大小|过大/);
  });

  it.each([null, {}, { version: 2 }, { signature: "changed" }, { unitId: "s1-liberties-groups" }, { unitId: "s1-checkpoint" }, { hintLevel: 99 }, { acceptedActions: [{ exerciseId: "forged", action: { kind: "pass" }, hintLevel: 2 }] }])("drops only an unusable resume and warns %#", invalid => {
    const resume = invalid === null || Object.keys(invalid).length === 0 ? invalid : { ...createLessonResume(secondTask())!, ...invalid };
    const value = { ...envelope(), lessonResume: resume };
    const result = successful(value);
    expect(result.data.learning).toEqual(learning());
    expect(result.data.lessonResume).toBeNull();
    expect(result.summary.resume).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/续学/);
    expect(result.warnings.join(" ")).toMatch(/其余学习记录/);
  });
  it("rechecks the real course signature and strips external resume state claims", () => {
    const session = secondTask();
    const resume = createLessonResume(session)!;
    const result = successful({ ...envelope(), lessonResume: { ...resume, exerciseIndex: 99, state: { board: [] }, token: "private" } });
    expect(result.data.lessonResume).toEqual(resume);
    const unit = CURRICULUM[0];
    if (unit.kind !== "lesson") throw new Error("Expected ordinary lesson");
    const old = unit.exercises[0].prompt;
    try {
      unit.exercises[0].prompt += " changed";
      expect(successful({ ...envelope(), lessonResume: resume }).data.lessonResume).toBeNull();
    } finally {
      unit.exercises[0].prompt = old;
    }
    expect(createLearningBackup(createDefaultProgress(), { ...resume, signature: "changed" }, now)).not.toContain("lessonResume");
  });

  it("preserves graduation event metadata while removing inconsistent completion, without inventing dependencies", () => {
    const partial = { ...learning(), completedUnitIds: ["s3-graduation", "s3-weak-groups"], graduation: { ...learning().graduation, completedNineLineGame: true, finalizedScore: true } };
    const result = successful({ ...envelope(), learning: partial });
    expect(result.data.learning.completedUnitIds).toEqual(["s3-weak-groups"]);
    expect(result.data.learning.graduation).toEqual(partial.graduation);
    expect(isGraduated({ ...result.data.learning, assists: createDefaultProgress().assists })).toBe(false);
    const complete = { ...learning(), completedUnitIds: CURRICULUM.map(unit => unit.id), bestQuizScores: { "stage-1": 80, "stage-2": 80 }, graduation: { completedNineLineGame: true, enteredScoring: true, confirmedDeadStones: true, finalizedScore: true } };
    expect(successful({ ...envelope(), learning: complete }).data.learning).toEqual(complete);
    const exported = createLearningBackup({ ...partial, assists: createDefaultProgress().assists } as LearningProgress, null, now);
    expect(successful(JSON.parse(exported)).data.learning.completedUnitIds).toEqual(["s3-weak-groups"]);
  });
});

function learningFrom(progress: LearningProgress) {
  return {
    completedUnitIds: progress.completedUnitIds,
    bestQuizScores: progress.bestQuizScores,
    wrongQuestionIds: progress.wrongQuestionIds,
    termStates: progress.termStates,
    graduation: progress.graduation,
  };
}
