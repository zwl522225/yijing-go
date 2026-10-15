"use client";
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/go/types";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { applyLessonAction, type ExerciseResult } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import { getRecommendedUnit, isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import type { LessonAction, LessonUnitId } from "@/lib/learning/types";
import { createLearningSession, submitLearningAction, revealNextHint, undoLearningAction, updateSessionProgress, type LearningSession } from "@/lib/learning/session";
import { createLessonResume, restoreLessonResume } from "@/lib/learning/session-resume";
export { createLearningSession, submitLearningAction, revealNextHint, undoLearningAction, updateSessionProgress } from "@/lib/learning/session";
export type { LearningAnswer, LearningSession } from "@/lib/learning/session";
export function useLearningSession(options: {
    progress: LearningProgress;
    onProgressChange(next: LearningProgress): void;
    /** Owners with other progress writers provide their synchronous current value. */
    getProgress?(): LearningProgress;
    /** Embedded lessons reject cached controls after their owner leaves the academy. */
    isActive?(): boolean;
    onAction?(before: LearningSession, action: LessonAction, result: ExerciseResult): void;
    /** Explicit retries, rewinds and restarts discard any narrated result. */
    onReset?(): void;
    onSessionChange?(next: LearningSession): void;
}) {
    const [session, setSession] = useState(() => createLearningSession(getRecommendedUnit(options.progress) ?? "s1-intersections-turns"));
    const [selectedDeadStone, setSelectedDeadStone] = useState<Point | null>(null);
    const [restored, setRestored] = useState(false);
    // Invalidate old course callbacks, while allowing repeated real actions in one frame.
    const contextRef = useRef(0);
    const context = contextRef.current;
    const isCurrent = () => context === contextRef.current;
    const canAct = () => isCurrent() && (options.isActive?.() ?? true);
    const sessionRef = useRef(session);
    const progressRef = useRef(options.progress);
    useEffect(() => { progressRef.current = options.progress; }, [options.progress]);
    const unit = CURRICULUM_BY_ID.get(session.unitId)!;
    const replace = (next: LearningSession) => {
        sessionRef.current = next;
        setSession(next);
        setSelectedDeadStone(null);
        options.onSessionChange?.(next);
    };
    const reset = (next: LearningSession) => {
        if(next === sessionRef.current) return;
        replace(next);
        options.onReset?.();
    };
    const submit = (action: LessonAction) => {
        if (!canAct()) return null;
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
        if (!isCurrent()) return false;
        if (!isUnitUnlocked(id, options.getProgress?.() ?? progressRef.current))
            return false;
        contextRef.current += 1;
        setRestored(false);
        reset(createLearningSession(id));
        return true;
    };
    const restoreSession = (validated: LearningSession) => {
        if (!isCurrent()) return false;
        const next = restoreLessonResume(createLessonResume(validated), options.getProgress?.() ?? progressRef.current);
        if (!next) return false;
        contextRef.current += 1;
        setRestored(true);
        reset(next);
        return true;
    };
    const visibleHints = unit.kind === "quiz" || session.completed ? [] : session.exercise?.hints.slice(0, session.hintLevel) ?? [];
    return {
        getSession: () => sessionRef.current,
        session, unit, state: session.state, feedback: session.feedback, visibleHints, selectedDeadStone, restored,
        startUnit, restoreSession,
        isQuizActive: () => CURRICULUM_BY_ID.get(sessionRef.current.unitId)?.kind === "quiz" && !sessionRef.current.completed,
        /** Rejected previews explain rules without becoming submitted answers. */
        reportRejectedMove: (point: Point) => {
            if (!canAct()) return;
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
            if (!canAct()) return;
            if (sessionRef.current.state.board[point.y]?.[point.x])
                setSelectedDeadStone(point);
        },
        submitChoice: (choiceId: string) => submit({ kind: "choice", choiceId }),
        requestHint: () => { if (canAct()) replace(revealNextHint(sessionRef.current)); },
        retryExercise: () => {
            if (!canAct()) return;
            const current = sessionRef.current;
            if (!current.exercise || current.completed)
                return;
            reset({ ...current, state: createPosition(current.exercise.position), feedback: null, feedbackExerciseId: undefined });
        },
        undoExercise: () => { if (canAct()) reset(undoLearningAction(sessionRef.current)); },
        resetUnit: () => {
            if (!canAct()) return;
            contextRef.current += 1;
            setRestored(false);
            reset(createLearningSession(sessionRef.current.unitId));
        },
    };
}
export type LearningSessionController = ReturnType<typeof useLearningSession>;
