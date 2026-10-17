import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningBackupDialog } from "@/components/learning/learning-backup-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GameApp } from "@/components/game/game-app";
import { createGame } from "@/lib/go/rules";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createLearningSession } from "@/lib/learning/session";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
const host=vi.hoisted(()=>({values:[] as unknown[],refs:[] as {current:unknown}[],cursor:0,refCursor:0,effectCursor:0,effects:[] as {deps?:unknown[];cleanup?:()=>void}[],pending:[] as (()=>void)[],game:{} as Record<string,unknown>}));
vi.mock("@/hooks/use-go-game",()=>({useGoGame:()=>host.game}));
vi.mock("@/hooks/use-soundscape",()=>({useSoundscape:()=>({volume:.5,category:"pop"})}));
vi.mock("@/hooks/use-webmcp",()=>({useWebMcp:()=>{}}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState:(initial:unknown)=>{const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function"?(next as (v:unknown)=>unknown)(host.values[i]):next;}];},
  useRef:(initial:unknown)=>{const i=host.refCursor++;return host.refs[i]??(host.refs[i]={current:initial});},
  useEffect:(effect:()=>void|(()=>void),deps?:unknown[])=>{const i=host.effectCursor++,previous=host.effects[i];if(deps&&previous?.deps&&deps.length===previous.deps.length&&deps.every((v,n)=>Object.is(v,previous.deps![n])))return;host.pending.push(()=>{previous?.cleanup?.();host.effects[i]={deps,cleanup:effect()||undefined};});},
}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({children}:{children:unknown})=>createElement("div",null,children as never),DialogContent:({children}:{children:unknown})=>createElement("section",null,children as never),DialogHeader:"header",DialogTitle:"h2",DialogDescription:"p",DialogFooter:"footer"}));
function nodes(node:unknown):ReactElement<Record<string,unknown>>[]{if(!node||typeof node!=="object")return [];if(Array.isArray(node))return node.flatMap(nodes);const e=node as ReactElement<Record<string,unknown>>;return [e,...nodes(e.props?.children)];}
function find(tree:unknown,key:string,value:unknown){return nodes(tree).find(e=>e.props?.[key]===value)!;}
const ticket=Object.freeze({});
const summary={exportedAt:"2026-10-17T01:00:00Z",completedCount:2,quizScores:{"stage-1":85},termCount:3,resume:{unitId:"s1-intersections-turns" as const,title:"交叉点与轮流",exerciseIndex:1,exerciseCount:4}};
let props:Parameters<typeof LearningBackupDialog>[0];
function draw(){host.cursor=host.refCursor=host.effectCursor=0;const tree=LearningBackupDialog(props);host.pending.splice(0).forEach(fn=>fn());return tree;}
function click(tree:unknown,action:string){return (find(tree,"data-action",action).props.onClick as ()=>unknown)();}
async function select(file:{size:number;text:()=>Promise<string>}|null){return (find(draw(),"data-learning-backup-file",true).props.onChange as (e:unknown)=>Promise<void>)({target:{files:file?[file]:[],value:"chosen"}});}
beforeEach(()=>{host.values=[];host.refs=[];host.effects=[];host.pending=[];props={opener:{isConnected:true,disabled:false,focus:vi.fn()} as unknown as HTMLButtonElement,onClose:vi.fn(),game:{backupBlockedReason:null,exportLearningBackup:vi.fn<Parameters<typeof LearningBackupDialog>[0]["game"]["exportLearningBackup"]>(()=>({ok:true,text:'{"learning":{}}'})),previewLearningBackup:vi.fn<Parameters<typeof LearningBackupDialog>[0]["game"]["previewLearningBackup"]>(()=>({ok:true,ticket,summary,warnings:["忽略一项"]})),confirmLearningRestore:vi.fn<Parameters<typeof LearningBackupDialog>[0]["game"]["confirmLearningRestore"]>(()=>({ok:true})),cancelLearningRestore:vi.fn()}};});
afterEach(()=>{host.effects.forEach(e=>e.cleanup?.());vi.useRealTimers();vi.unstubAllGlobals();});
describe("learning backup dialog",()=>{
  it("previews actual file callbacks and only confirms with the opaque controller ticket",async()=>{
    await select({size:12,text:async()=>"backup"});const tree=draw();expect(props.game.previewLearningBackup).toHaveBeenCalledWith("backup");expect(props.game.confirmLearningRestore).not.toHaveBeenCalled();
    const html=renderToStaticMarkup(tree);for(const text of ["85","3","第 2","交叉点与轮流","忽略一项","不合并","当前棋局和操作设置保留"])expect(html).toContain(text);
    expect(find(tree,"data-learning-backup-preview",true)).toBeDefined();click(tree,"confirm-learning-restore");expect(props.game.confirmLearningRestore).toHaveBeenCalledWith(ticket);expect(props.onClose).toHaveBeenCalledOnce();
  });
  it("cancels the whole modal and invalidates the ticket without writes",async()=>{
    await select({size:1,text:async()=>"backup"});click(draw(),"cancel-learning-restore");expect(props.game.cancelLearningRestore).toHaveBeenCalled();expect(props.onClose).toHaveBeenCalledOnce();expect(props.game.confirmLearningRestore).not.toHaveBeenCalled();
  });
  it("checks file size before reading, clears a previous preview and permits reselect",async()=>{
    await select({size:1,text:async()=>"old"});const text=vi.fn();await select({size:1048577,text});expect(text).not.toHaveBeenCalled();expect(nodes(draw()).some(e=>e.props?.["data-learning-backup-preview"])).toBe(false);expect(renderToStaticMarkup(draw())).toContain("1 MiB");await select(null);expect(props.game.confirmLearningRestore).not.toHaveBeenCalled();
  });
  it("ignores an old read after reselect and after closing before text resolves",async()=>{
    let resolve!:(value:string)=>void;const waiting=select({size:1,text:()=>new Promise(r=>{resolve=r;})});await select({size:1,text:async()=>"new"});resolve("old");await waiting;expect(props.game.previewLearningBackup).toHaveBeenCalledExactlyOnceWith("new");
    const closed=select({size:1,text:()=>new Promise(r=>{resolve=r;})});click(draw(),"cancel-learning-restore");resolve("closed");await closed;expect(props.game.previewLearningBackup).toHaveBeenCalledTimes(1);
  });
  it("ignores a read after unmount",async()=>{
    let resolve!:(value:string)=>void;const waiting=select({size:1,text:()=>new Promise(r=>{resolve=r;})});host.effects.forEach(e=>e.cleanup?.());resolve("late");await waiting;expect(props.game.previewLearningBackup).not.toHaveBeenCalled();
  });
  it("clears a stale preview on parser, read and confirmation errors",async()=>{
    await select({size:1,text:async()=>"first"});vi.mocked(props.game.confirmLearningRestore).mockReturnValueOnce({ok:false,error:"请重新预览"});click(draw(),"confirm-learning-restore");expect(renderToStaticMarkup(draw())).toContain("请重新预览");expect(props.onClose).not.toHaveBeenCalled();expect(nodes(draw()).some(e=>e.props?.["data-learning-backup-preview"])).toBe(false);
    await select({size:1,text:async()=>{throw Error("bad");}});expect(renderToStaticMarkup(draw())).toContain("无法读取");
  });
  it.each([false,true])("uses a local dated filename and revokes the Blob URL (failure %s)",failure=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,17,0,1));const revokeObjectURL=vi.fn(),createObjectURL=vi.fn(()=>"blob:backup"),remove=vi.fn(),clickAnchor=vi.fn(()=>{if(failure)throw Error("denied");});const anchor={download:"",href:"",click:clickAnchor,remove};vi.stubGlobal("URL",{createObjectURL,revokeObjectURL});vi.stubGlobal("document",{createElement:()=>anchor,body:{appendChild:vi.fn()}});
    click(draw(),"download-learning-backup");expect(anchor.download).toBe("yijing-learning-backup-2026-10-17.json");vi.runAllTimers();expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:backup");expect(remove).toHaveBeenCalledOnce();expect(renderToStaticMarkup(draw())).toContain(failure?"无法发起下载":"已发起下载，请检查浏览器下载列表");expect(props.game.confirmLearningRestore).not.toHaveBeenCalled();
  });
  it("displays blocked/export errors without pretending to download or auto-confirm",()=>{
    vi.mocked(props.game.exportLearningBackup).mockReturnValueOnce({ok:false,error:"请等待电脑"});click(draw(),"download-learning-backup");expect(renderToStaticMarkup(draw())).toContain("请等待电脑");expect(props.game.confirmLearningRestore).not.toHaveBeenCalled();props.game.backupBlockedReason="请等待电脑";expect(find(draw(),"data-action","download-learning-backup").props.disabled).toBe(true);
  });
  it("uses close autofocus on the actual opener with mode-tab fallback",()=>{
    let tree=draw();const focus=vi.fn();vi.stubGlobal("document",{querySelector:()=>({focus})});let content=nodes(tree).find(e=>e.type===DialogContent)!;(content.props.onCloseAutoFocus as (event:unknown)=>void)({preventDefault:vi.fn()});expect(props.opener.focus).toHaveBeenCalled();props.opener.disabled=true;tree=draw();content=nodes(tree).find(e=>e.type===DialogContent)!;(content.props.onCloseAutoFocus as (event:unknown)=>void)({preventDefault:vi.fn()});expect(focus).toHaveBeenCalled();
    (nodes(tree).find(e=>e.type===Dialog)!.props.onOpenChange as (open:boolean)=>void)(false);expect(props.onClose).toHaveBeenCalledOnce();
  });
});

describe("footer learning backup entry",()=>{
  function app(){host.cursor=host.refCursor=host.effectCursor=0;return GameApp();}
  function setup(){const session=createLearningSession("s1-intersections-turns"),state=createGame({size:5});host.game={...props.game,mode:"lesson",state,matchState:state,learningProgress:createDefaultProgress(),learningSession:{unit:CURRICULUM_BY_ID.get(session.unitId),session,visibleHints:[]},deadStones:new Set(),coachRound:[],scorePhase:"dead-stones",reviewing:false,closeGlossary:vi.fn(),closePractice:vi.fn()};}
  it("captures opener, closes auxiliaries and opens a fresh local dialog",()=>{
    setup();const entry=find(app(),"data-action","open-learning-backup");expect(entry).toBeDefined();const opener=props.opener;
    (entry.props.onClick as (event:unknown)=>void)({currentTarget:opener});const opened=nodes(app()).find(e=>e.type===LearningBackupDialog)!;expect(opened.props.opener).toBe(opener);expect(opened.props.game).toBe(host.game);expect(host.game.closeGlossary).toHaveBeenCalledOnce();expect(host.game.closePractice).toHaveBeenCalledOnce();
    (opened.props.onClose as ()=>void)();expect(nodes(app()).some(e=>e.type===LearningBackupDialog)).toBe(false);
  });
  it("disables the footer with its reason visible in blocked contexts",()=>{
    setup();host.game.backupBlockedReason="请等待电脑回合结束。";const tree=app(),entry=find(tree,"data-action","open-learning-backup");expect(entry.props.disabled).toBe(true);expect(nodes(tree).some(e=>e.props.children==="请等待电脑回合结束。")).toBe(true);
  });
});
