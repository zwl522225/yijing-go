"use client";
/* eslint-disable react-hooks/refs -- Event guards must invalidate retained callbacks synchronously, before effects. */
import { useLayoutEffect, useRef, useState } from "react";
import { KO_PRACTICE_SCENARIO } from "@/lib/learning/ko-practice";
import { applyKoPracticeEvent, createKoPracticeSession, type KoPracticeEvent, type KoPracticeSession } from "@/lib/learning/ko-practice-session";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { groupAt } from "@/lib/go/analysis";
import type { Point } from "@/lib/go/types";
let attemptCounter=0;
const sourceFingerprint=()=>{try{return JSON.stringify(KO_PRACTICE_SCENARIO);}catch{return null;}};
const fresh=()=>createKoPracticeSession(`ko-attempt-${++attemptCounter}`,KO_PRACTICE_SCENARIO);
const coord=(p:Point)=>`（${p.x+1}，${p.y+1}）`;
const points=(ps:Point[])=>ps.map(coord).join("、")||"无";
type Action=KoPracticeEvent extends infer E ? E extends KoPracticeEvent ? Omit<E,"sessionId"|"scenarioId"|"revision"|"phase">:never:never;
export function KoPractice({isActive,onBack}:{isActive?():boolean;onBack():void}) {
 const [stored,setStored]=useState<KoPracticeSession|null>(fresh);
 const [tab,setTab]=useState(0);
 const [,refreshAttempt]=useState(0);
 const latest=useRef(stored), alive=useRef(true), parent=useRef(isActive), heading=useRef<HTMLHeadingElement|null>(null), cells=useRef<(HTMLButtonElement|null)[]>([]);
 parent.current=isActive;
 const fingerprint=sourceFingerprint();
 const attempt=useRef({});
 const source=useRef({value:KO_PRACTICE_SCENARIO,fingerprint});
 const activation=useRef(true);
 const activeNow=isActive?.()??true;
 let session=stored;
 if(source.current.value!==KO_PRACTICE_SCENARIO||source.current.fingerprint!==fingerprint||!activeNow||!activation.current){
  attempt.current={};
  source.current={value:KO_PRACTICE_SCENARIO,fingerprint};
  session=activeNow?fresh():null;latest.current=session;activation.current=activeNow;
  if(session!==stored)setStored(session);
 }
 useLayoutEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
 useLayoutEffect(()=>{heading.current?.focus();},[session?.sessionId,session?.phase]);
 const identity=attempt.current;
 const valid=()=>{
  if(!(parent.current?.()??true)){activation.current=false;latest.current=null;return false;}
  return attempt.current===identity&&alive.current&&activation.current&&latest.current===session&&source.current.value===KO_PRACTICE_SCENARIO&&source.current.fingerprint===sourceFingerprint();
 };
 const send=(action:Action)=>{
  if(!valid()||!session)return;
  const next=applyKoPracticeEvent(session,{...action,sessionId:session.sessionId,scenarioId:session.scenarioId,revision:session.revision,phase:session.phase} as KoPracticeEvent);
  latest.current=next;setStored(next);
 };
 const restart=()=>{if(!valid())return;attempt.current={};const next=fresh();latest.current=next;setStored(next);setTab(0);refreshAttempt(n=>n+1);};
 const back=()=>{if(!valid())return;alive.current=false;onBack();};
 const controls=<div className="ko-controls"><button type="button" data-action="ko-restart" onClick={restart}>重新练习，选择另一种应手</button><button type="button" data-action="ko-back" onClick={back}>返回选题</button></div>;
 if(!session)return <section data-ko-practice="ko" data-phase="unavailable" className="ko-practice"><h3 ref={heading} tabIndex={-1} data-ko-heading>本题暂不可用</h3><p>请重新练习恢复题盘，或返回选题。</p>{controls}</section>;
 const s=session, writable=["probe","threat","follow-up"].includes(s.phase);
 const task={ready:"这是教学摆子，请主动查看黑棋如何提劫。",probe:"请白棋尝试立即下在（3，3）回提，亲自体验劫的限制。","probe-done":"这是预期的规则体验，不计作额外尝试。两边不能立即重复之前的棋形。",threat:"请白棋寻找一手劫材：观察角上黑棋的气。",reply:"白棋劫材已下。请选择并查看一手黑棋应对。","follow-up":"轮到白棋：观察黑棋应对后，选择本次变化的后续着手。",complete:"本条示范变化完成。可重新开始，体验另一种黑棋应对。"}[s.phase];
 const hintKey=s.phase==="threat"?"threat":s.phase==="follow-up"?"followUp":null;
 const branch=s.scenario.branches.find(b=>b.id===s.branchId);
 const hintTexts=hintKey==="threat"?s.scenario.threatHints:branch?.followUpHints;
 return <section data-ko-practice="ko" data-phase={s.phase} className="ko-practice">
  <h3 ref={heading} tabIndex={-1} data-ko-heading>劫与劫材：两种应对</h3>
  <p className="ko-role">你执白 · 当前轮到{s.game.toPlay==="black"?"黑棋":"白棋"}{!writable?"（观察阶段）":""}</p><p>{task}</p>
  <div role="status" aria-live="polite" aria-atomic="true">{s.feedback?<p data-ko-feedback data-kind={s.feedback.kind} data-reason={s.feedback.reason}>{s.feedback.kind==="off-route"?"合法但偏离路线：":s.feedback.kind==="illegal"?(s.phase==="probe-done"?"规则体验：":"规则限制："):""}{s.feedback.message}{s.phase==="follow-up"&&s.branchId==="fill"&&s.feedback.reason==="occupied"?" 请重新观察左上黑棋的最后一口气。":""}{["illegal","off-route"].includes(s.feedback.kind)?" 棋盘保持原状。":""}</p>:null}</div>
  <div className="ko-controls">{s.phase==="ready"?<button type="button" data-action="ko-start" onClick={()=>send({kind:"start"})}>看黑棋提劫</button>:null}
  {s.phase==="probe-done"?<button type="button" data-action="ko-continue" onClick={()=>send({kind:"continue"})}>继续找劫材</button>:null}
  {s.phase==="reply"?s.scenario.branches.map(b=><button type="button" key={b.id} data-ko-reply={b.id} onClick={()=>send({kind:"reply",branchId:b.id})}>{b.label}</button>):null}
  {hintKey?<button type="button" data-action="ko-hint" aria-expanded={s.hints[hintKey]>0} disabled={s.hints[hintKey]>=3} onClick={()=>send({kind:"hint"})}>查看提示（{s.hints[hintKey]}/3）</button>:null}
  {s.phase==="complete"&&s.branchId==="answer"?<button type="button" data-action="ko-probe-black" onClick={()=>send({kind:"probe-black"})}>试探黑棋能否立即提回</button>:null}</div>
  {hintKey&&s.hints[hintKey]>0?<ol className="ko-hints">{hintTexts?.slice(0,s.hints[hintKey]).map((text,i)=><li key={i}>{text}</li>)}</ol>:null}
  <div className="ko-layout"><div><div className="ko-board" role="grid" aria-label="五路劫练习棋盘，列在前行在后" aria-readonly={!writable}>
   {s.game.board.map((row,y)=><div role="row" className="ko-row" key={y}>{row.map((stone,x)=>{const index=y*5+x;return <button type="button" role="gridcell" key={index} ref={node=>{cells.current[index]=node;}} data-ko-point={`${x},${y}`} aria-label={`第${x+1}列，第${y+1}行，${stone==="black"?"黑棋":stone==="white"?"白棋":"空点"}`} tabIndex={tab===index?0:-1}
    onFocus={()=>{if(valid())setTab(index);}}
    onClick={()=>{if(writable)send({kind:"move",point:{x,y}});}}
    onKeyDown={event=>{const offsets:Record<string,Point>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};const d=offsets[event.key];if(!d)return;event.preventDefault();if(!valid())return;const next=Math.max(0,Math.min(4,y+d.y))*5+Math.max(0,Math.min(4,x+d.x));setTab(next);cells.current[next]?.focus();}}>{stone?<i aria-hidden="true" className={`mini-stone ${stone}`}/>:null}</button>;})}</div>)}
  </div><p>坐标均为（列，行），从 1 开始。方向键浏览，回车或空格落子；观察阶段只能浏览。</p></div>
  <div className="ko-observations"><p data-ko-corner>当前角上目标黑棋：{s.facts.corner?.stones.length??0} 颗；气 {s.facts.corner?.liberties.length??0} 口，位置 {points(s.facts.corner?.liberties??[])}。</p><p data-ko-captures>累计提子：黑棋 {s.facts.captures.black} 颗，白棋 {s.facts.captures.white} 颗。</p>
  <ol aria-label="合法着手记录">{s.actions.map((a,i)=>{const before=s.game.past[i],after=s.game.past[i+1]??s.game;const corner=groupAt(after.board,5,s.scenario.cornerTarget);return <li key={i} data-ko-action={i}>{i+1}. {a.actor==="black"?"黑棋":"白棋"} {coord(a.point)}{i===0?"（教学准备手）":""}；本手提子 {after.captures[a.actor]-before.captures[a.actor]} 颗；角上目标黑棋 {corner?.stones.length??0} 颗、气 {corner?.liberties.length??0} 口：{points(corner?.liberties??[])}。</li>;})}</ol></div></div>
  {s.phase==="complete"?<div data-ko-summary><h4>{branch?.label}：本次变化记录</h4><p>白棋最后一手提掉 {s.facts.captureDelta.white} 颗黑子；白棋累计提子 {s.facts.captures.white} 颗。</p>{(["threat","followUp"] as const).map(k=><p key={k} data-ko-stats={k} data-hint-used={s.stats[k].usedHint} data-extra-attempts={s.stats[k].extraAttempts}>{k==="threat"?"寻找劫材":"后续着手"}：{s.stats[k].usedHint?"使用过提示":"未用提示"}；额外尝试 {s.stats[k].extraAttempts} 次。</p>)}<p>{s.branchId==="answer"?"黑棋在角上应劫，白棋才回提。两处的着手改变了整个棋盘，真实规则因此允许这次回提；不能只理解为等了一回合。":"黑棋也可以不应劫材，选择填住劫点。白棋兑现角上的威胁，提掉两颗黑子。"}</p><p>这只是有限的引导示范，不判断最佳着手或全局胜负。这里只记录本次练习，不计课程成绩或术语掌握。</p></div>:null}
  <div className="ko-terms" aria-label="只读术语解释">{(["ko","ko-threat","capture","atari","liberty"] as const).map(id=>{const term=GLOSSARY_BY_ID.get(id);return term?<details key={id}><summary>{term.name}</summary><p>{term.plain}</p><p>{term.formal}</p></details>:null;})}</div>
  {controls}
 </section>;
}
