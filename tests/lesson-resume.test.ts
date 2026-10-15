import { describe, expect, it } from "vitest";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { createDefaultProgress } from "@/lib/learning/progress";
import { groupAt } from "@/lib/go/analysis";
import { createLearningSession, revealNextHint, submitLearningAction, undoLearningAction } from "@/hooks/use-learning-session";
import { createLessonResume, restoreLessonResume } from "@/lib/learning/session-resume";
import type { LearningSession } from "@/hooks/use-learning-session";
import type { LessonAction } from "@/lib/learning/types";

const unlocked = () => ({ ...createDefaultProgress(), completedUnitIds: CURRICULUM.map(u => u.id), bestQuizScores: { "stage-1": 100, "stage-2": 100 } });
const record = () => {
  const first = createLearningSession("s1-intersections-turns");
  return createLessonResume(submitLearningAction(first, first.exercise!.expected))!;
};

describe("ordinary lesson resume", () => {
  it("logs actual accepted actions only and copies caller coordinates", () => {
    const start = createLearningSession("s1-intersections-turns");
    expect(start.acceptedActions).toEqual([]);
    const failed = submitLearningAction(start, { kind: "choice", choiceId: "wrong" });
    expect(failed.acceptedActions).toEqual([]);
    const action = structuredClone(start.exercise!.expected);
    const next = submitLearningAction(failed, action);
    const expected = structuredClone(action);
    if ("point" in action) action.point.x = 99;
    expect(next.acceptedActions).toEqual([{ exerciseId: start.exercise!.id, action: expected, hintLevel: start.hintLevel }]);
    expect(createLearningSession("s1-checkpoint").acceptedActions).toEqual([]);
    const quiz = createLearningSession("s1-checkpoint");
    expect(submitLearningAction(quiz, quiz.exercise!.expected).acceptedActions).toEqual([]);
  });

  it("restores the second task and hints without feedback, changing progress, or losing undo", () => {
    const first = createLearningSession("s1-intersections-turns");
    const next = revealNextHint(submitLearningAction(first, first.exercise!.expected));
    const progress = createDefaultProgress();
    const before = structuredClone(progress);
    const restored = restoreLessonResume(createLessonResume(next), progress)!;
    expect(restored.exerciseIndex).toBe(1);
    expect(restored.hintLevel).toBe(next.hintLevel);
    expect(restored.state).toEqual(next.state);
    expect(restored.feedback).toBeNull();
    expect(restored.feedbackExerciseId).toBeUndefined();
    expect(undoLearningAction(restored).exerciseIndex).toBe(0);
    expect(progress).toEqual(before);
  });

  it("restores all ordinary action kinds and genuine ko/pass history, clearing every undo feedback", () => {
    const kinds = new Set<LessonAction["kind"]>();
    for (const unit of CURRICULUM) {
      if (unit.kind !== "lesson") continue;
      let session = createLearningSession(unit.id);
      for (const exercise of unit.exercises) {
        const initial = restoreLessonResume(createLessonResume(session), unlocked())!;
        expect(initial.state).toEqual(session.state);
        expect(initial.state.history).toEqual(session.state.history);
        kinds.add(exercise.expected.kind);
        session = submitLearningAction(session, exercise.expected);
        if (session.completed) expect(createLessonResume(session)).toBeNull();
        else {
          const restored = restoreLessonResume(createLessonResume(session), unlocked())!;
          expect(restored.state).toEqual(session.state);
          expect(restored.acceptedActions).toEqual(session.acceptedActions);
          for (let past: LearningSession | null = restored; past; past = past.previous) {
            expect(past.feedback).toBeNull();
            expect(past.feedbackExerciseId).toBeUndefined();
          }
        }
      }
    }
    expect([...kinds].sort()).toEqual(["choice", "mark-dead", "move", "pass", "select-group"]);
  });

  it("preserves the actual group selection rather than synthesizing the expected point", () => {
    for (const unit of CURRICULUM) {
      if (unit.kind !== "lesson") continue;
      let session = createLearningSession(unit.id);
      for (const exercise of unit.exercises) {
        if ((exercise.expected.kind === "select-group" || exercise.expected.kind === "mark-dead") && session.exerciseIndex < unit.exercises.length - 1) {
          const expected = exercise.expected;
          const alternate = groupAt(session.state.board, session.state.size, expected.point)?.stones.find(p => p.x !== expected.point.x || p.y !== expected.point.y);
          if (alternate) {
            const action = { kind: expected.kind, point: alternate };
            const next = submitLearningAction(session, action);
            const resume = createLessonResume(next)!;
            expect(resume.acceptedActions.at(-1)?.action).toEqual(action);
            expect(restoreLessonResume(resume, unlocked())?.acceptedActions.at(-1)?.action).toEqual(action);
            return;
          }
        }
        session = submitLearningAction(session, exercise.expected);
      }
    }
    throw new Error("Expected a catalog group with an alternate point");
  });

  it("clips accepted actions on undo and retains per-task expanded hints", () => {
    let session = revealNextHint(createLearningSession("s1-intersections-turns"));
    session = revealNextHint(submitLearningAction(session, session.exercise!.expected));
    session = submitLearningAction(session, session.exercise!.expected);
    const restored = restoreLessonResume(createLessonResume(session), createDefaultProgress())!;
    const undone = undoLearningAction(restored);
    expect(undone.acceptedActions).toHaveLength(1);
    expect(undone.hintLevel).toBe(2);
    const first = undoLearningAction(undone);
    expect(first.hintLevel).toBe(3);
    expect(createLessonResume(first)?.acceptedActions).toEqual([]);
    const independent = createLessonResume(restored)!;
    if ("point" in independent.acceptedActions[0].action) independent.acceptedActions[0].action.point.x = 99;
    expect(createLessonResume(restored)?.acceptedActions[0].action).toEqual(session.acceptedActions[0].action);
  });

  it("refuses quiz, graduation, completed sessions, and locked lessons", () => {
    expect(createLessonResume(createLearningSession("s1-checkpoint"))).toBeNull();
    expect(createLessonResume(createLearningSession("s3-graduation"))).toBeNull();
    const locked = createLessonResume(createLearningSession("s2-connect-cut"));
    expect(restoreLessonResume(locked, createDefaultProgress())).toBeNull();
    for (const unitId of ["unknown", "s1-checkpoint", "s3-graduation"]) expect(restoreLessonResume({ ...record(), unitId }, unlocked())).toBeNull();
    let session = createLearningSession("s1-intersections-turns");
    while (!session.completed) session = submitLearningAction(session, session.exercise!.expected);
    expect(createLessonResume(session)).toBeNull();
    expect(restoreLessonResume({ ...record(), acceptedActions: session.acceptedActions }, unlocked())).toBeNull();
  });

  it("invalidates an old signature when actual lesson content changes", () => {
    const resume = record();
    const unit = CURRICULUM.find(u => u.id === resume.unitId)!;
    if (unit.kind !== "lesson") throw new Error("Expected lesson");
    const hint = unit.exercises[0].hints[0];
    const text = hint.text;
    try {
      hint.text = `${text} Updated`;
      expect(restoreLessonResume(resume, createDefaultProgress())).toBeNull();
    } finally {
      hint.text = text;
    }
    expect(restoreLessonResume(resume, createDefaultProgress())).not.toBeNull();
  });

  it("derives the current position and index from actions, ignoring external state claims", () => {
    const valid = record();
    const restored = restoreLessonResume({ ...valid, exerciseIndex: 99, completed: true, state: { board: [] } }, createDefaultProgress())!;
    expect(restored.exerciseIndex).toBe(1);
    expect(restored.completed).toBe(false);
    expect(restored.state.size).toBe(5);
  });

  it.each([
    null, [], { version: 2 }, { signature: "changed" }, { unitId: "x".repeat(10000) },
    { hintLevel: -1 }, { hintLevel: 4 }, { hintLevel: 1.5 }, { hintLevel: Infinity },
    { acceptedActions: new Array(1000).fill({}) }, { acceptedActions: {} },
  ])("rejects invalid resume envelope %#", invalid => {
    const value = invalid && !Array.isArray(invalid) ? { ...record(), ...invalid } : invalid;
    expect(restoreLessonResume(value, createDefaultProgress())).toBeNull();
  });

  it.each([
    { exerciseId: "wrong" }, { hintLevel: 1 }, { hintLevel: NaN }, { hintLevel: 3.1 },
    { action: null }, { action: { kind: "unknown" } },
    { action: { kind: "choice", choiceId: 1 } }, { action: { kind: "choice", choiceId: "" } },
    { action: { kind: "move" } }, { action: { kind: "move", point: [] } },
    { action: { kind: "move", point: { x: Infinity, y: 2 } } },
    { action: { kind: "move", point: { x: 2.1, y: 2 } } },
    { action: { kind: "move", point: { x: 2, y: "2" } } },
    { action: { kind: "move", point: { x: 2, y: 2, extra: true } } },
    { action: { kind: "move", point: { x: -1, y: 2 } } },
    { action: { kind: "move", point: { x: 99, y: 2 } } },
    { action: { kind: "move", point: { x: 0, y: 0 } } },
    { action: { kind: "move", point: { x: 2, y: 2 }, choiceId: "extra" } },
    { action: { kind: "pass", point: { x: 2, y: 2 } } },
    { action: { kind: "choice", choiceId: "x".repeat(10000) } },
  ])("rejects invalid accepted action %#", invalid => {
    const valid = record();
    expect(restoreLessonResume({ ...valid, acceptedActions: [{ ...valid.acceptedActions[0], ...invalid }] }, createDefaultProgress())).toBeNull();
  });

  it("rejects skipped/repeated task IDs and current hints below the current initial level", () => {
    expect(restoreLessonResume({}, createDefaultProgress())).toBeNull();
    let session = createLearningSession("s1-intersections-turns");
    session = submitLearningAction(session, session.exercise!.expected);
    session = submitLearningAction(session, session.exercise!.expected);
    const valid = createLessonResume(session)!;
    valid.acceptedActions[1].exerciseId = valid.acceptedActions[0].exerciseId;
    expect(restoreLessonResume(valid, createDefaultProgress())).toBeNull();
    expect(restoreLessonResume({ ...createLessonResume(createLearningSession("s1-intersections-turns")), hintLevel: 0 }, createDefaultProgress())).toBeNull();
  });
});
