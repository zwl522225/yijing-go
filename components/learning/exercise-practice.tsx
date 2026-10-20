"use client";
import { useEffect, useRef, useState } from "react";
import { LessonFeedback } from "@/components/learning/lesson-feedback";
import { applyLessonAction, type ExerciseResult } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import type { Exercise, LessonAction } from "@/lib/learning/types";
import type { GameState, Point } from "@/lib/go/types";

export type PracticeInteraction = { type: "answer"; result: ExerciseResult } | { type: "hint" } | { type: "reset" };
type Attempt = { state: GameState | null; feedback: ExerciseResult | null; selected: Point | null; hintLevel: number };
function initialAttempt(exercise: Exercise): Attempt {
  try { return { state: createPosition(exercise.position), feedback: null, selected: null, hintLevel: 0 }; }
  catch { return { state: null, feedback: null, selected: null, hintLevel: 0 }; }
}

export function ExercisePractice({ exercise, label, onComplete, successLabel, boardLabel = "练习棋盘", onInteraction, isActive, lockCompleted = false }: {
  exercise: Exercise; label: string; onComplete?(): void; successLabel?: string; boardLabel?: string;
  onInteraction?(event: PracticeInteraction): void; isActive?(): boolean; lockCompleted?: boolean;
}) {
  const [attempt, setAttempt] = useState(() => initialAttempt(exercise));
  const latest = useRef({ exercise, attempt });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = () => alive.current && latest.current.exercise === exercise && (isActive?.() ?? true);
  const update = (next: Attempt) => { latest.current = { exercise, attempt: next }; setAttempt(next); };
  const submit = (action: LessonAction) => {
    const current = latest.current.attempt;
    if (!active() || !current.state || current.feedback?.completed) return;
    const result = applyLessonAction(exercise, current.state, action);
    update({ ...current, state: result.nextState, feedback: result });
    onInteraction?.({ type: "answer", result });
    if (result.completed && alive.current) onComplete?.();
  };
  const select = (point: Point) => {
    const current = latest.current.attempt;
    if (!active() || !current.state || current.feedback?.completed) return;
    if (exercise.expected.kind === "select-group" || exercise.expected.kind === "mark-dead") {
      if (current.state.board[point.y][point.x]) update({ ...current, selected: point });
    } else if (exercise.expected.kind === "move") submit({ kind: "move", point });
  };
  const reset = () => {
    if (!active() || (lockCompleted && latest.current.attempt.feedback?.completed)) return;
    update(initialAttempt(exercise)); onInteraction?.({ type: "reset" });
  };
  const hint = () => {
    const current = latest.current.attempt;
    if (!active() || !current.state || current.feedback?.completed || current.hintLevel >= Math.min(3, exercise.hints.length)) return;
    update({ ...current, hintLevel: current.hintLevel + 1 }); onInteraction?.({ type: "hint" });
  };
  const completed = attempt.feedback?.completed ?? false;
  if (!attempt.state) return <section className="term-practice" aria-label={label}><h3>本题暂不可用</h3><p>本题局面无法加载，可以结束本轮后再选择其他练习。</p></section>;
  return <section className="term-practice" aria-label={label}>
    <h3>动手试一试</h3><p>{exercise.prompt}</p>
    <div className="demo-board practice-board" style={{ "--board-size": attempt.state.size } as React.CSSProperties} aria-label={boardLabel}>
      {attempt.state.board.flatMap((row, y) => row.map((stone, x) => <button key={`${x},${y}`} type="button" className="demo-point" data-practice-point={`${x},${y}`} data-target={attempt.selected?.x === x && attempt.selected.y === y || undefined}
        disabled={completed || exercise.expected.kind === "choice" || exercise.expected.kind === "pass"} aria-pressed={attempt.selected?.x === x && attempt.selected.y === y}
        aria-label={`第 ${x + 1} 列、第 ${y + 1} 行，${stone === "black" ? "黑棋" : stone === "white" ? "白棋" : "空位"}`} onClick={() => select({ x, y })}>{stone ? <i className={`mini-stone ${stone}`} /> : null}</button>))}
    </div>
    {exercise.expected.kind === "move" ? <p>点击棋盘交叉点落子。</p> : null}
    {exercise.expected.kind === "select-group" || exercise.expected.kind === "mark-dead" ? <p>点击棋子选择目标，再确认。{attempt.selected ? `已选择第 ${attempt.selected.x + 1} 列、第 ${attempt.selected.y + 1} 行。` : "尚未选择。"}</p> : null}
    <div className="exercise-controls">
      {exercise.expected.kind === "pass" ? <button type="button" data-action="pass" disabled={completed} onClick={() => submit({ kind: "pass" })}>停一手</button> : null}
      {exercise.expected.kind === "choice" ? exercise.choices?.map(choice => <button key={choice.id} type="button" data-choice-id={choice.id} disabled={completed} onClick={() => submit({ kind: "choice", choiceId: choice.id })}>{choice.label}</button>) : null}
      {exercise.expected.kind === "select-group" || exercise.expected.kind === "mark-dead" ? <button type="button" data-action={exercise.expected.kind} disabled={completed || !attempt.selected} onClick={() => {
        const selected = latest.current.attempt.selected;
        if (selected && (exercise.expected.kind === "select-group" || exercise.expected.kind === "mark-dead")) submit({ kind: exercise.expected.kind, point: selected });
      }}>{exercise.expected.kind === "mark-dead" ? "确认死子" : "确认棋块"}</button> : null}
    </div>
    <LessonFeedback feedback={attempt.feedback} actionKind={exercise.expected.kind} successLabel={successLabel} />
    <div className="term-practice-actions"><button type="button" data-action="retry" disabled={lockCompleted && completed} onClick={reset}>重新练习</button><button type="button" data-action="hint" disabled={completed || attempt.hintLevel >= Math.min(3, exercise.hints.length)} onClick={hint}>查看提示（{attempt.hintLevel}/3）</button></div>
    {exercise.hints.slice(0, attempt.hintLevel).map(hint => <p key={hint.level}>{hint.level}. {hint.text}</p>)}
  </section>;
}
