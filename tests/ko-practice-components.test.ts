import { PracticePicker } from "@/components/learning/practice-picker";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KoPractice } from "@/components/learning/ko-practice";
import * as sessions from "@/lib/learning/ko-practice-session";
import { KO_PRACTICE_SCENARIO } from "@/lib/learning/ko-practice";
const host=vi.hoisted(()=>({scope:"ko",scopes:{} as Record<string,{values:unknown[];effects:{deps?:unknown[];cleanup?:()=>void}[]}>,cursor:0,effectCursor:0,pending:[] as (()=>void)[]}));
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
function draw(fn:()=>ReactNode,scope="ko",flush=true){host.scope=scope;host.scopes[scope]??={values:[],effects:[]};host.cursor=0;host.effectCursor=0;const tree=fn();for(const e of nodes(tree)){const ref=e.props.ref,nodeFocus=focus;if(typeof ref==="function")ref({focus:nodeFocus});else if(ref&&typeof ref==="object")(ref as {current:unknown}).current??={focus:nodeFocus};}if(flush)host.pending.splice(0).forEach(fn=>fn());return tree;}
function click(tree:unknown,id:string){(find(tree,"data-action",`ko-${id}`).props.onClick as ()=>void)();}
function move(tree:unknown,p:string){(find(tree,"data-ko-point",p).props.onClick as ()=>void)();}
function phase(tree:unknown){return find(tree,"data-ko-practice").props["data-phase"];}
function setup(){let active=true;const back=vi.fn();const view=(flush=true)=>draw(()=>KoPractice({isActive:()=>active,onBack:back}),"ko",flush);return {view,back,active(v:boolean){active=v;return view(false);}};}
beforeEach(()=>{host.scopes={};host.pending=[];focus.mockClear();});
afterEach(()=>{Object.values(host.scopes).forEach(s=>s.effects.forEach(e=>e.cleanup?.()));vi.restoreAllMocks();});
it.each(["answer","fill"])("guides the manual %s route with truthful records and no probe move",branch=>{
 const h=setup();let t=h.view();expect(phase(t)).toBe("ready");move(t,"2,2");expect(phase(h.view())).toBe("ready");click(t,"start");t=h.view();expect(phase(t)).toBe("probe");move(t,"2,2");t=h.view();expect(phase(t)).toBe("probe-done");expect(find(t,"data-ko-feedback").props["data-reason"]).toBe("ko");expect(nodes(t).filter(e=>"data-ko-action" in e.props)).toHaveLength(1);
 click(t,"continue");t=h.view();expect(renderToStaticMarkup(t)).not.toContain("白棋下在（2，2）");move(t,"1,1");t=h.view();expect(phase(t)).toBe("reply");(find(t,"data-ko-reply",branch).props.onClick as ()=>void)();t=h.view();expect(phase(t)).toBe("follow-up");move(t,branch==="answer"?"2,2":"0,2");t=h.view();expect(phase(t)).toBe("complete");expect(nodes(t).filter(e=>"data-ko-action" in e.props)).toHaveLength(4);expect(find(t,"data-ko-stats","threat").props["data-extra-attempts"]).toBe(0);expect(renderToStaticMarkup(t)).toContain("你执白");
});
it("guards old phase, restart, parent deactivation, source mutation and unmount synchronously",()=>{
 const h=setup();const old=h.view();click(old,"start");click(old,"back");expect(h.back).not.toHaveBeenCalled();let t=h.view();click(t,"restart");click(t,"back");expect(h.back).not.toHaveBeenCalled();t=h.view();h.active(false);h.active(true);click(t,"back");expect(h.back).not.toHaveBeenCalled();t=h.view();const saved=KO_PRACTICE_SCENARIO.threatHints[0];KO_PRACTICE_SCENARIO.threatHints[0]+=" changed";const unavailable=h.view(false);click(t,"back");expect(h.back).not.toHaveBeenCalled();expect(renderToStaticMarkup(unavailable)).toContain("本题暂不可用");KO_PRACTICE_SCENARIO.threatHints[0]=saved;t=h.view();host.pending.splice(0).forEach(fn=>fn());host.scopes.ko.effects.forEach(e=>e.cleanup?.());click(t,"back");expect(h.back).not.toHaveBeenCalled();
});
it("keeps one tab point, arrow browsing and native activation single",()=>{
 const h=setup();let t=h.view();expect(nodes(t).filter(e=>"data-ko-point" in e.props)).toHaveLength(25);expect(nodes(t).filter(e=>e.props.tabIndex===0&&"data-ko-point" in e.props)).toHaveLength(1);const cell=find(t,"data-ko-point","0,0");const preventDefault=vi.fn();(cell.props.onKeyDown as (e:unknown)=>void)({key:"Enter",preventDefault});expect(preventDefault).not.toHaveBeenCalled();(cell.props.onKeyDown as (e:unknown)=>void)({key:"ArrowLeft",preventDefault});expect(preventDefault).toHaveBeenCalledOnce();t=h.view();expect(phase(t)).toBe("ready");
});
it("distinguishes illegal and legal off-route attempts, progressively reveals hints, and resets stats",()=>{
 const h=setup();let t=h.view();click(t,"start");move(h.view(),"2,2");click(h.view(),"continue");t=h.view();const count=()=>nodes(h.view()).filter(e=>"data-ko-action" in e.props).length;
 move(t,"0,0");t=h.view();expect(find(t,"data-ko-feedback").props["data-kind"]).toBe("illegal");expect(find(t,"data-ko-feedback").props["data-reason"]).toBe("occupied");expect(count()).toBe(1);move(t,"4,4");t=h.view();expect(find(t,"data-ko-feedback").props["data-kind"]).toBe("off-route");expect(count()).toBe(1);
 const before=focus.mock.calls.length;for(let n=1;n<=3;n++){click(t,"hint");t=h.view();expect(renderToStaticMarkup(t)).toContain(KO_PRACTICE_SCENARIO.threatHints[n-1]);expect(find(t,"data-action","ko-hint").props["aria-expanded"]).toBe(true);}expect(focus.mock.calls.length).toBe(before);expect(find(t,"data-action","ko-hint").props.disabled).toBe(true);
 move(t,"1,1");t=h.view();(find(t,"data-ko-reply","answer").props.onClick as ()=>void)();t=h.view();move(t,"2,2");t=h.view();expect(find(t,"data-ko-stats","threat").props["data-hint-used"]).toBe(true);expect(find(t,"data-ko-stats","threat").props["data-extra-attempts"]).toBe(2);const record=nodes(t).filter(e=>"data-ko-action" in e.props).map(e=>renderToStaticMarkup(e));click(t,"probe-black");t=h.view();expect(find(t,"data-ko-feedback").props["data-reason"]).toBe("ko");expect(nodes(t).filter(e=>"data-ko-action" in e.props).map(e=>renderToStaticMarkup(e))).toEqual(record);click(t,"restart");t=h.view();expect(phase(t)).toBe("ready");expect(nodes(t).filter(e=>"data-ko-action" in e.props)).toHaveLength(0);expect(nodes(t).filter(e=>e.type==="details")).toHaveLength(5);
});

it("retains guarded recovery controls when the factory is unavailable",()=>{
 vi.spyOn(sessions,"createKoPracticeSession").mockReturnValue(null);const h=setup();let t=h.view();expect(renderToStaticMarkup(t)).toContain("本题暂不可用");expect(nodes(t).some(e=>"data-ko-point" in e.props)).toBe(false);const old=t;click(t,"restart");click(old,"back");expect(h.back).not.toHaveBeenCalled();t=h.view();click(t,"back");expect(h.back).toHaveBeenCalledOnce();click(t,"back");expect(h.back).toHaveBeenCalledOnce();
});

it("fails closed for cyclic source corruption and recovers after source repair",()=>{
 const h=setup(),old=h.view();const source=KO_PRACTICE_SCENARIO as unknown as Record<string,unknown>;source.cycle=source;try {const t=h.view(false);expect(renderToStaticMarkup(t)).toContain("本题暂不可用");click(old,"back");expect(h.back).not.toHaveBeenCalled();}finally{delete source.cycle;}expect(phase(h.view())).toBe("ready");
});


it("restores the independent picker entry focus and rejects callbacks from its old view",()=>{
 const progress={...createDefaultProgress(),completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":100,"stage-2":100}};const picker=()=>draw(()=>PracticePicker({progress,onClose(){}}),"picker");let t=picker();const entry=find(t,"data-ko-entry","ko");(entry.props.onClick as ()=>void)();t=picker();const component=nodes(t).find(e=>e.type===KoPractice)!;expect(Object.keys(component.props).sort()).toEqual(["isActive","onBack"]);(component.props.onBack as ()=>void)();t=picker();expect(focus).toHaveBeenCalled();(entry.props.onClick as ()=>void)();expect(nodes(picker()).some(e=>e.type===KoPractice)).toBe(false);expect(find(t,"data-ko-entry","ko").props.disabled).toBe(false);
});
it("redirects an occupied fill-branch follow-up toward the corner without giving the move",()=>{
 const h=setup();let t=h.view();click(t,"start");move(h.view(),"2,2");click(h.view(),"continue");move(h.view(),"1,1");t=h.view();(find(t,"data-ko-reply","fill").props.onClick as ()=>void)();t=h.view();const before=nodes(t).filter(e=>"data-ko-point" in e.props).map(e=>renderToStaticMarkup(e));move(t,"2,2");t=h.view();expect(phase(t)).toBe("follow-up");expect(find(t,"data-ko-feedback").props["data-reason"]).toBe("occupied");expect(renderToStaticMarkup(find(t,"data-ko-feedback"))).toContain("请重新观察左上黑棋的最后一口气");expect(nodes(t).filter(e=>"data-ko-point" in e.props).map(e=>renderToStaticMarkup(e))).toEqual(before);move(t,"0,2");t=h.view();expect(find(t,"data-ko-stats","followUp").props["data-extra-attempts"]).toBe(1);
});
it("exposes five semantic grid rows containing five cells each",()=>{
 const t=setup().view();const grid=find(t,"role","grid"),rows=nodes(grid.props.children).filter(e=>e.props.role==="row");expect(rows).toHaveLength(5);for(const row of rows)expect(nodes(row.props.children).filter(e=>e.props.role==="gridcell")).toHaveLength(5);expect(nodes(grid).filter(e=>e.props["data-ko-point"]!==undefined)).toHaveLength(25);expect(nodes(grid).filter(e=>e.props.tabIndex===0)).toHaveLength(1);
});
it("keeps reply feedback and both manual actions before the board and long records",()=>{
 const h=setup();click(h.view(),"start");move(h.view(),"2,2");click(h.view(),"continue");move(h.view(),"1,1");const t=h.view(),all=nodes(t),board=all.findIndex(e=>e.props.role==="grid");expect(all.findIndex(e=>"data-ko-feedback" in e.props)).toBeLessThan(board);for(const branch of ["answer","fill"])expect(all.findIndex(e=>e.props["data-ko-reply"]===branch)).toBeLessThan(board);
});
