"use client";
import { useEffect, useState } from "react";
import { resolveDemoFrame } from "@/lib/learning/demo";
import type { BoardSize } from "@/lib/go/types";
import type { DemoFrame, LessonUnit, QuizUnit } from "@/lib/learning/types";
export function LessonDemo({ unit }: {
    unit: LessonUnit | QuizUnit;
}) {
    const choices = (unit.kind === "lesson" ? unit.exercises : unit.questions).flatMap(exercise => exercise.choices ?? []);
    return <DemoPlayback key={unit.id} unit={{...unit, choices}}/>;
}
export function PauseableLessonDemo({id,boardSize,frames,choices=[]}: {
    id:string; boardSize:BoardSize; frames:DemoFrame[]; choices?:{id:string;label:string}[];
}) {
    return <DemoPlayback key={id} unit={{id,boardSize,demo:frames,choices}}/>;
}
function DemoPlayback({ unit }: {
    unit: {id:string;boardSize:BoardSize;demo:DemoFrame[];choices:{id:string;label:string}[]};
}) {
    const [playback, setPlayback] = useState({ index: 0, playing: false });
    const { index, playing } = playback;
    useEffect(() => {
        if (!playing || unit.demo.length < 2)
            return;
        const timer = setInterval(() => setPlayback(current => ({ index: (current.index + 1) % unit.demo.length, playing: true })), 1600);
        return () => clearInterval(timer);
    }, [playing, unit.id, unit.demo.length]);
    if (!unit.demo.length)
        return null;
    const frame = unit.demo[Math.min(index, unit.demo.length - 1)];
    const demonstration = resolveDemoFrame(unit.boardSize, frame, unit.choices);
    const {state} = demonstration;
    return <section className="lesson-demo" aria-label="正确示范与反例">
    <h3>看一遍，再试一试</h3>
    <div className="demo-board" role="img" aria-label={`${unit.boardSize}路示范棋盘，第 ${index + 1} 帧`} style={{ "--board-size": unit.boardSize } as React.CSSProperties}>
      {state.board.flatMap((row, y) => row.map((stone, x) => {
        const targeted = demonstration.targetPoints.some(point => point.x === x && point.y === y);
        const attempted = demonstration.attemptedPoint?.x === x && demonstration.attemptedPoint.y === y;
        return <span className="demo-point" key={`${x},${y}`} data-target={targeted || undefined} data-attempted={attempted || undefined} aria-label={`第 ${x+1} 列、第 ${y+1} 行，${stone === "black" ? "黑棋" : stone === "white" ? "白棋" : "空位"}${targeted ? "，选择目标" : ""}${attempted ? "，非法尝试落点" : ""}`}>{stone ? <i className={`mini-stone ${stone}`}/> : null}{attempted ? <span className="demo-attempt" aria-hidden="true">×</span> : null}</span>;
      }))}
    </div>
    <p aria-live="polite">{frame.caption}</p>
    {demonstration.actionText ? <p className="demo-action">{demonstration.actionText}</p> : null}
    {demonstration.rejection ? <p className="demo-rejection" role="status">操作被拒绝：{demonstration.rejection}</p> : null}
    <p className="demo-state" aria-label="演示后的棋局状态">{state.consecutivePasses >= 2 ? "双方连续停手，已终局" : `轮到${state.toPlay === "black" ? "黑棋" : "白棋"}`} · 黑方提子 {state.captures.black} · 白方提子 {state.captures.white}{state.consecutivePasses > 0 ? ` · 连续停手 ${state.consecutivePasses} 次` : ""}</p>
    <div className="demo-controls">
      <button type="button" disabled={index === 0} onClick={() => setPlayback({ index: Math.max(0, index - 1), playing: false })}>上一步</button>
      <button type="button" aria-pressed={playing} onClick={() => setPlayback({ index, playing: !playing })}>{playing ? "暂停" : "播放"}</button>
      <button type="button" disabled={index === unit.demo.length - 1} onClick={() => setPlayback({ index: Math.min(unit.demo.length - 1, index + 1), playing: false })}>下一步</button>
    </div>
    <small>{index + 1} / {unit.demo.length} 帧</small>
  </section>;
}
