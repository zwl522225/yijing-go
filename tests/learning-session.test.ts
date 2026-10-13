import { describe, expect, it } from "vitest";
import { createLearningSession, submitLearningAction, revealNextHint, undoLearningAction, updateSessionProgress } from "@/hooks/use-learning-session";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createPosition } from "@/lib/learning/positions";
describe("learning sessions", () => {
    it("masters only the first correct checkpoint attempts without level-three help, even before completion", () => {
        let quiz = createLearningSession("s1-checkpoint");
        const unit = CURRICULUM.find(u=>u.id===quiz.unitId)!;
        if(unit.kind!=="quiz") throw new Error("quiz");
        let progress=createDefaultProgress(); progress.termStates[unit.questions[0].termId]="practiced";
        quiz=submitLearningAction(quiz,quiz.exercise!.expected);
        progress=updateSessionProgress(quiz,progress);
        expect(progress.termStates[unit.questions[0].termId]).toBe("mastered");
        quiz=submitLearningAction(quiz,{kind:"choice",choiceId:"wrong"});
        quiz=submitLearningAction(quiz,quiz.exercise!.expected);
        progress=updateSessionProgress(quiz,progress);
        expect(progress.termStates[unit.questions[1].termId]).toBeUndefined();
        quiz={...quiz,hintLevel:3};
        quiz=submitLearningAction(quiz,quiz.exercise!.expected);
        progress=updateSessionProgress(quiz,progress);
        expect(progress.termStates[unit.questions[2].termId]).toBeUndefined();
        expect(progress.bestQuizScores).toEqual({});
    });
    it("keeps incorrect moves on the same replayed task with feedback", () => {
        const start = createLearningSession("s1-intersections-turns");
        const wrong = submitLearningAction(start, { kind: "move", point: { x: 0, y: 0 } });
        expect(wrong.exerciseIndex).toBe(0);
        expect(wrong.state).toEqual(start.state);
        expect(wrong.feedback).toMatchObject({ completed: false, message: start.exercise!.errors.wrong_answer });
    });
    it("requires all three practices, initializes their fading hints, and supports undo", () => {
        let session = createLearningSession("s1-intersections-turns");
        expect(session.hintLevel).toBe(2);
        const first = session;
        session = submitLearningAction(session, session.exercise!.expected);
        expect(session.exerciseIndex).toBe(1);
        expect(session.hintLevel).toBe(1);
        expect(updateSessionProgress(session, createDefaultProgress()).completedUnitIds).toEqual([]);
        expect(undoLearningAction(session)).toEqual(first);
        session = submitLearningAction(session, session.exercise!.expected);
        expect(session.hintLevel).toBe(0);
        session = submitLearningAction(session, session.exercise!.expected);
        expect(session.completed).toBe(true);
        expect(updateSessionProgress(session, createDefaultProgress()).completedUnitIds).toEqual([session.unitId]);
        expect(undoLearningAction(session).exerciseIndex).toBe(2);
    });
    it("caps practice hints and refuses all quiz hints", () => {
        const practice = createLearningSession("s1-intersections-turns");
        expect(revealNextHint(revealNextHint(practice)).hintLevel).toBe(3);
        const quiz = createLearningSession("s1-checkpoint");
        expect(revealNextHint(quiz).hintLevel).toBe(0);
        expect(undoLearningAction(quiz)).toEqual(quiz);
    });
    it("replays history dependent exercises and handles all catalog action kinds", () => {
        for (const unit of CURRICULUM) {
            if (unit.kind === "graduation")
                continue;
            let session = createLearningSession(unit.id);
            for (const exercise of unit.kind === "quiz" ? unit.questions : unit.exercises) {
                expect(session.state).toEqual(createPosition(exercise.position));
                session = submitLearningAction(session, exercise.expected);
                expect(session.feedback?.completed).toBe(true);
            }
            expect(session.completed).toBe(true);
        }
    });
    it("scores the first quiz attempts only after all five questions and preserves best progress", () => {
        let progress = createDefaultProgress();
        progress.completedUnitIds = CURRICULUM.slice(0, 7).map(u => u.id);
        let quiz = createLearningSession("s1-checkpoint");
        quiz = submitLearningAction(quiz, { kind: "choice", choiceId: "wrong" });
        expect(quiz.exerciseIndex).toBe(0);
        for (let index = 0; index < 5; index++) {
            quiz = submitLearningAction(quiz, quiz.exercise!.expected);
            if (index < 4)
                expect(updateSessionProgress(quiz, progress).bestQuizScores).toEqual({});
        }
        progress = updateSessionProgress(quiz, progress);
        expect(progress.bestQuizScores["stage-1"]).toBe(80);
        expect(progress.wrongQuestionIds).toHaveLength(1);
        let repeat = createLearningSession("s1-checkpoint");
        for (let index = 0; index < 5; index++) {
            repeat = submitLearningAction(repeat, { kind: "choice", choiceId: "wrong" });
            repeat = submitLearningAction(repeat, repeat.exercise!.expected);
        }
        expect(updateSessionProgress(repeat, progress).bestQuizScores["stage-1"]).toBe(80);
        expect(updateSessionProgress(repeat, progress).completedUnitIds).toContain("s1-checkpoint");
    });
});
