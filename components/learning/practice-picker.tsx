"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ExercisePractice } from "@/components/learning/exercise-practice";
export { ExercisePractice } from "@/components/learning/exercise-practice";
import { getPracticeTopics, getWrongQuestionPractice } from "@/lib/learning/practice";
import type { LearningProgress } from "@/lib/learning/progress";
import { PracticeRound } from "@/components/learning/practice-round";
import { createPracticeRound, type PracticeRound as Round } from "@/lib/learning/practice-round";
import { TacticalPractice } from "@/components/learning/tactical-practice";
import { AreaCountingPractice } from "@/components/learning/area-counting-practice";
import { AREA_PRACTICE_SCENARIOS, canStartAreaPractice, type AreaPracticeScenarioId } from "@/lib/learning/area-practice";
import { TACTICAL_SEQUENCES, canStartTacticalSequence, type TacticalSequence } from "@/lib/learning/tactical-sequences";

type PracticeItem = ReturnType<typeof getPracticeTopics>[number]["items"][number];
type PickerView = {topic:string; epoch:number} & (
  {kind:"picker"} | {kind:"free";item:PracticeItem} |
  {kind:"round";round:Round;theme:string} | {kind:"tactical";scenario:TacticalSequence} | {kind:"area";scenarioId:AreaPracticeScenarioId}
);

export function PracticePicker({progress,onClose,isActive}: {progress:LearningProgress;onClose():void;isActive?():boolean}) {
  const [view,setView] = useState<PickerView>({kind:"picker",topic:"placement",epoch:0});
  const latest = useRef(view);
  const alive = useRef(true);
  const inputs = useRef({progress,isActive});
  // eslint-disable-next-line react-hooks/refs -- entry handlers must synchronously recheck current progress and parent activity.
  inputs.current={progress,isActive};
  const entryRefs = useRef<Partial<Record<TacticalSequence["id"],HTMLButtonElement|null>>>({});
  const returnEntry = useRef<TacticalSequence["id"]|null>(null);
  const areaEntryRefs = useRef<Partial<Record<AreaPracticeScenarioId,HTMLButtonElement|null>>>({});
  const returnAreaEntry = useRef<AreaPracticeScenarioId|null>(null);
  useEffect(() => { alive.current=true; return () => { alive.current=false; }; },[]);
  useEffect(() => {
    if (view.kind === "picker" && returnEntry.current) {
      entryRefs.current[returnEntry.current]?.focus(); returnEntry.current=null;
    }
    if (view.kind === "picker" && returnAreaEntry.current) {
      areaEntryRefs.current[returnAreaEntry.current]?.focus(); returnAreaEntry.current=null;
    }
  },[view]);
  const topics = getPracticeTopics(progress), wrong = getWrongQuestionPractice(progress);
  const items = view.topic === "wrong" ? wrong : topics.find(item => item.id === view.topic)?.items ?? [];
  // A mode is a particular object, so callbacks cannot become valid again on reentry.
  const active = () => alive.current && (inputs.current.isActive?.() ?? true) && latest.current === view;
  const update = (next:PickerView) => { latest.current=next; setView(next); };
  const close = () => { if (!active()) return; alive.current=false; onClose(); };
  const back = () => {
    if (!active()) return;
    if (view.kind === "tactical") returnEntry.current=view.scenario.id;
    if (view.kind === "area") returnAreaEntry.current=view.scenarioId;
    update({kind:"picker",topic:view.topic,epoch:view.epoch+1});
  };
  const chooseTopic = (topic:string) => {
    if (!active() || view.kind !== "picker") return;
    update({kind:"picker",topic,epoch:view.epoch+1});
  };
  const start = () => {
    if (!active() || view.kind !== "picker") return;
    const round = createPracticeRound(items); if (!round) return;
    update({kind:"round",topic:view.topic,epoch:view.epoch+1,round,theme:view.topic === "wrong" ? "错题重练" : topics.find(item => item.id === view.topic)!.title});
  };
  const enterTactical = (scenario:TacticalSequence) => {
    if (!active() || view.kind !== "picker" || !canStartTacticalSequence(scenario,inputs.current.progress)) return;
    update({kind:"tactical",topic:view.topic,epoch:view.epoch+1,scenario});
  };
  const enterArea = (scenarioId:AreaPracticeScenarioId) => {
    if (!active() || view.kind !== "picker" || !canStartAreaPractice(inputs.current.progress)) return;
    update({kind:"area",topic:view.topic,epoch:view.epoch+1,scenarioId});
  };
  if (view.kind === "area") return <div className="practice-picker">
    <AreaCountingPractice key={view.epoch} scenarioId={view.scenarioId} isActive={active} onBack={back}/>
    <button type="button" onClick={close}>结束练习</button>
  </div>;
  if (view.kind === "tactical") return <div className="practice-picker">
    <TacticalPractice key={view.epoch} scenario={view.scenario} isActive={active} onBack={back}/>
    <button type="button" onClick={close}>结束练习</button>
  </div>;
  if (view.kind === "round") return <div className="practice-picker"><PracticeRound key={view.epoch} initialRound={view.round} theme={view.theme} isActive={active} onBack={back}/>
    <button type="button" onClick={close}>结束练习</button>
  </div>;
  if (view.kind === "free") return <div className="practice-picker">
    <p>练习不计入课程和测验成绩，也不改变术语掌握状态。</p>
    <ExercisePractice key={view.epoch} exercise={view.item.exercise} label="独立练习" successLabel="成功已重练" isActive={active}/>
    <button type="button" data-action="back-practice-picker" onClick={back}>返回选题</button>
    <button type="button" onClick={close}>结束练习</button>
  </div>;
  return <div className="practice-picker">
    <p>练习不计入课程和测验成绩，也不改变术语掌握状态。</p>
    <section className="area-entries" aria-label="数子练习">
      <h3>数子练习</h3><p>亲自数出活子、围住空点与公空，再计算白棋贴目后的结果。</p>
      {AREA_PRACTICE_SCENARIOS.map(scenario=><button key={scenario.id} type="button" ref={node=>{areaEntryRefs.current[scenario.id]=node;}} data-area-entry={scenario.id} disabled={!canStartAreaPractice(progress)} onClick={()=>enterArea(scenario.id)}>{scenario.title}</button>)}
      {!canStartAreaPractice(progress) ? <p>先完成《中国规则数目与贴目》，并满足前课解锁条件。</p> : null}
    </section>
    <section className="tactical-entries" aria-label="连续吃子练习">
      <h3>连续吃子练习</h3><p>你下两手黑棋，中间主动查看白棋示范应手。</p>
      {TACTICAL_SEQUENCES.map(scenario => <div key={scenario.id}>
        <button type="button" ref={node => { entryRefs.current[scenario.id]=node; }} data-tactical-entry={scenario.id} disabled={!canStartTacticalSequence(scenario,progress)} onClick={() => enterTactical(scenario)}>{scenario.title}</button>
        {!canStartTacticalSequence(scenario,progress) ? <p>先完成《{scenario.id === "net" ? "枷吃" : "倒扑"}》并满足前课解锁条件。</p> : null}
      </div>)}
    </section>
    <nav className="practice-topics" aria-label="练习主题">
      {topics.map(item => <button type="button" key={item.id} data-practice-topic={item.id} aria-pressed={view.topic === item.id} disabled={!item.items.length} onClick={() => chooseTopic(item.id)}>{item.title}{!item.items.length ? " · 待解锁" : "（"+item.items.length+"）"}</button>)}
      <button type="button" data-practice-topic="wrong" aria-pressed={view.topic === "wrong"} onClick={() => chooseTopic("wrong")}>错题重练（{wrong.length}）</button>
    </nav>
    <button type="button" data-action="start-practice-round" disabled={!items.length} onClick={start}>开始一组练习（{Math.min(5,items.length)} 题）</button>
    <div className="practice-exercises" aria-label="选择练习题">{items.map((item,index) => <button type="button" key={item.exercise.id} data-practice-exercise={item.exercise.id} aria-pressed={false} onClick={() => {
      if (!active() || view.kind !== "picker") return;
      update({kind:"free",topic:view.topic,epoch:view.epoch+1,item});
    }}>{item.title} · 第 {index+1} 题</button>)}</div>
    {!items.length ? <p>当前没有可重练的错题。先完成已解锁的课程或测验。</p> : <p>选择一道题，随时可查看提示或重新练习。</p>}
    <button type="button" onClick={close}>结束练习</button>
  </div>;
}

export function PracticeDialog({open,progress,onClose}: {open:boolean;progress:LearningProgress;onClose():void}) {
  const returnFocus = useRef<HTMLElement|null>(null);
  const rendered = useMemo(() => ({open}),[open]);
  const lifecycle = useRef({identity:rendered,active:open});
  useEffect(() => {
    lifecycle.current={identity:rendered,active:open};
    return () => { if (lifecycle.current.identity === rendered) lifecycle.current.active=false; };
  },[rendered,open]);
  const active = () => open && lifecycle.current.identity === rendered && lifecycle.current.active;
  const close = () => { if (!active()) return; lifecycle.current.active=false; onClose(); };
  return <Dialog open={open} onOpenChange={value => { if (!value) close(); }}><DialogContent className="glossary-dialog practice-dialog" showCloseButton={false}
    onOpenAutoFocus={() => { returnFocus.current=document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
    onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
    <div className="glossary-toolbar"><DialogTitle>专项练习与错题本</DialogTitle><DialogClose asChild><button type="button" aria-label="关闭专项练习" onClick={close}>关闭</button></DialogClose></div>
    <DialogDescription>按主题重练已解锁的课程题目，用真实棋局验证每一次操作。</DialogDescription>
    {open ? <PracticePicker progress={progress} onClose={close} isActive={active}/> : null}
  </DialogContent></Dialog>;
}
