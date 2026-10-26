"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GoBoard } from "@/components/game/go-board";
import { AREA_PRACTICE_SCENARIOS } from "@/lib/learning/area-practice";
import { applyAreaPracticeEvent, createAreaPracticeSession, getAreaPracticeMarkers, type AreaPracticeEvent, type AreaPracticeField } from "@/lib/learning/area-practice-session";
import { DEFAULT_ASSISTS } from "@/lib/learning/progress";

let attemptNumber = 0;
const titles = {black:"第一步 · 数黑方",white:"第二步 · 数白方",result:"第三步 · 算最终结果",complete:"本次数子练习完成"};
const categoryLabels = {stones:"活子",territory:"围住空点",neutral:"公空"};
const symbols = {stones:"○",territory:"□",neutral:"◇"};
const noWrite = () => {};
function sourceFor(id:string) { return AREA_PRACTICE_SCENARIOS.find(scenario=>scenario.id === id); }
function factsFor(id:string) { try { return JSON.stringify(sourceFor(id)); } catch { return undefined; } }
function newAttempt(scenarioId:string,enabled:boolean) {
  const id=`area-${++attemptNumber}`;
  return {id,scenarioId,source:sourceFor(scenarioId),facts:factsFor(scenarioId),enabled,session:createAreaPracticeSession(scenarioId,id)};
}
type Attempt = ReturnType<typeof newAttempt>;
type Action = AreaPracticeEvent extends infer E ? E extends AreaPracticeEvent ? Omit<E,"sessionId"|"scenarioId"|"revision"|"phase"> : never : never;

export function AreaCountingPractice({scenarioId,isActive,onBack}: {
  scenarioId:string; isActive?():boolean; onBack():void;
}) {
  const enabled=isActive?.() ?? true;
  const [stored,setStored]=useState(()=>newAttempt(scenarioId,enabled));
  const latest=useRef<Attempt|null>(stored);
  const parent=useRef(isActive);
  // eslint-disable-next-line react-hooks/refs -- event guards must see the current parent before effects run.
  parent.current=isActive;
  const alive=useRef(true);
  const heading=useRef<HTMLHeadingElement|null>(null);
  const checkButton=useRef<HTMLButtonElement|null>(null);
  let attempt=stored;
  // Invalidate the old render before effects, including source replacement and fact edits.
  // eslint-disable-next-line react-hooks/refs -- retained callbacks must lose their identity synchronously on context changes.
  if (stored.scenarioId !== scenarioId || stored.source !== sourceFor(scenarioId) || stored.facts !== factsFor(scenarioId) || stored.enabled !== enabled || latest.current === null) {
    attempt=newAttempt(scenarioId,enabled);
    latest.current=attempt;
    setStored(attempt);
  }
  useLayoutEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  useEffect(()=>{heading.current?.focus();},[attempt.id]);
  const active=()=>{
    if (!alive.current || latest.current !== attempt) return false;
    if (!(parent.current?.() ?? true)) { latest.current=null; return false; }
    if (attempt.source !== sourceFor(scenarioId) || attempt.facts !== factsFor(scenarioId)) { latest.current=null; return false; }
    return true;
  };
  const update=(next:Attempt)=>{latest.current=next;setStored(next);};
  const act=(action:Action)=>{
    if (!active() || !attempt.session) return;
    const session=attempt.session;
    const next=applyAreaPracticeEvent(session,{...action,sessionId:session.sessionId,scenarioId:session.scenarioId,revision:session.revision,phase:session.phase});
    if (next !== session) update({...attempt,session:next});
  };
  const restart=()=>{if(active())update(newAttempt(scenarioId,true));};
  const next=()=>{
    if (!active() || !attempt.session?.checked || !["black","white"].includes(attempt.session.phase)) return;
    act({kind:"next"});
    checkButton.current?.focus();
  };
  const back=()=>{if(!active())return;alive.current=false;onBack();};
  const controls=<div className="area-actions">
    <button type="button" data-action="area-restart" onClick={restart}>重练本题</button>
    <button type="button" data-action="area-back" onClick={back}>返回选题</button>
  </div>;
  const session=attempt.session;
  if (!session) return <section className="area-practice" data-area-practice data-phase="unavailable">
    <h2 ref={heading} tabIndex={-1}>本题暂不可用</h2><p>题盘或计分事实无法验证，请重练或返回选题。</p>{controls}
  </section>;
  const {phase,help,summary}=session;
  const categories=phase === "result" ? ["neutral"] as const : ["stones","territory"] as const;
  const labels:Partial<Record<AreaPracticeField,string>>=phase === "black" ? {stones:"黑方活子数",territory:"黑方围住空点数"} : phase === "white" ? {stones:"白方活子数",territory:"白方围住空点数"} : {neutral:"公空点数",whiteTotal:"白棋贴目后总分",winner:"胜方"};
  const marks=getAreaPracticeMarkers(session);
  return <section className="area-practice" data-area-practice data-phase={phase} aria-label="三步数子练习">
    <p className="area-scenario-title">{session.scenario.title}</p>
    <p>{session.scenario.description}</p>
    <h2 ref={heading} tabIndex={-1}>{titles[phase]}</h2>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{titles[phase]}</p>
    <div className="area-layout">
      <div className="area-board">
        <GoBoard state={session.game} mode="lesson" title="数子题盘" eyebrow="给定活死条件的教学摆子" prompt="只读观察，不落子、不标死子" hints={[]} deadStones={new Set()} assists={DEFAULT_ASSISTS}
          aiThinking={false} readOnly readOnlyLabel="只读练习" practiceMarks={marks.length ? {points:marks,kind:help.category} : undefined} onPlay={noWrite} onToggleDead={noWrite}/>
        {help.enabled && !session.checked ? <p className="area-mark-legend" aria-label="练习标记图例"><span aria-hidden="true">{symbols[help.category]}</span> {categoryLabels[help.category]}标记：请逐点计数。</p> : null}
      </div>
      <div className="area-work">
        <p>面积＝活子数＋围住空点数。公空不属于任何一方；白棋另加 7.5 目，黑棋不加贴目。</p>
        {session.revealedAreas.black !== null ? <p>已核对黑方面积：{session.revealedAreas.black}。</p> : null}
        {session.revealedAreas.white !== null ? <p>已核对白方面积：{session.revealedAreas.white}。</p> : null}
        {phase !== "complete" ? <>
          <form noValidate onSubmit={event=>{event.preventDefault();act({kind:"check"});}}>
            <fieldset disabled={session.checked}>
              <legend>{phase === "result" ? "计算并选择胜方" : `分别数${phase === "black" ? "黑" : "白"}方活子和围住空点`}</legend>
              {(Object.entries(labels) as [AreaPracticeField,string][]).map(([field,label])=>{
                const id=`${session.sessionId}-${field}`,error=session.feedback?.wrongFields.includes(field);
                return <div className="area-field" key={field}>
                  <label htmlFor={id}>{label}</label>
                  {field === "winner" ? <select id={id} aria-label={label} value={session.inputs[field]} aria-invalid={error || undefined} aria-describedby={error ? "area-feedback" : undefined} onChange={event=>act({kind:"input",field,value:event.target.value})}>
                    <option value="">请选择胜方</option><option value="black">黑胜</option><option value="white">白胜</option>
                  </select> : <input id={id} aria-label={label} type="text" inputMode={field === "whiteTotal" ? "decimal" : "numeric"} autoComplete="off" value={session.inputs[field]} aria-invalid={error || undefined} aria-describedby={`${id}-range${error ? " area-feedback" : ""}`} onChange={event=>act({kind:"input",field,value:event.target.value})}/>}
                  {field !== "winner" ? <small id={`${id}-range`}>{field === "whiteTotal" ? "7.5–88.5，可填整数或半整数" : "0–81 的整数"}</small> : null}
                </div>;
              })}
            </fieldset>
            <button ref={checkButton} type="submit" data-action="area-check" aria-disabled={session.checked}>核对本步</button>
            {session.checked ? <button type="button" data-action="area-next" onClick={next}>下一步</button> : null}
          </form>
          <div className="area-help">
            <button type="button" data-action="area-toggle-help" aria-expanded={help.enabled && !session.checked} aria-disabled={session.checked} onClick={()=>act({kind:"toggle-help"})}>标记帮助</button>
            {help.enabled && !session.checked ? <div className="area-categories" aria-label="标记类别">{categories.map(category=><button key={category} type="button" data-area-category={category} aria-pressed={category === help.category} onClick={()=>act({kind:"help-category",category})}>{symbols[category]} {categoryLabels[category]}</button>)}</div> : null}
          </div>
        </> : null}
        <div id="area-feedback" data-area-feedback role="status" aria-live="polite" aria-atomic="true">{session.feedback?.message ?? "请先自行计数，再核对本步。"}</div>
        {summary ? <div data-area-summary className="area-summary">
          <h3>本次练习总结</h3>
          <p>黑方：{summary.black.stones} 活子＋{summary.black.territory} 空点＝{summary.black.area}，总分 {summary.black.total}。</p>
          <p>白方：{summary.white.stones} 活子＋{summary.white.territory} 空点＝{summary.white.area}，贴目 {summary.komi}，总分 {summary.white.total}。</p>
          <p>公空 {summary.neutral} 点，不计入任何一方。{summary.winner === "black" ? "黑" : "白"}胜 {summary.margin}。</p>
          <p>提子不再单独加分。以下只记录本次尝试，不计入课程、测验或术语成绩。</p>
          {(["black","white","result"] as const).map(stage=><p key={stage} data-area-stats={stage} data-help-used={session.stats[stage].usedHelp} data-retries={session.stats[stage].retries}>
            {titles[stage]}：{session.stats[stage].usedHelp ? "用过标记帮助" : "未用标记帮助"}；错误重试 {session.stats[stage].retries} 次。
          </p>)}
        </div> : null}
        {controls}
      </div>
    </div>
  </section>;
}
