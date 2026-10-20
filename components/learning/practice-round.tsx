"use client";
import { useEffect, useRef, useState } from "react";
import { ExercisePractice, type PracticeInteraction } from "@/components/learning/exercise-practice";
import { applyPracticeRoundEvent, isIndependentPractice, nextPracticeRound, retryPracticeRound, type PracticeRound as Round, type PracticeRoundEvent } from "@/lib/learning/practice-round";

export function PracticeRound({ initialRound, theme, onBack, isActive }: { initialRound: Round; theme: string; onBack(): void; isActive?(): boolean }) {
  const [round, setRound] = useState(initialRound);
  const latest = useRef(round);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [round.id, round.index, round.phase]);
  const active = () => alive.current && (isActive?.() ?? true);
  const update = (next: Round) => { latest.current = next; setRound(next); };
  const item = round.items[round.index];
  const exerciseId = item.exercise.id;
  const dispatch = (event: PracticeRoundEvent) => {
    if (!active()) return;
    const next = applyPracticeRoundEvent(latest.current, event);
    if (next !== latest.current) update(next);
  };
  const identity = { roundId: round.id, exerciseId };
  const childActive = () => active() && latest.current.id === round.id && latest.current.phase === "active" &&
    latest.current.items[latest.current.index].exercise.id === exerciseId && !latest.current.records[exerciseId].completed;
  const interaction = (event: PracticeInteraction) => dispatch(event.type === "answer"
    ? { ...identity, type: "answer", completed: event.result.completed }
    : { ...identity, type: event.type });
  const summaryAction = (next: (round: Round) => Round | null) => {
    if (!active() || latest.current !== round || round.phase !== "summary") return;
    const result = next(round); if (result) update(result);
  };
  if (round.phase === "summary") {
    const completed = round.items.filter(item => round.records[item.exercise.id].completed).length;
    const independent = round.items.filter(item => isIndependentPractice(round.records[item.exercise.id])).length;
    return <section className="practice-round" data-practice-round data-practice-summary aria-label="本轮小结">
      <h2 ref={heading} tabIndex={-1} data-practice-round-heading>{theme} · 本轮小结</h2>
      <p className="practice-round-count">本轮完成 {completed} / {round.items.length} 题</p><p>独立首答完成 {independent} 题</p>
      <p>这是本轮练习表现，不是正式测验分数或永久掌握程度。</p>
      <ol className="practice-round-results">{round.items.map((item, index) => {
        const record = round.records[item.exercise.id];
        const status = isIndependentPractice(record) ? "independent" : record.completed ? "practiced" : "unfinished";
        return <li key={item.exercise.id} data-practice-result={item.exercise.id} data-status={status}>
          <span>第 {index + 1} 题 · {item.title}</span><strong>{status === "independent" ? "独立首答完成" : status === "practiced" ? "练习后完成" : "未完成"}</strong><span>{record.hintUsed ? "已使用提示" : "未使用提示"}</span><small>提交 {record.attempts} 次 · 重试 {record.resets} 次</small>
        </li>;
      })}</ol>
      <p>本轮记录关闭后不保留，课程成绩不变。</p>
      {independent === round.items.length ? <p>本轮没有需巩固题。</p> : null}
      <div className="practice-round-actions">
        <button type="button" data-action="retry-practice-round" disabled={independent === round.items.length} onClick={() => summaryAction(retryPracticeRound)}>再练需巩固题</button>
        <button type="button" data-action="next-practice-round" onClick={() => summaryAction(nextPracticeRound)}>{round.nextOffset >= round.source.length ? "从本主题重新开始" : "练下一组"}</button>
        <button type="button" data-action="back-practice-picker" onClick={() => { if (!active() || latest.current !== round) return; alive.current = false; onBack(); }}>返回选题</button>
      </div>
    </section>;
  }
  return <section className="practice-round" data-practice-round aria-label="成组专项练习">
    <h2 ref={heading} tabIndex={-1} data-practice-round-heading>{theme} · 第 {round.index + 1} / {round.items.length} 题 · {item.title}</h2>
    <p>本轮记录关闭后不保留，课程成绩不变。</p>
    <div data-round-exercise={exerciseId}><ExercisePractice key={`${round.id}:${exerciseId}`} exercise={item.exercise} label="本轮练习" successLabel="本题已完成" lockCompleted onInteraction={interaction} isActive={childActive} /></div>
    <div className="practice-round-actions">
      <button type="button" data-action="next-practice-question" disabled={!round.records[exerciseId].completed} onClick={() => dispatch({ ...identity, type: "next" })}>{round.index === round.items.length - 1 ? "查看本轮小结" : "下一题"}</button>
      <button type="button" data-action="finish-practice-round" onClick={() => dispatch({ ...identity, type: "finish" })}>结束本轮</button>
    </div>
  </section>;
}
