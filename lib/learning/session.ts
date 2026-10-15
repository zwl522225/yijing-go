import type { GameState } from "@/lib/go/types";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { applyLessonAction, type ExerciseResult } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import { advanceTermStatus, completeUnit, recordQuizScore, type LearningProgress } from "@/lib/learning/progress";
import type { CurriculumUnit, Exercise, LessonAction, LessonUnitId, TermId } from "@/lib/learning/types";

export type AcceptedLessonAction = { exerciseId: string; action: LessonAction; hintLevel: number };
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
    acceptedActions: AcceptedLessonAction[];
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
        feedback: null, completed: false, answers: [], previous: null, acceptedActions: [],
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
        acceptedActions: unit.kind === "lesson" ? [...session.acceptedActions, {
            exerciseId: session.exercise.id,
            action: "point" in action ? { ...action, point: { ...action.point } } : { ...action },
            hintLevel: session.hintLevel,
        }] : session.acceptedActions,
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
