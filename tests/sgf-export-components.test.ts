import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SgfExportButton } from "@/components/game/sgf-export-button";
import { ControlPanel } from "@/components/game/control-panel";
import { ReviewPanel } from "@/components/game/review-panel";
import { ResultDialog } from "@/components/game/result-dialog";
import { GameApp } from "@/components/game/game-app";
import { FeedbackDialog } from "@/components/game/feedback-dialog";
import { LearningBackupDialog } from "@/components/learning/learning-backup-dialog";
import { createGame } from "@/lib/go/rules";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createLearningSession } from "@/lib/learning/session";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import type { GoGameController } from "@/hooks/use-go-game";
const host=vi.hoisted(()=>({values:[] as unknown[],refs:[] as {current:unknown}[],cursor:0,refCursor:0,effectCursor:0,effects:[] as {deps?:unknown[];cleanup?:()=>void}[],pending:[] as (()=>void)[],game:{} as Record<string,unknown>}));
vi.mock("@/hooks/use-go-game",()=>({useGoGame:()=>host.game}));
vi.mock("@/hooks/use-soundscape",()=>({useSoundscape:()=>({volume:.5,category:"pop"})}));
vi.mock("@/hooks/use-webmcp",()=>({useWebMcp:()=>{}}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useId:()=>"sgf-test",useMemo:(fn:()=>unknown)=>fn(),
 useState:(initial:unknown)=>{const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function"?(next as (v:unknown)=>unknown)(host.values[i]):next;}];},
 useRef:(initial:unknown)=>{const i=host.refCursor++;return host.refs[i]??(host.refs[i]={current:initial});},
 useEffect:(effect:()=>void|(()=>void),deps?:unknown[])=>{const i=host.effectCursor++,p=host.effects[i];if(deps&&p?.deps&&deps.length===p.deps.length&&deps.every((v,n)=>Object.is(v,p.deps![n])))return;host.pending.push(()=>{p?.cleanup?.();host.effects[i]={deps,cleanup:effect()||undefined};});},
}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({children}:{children:unknown})=>createElement("div",null,children as never),DialogContent:({children}:{children:unknown})=>createElement("section",null,children as never),DialogHeader:"header",DialogTitle:"h2",DialogDescription:"p",DialogFooter:"footer"}));
function nodes(node:unknown):ReactElement<Record<string,unknown>>[]{if(!node||typeof node!=="object")return [];if(Array.isArray(node))return node.flatMap(nodes);const e=node as ReactElement<Record<string,unknown>>;return [e,...nodes(e.props?.children)];}
function find(tree:unknown,key:string,value:unknown){return nodes(tree).find(e=>e.props?.[key]===value)!;}
function draw<T>(fn:()=>T){host.cursor=host.refCursor=host.effectCursor=0;const result=fn();host.pending.splice(0).forEach(fn=>fn());return result;}
let props:Parameters<typeof SgfExportButton>[0];
const remove=vi.fn(),anchorClick=vi.fn(),append=vi.fn(),revokeObjectURL=vi.fn(),createObjectURL=vi.fn((...args:[Blob])=>{void args;return "blob:sgf";});
let anchor:{download:string;href:string;click:()=>void;remove:()=>void};
const button=()=>draw(()=>SgfExportButton(props));
const click=()=> (find(button(),"data-action","export-sgf").props.onClick as ()=>void)();
const markup=()=>renderToStaticMarkup(button());
beforeEach(()=>{host.values=[];host.refs=[];host.effects=[];host.pending=[];vi.clearAllMocks();vi.useFakeTimers({toFake:["Date","setTimeout","clearTimeout"]});vi.setSystemTime(new Date(2026,9,20,0,1));props={onExport:vi.fn<Parameters<typeof SgfExportButton>[0]["onExport"]>(()=>({ok:true,content:"(;FF[4]C[中文];B[cc])",size:9,moves:1})),blockedReason:null,context:"game-1"};anchor={download:"",href:"",click:anchorClick,remove};vi.stubGlobal("URL",{createObjectURL,revokeObjectURL});vi.stubGlobal("document",{createElement:()=>anchor,body:{appendChild:append}});});
afterEach(()=>{host.effects.forEach(e=>e.cleanup?.());vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("SGF manual download",()=>{
 it("only downloads on click with UTF-8, exact local filename and delayed cleanup",async()=>{button();expect(props.onExport).not.toHaveBeenCalled();click();expect(props.onExport).toHaveBeenCalledOnce();const blob=createObjectURL.mock.calls[0][0] as Blob;expect(blob.type).toBe("application/x-go-sgf;charset=utf-8");expect(await blob.text()).toBe("(;FF[4]C[中文];B[cc])");expect(anchor.download).toBe("yijing-go-9x9-2026-10-20-1moves.sgf");expect(anchor.href).toBe("blob:sgf");expect(append).toHaveBeenCalledWith(anchor);expect(anchorClick).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledOnce();expect(revokeObjectURL).not.toHaveBeenCalled();expect(markup()).toContain("已发起棋谱下载，请检查浏览器下载列表");vi.runAllTimers();expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:sgf");});
 it("locks reentrant and duplicate synchronous invokes while allowing a later click",async()=>{const original=props.onExport;props.onExport=vi.fn(()=>{click();return original();});click();click();expect(props.onExport).toHaveBeenCalledOnce();await Promise.resolve();click();expect(props.onExport).toHaveBeenCalledTimes(2);});
 it("clears old status on a new context and cannot resurrect it after cleanup",()=>{click();props={...props,context:"game-2"};expect(markup()).not.toContain("已发起棋谱下载");vi.runAllTimers();expect(markup()).not.toContain("已发起棋谱下载");});
 it("exposes the reason and accessible description, while controller rechecks a click",()=>{props.blockedReason="请先确认待落子";const tree=button(),b=find(tree,"data-action","export-sgf");expect(b.props.type).toBe("button");expect(b.props.disabled).toBe(true);expect(b.props["aria-describedby"]).toBeTruthy();expect(markup()).toContain("请先确认待落子");click();expect(props.onExport).not.toHaveBeenCalled();props.blockedReason=null;props.onExport=vi.fn<Parameters<typeof SgfExportButton>[0]["onExport"]>(()=>({ok:false,error:"对局状态已变化"}));click();expect(markup()).toContain("对局状态已变化");expect(createObjectURL).not.toHaveBeenCalled();});
 it.each(["Blob","URL","download","create","append","click"])("reports unavailable %s and cleans a created URL even on errors",failure=>{if(failure==="Blob")vi.stubGlobal("Blob",undefined);if(failure==="URL")vi.stubGlobal("URL",{});if(failure==="download")delete (anchor as Partial<typeof anchor>).download;if(failure==="create")createObjectURL.mockImplementationOnce(()=>{throw Error("denied");});if(failure==="append")append.mockImplementationOnce(()=>{throw Error("denied");});if(failure==="click")anchorClick.mockImplementationOnce(()=>{throw Error("denied");});expect(()=>click()).not.toThrow();expect(markup()).toContain("无法发起棋谱下载");expect(markup()).not.toContain("已发起棋谱下载，请检查");vi.runAllTimers();if(["append","click"].includes(failure))expect(revokeObjectURL).toHaveBeenCalledWith("blob:sgf");});
 it("handles revoke failure without falsely saying the download failed or throwing",()=>{revokeObjectURL.mockImplementationOnce(()=>{throw Error("denied");});click();expect(()=>vi.runAllTimers()).not.toThrow();expect(markup()).toContain("下载已发起");expect(markup()).toContain("无法释放");});
});
function setup(){const session=createLearningSession("s1-intersections-turns"),state=createGame({size:9});host.game={...props,difficulty:"beginner",mode:"play",state,matchState:state,learningProgress:createDefaultProgress(),learningSession:{unit:CURRICULUM_BY_ID.get(session.unitId),session,visibleHints:[]},deadStones:new Set(),coachRound:[],scorePhase:"dead-stones",reviewing:false,closeGlossary:vi.fn(),closePractice:vi.fn(),cancelLearningRestore:vi.fn(),setSgfOverlayOpen:vi.fn(),sgfBlockedReason:null,exportSgf:props.onExport,sgfContext:"game-1"};return host.game as unknown as GoGameController;}
describe("SGF entries and root overlay locks",()=>{
 it("wires normal and whole-game review entries, and offers final-only result export",()=>{const game=setup();expect(nodes(ControlPanel({game})).some(e=>e.type===SgfExportButton)).toBe(true);const review=ReviewPanel({index:0,total:2,step:{status:"opening"},moments:[],progress:game.learningProgress,onSeek:vi.fn(),onExit:vi.fn(),onStartLesson:vi.fn(),onOpenTerm:vi.fn(),onExport:game.exportSgf,sgfBlockedReason:null,sgfContext:game.sgfContext});const reviewExport=nodes(review).find(e=>e.type===SgfExportButton)!;expect(reviewExport.props.description).toContain("包含当前查看手之后的已有落子");
 const resultProps={open:true,state:game.matchState,deadStones:new Set<string>(),outcome:null,graduated:false,onToggleDead:vi.fn(),onNewGame:vi.fn(),onConfirmDead:vi.fn(),onConfirmScore:vi.fn(),onReturnAcademy:vi.fn(),onExport:game.exportSgf,sgfBlockedReason:null,sgfContext:game.sgfContext};for(const phase of ["dead-stones","score-review","final"] as const){const tree=ResultDialog({...resultProps,phase});expect(nodes(tree).some(e=>e.type===SgfExportButton)).toBe(phase==="final");}});
 it("locks feedback and backup synchronously, unlocks each close, and cleans both on unmount",()=>{setup();const app=()=>draw(GameApp),opener={} as HTMLButtonElement;let tree=app();(find(tree,"data-action","open-feedback").props.onClick as (e:unknown)=>void)({currentTarget:opener});expect(host.game.setSgfOverlayOpen).toHaveBeenLastCalledWith("feedback",true);tree=app();const feedback=nodes(tree).find(e=>e.type===FeedbackDialog)!;(feedback.props.onClose as ()=>void)();expect(host.game.setSgfOverlayOpen).toHaveBeenLastCalledWith("feedback",false);
 tree=app();(find(tree,"data-action","open-learning-backup").props.onClick as (e:unknown)=>void)({currentTarget:opener});expect(host.game.setSgfOverlayOpen).toHaveBeenLastCalledWith("backup",true);tree=app();(nodes(tree).find(e=>e.type===LearningBackupDialog)!.props.onClose as ()=>void)();expect(host.game.setSgfOverlayOpen).toHaveBeenLastCalledWith("backup",false);host.effects.forEach(e=>e.cleanup?.());expect(host.game.setSgfOverlayOpen).toHaveBeenCalledWith("feedback",false);expect(host.game.setSgfOverlayOpen).toHaveBeenCalledWith("backup",false);});
});
