"use client";
import { useEffect, useRef, useState } from "react";
import type { GameState, Point } from "@/lib/go/types";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { applyLessonAction, type ExerciseResult } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import { advanceTermStatus, completeUnit, getRecommendedUnit, isUnitUnlocked, recordQuizScore, type LearningProgress } from "@/lib/learning/progress";
import type { CurriculumUnit, Exercise, LessonAction, LessonUnitId, TermId } from "@/lib/learning/types";
export type LearningAnswer = {
    exerciseId: string;
    termId?: TermId;
    correct: boolean;
    hintLevel?: number;
};
export type LearningSession = {
    unitId: LessonUnitId;
    exerciseIndex: number;
    exercise: Exercise | null;
    state: GameState;
    hintLevel: number;
    feedback: ExerciseResult | null;
    feedbackExerciseId?: string;
    completed: boolean;
    answers: LearningAnswer[];
    previous: LearningSession | null;
};
function exercises(unit: CurriculumUnit): Exercise[] {
    return unit.kind === "lesson" ? unit.exercises : unit.kind === "quiz" ? unit.questions : [];
}
export function createLearningSession(unitId: LessonUnitId): LearningSession {
    const unit = CURRICULUM_BY_ID.get(unitId);
    if (!unit)
        throw new Error(`Unknown learning unit: ${unitId}`);
    const exercise = exercises(unit)[0] ?? null;
    return {
        unitId, exerciseIndex: 0, exercise,
        state: createPosition(exercise?.position ?? { size: unit.boardSize, stones: [], toPlay: "black" }),
        hintLevel: unit.kind === "quiz" ? 0 : exercise?.initialHintLevel ?? 0,
        feedback: null, completed: false, answers: [], previous: null,
    };
}
export function submitLearningAction(session: LearningSession, action: LessonAction): LearningSession {
    if (session.completed || !session.exercise)
        return session;
    const unit = CURRICULUM_BY_ID.get(session.unitId)!;
    const result = applyLessonAction(session.exercise, session.state, action);
    const answers = unit.kind === "quiz" && !session.answers.some(a => a.exerciseId === session.exercise!.id)
        ? [...session.answers, { exerciseId: session.exercise.id, termId: unit.questions[session.exerciseIndex].termId, correct: result.completed, hintLevel: session.hintLevel }]
        : session.answers;
    if (!result.completed)
        return { ...session, answers, feedback: result, feedbackExerciseId: session.exercise.id };
    const nextIndex = session.exerciseIndex + 1;
    const next = exercises(unit)[nextIndex];
    return {
        ...session, exerciseIndex: nextIndex, exercise: next ?? session.exercise,
        state: next ? createPosition(next.position) : result.nextState,
        hintLevel: unit.kind === "quiz" ? 0 : next?.initialHintLevel ?? session.hintLevel,
        feedback: result, feedbackExerciseId: session.exercise.id, answers,
        completed: !next, previous: unit.kind === "lesson" ? session : null,
    };
}
export function revealNextHint(session: LearningSession): LearningSession {
    if (CURRICULUM_BY_ID.get(session.unitId)?.kind === "quiz" || session.completed)
        return session;
    return { ...session, hintLevel: Math.min(3, session.hintLevel + 1) };
}
export function undoLearningAction(session: LearningSession): LearningSession {
    return session.previous ? { ...session.previous, feedback: null, feedbackExerciseId: undefined } : session;
}
export function updateSessionProgress(session: LearningSession, progress: LearningProgress): LearningProgress {
    const unit = CURRICULUM_BY_ID.get(session.unitId)!;
    if (unit.kind === "quiz") {
        for(const answer of session.answers) {
            if(answer.correct && answer.termId && (answer.hintLevel ?? 0)<3 && progress.termStates[answer.termId]!=="mastered") {
                progress={...progress,termStates:{...progress.termStates,[answer.termId]:advanceTermStatus(progress.termStates[answer.termId],"mastered")}};
            }
        }
        if(!session.completed) return progress;
        const score = session.answers.filter(a => a.correct).length / unit.questions.length * 100;
        return recordQuizScore(progress, unit.stageId, score, session.answers.filter(a => !a.correct).map(a => a.exerciseId));
    }
    return session.completed ? completeUnit(progress, unit.id) : progress;
}
export function useLearningSession(options: {
    progress: LearningProgress;
    onProgressChange(next: LearningProgress): void;
    /** Owners with other progress writers provide their synchronous current value. */
    getProgress?(): LearningProgress;
    onAction?(before: LearningSession, action: LessonAction, result: ExerciseResult): void;
    /** Explicit retries, rewinds and restarts discard any narrated result. */
    onReset?(): void;
}) {
    const [session, setSession] = useState(() => createLearningSession(getRecommendedUnit(options.progress) ?? "s1-intersections-turns"));
    const [selectedDeadStone, setSelectedDeadStone] = useState<Point | null>(null);
    const sessionRef = useRef(session);
    const progressRef = useRef(options.progress);
    useEffect(() => { progressRef.current = options.progress; }, [options.progress]);
    const unit = CURRICULUM_BY_ID.get(session.unitId)!;
    const replace = (next: LearningSession) => {
        sessionRef.current = next;
        setSession(next);
        setSelectedDeadStone(null);
    };
    const reset = (next: LearningSession) => {
        if(next === sessionRef.current) return;
        replace(next);
        options.onReset?.();
    };
    const submit = (action: LessonAction) => {
        const before = sessionRef.current;
        const next = submitLearningAction(before, action);
        replace(next);
        if(next !== before && next.feedback) options.onAction?.(before,action,next.feedback);
        const previousProgress = options.getProgress?.() ?? progressRef.current;
        const progress = updateSessionProgress(next, previousProgress);
        progressRef.current = progress;
        if (progress !== previousProgress)
            options.onProgressChange(progress);
        return next.feedback;
    };
    const startUnit = (id: LessonUnitId) => {
        if (!isUnitUnlocked(id, options.getProgress?.() ?? progressRef.current))
            return false;
        reset(createLearningSession(id));
        return true;
    };
    const visibleHints = unit.kind === "quiz" || session.completed ? [] : session.exercise?.hints.slice(0, session.hintLevel) ?? [];
    return {
        getSession: () => sessionRef.current,
        session, unit, state: session.state, feedback: session.feedback, visibleHints, selectedDeadStone,
        startUnit,
        isQuizActive: () => CURRICULUM_BY_ID.get(sessionRef.current.unitId)?.kind === "quiz" && !sessionRef.current.completed,
        /** Rejected previews explain rules without becoming submitted answers. */
        reportRejectedMove: (point: Point) => {
            const current = sessionRef.current;
            if (current.completed || !current.exercise || CURRICULUM_BY_ID.get(current.unitId)?.kind === "quiz") return;
            const feedback = applyLessonAction(current.exercise, current.state, { kind: "move", point });
            if (feedback.failure?.kind === "rule")
                replace({ ...current, feedback, feedbackExerciseId: current.exercise.id });
        },
        submitMove: (point: Point) => submit({ kind: "move", point }),
        submitPass: () => submit({ kind: "pass" }),
        submitGroup: (point: Point) => submit({ kind: "select-group", point }),
        submitDeadStone: (point: Point) => submit({ kind: "mark-dead", point }),
        selectDeadStone: (point: Point) => {
            if (sessionRef.current.state.board[point.y]?.[point.x])
                setSelectedDeadStone(point);
        },
        submitChoice: (choiceId: string) => submit({ kind: "choice", choiceId }),
        requestHint: () => replace(revealNextHint(sessionRef.current)),
        retryExercise: () => {
            const current = sessionRef.current;
            if (!current.exercise || current.completed)
                return;
            reset({ ...current, state: createPosition(current.exercise.position), feedback: null, feedbackExerciseId: undefined });
        },
        undoExercise: () => reset(undoLearningAction(sessionRef.current)),
        resetUnit: () => reset(createLearningSession(sessionRef.current.unitId)),
    };
}
export type LearningSessionController = ReturnType<typeof useLearningSession>;
