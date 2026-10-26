import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaCountingPractice } from "@/components/learning/area-counting-practice";
import { GoBoard } from "@/components/game/go-board";
import { PracticePicker } from "@/components/learning/practice-picker";
import { AREA_PRACTICE_SCENARIOS } from "@/lib/learning/area-practice";
import * as sessions from "@/lib/learning/area-practice-session";
import { createDefaultProgress, DEFAULT_ASSISTS, type LearningProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";

const host=vi.hoisted(()=>({scope:"area",scopes:{} as Record<string,{values:unknown[];effects:{deps?:unknown[];cleanup?:()=>void}[]}>,cursor:0,effectCursor:0,pending:[] as (()=>void)[]}));
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
const checkFocus=vi.fn();
function draw(fn:()=>ReactNode,scope="area",flush=true){host.scope=scope;host.scopes[scope]??={values:[],effects:[]};host.cursor=0;host.effectCursor=0;const tree=fn();for(const e of nodes(tree)){const ref=e.props.ref,nodeFocus=e.props["data-action"]==="area-check"?checkFocus:focus;if(typeof ref==="function")ref({focus:nodeFocus});else if(ref&&typeof ref==="object")(ref as {current:unknown}).current??={focus:nodeFocus};}if(flush)host.pending.splice(0).forEach(fn=>fn());return tree;}
function action(tree:unknown,id:string){return find(tree,"data-action",`area-${id}`);}
function click(tree:unknown,id:string){(action(tree,id).props.onClick as ()=>void)();}
function submit(tree:unknown){(find(tree,"noValidate",true).props.onSubmit as (e:unknown)=>void)({preventDefault:vi.fn()});}
function change(tree:unknown,label:string,value:string){(find(tree,"aria-label",label).props.onChange as (e:unknown)=>void)({target:{value}});}
function board(tree:unknown){return nodes(tree).find(e=>e.type===GoBoard)!.props as Parameters<typeof GoBoard>[0];}
function phase(tree:unknown){return find(tree,"data-area-practice").props["data-phase"];}
function setup(scenarioId="balanced"){let props={scenarioId,isActive:()=>true,onBack:vi.fn()};return {view:(flush=true)=>draw(()=>AreaCountingPractice(props),"area",flush),change(next:Partial<typeof props>,flush=true){props={...props,...next};return this.view(flush);},back:props.onBack};}
function input(h:ReturnType<typeof setup>,label:string,value:string){change(h.view(),label,value);return h.view();}
function countSide(h:ReturnType<typeof setup>,color:"black"|"white",territory=27){input(h,color==="black"?"黑方活子数":"白方活子数","9");input(h,color==="black"?"黑方围住空点数":"白方围住空点数",String(territory));submit(h.view());return h.view();}
beforeEach(()=>{host.scopes={};host.pending=[];focus.mockClear();checkFocus.mockClear();});
afterEach(()=>{Object.values(host.scopes).forEach(s=>s.effects.forEach(e=>e.cleanup?.()));vi.restoreAllMocks();});

it.each(["balanced","shifted"])("guides %s through explicit checks, next and a scorer-derived summary without leaking answers",id=>{
  const before=structuredClone(AREA_PRACTICE_SCENARIOS),h=setup(id);let tree=h.view();expect(phase(tree)).toBe("black");expect(focus).toHaveBeenCalledOnce();
  expect(nodes(tree).filter(e=>e.type==="input")).toHaveLength(2);expect(find(tree,"aria-label","黑方活子数").props.value).toBe("");
  const text=renderToStaticMarkup(tree);expect(text).not.toContain("面积为");expect(text).not.toContain("白胜");expect(text).not.toContain("黑胜");
  expect(board(tree).assists).toEqual(DEFAULT_ASSISTS);expect(board(tree).readOnly).toBe(true);expect(board(tree).readOnlyLabel).toBe("只读练习");
  tree=countSide(h,"black");expect(phase(tree)).toBe("black");expect(renderToStaticMarkup(tree)).toContain("黑方面积为 36");expect(action(tree,"check").props.disabled).toBeUndefined();expect(action(tree,"check").props["aria-disabled"]).toBe(true);
  click(tree,"next");tree=h.view();expect(phase(tree)).toBe("white");expect(find(tree,"aria-label","白方活子数").props.value).toBe("");expect(focus).toHaveBeenCalledOnce();expect(checkFocus).toHaveBeenCalledOnce();
  tree=countSide(h,"white",id==="balanced"?27:18);click(tree,"next");tree=h.view();expect(phase(tree)).toBe("result");expect(find(tree,"aria-label","胜方").props.value).toBe("");
  input(h,"公空点数",id==="balanced"?"9":"18");input(h,"白棋贴目后总分",id==="balanced"?"43.5":"34.5");input(h,"胜方",id==="balanced"?"white":"black");submit(h.view());tree=h.view();
  expect(phase(tree)).toBe("complete");const summary=renderToStaticMarkup(find(tree,"data-area-summary"));expect(summary).toContain(id==="balanced"?"白胜 7.5":"黑胜 1.5");expect(summary).toContain("贴目 7.5");expect(summary).toContain("提子不再单独加分");
  for(const stage of ["black","white","result"]){const stat=find(tree,"data-area-stats",stage);expect(stat.props["data-help-used"]).toBe(false);expect(stat.props["data-retries"]).toBe(0);}
  expect(AREA_PRACTICE_SCENARIOS).toEqual(before);
});

it("owns invalid-input feedback, complete help categories, stats and reset without moving focus",()=>{
  const h=setup();let tree=h.view();submit(tree);submit(tree);tree=h.view();expect(renderToStaticMarkup(find(tree,"data-area-feedback"))).toContain("重新核对");
  input(h,"黑方活子数","Infinity");input(h,"黑方围住空点数","-1");submit(h.view());tree=h.view();expect(phase(tree)).toBe("black");
  const oldToggle=action(tree,"toggle-help");click(tree,"toggle-help");click(tree,"toggle-help");tree=h.view();expect(board(tree).practiceMarks?.points).toHaveLength(9);
  expect(find(tree,"data-area-category","stones").props["aria-pressed"]).toBe(true);expect(nodes(tree).some(e=>e.props["data-area-category"]==="neutral")).toBe(false);
  (find(tree,"data-area-category","territory").props.onClick as ()=>void)();tree=h.view();expect(board(tree).practiceMarks?.points).toHaveLength(27);expect(focus).toHaveBeenCalledOnce();
  tree=countSide(h,"black");expect(board(tree).practiceMarks).toBeUndefined();click(tree,"next");tree=h.view();expect(board(tree).practiceMarks).toBeUndefined();
  tree=countSide(h,"white");click(tree,"next");tree=h.view();click(tree,"toggle-help");tree=h.view();expect(board(tree).practiceMarks?.points).toHaveLength(9);expect(nodes(tree).filter(e=>e.props["data-area-category"])).toHaveLength(1);
  input(h,"公空点数","9");input(h,"白棋贴目后总分","43.5");input(h,"胜方","white");submit(h.view());tree=h.view();expect(find(tree,"data-area-stats","black").props["data-retries"]).toBe(2);expect(find(tree,"data-area-stats","black").props["data-help-used"]).toBe(true);
  click(tree,"restart");tree=h.view();(oldToggle.props.onClick as ()=>void)();expect(board(h.view()).practiceMarks).toBeUndefined();expect(find(tree,"aria-label","黑方活子数").props.value).toBe("");expect(focus).toHaveBeenCalledTimes(2);
});

it("rejects every retained handler after revision, phase, restart, scenario, parent inactive, source facts, back and unmount",()=>{
  const h=setup();let tree=h.view();const old=tree,oldInput=find(tree,"aria-label","黑方活子数").props.onChange as (e:unknown)=>void;
  click(tree,"toggle-help");tree=h.view();oldInput({target:{value:"9"}});submit(old);click(old,"back");click(old,"restart");expect(h.back).not.toHaveBeenCalled();expect(find(h.view(),"aria-label","黑方活子数").props.value).toBe("");
  tree=countSide(h,"black");const checked=tree;click(tree,"next");click(tree,"next");tree=h.view();expect(phase(tree)).toBe("white");click(checked,"restart");click(checked,"back");expect(h.back).not.toHaveBeenCalled();
  const previous=tree;tree=h.change({scenarioId:"shifted"},false);click(previous,"toggle-help");click(previous,"back");click(previous,"restart");expect(phase(tree)).toBe("black");expect(board(tree).practiceMarks).toBeUndefined();
  const fresh=tree;tree=h.change({isActive:()=>false},false);click(fresh,"restart");submit(fresh);click(fresh,"back");expect(h.back).not.toHaveBeenCalled();tree=h.change({isActive:()=>true},false);click(fresh,"toggle-help");expect(board(h.view()).practiceMarks).toBeUndefined();
  const before=h.view();const scenario=AREA_PRACTICE_SCENARIOS[1],saved=scenario.description;scenario.description+="变化";tree=h.view(false);click(before,"back");click(before,"restart");expect(h.back).not.toHaveBeenCalled();scenario.description=saved;tree=h.view(false);
  click(tree,"back");click(tree,"back");click(tree,"restart");expect(h.back).toHaveBeenCalledOnce();
  host.scopes={};const mounted=h.view();host.pending.splice(0).forEach(fn=>fn());host.scopes.area.effects.forEach(e=>e.cleanup?.());const values=[...host.scopes.area.values];click(mounted,"restart");click(mounted,"back");submit(mounted);expect(host.scopes.area.values).toEqual(values);
});

it("fails closed on unavailable factories while retaining guarded restart and back",()=>{
  vi.spyOn(sessions,"createAreaPracticeSession").mockReturnValue(null);const h=setup(),tree=h.view();expect(renderToStaticMarkup(tree)).toContain("本题暂不可用");expect(nodes(tree).some(e=>e.type===GoBoard)).toBe(false);click(tree,"restart");click(tree,"back");expect(h.back).not.toHaveBeenCalled();click(h.view(),"back");expect(h.back).toHaveBeenCalledOnce();
});

it.each(["play","scoring"] as const)("ignores accidental practice marks for ordinary %s and preserves its writer",mode=>{
  const s=sessions.createAreaPracticeSession("balanced","board")!;const p={state:s.game,mode,title:"棋盘",eyebrow:"棋盘",prompt:"任务",hints:[],deadStones:new Set<string>(),aiThinking:false,onPlay:vi.fn(),onToggleDead:vi.fn(),practiceMarks:{points:[{x:3,y:0}],kind:"stones" as const}};
  const tree=draw(()=>GoBoard(p),"board");expect(nodes(tree).some(e=>e.props["data-area-practice-mark"])).toBe(false);(find(tree,"role","gridcell").props.onClick as ()=>void)();expect(mode==="play"?p.onPlay:p.onToggleDead).toHaveBeenCalledOnce();
});

it.each(["stones","territory","neutral"] as const)("renders independent %s shapes on the read-only board with single-tab arrow browsing and inert native activation",kind=>{
  const s=sessions.createAreaPracticeSession("balanced","board")!,p={state:s.game,mode:"lesson" as const,title:"题盘",eyebrow:"练习",prompt:"数点",hints:[],deadStones:new Set<string>(),assists:DEFAULT_ASSISTS,readOnly:true,readOnlyLabel:"只读练习",aiThinking:false,onPlay:vi.fn(),onToggleDead:vi.fn(),practiceMarks:{points:[{x:3,y:0}],kind}};
  const tree=draw(()=>GoBoard(p),"board"),cell=find(tree,"data-area-practice-mark",kind);expect(renderToStaticMarkup(tree)).toContain("只读练习");expect(renderToStaticMarkup(cell)).toContain(`area-point-mark ${kind}`);expect(renderToStaticMarkup(cell)).toContain("stone-black");expect(cell.props["aria-label"]).toContain("练习标记");
  (cell.props.onClick as ()=>void)();for(const key of ["Enter"," "])(cell.props.onKeyDown as (e:unknown)=>void)({key,preventDefault:vi.fn()});expect(p.onPlay).not.toHaveBeenCalled();expect(p.onToggleDead).not.toHaveBeenCalled();expect(nodes(tree).filter(e=>e.props.tabIndex===0)).toHaveLength(1);
  const cells=nodes(tree).filter(e=>e.props.role==="gridcell"),arrowFocus=vi.fn();(cells[1].props.ref as (v:unknown)=>void)({focus:arrowFocus});(cells[0].props.onKeyDown as (e:unknown)=>void)({key:"ArrowRight",preventDefault:vi.fn()});expect(arrowFocus).toHaveBeenCalledOnce();expect(renderToStaticMarkup(tree)).not.toContain("data-captured-position");
});

it("returns to the corresponding area entry and invalidates picker callbacks across views and parent inactivity",()=>{
  let progress:LearningProgress={...createDefaultProgress(),completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":100,"stage-2":100}};let active=true;const picker=()=>draw(()=>PracticePicker({progress,onClose(){},isActive:()=>active}),"picker");let tree=picker();const oldEntry=find(tree,"data-area-entry","balanced");
  (oldEntry.props.onClick as ()=>void)();tree=picker();const element=nodes(tree).find(e=>e.type===AreaCountingPractice)!;expect(Object.keys(element.props).sort()).toEqual(["isActive","onBack","scenarioId"]);
  (element.props.onBack as ()=>void)();tree=picker();expect(focus).toHaveBeenCalled();(oldEntry.props.onClick as ()=>void)();expect(nodes(picker()).some(e=>e.type===AreaCountingPractice)).toBe(false);
  const current=find(tree,"data-area-entry","shifted");active=false;(current.props.onClick as ()=>void)();expect(nodes(picker()).some(e=>e.type===AreaCountingPractice)).toBe(false);
  active=true;progress=createDefaultProgress();picker();(current.props.onClick as ()=>void)();expect(nodes(picker()).some(e=>e.type===AreaCountingPractice)).toBe(false);
});
