"use client";
import { useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LessonFeedback } from "@/components/learning/lesson-feedback";
import { applyLessonAction, type ExerciseResult } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import { getPracticeTopics, getWrongQuestionPractice } from "@/lib/learning/practice";
import type { LearningProgress } from "@/lib/learning/progress";
import type { Exercise, LessonAction } from "@/lib/learning/types";
import type { Point } from "@/lib/go/types";

export function ExercisePractice({exercise,label,onComplete,successLabel,boardLabel="练习棋盘"}: {exercise:Exercise;label:string;onComplete?():void;successLabel?:string;boardLabel?:string}) {
  const [attempt,setAttempt]=useState(()=>({state:createPosition(exercise.position),feedback:null as ExerciseResult|null,selected:null as Point|null,hintLevel:0}));
  const completed=attempt.feedback?.completed ?? false;
  const submit=(action:LessonAction)=>{
    if(completed) return;
    const result=applyLessonAction(exercise,attempt.state,action);
    setAttempt({...attempt,state:result.nextState,feedback:result});
    if(result.completed) onComplete?.();
  };
  const select=(point:Point)=>{
    if(completed) return;
    if(exercise.expected.kind==="select-group" || exercise.expected.kind==="mark-dead") {
      if(attempt.state.board[point.y][point.x]) setAttempt({...attempt,selected:point});
    } else submit({kind:"move",point});
  };
  return <section className="term-practice" aria-label={label}>
    <h3>动手试一试</h3><p>{exercise.prompt}</p>
    <div className="demo-board practice-board" style={{"--board-size":attempt.state.size} as React.CSSProperties} aria-label={boardLabel}>
      {attempt.state.board.flatMap((row,y)=>row.map((stone,x)=><button key={`${x},${y}`} type="button" className="demo-point" data-practice-point={`${x},${y}`} data-target={attempt.selected?.x===x && attempt.selected.y===y || undefined}
        disabled={completed || exercise.expected.kind==="choice" || exercise.expected.kind==="pass"} aria-pressed={attempt.selected?.x===x && attempt.selected.y===y}
        aria-label={`第 ${x+1} 列、第 ${y+1} 行，${stone==="black" ? "黑棋" : stone==="white" ? "白棋" : "空位"}`} onClick={()=>select({x,y})}>{stone ? <i className={`mini-stone ${stone}`}/> : null}</button>))}
    </div>
    {exercise.expected.kind==="move" ? <p>点击棋盘交叉点落子。</p> : null}
    {exercise.expected.kind==="select-group" || exercise.expected.kind==="mark-dead" ? <p>点击棋子选择目标，再确认。{attempt.selected ? `已选择第 ${attempt.selected.x+1} 列、第 ${attempt.selected.y+1} 行。` : "尚未选择。"}</p> : null}
    <div className="exercise-controls">
      {exercise.expected.kind==="pass" ? <button type="button" data-action="pass" disabled={completed} onClick={()=>submit({kind:"pass"})}>停一手</button> : null}
      {exercise.expected.kind==="choice" ? exercise.choices?.map(choice=><button key={choice.id} type="button" data-choice-id={choice.id} disabled={completed} onClick={()=>submit({kind:"choice",choiceId:choice.id})}>{choice.label}</button>) : null}
      {exercise.expected.kind==="select-group" || exercise.expected.kind==="mark-dead" ? <button type="button" data-action={exercise.expected.kind} disabled={completed || !attempt.selected} onClick={()=>{if(attempt.selected && (exercise.expected.kind==="select-group" || exercise.expected.kind==="mark-dead")) submit({kind:exercise.expected.kind,point:attempt.selected});}}>{exercise.expected.kind==="mark-dead" ? "确认死子" : "确认棋块"}</button> : null}
    </div>
    <LessonFeedback feedback={attempt.feedback} actionKind={exercise.expected.kind} successLabel={successLabel}/>
    <div className="term-practice-actions"><button type="button" data-action="retry" onClick={()=>setAttempt({state:createPosition(exercise.position),feedback:null,selected:null,hintLevel:0})}>重新练习</button><button type="button" data-action="hint" disabled={completed || attempt.hintLevel>=3} onClick={()=>setAttempt({...attempt,hintLevel:Math.min(3,attempt.hintLevel+1)})}>查看提示（{attempt.hintLevel}/3）</button></div>
    {exercise.hints.slice(0,attempt.hintLevel).map(hint=><p key={hint.level}>{hint.level}. {hint.text}</p>)}
  </section>;
}

export function PracticePicker({progress,onClose}: {progress:LearningProgress;onClose():void}) {
  const [topic,setTopic]=useState("placement");
  const [exerciseId,setExerciseId]=useState<string|null>(null);
  const topics=getPracticeTopics(progress),wrong=getWrongQuestionPractice(progress);
  const items=topic==="wrong" ? wrong : topics.find(item=>item.id===topic)?.items ?? [];
  const selected=items.find(item=>item.exercise.id===exerciseId);
  return <div className="practice-picker">
    <p>练习不计入课程和测验成绩，也不改变术语掌握状态。</p>
    <nav className="practice-topics" aria-label="练习主题">
      {topics.map(item=><button type="button" key={item.id} data-practice-topic={item.id} aria-pressed={topic===item.id} disabled={!item.items.length} onClick={()=>{setTopic(item.id);setExerciseId(null);}}>{item.title}{!item.items.length ? " · 待解锁" : "（"+item.items.length+"）"}</button>)}
      <button type="button" data-practice-topic="wrong" aria-pressed={topic==="wrong"} onClick={()=>{setTopic("wrong");setExerciseId(null);}}>错题重练（{wrong.length}）</button>
    </nav>
    <div className="practice-exercises" aria-label="选择练习题">{items.map((item,index)=><button type="button" key={item.exercise.id} data-practice-exercise={item.exercise.id} aria-pressed={selected===item} onClick={()=>setExerciseId(item.exercise.id)}>{item.title} · 第 {index+1} 题</button>)}</div>
    {!items.length ? <p>当前没有可重练的错题。先完成已解锁的课程或测验。</p> : !selected ? <p>选择一道题，随时可查看提示或重新练习。</p> : null}
    {selected ? <ExercisePractice key={selected.exercise.id} exercise={selected.exercise} label="独立练习" successLabel="成功已重练"/> : null}
    <button type="button" onClick={onClose}>结束练习</button>
  </div>;
}
export function PracticeDialog({open,progress,onClose}: {open:boolean;progress:LearningProgress;onClose():void}) {
  const returnFocus=useRef<HTMLElement|null>(null);
  return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="glossary-dialog practice-dialog" showCloseButton={false}
    onOpenAutoFocus={()=>{returnFocus.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;}}
    onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus.current?.isConnected)returnFocus.current.focus();}}>
    <div className="glossary-toolbar"><DialogTitle>专项练习与错题本</DialogTitle><DialogClose asChild><button type="button" aria-label="关闭专项练习">关闭</button></DialogClose></div>
    <DialogDescription>按主题重练已解锁的课程题目，用真实棋局验证每一次操作。</DialogDescription>
    {open ? <PracticePicker progress={progress} onClose={onClose}/> : null}
  </DialogContent></Dialog>;
}
