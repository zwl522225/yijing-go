import { describe, expect, it } from "vitest";

import { createGame } from "@/lib/go/rules";
import { decodeSave } from "@/lib/go/storage";
import {
  DEFAULT_PROGRESS, advanceTermStatus, completeUnit, createDefaultProgress, getRecommendedUnit,
  isGraduated, isUnitUnlocked, recordGraduationEvent, recordQuizScore,
} from "@/lib/learning/progress";
import type { LearningProgress } from "@/lib/learning/progress";
import { STAGE_1_UNITS } from "@/lib/learning/stage-1";
import { STAGE_2_UNITS } from "@/lib/learning/stage-2";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";

describe("learning progress", () => {
  it("starts empty and recommends the first lesson", () => {
    expect(DEFAULT_PROGRESS.completedUnitIds).toEqual([]);
    expect(DEFAULT_PROGRESS.bestQuizScores).toEqual({});
    expect(DEFAULT_PROGRESS.wrongQuestionIds).toEqual([]);
    expect(DEFAULT_PROGRESS.termStates).toEqual({});
    expect(Object.values(DEFAULT_PROGRESS.assists)).toHaveLength(5);
    expect(Object.values(DEFAULT_PROGRESS.graduation)).toEqual([false, false, false, false]);
    expect(getRecommendedUnit(DEFAULT_PROGRESS)).toBe("s1-intersections-turns");
  });

  it("creates independent nested progress for each new learner", () => {
    const first = createDefaultProgress();
    const second = createDefaultProgress();
    first.completedUnitIds.push("s1-intersections-turns");
    first.bestQuizScores["stage-1"] = 90;
    first.wrongQuestionIds.push("q1");
    first.termStates.liberty = "mastered";
    first.assists.showLiberties = true;
    first.graduation.enteredScoring = true;
    expect(second).toEqual(DEFAULT_PROGRESS);
    expect(second).not.toBe(DEFAULT_PROGRESS);
    expect(first.completedUnitIds).not.toBe(second.completedUnitIds);
    expect(first.bestQuizScores).not.toBe(second.bestQuizScores);
    expect(first.wrongQuestionIds).not.toBe(second.wrongQuestionIds);
    expect(first.termStates).not.toBe(second.termStates);
    expect(first.assists).not.toBe(second.assists);
    expect(first.graduation).not.toBe(second.graduation);
  });

  it("unlocks lessons in order and requires 80 on both checkpoints", () => {
    expect(isUnitUnlocked("s1-intersections-turns", DEFAULT_PROGRESS)).toBe(true);
    expect(isUnitUnlocked("s1-liberties-groups", DEFAULT_PROGRESS)).toBe(false);
    const stageOne = STAGE_1_UNITS.slice(0, 7).reduce(
      (progress, unit) => completeUnit(progress, unit.id), DEFAULT_PROGRESS,
    );
    expect(isUnitUnlocked("s1-checkpoint", stageOne)).toBe(true);
    expect(isUnitUnlocked("s2-connect-cut", recordQuizScore(stageOne, "stage-1", 79, []))).toBe(false);
    const passedOne = recordQuizScore(stageOne, "stage-1", 80, []);
    expect(isUnitUnlocked("s2-connect-cut", passedOne)).toBe(true);
    const stageTwo = STAGE_2_UNITS.slice(0, 7).reduce(
      (progress, unit) => completeUnit(progress, unit.id), passedOne,
    );
    expect(isUnitUnlocked("s3-corner-side-center", recordQuizScore(stageTwo, "stage-2", 79, []))).toBe(false);
    expect(isUnitUnlocked("s3-corner-side-center", recordQuizScore(stageTwo, "stage-2", 80, []))).toBe(true);
  });

  it("keeps the best quiz score and retains mistakes across retries", () => {
    const ready = STAGE_1_UNITS.reduce(
      (progress, unit) => completeUnit(progress, unit.id), DEFAULT_PROGRESS,
    );
    const started = recordQuizScore(ready, "stage-1", 90, ["q1"]);
    const retried = recordQuizScore(started, "stage-1", 65, ["q1", "q2"]);
    expect(retried.bestQuizScores["stage-1"]).toBe(90);
    expect(retried.wrongQuestionIds).toEqual(["q1", "q2"]);
    expect(retried.completedUnitIds).toContain("s1-checkpoint");
  });

  it("ignores quiz results until that stage checkpoint is unlocked", () => {
    expect(recordQuizScore(DEFAULT_PROGRESS, "stage-1", 100, ["q1"])).toBe(DEFAULT_PROGRESS);
    const stageOne = STAGE_1_UNITS.reduce(
      (progress, unit) => completeUnit(progress, unit.id), DEFAULT_PROGRESS,
    );
    const passedOne = recordQuizScore(stageOne, "stage-1", 100, []);
    expect(recordQuizScore(passedOne, "stage-2", 100, ["q2"])).toBe(passedOne);
  });

  it("retains migrated eyes progress without bypassing stage one", () => {
    const restored = decodeSave(JSON.stringify({
      version: 2,
      data: {
        game: createGame({ size: 9 }), lessonIds: ["eyes"],
        difficulty: "beginner", volume: 0.35, category: "instrumental",
      },
    }));
    if (!restored) throw new Error("Expected a restorable v2 save");
    const attemptedLesson = completeUnit(restored.learning, "s2-dead-seki");
    const attemptedQuiz = recordQuizScore(attemptedLesson, "stage-2", 100, ["q2"]);
    expect(attemptedQuiz.completedUnitIds).toEqual(["s2-two-eyes"]);
    expect(attemptedQuiz.bestQuizScores).toEqual({});
    expect(attemptedQuiz.wrongQuestionIds).toEqual([]);
    expect(isUnitUnlocked("s2-dead-seki", restored.learning)).toBe(false);
    expect(isUnitUnlocked("s3-corner-side-center", attemptedQuiz)).toBe(false);
  });

  it("requires the stage one checkpoint and passing score throughout stage two", () => {
    const passed: LearningProgress = {
      ...DEFAULT_PROGRESS,
      completedUnitIds: [...LESSON_UNIT_IDS],
      bestQuizScores: { "stage-1": 80, "stage-2": 80 },
    };
    const missingCheckpoint = {
      ...passed, completedUnitIds: passed.completedUnitIds.filter((id) => id !== "s1-checkpoint"),
    };
    const belowPassingScore = { ...passed, bestQuizScores: { "stage-1": 79, "stage-2": 80 } };
    for (const id of LESSON_UNIT_IDS.slice(8, 16)) {
      expect(isUnitUnlocked(id, passed)).toBe(true);
      expect(isUnitUnlocked(id, missingCheckpoint)).toBe(false);
      expect(isUnitUnlocked(id, belowPassingScore)).toBe(false);
    }
  });

  it("requires both earlier checkpoints and passing scores throughout stage three", () => {
    const passed: LearningProgress = {
      ...DEFAULT_PROGRESS,
      completedUnitIds: [...LESSON_UNIT_IDS],
      bestQuizScores: { "stage-1": 80, "stage-2": 80 },
    };
    const missingGate = [
      { ...passed, completedUnitIds: passed.completedUnitIds.filter((id) => id !== "s1-checkpoint") },
      { ...passed, completedUnitIds: passed.completedUnitIds.filter((id) => id !== "s2-checkpoint") },
      { ...passed, bestQuizScores: { "stage-1": 79, "stage-2": 80 } },
      { ...passed, bestQuizScores: { "stage-1": 80, "stage-2": 79 } },
    ];
    for (const id of LESSON_UNIT_IDS.slice(16)) {
      expect(isUnitUnlocked(id, passed)).toBe(true);
      for (const progress of missingGate) expect(isUnitUnlocked(id, progress)).toBe(false);
    }
  });

  it("does not award a quiz score for the graduation stage", () => {
    const progress: LearningProgress = {
      ...DEFAULT_PROGRESS,
      completedUnitIds: LESSON_UNIT_IDS.filter((id) => id !== "s3-graduation"),
      bestQuizScores: { "stage-1": 80, "stage-2": 80 },
    };
    expect(recordQuizScore(progress, "stage-3", 100, [])).toBe(progress);
  });

  it("never lowers a term status", () => {
    expect(advanceTermStatus(undefined, "seen")).toBe("seen");
    expect(advanceTermStatus("seen", "practiced")).toBe("practiced");
    expect(advanceTermStatus("mastered", "seen")).toBe("mastered");
  });

  it("graduates only after all four events, independent of match result", () => {
    let progress: LearningProgress = {
      ...DEFAULT_PROGRESS,
      completedUnitIds: LESSON_UNIT_IDS.filter((id) => id !== "s3-graduation"),
      bestQuizScores: { "stage-1": 80, "stage-2": 80 },
    };
    for (const event of ["completedNineLineGame", "enteredScoring", "confirmedDeadStones"] as const) {
      progress = recordGraduationEvent(progress, event);
      expect(isGraduated(progress)).toBe(false);
    }
    progress = recordGraduationEvent(progress, "finalizedScore");
    expect(isGraduated(progress)).toBe(true);
    expect(progress.completedUnitIds).toContain("s3-graduation");
  });

  it("does not grant graduation before the preceding lesson", () => {
    const progress = { ...DEFAULT_PROGRESS, completedUnitIds: [] };
    const allEvents = (["completedNineLineGame", "enteredScoring", "confirmedDeadStones", "finalizedScore"] as const)
      .reduce(recordGraduationEvent, progress);
    expect(isGraduated(allEvents)).toBe(false);
    expect(allEvents.completedUnitIds).not.toContain("s3-graduation");
  });
});
