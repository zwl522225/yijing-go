"use client";
import { useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PauseableLessonDemo } from "@/components/learning/lesson-demo";
import { TermLink } from "@/components/learning/term-link";
import { GLOSSARY, GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { ExercisePractice } from "@/components/learning/practice-picker";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import type { GlossaryEntry, LessonUnitId, TermId, TermStatus } from "@/lib/learning/types";

const STATUS_LABELS = {seen:"已见过",practiced:"已练过",mastered:"已掌握"};
const statusLabel = (status?:TermStatus) => status ? STATUS_LABELS[status] : "未学习";

export function GlossaryDictionary({progress,onOpenTerm}: {progress:LearningProgress;onOpenTerm(id:TermId):void}) {
  const [search,setSearch]=useState("");
  const query=search.trim().toLocaleLowerCase();
  const entries=GLOSSARY.filter(entry=>[entry.name,...entry.aliases,entry.id].some(value=>value.toLocaleLowerCase().includes(query)));
  return <section className="glossary-dictionary" aria-label="全部围棋术语">
    <label htmlFor="glossary-search">搜索名称或别名</label>
    <input id="glossary-search" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="例如：气、打吃"/>
    <p aria-live="polite">找到 {entries.length} 个术语 · 共 {GLOSSARY.length} 个</p>
    <ul>{entries.map(entry=><li key={entry.id}><TermLink entry={entry} onOpen={onOpenTerm}/><span>{statusLabel(progress.termStates[entry.id])}</span>{entry.aliases.length ? <small>{entry.aliases.join("、")}</small> : null}</li>)}</ul>
    {!entries.length ? <p>没有找到，试试其他名称或别名。</p> : null}
  </section>;
}

export function TermPractice({entry,onPractice}: {entry:GlossaryEntry;onPractice(id:TermId):void}) {
  return <ExercisePractice exercise={entry.practice} label={entry.name+"即时练习"} boardLabel="术语练习棋盘" onComplete={()=>onPractice(entry.id)}/>;
}

type EntryProps = {entry:GlossaryEntry;status?:TermStatus;progress:LearningProgress;onPractice(id:TermId):void;onOpenTerm(id:TermId):void;onStartLesson(id:LessonUnitId):void};
export function GlossaryContent({entry,status,progress,onPractice,onOpenTerm,onStartLesson}:EntryProps) {
  return <div className="glossary-entry">
    <div className="term-heading"><h2>{entry.name}</h2><span>{statusLabel(status)}</span></div>
    {entry.aliases.length ? <p>别名：{entry.aliases.join("、")}</p> : <p>别名：暂无</p>}
    <h3>白话解释</h3><p>{entry.plain}</p><h3>专业定义</h3><p>{entry.formal}</p><h3>易错点</h3><p>{entry.misconception}</p>
    <PauseableLessonDemo id={`term-${entry.id}`} boardSize={entry.animation.position.size} frames={entry.animation.frames} choices={entry.practice.choices}/>
    <TermPractice key={entry.id} entry={entry} onPractice={onPractice}/>
    <h3>关联课程</h3><div className="term-links">{entry.lessonIds.map(id=><button type="button" key={id} data-lesson-id={id} disabled={!isUnitUnlocked(id,progress)} onClick={()=>{if(isUnitUnlocked(id,progress)) onStartLesson(id);}}>{CURRICULUM_BY_ID.get(id)?.title}{!isUnitUnlocked(id,progress) ? " · 先完成前课" : ""}</button>)}</div>
    <h3>相关术语</h3><div className="term-links">{entry.relatedTermIds.map(id=><TermLink key={id} entry={GLOSSARY_BY_ID.get(id)!} onOpen={onOpenTerm}/>)}</div>
  </div>;
}

export function GlossaryDialog({open,termId,progress,onClose,onOpenTerm,onDictionary,onPractice,onStartLesson}: {
  open:boolean;termId:TermId|null;progress:LearningProgress;onClose():void;onOpenTerm(id:TermId):void;onDictionary():void;onPractice(id:TermId):void;onStartLesson(id:LessonUnitId):void;
}) {
  const entry=termId ? GLOSSARY_BY_ID.get(termId) : undefined;
  const returnFocus=useRef<HTMLElement|null>(null);
  return <Dialog open={open} onOpenChange={value=>{if(!value) onClose();}}><DialogContent className="glossary-dialog" showCloseButton={false}
    onOpenAutoFocus={()=>{returnFocus.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;}}
    onCloseAutoFocus={event=>{event.preventDefault(); if(returnFocus.current?.isConnected) returnFocus.current.focus();}}>
    <div className="glossary-toolbar"><DialogTitle>{entry ? `术语词典 · ${entry.name}` : "术语词典"}</DialogTitle><DialogClose asChild><button type="button" aria-label="关闭术语词典">关闭</button></DialogClose></div>
    <DialogDescription>白话解释、真实棋形演示与动手练习。</DialogDescription>
    {entry ? <><button type="button" onClick={onDictionary}>返回全部术语</button><GlossaryContent entry={entry} status={progress.termStates[entry.id]} progress={progress} onPractice={onPractice} onOpenTerm={onOpenTerm} onStartLesson={onStartLesson}/></> : <GlossaryDictionary progress={progress} onOpenTerm={onOpenTerm}/>}
  </DialogContent></Dialog>;
}
