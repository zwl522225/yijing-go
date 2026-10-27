"use client";
/* eslint-disable react-hooks/refs -- Retained events must be invalidated synchronously before layout effects. */
import { useLayoutEffect, useRef, useState } from "react";
import { LADDER_PRACTICE_SCENARIOS } from "@/lib/learning/ladder-practice";
import { createLadderPracticeSession, applyLadderPracticeEvent, type LadderPracticeEvent } from "@/lib/learning/ladder-practice-session";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import type { Point } from "@/lib/go/types";
let attempts=0;
const sourceFor=(id:string):unknown=>{try{return LADDER_PRACTICE_SCENARIOS.find(s=>s?.id===id)??null;}catch{return null;}};
const fingerprint=(value:unknown)=>{try{return JSON.stringify(value);}catch{return null;}};
const coord=(p:Point)=>`（${p.x+1}，${p.y+1}）`;
const points=(ps:Point[])=>ps.map(coord).join("、")||"无";
const fresh=(id:string)=>{const token=`ladder-attempt-${++attempts}`,source=sourceFor(id);return {token,session:source===null?null:createLadderPracticeSession(id,token,source)};};
type Action={kind:"move";point:Point}|{kind:"reply"}|{kind:"hint"};
export function LadderPractice({scenarioId,isActive,onBack}:{scenarioId:string;isActive?():boolean;onBack():void}) {
 const [attempt,setAttempt]=useState(()=>fresh(scenarioId));
 const [tab,setTab]=useState(0);
 const latest=useRef(attempt),alive=useRef(true),parent=useRef(isActive),heading=useRef<HTMLHeadingElement|null>(null),cells=useRef<(HTMLButtonElement|null)[]>([]);
 parent.current=isActive;
 const source=sourceFor(scenarioId), stamp=fingerprint(source);
 const inputs=useRef({scenarioId,source,stamp});
 const activation=useRef(true);
 const activeNow=isActive?.()??true;
 let current=attempt;
 if(inputs.current.scenarioId!==scenarioId||inputs.current.source!==source||inputs.current.stamp!==stamp||activeNow!==activation.current){
  inputs.current={scenarioId,source,stamp};activation.current=activeNow;
  current=activeNow?fresh(scenarioId):{token:`ladder-attempt-${++attempts}`,session:null};latest.current=current;
  setAttempt(current);
 }
 useLayoutEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
 const s=current.session;
 useLayoutEffect(()=>{heading.current?.focus();},[current.token,s?.cursor]);
 const valid=()=>{
  if(!(parent.current?.()??true)){activation.current=false;latest.current={token:"inactive",session:null};return false;}
  if(inputs.current.scenarioId!==scenarioId||sourceFor(scenarioId)!==source||fingerprint(sourceFor(scenarioId))!==stamp){activation.current=false;latest.current={token:"invalid-source",session:null};return false;}
  return alive.current&&activation.current&&latest.current===current;
 };
 const send=(action:Action)=>{if(!valid()||!s)return;const session=applyLadderPracticeEvent(s,{...action,sessionId:s.sessionId,scenarioId:s.scenarioId,revision:s.revision,phase:s.phase,cursor:s.cursor} as LadderPracticeEvent);const next={token:current.token,session};latest.current=next;setAttempt(next);};
 const restart=()=>{if(!valid())return;const next=fresh(scenarioId);latest.current=next;setAttempt(next);setTab(0);};
 const back=()=>{if(!valid())return;alive.current=false;onBack();};
 const controls=<div className="ladder-controls"><button type="button" data-action="ladder-restart" onClick={restart}>重练本题</button><button type="button" data-action="ladder-back" onClick={back}>返回选题</button></div>;
 if(!s)return <section className="ladder-practice" data-ladder-practice data-phase="unavailable" data-cursor={0}><h3 ref={heading} tabIndex={-1} data-ladder-heading>本题暂不可用</h3><p>请重练本题恢复题盘，或返回选题。</p>{controls}</section>;
 const total=s.stats.length,task=Math.min(Math.floor(s.cursor/2)+1,total),index=Math.floor(s.cursor/2),hintCount=s.hints[index]??0;
 return <section className="ladder-practice" data-ladder-practice data-phase={s.phase} data-cursor={s.cursor}>
  <h3 ref={heading} tabIndex={-1} data-ladder-heading>{scenarioId==="capture"?"追到边线并提子":"接应子改变追法"}</h3>
  <p>你执黑；白棋为手动示范</p><p>教学摆子：这不是从空盘下出的实战。黑棋任务 {task}/{total}。</p>
  <p>{s.phase==="reply"?"请主动查看一手白棋示范应手，再重新数气。":s.phase==="complete"?"本题示范完成，可查看本次记录。":scenarioId==="helper"&&index===2?"比较实验：照原路线黑（4，5），观察是否还在打吃。":"轮到黑棋：观察目标白棋的气，沿指定路线继续追击。"}</p>
  <div role="status" aria-live="polite" aria-atomic="true">{s.feedback?<p data-ladder-feedback data-kind={s.feedback.kind} data-reason={s.feedback.reason}>{s.feedback.kind==="illegal"?"规则限制：":s.feedback.kind==="off-route"?"合法但偏离路线：":""}{s.feedback.message}{["illegal","off-route"].includes(s.feedback.kind)?" 棋盘保持原状。":""}</p>:null}</div>
  <div className="ladder-controls">{s.phase==="reply"?<button type="button" data-action="ladder-reply" onClick={()=>send({kind:"reply"})}>看白棋示范应手</button>:null}{s.phase==="player"?<button type="button" data-action="ladder-hint" aria-expanded={hintCount>0} disabled={hintCount>=3} onClick={()=>send({kind:"hint"})}>查看提示（{hintCount}/3）</button>:null}</div>
  {s.phase==="player"&&hintCount>0?<ol>{s.scenario.hints[index]?.slice(0,hintCount).map((text,i)=><li key={i}>{text}</li>)}</ol>:null}
  <p>目标是起始（3，3）的白棋组。{scenarioId==="helper"?"初始（3，6）的白棋是尚未连接的同色接应子。":null}</p>
  <p data-ladder-current data-stones={s.facts.target?.stones.length??0} data-liberties={s.facts.target?.liberties.length??0}>当前目标白棋 {s.facts.target?.stones.length??0} 颗：{points(s.facts.target?.stones??[])}；气 {s.facts.target?.liberties.length??0} 口：{points(s.facts.target?.liberties??[])}。最近合法一手提子：黑 {s.facts.captureDelta.black} 颗，白 {s.facts.captureDelta.white} 颗。</p>
  <div className="ladder-board" role="grid" aria-label="七路征子练习棋盘，列在前行在后" aria-readonly={s.phase!=="player"}>
   {s.game.board.map((row,y)=><div role="row" className="ladder-row" key={y}>{row.map((stone,x)=>{const n=y*7+x;return <button key={n} type="button" role="gridcell" data-ladder-point={`${x},${y}`} ref={node=>{cells.current[n]=node;}} tabIndex={tab===n?0:-1} aria-label={`第${x+1}列，第${y+1}行，${stone==="black"?"黑棋":stone==="white"?"白棋":"空点"}`} onFocus={()=>{if(valid())setTab(n);}} onClick={()=>{if(s.phase==="player")send({kind:"move",point:{x,y}});}} onKeyDown={event=>{const d:Record<string,Point>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};const offset=d[event.key];if(!offset)return;event.preventDefault();if(!valid())return;const next=Math.max(0,Math.min(6,y+offset.y))*7+Math.max(0,Math.min(6,x+offset.x));setTab(next);cells.current[next]?.focus();}}>{stone?<i aria-hidden="true" className={`mini-stone ${stone}`}/>:null}</button>;})}</div>)}
  </div><p>坐标为（列，行），从 1 开始。方向键浏览；回车或空格落子。白棋示范和完成阶段只浏览。</p>
  <details key={current.token} data-ladder-record><summary>展开合法着手记录（{s.actions.length} 手）</summary><ol>{s.actions.map((a,i)=><li key={i} data-ladder-action={i} data-stones={a.facts.target?.stones.length??0} data-liberties={a.facts.target?.liberties.length??0} data-captured={a.facts.captureDelta[a.actor]}>{i+1}. {a.actor==="black"?"黑棋":"白棋"} {coord(a.point)}；本手提子 {a.facts.captureDelta[a.actor]} 颗；当时目标白棋 {a.facts.target?.stones.length??0} 颗，气 {a.facts.target?.liberties.length??0} 口：{points(a.facts.target?.liberties??[])}。</li>)}</ol></details>
  {s.phase==="complete"?<div data-ladder-summary><h4>本次练习记录</h4><p>{scenarioId==="capture"?`指定应手下，最后一手实际提掉 ${s.facts.captureDelta.black} 颗白子。这是有限示范，没有搜索白棋所有合法反抗，也不判断全局胜负。`:"白棋连接后成为四子、三气；照原路线追后仍有两气，这一手没有继续打吃，需要重新读棋。两气不等于无条件活棋，也不证明所有黑棋着法均无效。"}</p>{s.stats.map((stat,i)=><p key={i} data-ladder-stats={i} data-hint-used={stat.usedHint} data-extra-attempts={stat.extraAttempts}>黑棋任务 {i+1}：{stat.usedHint?"使用过提示":"未用提示"}；额外尝试 {stat.extraAttempts} 次。</p>)}<p>只记录本次练习，不计课程成绩或术语掌握。</p></div>:null}
  <div aria-label="只读术语解释">{(["ladder","atari","liberty","connect"] as const).map(id=>{const term=GLOSSARY_BY_ID.get(id);return term?<details key={id} data-ladder-term={id}><summary>{term.name}</summary><p>{term.plain}</p><p>{term.formal}</p></details>:null;})}<p>接应子：征子方向上，逃跑方可以连接的同色棋子。</p></div>{controls}
 </section>;
}
