import { PracticePicker } from "@/components/learning/practice-picker";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LadderPractice } from "@/components/learning/ladder-practice";
import * as sessions from "@/lib/learning/ladder-practice-session";
import { LADDER_PRACTICE_SCENARIOS } from "@/lib/learning/ladder-practice";
const host=vi.hoisted(()=>({scope:"ladder",scopes:{} as Record<string,{values:unknown[];effects:{deps?:unknown[];cleanup?:()=>void}[]}>,cursor:0,effectCursor:0,pending:[] as (()=>void)[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState(initial:unknown){const values=host.scopes[host.scope].values,i=host.cursor++;if(!(i in values))values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [values[i],(next:unknown)=>{values[i]=typeof next==="function"?(next as (v:unknown)=>unknown)(values[i]):next;}];},
  useRef(initial:unknown){const values=host.scopes[host.scope].values,i=host.cursor++;return values[i]??(values[i]={current:initial});},
  useMemo(fn:()=>unknown){return fn();},
  useEffect(effect:()=>void|(()=>void),deps?:unknown[]){const effects=host.scopes[host.scope].effects,i=host.effectCursor++,old=effects[i];if(deps&&old?.deps&&deps.length===old.deps.length&&deps.every((v,n)=>Object.is(v,old.deps![n])))return;host.pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:effect()||undefined};});},
  useLayoutEffect(effect:()=>void|(()=>void),deps?:unknown[]){const effects=host.scopes[host.scope].effects,i=host.effectCursor++,old=effects[i];if(deps&&old?.deps&&deps.length===old.deps.length&&deps.every((v,n)=>Object.is(v,old.deps![n])))return;host.pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:effect()||undefined};});},
}));
function nodes(node:unknown):ReactElement<Record<string,unknown>>[]{if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=="object")return [];const e=node as ReactElement<Record<string,unknown>>;return [e,...nodes(e.props?.children)];}
function find(tree:unknown,attr:string,value?:unknown){const node=nodes(tree).find(e=>value===undefined?attr in e.props:e.props[attr]===value);expect(node,`${attr}=${String(value)}`).toBeDefined();return node!;}
const focus=vi.fn();
function draw(fn:()=>ReactNode,scope="ladder",flush=true){host.scope=scope;host.scopes[scope]??={values:[],effects:[]};host.cursor=0;host.effectCursor=0;const tree=fn();for(const e of nodes(tree)){const ref=e.props.ref,nodeFocus=focus;if(typeof ref==="function")ref({focus:nodeFocus});else if(ref&&typeof ref==="object")(ref as {current:unknown}).current??={focus:nodeFocus};}if(flush)host.pending.splice(0).forEach(fn=>fn());return tree;}
function click(tree:unknown,id:string){(find(tree,"data-action",`ladder-${id}`).props.onClick as ()=>void)();}
function move(tree:unknown,p:string){(find(tree,"data-ladder-point",p).props.onClick as ()=>void)();}
function phase(tree:unknown){return find(tree,"data-ladder-practice").props["data-phase"];}
function setup(){let active=true;const back=vi.fn();const view=(flush=true)=>draw(()=>LadderPractice({scenarioId:"capture",isActive:()=>active,onBack:back}),"ladder",flush);return {view,back,active(v:boolean){active=v;return view(false);}};}
beforeEach(()=>{host.scopes={};host.pending=[];focus.mockClear();});
afterEach(()=>{Object.values(host.scopes).forEach(s=>s.effects.forEach(e=>e.cleanup?.()));vi.restoreAllMocks();});
it("offers manual ladder teaching with seven valid rows, one tab stop and controls before board",()=>{
 const h=setup();let t=h.view();expect(phase(t)).toBe("player");const grid=find(t,"role","grid");const rows=nodes(grid).filter(e=>e.props.role==="row");expect(rows).toHaveLength(7);rows.forEach(row=>expect(nodes(row).filter(e=>e.props.role==="gridcell")).toHaveLength(7));expect(nodes(grid).filter(e=>e.props.tabIndex===0)).toHaveLength(1);expect(renderToStaticMarkup(t)).toContain("你执黑；白棋为手动示范");move(t,"3,2");t=h.view();expect(phase(t)).toBe("reply");const all=nodes(t);expect(all.indexOf(find(t,"data-action","ladder-reply"))).toBeLessThan(all.indexOf(find(t,"role","grid")));click(t,"reply");expect(phase(h.view())).toBe("player");
});
it.each(["capture","helper"])("completes %s route with snapshot records and fresh closed records",id=>{
 const back=vi.fn();const view=()=>draw(()=>LadderPractice({scenarioId:id,onBack:back}));let t=view();const scenario=LADDER_PRACTICE_SCENARIOS.find(s=>s.id===id)!;
 for(const [i,m] of scenario.moves.entries()){if(m.actor==="black")move(t,`${m.point.x},${m.point.y}`);else click(t,"reply");t=view();expect(nodes(t).filter(e=>"data-ladder-action" in e.props)).toHaveLength(i+1);const record=find(t,"data-ladder-action",i);expect(record.props["data-stones"]).toBe(id==="helper"?[1,2,2,4,4][i]:i===10?0:Math.floor((i+1)/2)+1);expect(record.props["data-liberties"]).toBe(id==="helper"?[1,2,1,3,2][i]:i===10?0:i===9||i%2===0?1:2);expect(record.props["data-captured"]).toBe(id==="capture"&&i===10?6:0);}
 expect(phase(t)).toBe("complete");const summary=find(t,"data-ladder-summary");expect(nodes(summary).filter(e=>"data-ladder-stats" in e.props)).toHaveLength(id==="capture"?6:3);expect(find(t,"data-ladder-current").props["data-liberties"]).toBe(id==="capture"?0:2);expect(find(t,"data-ladder-record").props.open).not.toBe(true);const key=find(t,"data-ladder-record").key;click(t,"restart");t=view();expect(find(t,"data-ladder-record").key).not.toBe(key);expect(nodes(t).filter(e=>"data-ladder-action" in e.props)).toHaveLength(0);
});
it("guards revisions, null restarts, latest activity and unmount",()=>{
 const h=setup();const old=h.view();click(old,"hint");click(old,"back");expect(h.back).not.toHaveBeenCalled();let t=h.view();h.active(false);h.active(true);click(t,"back");expect(h.back).not.toHaveBeenCalled();t=h.view();host.scopes.ladder.effects.forEach(e=>e.cleanup?.());click(t,"back");expect(h.back).not.toHaveBeenCalled();
});
it("has guarded null recovery",()=>{
 const spy=vi.spyOn(sessions,"createLadderPracticeSession").mockReturnValue(null);const h=setup();const old=h.view();click(old,"restart");click(old,"back");expect(h.back).not.toHaveBeenCalled();click(h.view(),"back");expect(h.back).toHaveBeenCalledOnce();spy.mockRestore();
});
it("locks both picker entries against forged completion and latest progress replacement",()=>{
 let progress=createDefaultProgress();const view=()=>draw(()=>PracticePicker({progress,onClose(){}}),"picker");let t=view();expect(find(t,"data-ladder-entry","capture").props.disabled).toBe(true);progress={...progress,completedUnitIds:["s2-ladder"]};expect(find(view(),"data-ladder-entry","helper").props.disabled).toBe(true);progress={...progress,completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":100,"stage-2":100}};t=view();const entry=find(t,"data-ladder-entry","helper");expect(entry.props.disabled).toBe(false);progress=createDefaultProgress();view();(entry.props.onClick as ()=>void)();expect(nodes(view()).some(e=>e.type===LadderPractice)).toBe(false);
});
it("permanently invalidates callbacks after observed source corruption, including cyclic and missing catalogs",()=>{
 const h=setup();let t=h.view();const source=LADDER_PRACTICE_SCENARIOS[0] as unknown as Record<string,unknown>;source.cycle=source;click(t,"hint");delete source.cycle;click(t,"back");expect(h.back).not.toHaveBeenCalled();t=h.view();const saved=LADDER_PRACTICE_SCENARIOS.shift()!;try{expect(renderToStaticMarkup(h.view())).toContain("本题暂不可用");click(t,"back");expect(h.back).not.toHaveBeenCalled();}finally{LADDER_PRACTICE_SCENARIOS.unshift(saved);}expect(phase(h.view())).toBe("player");
});
it("distinguishes illegal/off-route attempts and per-task capped hints without focus stealing",()=>{
 const h=setup();let t=h.view();move(t,"2,2");t=h.view();expect(find(t,"data-ladder-feedback").props["data-kind"]).toBe("illegal");expect(find(t,"data-ladder-feedback").props["data-reason"]).toBe("occupied");move(t,"6,0");t=h.view();expect(find(t,"data-ladder-feedback").props["data-kind"]).toBe("off-route");const before=focus.mock.calls.length;
 for(let i=1;i<=3;i++){click(t,"hint");t=h.view();expect(renderToStaticMarkup(t)).toContain(LADDER_PRACTICE_SCENARIOS[0].hints[0][i-1]);}expect(focus.mock.calls.length).toBe(before);expect(find(t,"data-action","ladder-hint").props.disabled).toBe(true);for(const m of LADDER_PRACTICE_SCENARIOS[0].moves){if(m.actor==="black")move(t,`${m.point.x},${m.point.y}`);else click(t,"reply");t=h.view();}expect(find(t,"data-ladder-stats",0).props["data-extra-attempts"]).toBe(2);expect(find(t,"data-ladder-stats",0).props["data-hint-used"]).toBe(true);expect(find(t,"data-ladder-action",9).props["data-liberties"]).toBe(1);expect(find(t,"data-ladder-action",10).props["data-captured"]).toBe(6);
});
it("retains native Enter/Space activation and browse-only reply cells",()=>{
 const h=setup();let t=h.view();const preventDefault=vi.fn();const cell=find(t,"data-ladder-point","0,0");for(const key of ["Enter"," "])(cell.props.onKeyDown as (e:unknown)=>void)({key,preventDefault});expect(preventDefault).not.toHaveBeenCalled();(cell.props.onKeyDown as (e:unknown)=>void)({key:"ArrowRight",preventDefault});expect(preventDefault).toHaveBeenCalledOnce();expect(find(h.view(),"data-ladder-point","1,0").props.tabIndex).toBe(0);move(h.view(),"3,2");t=h.view();move(t,"2,3");expect(find(h.view(),"data-ladder-practice").props["data-cursor"]).toBe(1);
});
it("resets on scenario and source reference changes, uses latest parent function and restores exact picker entry",()=>{
 let id="capture",active=()=>true;const back=vi.fn();const view=()=>draw(()=>LadderPractice({scenarioId:id,isActive:active,onBack:back}));let t=view();id="helper";view();click(t,"back");expect(back).not.toHaveBeenCalled();t=view();active=()=>false;view();click(t,"back");expect(back).not.toHaveBeenCalled();active=()=>true;t=view();const original=LADDER_PRACTICE_SCENARIOS[1];LADDER_PRACTICE_SCENARIOS[1]=structuredClone(original);view();click(t,"back");expect(back).not.toHaveBeenCalled();LADDER_PRACTICE_SCENARIOS[1]=original;
 const progress={...createDefaultProgress(),completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":100,"stage-2":100}};const picker=()=>draw(()=>PracticePicker({progress,onClose(){}}),"picker");t=picker();const entry=find(t,"data-ladder-entry","helper");(entry.props.onClick as ()=>void)();t=picker();const child=nodes(t).find(e=>e.type===LadderPractice)!;expect(Object.keys(child.props).sort()).toEqual(["isActive","onBack","scenarioId"]);expect(child.props.scenarioId).toBe("helper");(child.props.onBack as ()=>void)();picker();expect(focus).toHaveBeenCalled();(entry.props.onClick as ()=>void)();expect(nodes(picker()).some(e=>e.type===LadderPractice)).toBe(false);
});
it("never applies stale move/reply/hint/restart/back after revision or attempt replacement",()=>{
 const h=setup();let old=h.view();move(old,"3,2");click(old,"restart");click(old,"hint");click(old,"back");expect(h.back).not.toHaveBeenCalled();expect(find(h.view(),"data-ladder-practice").props["data-cursor"]).toBe(1);old=h.view();click(old,"reply");click(old,"reply");click(old,"restart");click(old,"back");expect(find(h.view(),"data-ladder-practice").props["data-cursor"]).toBe(2);expect(h.back).not.toHaveBeenCalled();old=h.view();click(old,"restart");move(old,"3,3");click(old,"back");expect(find(h.view(),"data-ladder-practice").props["data-cursor"]).toBe(0);expect(h.back).not.toHaveBeenCalled();
});
it("recovers from null factory with a unique attempt even before any valid session",()=>{
 const spy=vi.spyOn(sessions,"createLadderPracticeSession").mockReturnValue(null),h=setup();const t=h.view();spy.mockRestore();click(t,"restart");expect(phase(h.view())).toBe("player");click(t,"back");expect(h.back).not.toHaveBeenCalled();
});
