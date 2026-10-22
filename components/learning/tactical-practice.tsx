"use client";
import { useEffect, useRef, useState } from "react";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { applyTacticalEvent, createTacticalSession, type TacticalEvent, type TacticalSession } from "@/lib/learning/tactical-session";
import type { TacticalSequence } from "@/lib/learning/tactical-sequences";

let attemptNumber = 0;
const newSession = (scenario: TacticalSequence) => createTacticalSession(scenario, `tactical-${++attemptNumber}`);
const PHASE_TITLES = {
  first: "你的第一次落子 · 你执黑",
  reply: "观察白棋应手 · 手动选择示范",
  second: "你的第二次落子 · 你执黑",
  complete: "这条示范变化已完成",
};
const PHASE_TASKS = {
  first: "先观察目标白棋的气，再点击交叉点下第一手黑棋。",
  reply: "现在轮到白棋。点击下面的按钮，查看一手白棋示范应手。",
  second: "白棋已经应手。重新数气，再下第二手黑棋提掉目标棋组。",
  complete: "本次示范到此结束。保留最终棋形供你观察，也可以开始新尝试。",
};
type ActionInput = {kind:"move"; point:{x:number;y:number}} | {kind:"reply";branchId:string} | {kind:"hint"};
const chineseCount = (count: number) => ["零", "一", "二", "三"][count] ?? String(count);

export function TacticalPractice({ scenario, onBack, isActive }: {
  scenario: TacticalSequence; onBack(): void; isActive?(): boolean;
}) {
  const [session, setSession] = useState(() => newSession(scenario));
  const latest = useRef(session);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [session?.sessionId, session?.phase]);
  // Each closure belongs to this exact render, including errors and hint revisions.
  const active = () => alive.current && (isActive?.() ?? true) && latest.current === session;
  const update = (next: TacticalSession | null) => { latest.current = next; setSession(next); };
  const act = (input: ActionInput) => {
    if (!active() || !session) return;
    const event: TacticalEvent = {...input, sessionId:session.sessionId, scenarioId:session.scenarioId, revision:session.revision, phase:session.phase};
    const next = applyTacticalEvent(session, event);
    if (next !== session) update(next);
  };
  const back = () => { if (!active()) return; alive.current = false; onBack(); };
  const restart = () => { if (active()) update(newSession(scenario)); };
  if (!session) return <section className="tactical-practice" data-tactical-practice aria-label="连续吃子练习">
    <h2 ref={heading} tabIndex={-1} data-tactical-heading>本题暂不可用</h2>
    <p>这题局面无法加载，请返回选题。</p>
    <button type="button" data-action="tactical-back" onClick={back}>返回选题</button>
  </section>;

  const {phase, game, facts} = session;
  const learnerStage = phase === "first" || phase === "second";
  const branch = session.scenario.branches.find(item => item.id === session.selectedBranchId);
  const stageHints = phase === "first" ? session.scenario.firstHints : branch?.secondHints ?? [];
  const hintLevel = learnerStage ? session.hints[phase] : 0;
  const lost = session.actions.reduce((sum, action) => sum + action.facts.captureDelta.white, 0);
  const taken = session.actions.reduce((sum, action) => sum + action.facts.captureDelta.black, 0);
  return <section className="tactical-practice" data-tactical-practice data-phase={phase} aria-label="连续吃子练习">
    <p className="tactical-scenario-title">{session.scenario.title}</p>
    <p>你执黑，完成两次落子；中间主动查看一手白棋示范应手。这是给定的局部示范路线。</p>
    <h2 ref={heading} tabIndex={-1} data-tactical-heading>{PHASE_TITLES[phase]}</h2>
    <div className="tactical-status" role="status" aria-live="polite" aria-atomic="true">
      <p>{PHASE_TASKS[phase]}</p>
      <p>当前执子：{game.toPlay === "black" ? "黑棋" : "白棋"}{phase === "complete" ? "；本次示范已停止落子" : ""}。</p>
      {session.feedback ? <p className={`tactical-feedback ${session.feedback.kind}`}>{session.feedback.message}</p> : null}
    </div>
    <div className="demo-board practice-board tactical-board" style={{"--board-size":game.size} as React.CSSProperties} aria-label="连续吃子练习棋盘">
      {game.board.flatMap((row,y) => row.map((stone,x) => <button key={`${x},${y}`} type="button" className="demo-point" data-tactical-point={`${x},${y}`}
        disabled={!learnerStage} aria-label={`第 ${x+1} 列、第 ${y+1} 行，${stone === "black" ? "黑棋" : stone === "white" ? "白棋" : "空位"}`}
        onClick={() => act({kind:"move",point:{x,y}})}>{stone ? <i className={`mini-stone ${stone}`} /> : null}</button>))}
    </div>
    {phase === "reply" ? <div className="tactical-actions" aria-label="选择白棋示范应手">{session.scenario.branches.map(item => <button type="button" key={item.id} data-tactical-reply={item.id} onClick={() => act({kind:"reply",branchId:item.id})}>{item.label}</button>)}</div> : null}
    <div className="tactical-facts" aria-label="当前真实棋局事实">
      <p>{facts.target ? `目标白棋：${facts.target.stones.length}颗子、${facts.target.liberties.length}口气。` : "目标棋组已从棋盘移除。"}
        {facts.target && facts.target.liberties.length > 1 ? "目标白棋尚未被打吃。" : null}</p>
      {phase === "reply" && facts.invested && session.scenarioId === "snapback" ? <p>投入的黑子：{facts.invested.stones.length}颗子、{facts.invested.liberties.length}口气。</p> : null}
      <p>当前累计提子：黑棋 {facts.captures.black} 颗，白棋 {facts.captures.white} 颗。</p>
      {phase === "complete" && session.scenarioId === "snapback" ? <p>在这条示范变化中，先失{chineseCount(lost)}子，再反提{chineseCount(taken)}子。</p> : null}
    </div>
    {learnerStage ? <div className="tactical-hint-section">
      <button type="button" data-action="tactical-hint" disabled={hintLevel >= 3} onClick={() => act({kind:"hint"})}>查看本手提示（{hintLevel}/3）</button>
      <ol data-tactical-hints>{stageHints.slice(0,hintLevel).map((hint,index) => <li key={index}>{hint}</li>)}</ol>
    </div> : null}
    {session.actions.length ? <div className="tactical-record"><h3>本次变化记录</h3><ol>{session.actions.map((action,index) => <li key={index} data-tactical-action={index}>
      {action.actor === "black" ? "黑棋" : "白棋"} · 第 {action.point.x+1} 列、第 {action.point.y+1} 行 · 本手提子 {action.facts.captureDelta[action.actor]} 颗；
      {action.facts.target ? `目标白棋 ${action.facts.target.stones.length} 颗、${action.facts.target.liberties.length} 口气` : "目标棋组已移除"}。
    </li>)}</ol></div> : null}
    <div className="tactical-actions">
      <button type="button" data-action="tactical-restart" onClick={restart}>重走这题（开始新尝试）</button>
      <button type="button" data-action="tactical-back" onClick={back}>返回选题</button>
    </div>
    <div className="tactical-terms" aria-label="就地查看术语说明">{([session.scenarioId,"liberty","atari","capture"] as const).map(id => {
      const entry = GLOSSARY_BY_ID.get(id);
      return entry ? <details key={id} data-tactical-term={id}><summary>{entry.name}</summary><p>{entry.plain}</p><p>{entry.formal}</p></details> : null;
    })}</div>
  </section>;
}
