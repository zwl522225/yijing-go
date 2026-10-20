"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ExercisePractice } from "@/components/learning/exercise-practice";
export { ExercisePractice } from "@/components/learning/exercise-practice";
import { getPracticeTopics, getWrongQuestionPractice } from "@/lib/learning/practice";
import type { LearningProgress } from "@/lib/learning/progress";
import { PracticeRound } from "@/components/learning/practice-round";
import { createPracticeRound, type PracticeRound as Round } from "@/lib/learning/practice-round";

export function PracticePicker({progress,onClose}: {progress:LearningProgress;onClose():void}) {
  const [topic,setTopic]=useState("placement");
  const [exerciseId,setExerciseId]=useState<string|null>(null);
  const [run,setRun]=useState<{round:Round;theme:string}|null>(null);
  const currentRun=useRef(run);
  const selection=useRef<string|null>(null);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const topics=getPracticeTopics(progress),wrong=getWrongQuestionPractice(progress);
  const items=topic==="wrong" ? wrong : topics.find(item=>item.id===topic)?.items ?? [];
  const selected=items.find(item=>item.exercise.id===exerciseId);
  const close=()=>{if(!alive.current)return;alive.current=false;currentRun.current=null;onClose();};
  const chooseTopic=(next:string)=>{if(!alive.current||currentRun.current)return;selection.current=null;setTopic(next);setExerciseId(null);};
  const start=()=>{
    if(!alive.current||currentRun.current)return;
    const round=createPracticeRound(items);if(!round)return;
    const next={round,theme:topic==="wrong"?"错题重练":topics.find(item=>item.id===topic)!.title};
    currentRun.current=next;selection.current=null;setRun(next);
  };
  if(run)return <div className="practice-picker"><PracticeRound initialRound={run.round} theme={run.theme}
    isActive={()=>alive.current&&currentRun.current===run}
    onBack={()=>{if(!alive.current||currentRun.current!==run)return;currentRun.current=null;setRun(null);setExerciseId(null);}}/>
    <button type="button" onClick={close}>结束练习</button></div>;
  return <div className="practice-picker">
    <p>练习不计入课程和测验成绩，也不改变术语掌握状态。</p>
    <nav className="practice-topics" aria-label="练习主题">
      {topics.map(item=><button type="button" key={item.id} data-practice-topic={item.id} aria-pressed={topic===item.id} disabled={!item.items.length} onClick={()=>chooseTopic(item.id)}>{item.title}{!item.items.length ? " · 待解锁" : "（"+item.items.length+"）"}</button>)}
      <button type="button" data-practice-topic="wrong" aria-pressed={topic==="wrong"} onClick={()=>chooseTopic("wrong")}>错题重练（{wrong.length}）</button>
    </nav>
    <button type="button" data-action="start-practice-round" disabled={!items.length} onClick={start}>开始一组练习（{Math.min(5,items.length)} 题）</button>
    <div className="practice-exercises" aria-label="选择练习题">{items.map((item,index)=><button type="button" key={item.exercise.id} data-practice-exercise={item.exercise.id} aria-pressed={selected===item} onClick={()=>{if(!alive.current||currentRun.current)return;selection.current=item.exercise.id;setExerciseId(item.exercise.id);}}>{item.title} · 第 {index+1} 题</button>)}</div>
    {!items.length ? <p>当前没有可重练的错题。先完成已解锁的课程或测验。</p> : !selected ? <p>选择一道题，随时可查看提示或重新练习。</p> : null}
    {selected ? <ExercisePractice key={selected.exercise.id} exercise={selected.exercise} label="独立练习" successLabel="成功已重练" isActive={()=>alive.current&&!currentRun.current&&selection.current===selected.exercise.id}/> : null}
    <button type="button" onClick={close}>结束练习</button>
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
