import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameApp } from "@/components/game/game-app";
import { ResultDialog } from "@/components/game/result-dialog";
import { createGame } from "@/lib/go/rules";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createLearningSession } from "@/hooks/use-learning-session";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const host=vi.hoisted(()=>({values:[] as unknown[],cursor:0,game:{} as Record<string,unknown>, actions:[] as ReturnType<typeof vi.fn>[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState:(initial:unknown)=>{const values=host.values,i=host.cursor++;if(!(i in values))values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [values[i],(next:unknown)=>{values[i]=typeof next==="function"?(next as (v:unknown)=>unknown)(values[i]):next;}];}}));
vi.mock("@/hooks/use-go-game",()=>({useGoGame:()=>host.game}));
vi.mock("@/hooks/use-soundscape",()=>({useSoundscape:()=>({volume:.5,category:"pop"})}));
vi.mock("@/hooks/use-webmcp",()=>({useWebMcp:()=>{}}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({children}:{children:unknown})=>createElement("div",null,children as never),DialogContent:({children}:{children:unknown})=>createElement("section",null,children as never),DialogHeader:"header",DialogTitle:"h2",DialogDescription:"p",DialogFooter:"footer"}));
function nodes(node: unknown): ReactElement<Record<string,unknown>>[] {
  if(!node || typeof node!=="object")return [];if(Array.isArray(node))return node.flatMap(nodes);
  const e=node as ReactElement<Record<string,unknown>>;return [e,...nodes(e.props?.children)];
}
function render(){host.cursor=0;return GameApp();}
function find(tree:unknown,key:string,value:unknown){return nodes(tree).find(e=>e.props?.[key]===value)!;}
beforeEach(()=>{
  host.cursor=0;host.values=[];host.actions=[];const session=createLearningSession("s1-intersections-turns"),state=createGame({size:5});
  host.game={mode:"lesson",state,matchState:state,learningProgress:createDefaultProgress(),learningSession:{unit:CURRICULUM_BY_ID.get(session.unitId),session,visibleHints:[]},deadStones:new Set(),coachRound:[],scorePhase:"dead-stones",reviewing:false};
  for(const key of ["startUnit","startPlay","newGame","confirmDeadStones","confirmFinalScore","toggleDeadStone","startReview","selectPoint","cancelMove","setConfirmMoves","setLearningAssist"]){const action=vi.fn();host.game[key]=action;host.actions.push(action);}
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("local feedback entry",()=>{
  it.each(["lesson","play","review","quiz"])("opens in %s without invoking any game action",mode=>{
    if(mode==="play")host.game.mode="play";if(mode==="review")host.game.reviewing=true;if(mode==="quiz")host.game.glossaryBlocked=true;
    const before={...host.game};const tree=render();const entry=find(tree,"data-action","open-feedback");expect(entry).toBeDefined();
    const focus=vi.fn();(entry.props.onClick as (event:unknown)=>void)({currentTarget:{focus}});
    const opened=nodes(render()).find(e=>e.props.context)!;expect(opened).toBeDefined();
    expect(opened.props.context).toMatchObject({mode,boardSize:5});
    expect(host.game).toEqual(before);host.actions.forEach(action=>expect(action).not.toHaveBeenCalled());
  });
  it("passes the scoring entry without hiding or resetting the result dialog",()=>{
    host.game.mode="scoring";
    const result=nodes(render()).find(e=>e.type===ResultDialog)!;expect(result.props.open).toBe(true);expect(result.props.onFeedback).toBeTypeOf("function");
    (result.props.onFeedback as (event:unknown)=>void)({currentTarget:{focus:vi.fn()}});
    const opened=render();expect(nodes(opened).find(e=>e.type===ResultDialog)!.props.open).toBe(true);
    expect(nodes(opened).find(e=>e.props.context)!.props.context).toEqual({mode:"scoring",boardSize:5});expect(host.game.scorePhase).toBe("dead-stones");
    host.actions.forEach(action=>expect(action).not.toHaveBeenCalled());
  });
  it("snapshots actual lesson action and keeps it unchanged through an AI/session update",()=>{
    const entry=find(render(),"data-action","open-feedback"),opener={focus:vi.fn()};(entry.props.onClick as (event:unknown)=>void)({currentTarget:opener});
    const before=nodes(render()).find(e=>e.props.context)!;const context=before.props.context;
    expect(context).toEqual({mode:"lesson",boardSize:5,lessonTitle:CURRICULUM_BY_ID.get("s1-intersections-turns")!.title,actionKind:"move"});
    host.game.mode="play";host.game.aiThinking=true;host.game.state=createGame({size:9});
    const after=nodes(render()).find(e=>e.props.context)!;expect(after.props.context).toBe(context);expect(after.props.opener).toBe(opener);
    (after.props.onClose as ()=>void)();expect(nodes(render()).some(e=>e.props.context)).toBe(false);host.actions.forEach(action=>expect(action).not.toHaveBeenCalled());
  });
  it("redacts active quiz metadata and gives review precedence over scoring",()=>{
    host.game.glossaryBlocked=true;(find(render(),"data-action","open-feedback").props.onClick as (e:unknown)=>void)({currentTarget:{focus:vi.fn()}});
    const feedback=nodes(render()).find(e=>e.props.context)!;expect(feedback.props.context).toEqual({mode:"quiz",boardSize:5});(feedback.props.onClose as ()=>void)();
    host.game.reviewing=true;host.game.mode="scoring";(find(render(),"data-action","open-feedback").props.onClick as (e:unknown)=>void)({currentTarget:{focus:vi.fn()}});
    expect(nodes(render()).find(e=>e.props.context)!.props.context).toEqual({mode:"review",boardSize:5});
  });
});

function openDialog(){
  const entry=find(render(),"data-action","open-feedback");expect(entry).toBeDefined();
  const opener={focus:vi.fn()};(entry.props.onClick as (event:unknown)=>void)({currentTarget:opener});
  const element=nodes(render()).find(e=>e.props.context)!;const dialogHost:unknown[]=[];
  const draw=(overrides:Record<string,unknown>={})=>{const appValues=host.values;host.values=dialogHost;host.cursor=0;const tree=(element.type as (props:unknown)=>ReactElement)({...element.props,...overrides});host.values=appValues;return tree;};
  const act=(fn:()=>unknown)=>{const appValues=host.values;host.values=dialogHost;const result=fn();host.values=appValues;return result;};
  return {draw,act,opener,element};
}
describe("feedback report dialog",()=>{
  it("limits the entered description to 600 Unicode codepoints and always offers selectable escaped report text",()=>{
    const dialog=openDialog();let tree=dialog.draw();const description=find(tree,"data-feedback-description",true);
    dialog.act(()=>(description.props.onChange as (event:unknown)=>void)({target:{value:"😀".repeat(601)}}));tree=dialog.draw();
    expect(find(tree,"data-feedback-description",true).props.value).toBe("😀".repeat(600));
    expect(find(tree,"data-feedback-description",true).props.maxLength).toBeUndefined();
    expect(renderToStaticMarkup(tree)).toContain("600 / 600");expect(renderToStaticMarkup(tree)).toContain("不要填写个人信息");
    dialog.act(()=>(find(tree,"data-feedback-description",true).props.onChange as (event:unknown)=>void)({target:{value:"<script>test</script>"}}));
    const html=renderToStaticMarkup(dialog.draw());expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");
    expect(find(dialog.draw(),"data-feedback-report",true).props.readOnly).toBe(true);
  });
  it.each(["absent","denied"])("uses manual copy instructions when clipboard is %s",async availability=>{
    vi.stubGlobal("navigator",availability==="absent"?{}:{clipboard:{writeText:vi.fn().mockRejectedValue(new Error("denied"))}});
    const dialog=openDialog();const tree=dialog.draw();await dialog.act(()=>(find(tree,"data-action","copy-feedback").props.onClick as ()=>Promise<void>)());
    expect(renderToStaticMarkup(dialog.draw())).toContain("请选中下方反馈文本手动复制");
  });
  it("copies the same formatted text that is always visible",async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal("navigator",{clipboard:{writeText}});
    const dialog=openDialog();const tree=dialog.draw();await dialog.act(()=>(find(tree,"data-action","copy-feedback").props.onClick as ()=>Promise<void>)());
    expect(writeText).toHaveBeenCalledWith(find(tree,"data-feedback-report",true).props.value);expect(renderToStaticMarkup(dialog.draw())).toContain("反馈文本已复制");
  });
  it("falls back to manual copy when downloading is unsupported",()=>{
    vi.stubGlobal("URL",{});const dialog=openDialog();dialog.act(()=>(find(dialog.draw(),"data-action","download-feedback").props.onClick as ()=>void)());
    expect(renderToStaticMarkup(dialog.draw())).toContain("请选中下方反馈文本手动复制");
  });
  it.each([false,true])("cleans a temporary download and revokes its URL once after trigger (error %s)",failure=>{
    vi.useFakeTimers();const revokeObjectURL=vi.fn(),createObjectURL=vi.fn<(blob:Blob)=>string>().mockReturnValue("blob:feedback"),remove=vi.fn(),appendChild=vi.fn();
    const click=vi.fn(()=>{expect(revokeObjectURL).not.toHaveBeenCalled();if(failure)throw new Error("download unavailable");});
    const anchor={download:"",href:"",click,remove};vi.stubGlobal("URL",{createObjectURL,revokeObjectURL});vi.stubGlobal("document",{createElement:()=>anchor,body:{appendChild}});
    const dialog=openDialog();dialog.act(()=>(find(dialog.draw(),"data-action","download-feedback").props.onClick as ()=>void)());vi.runAllTimers();
    expect(click).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledOnce();expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:feedback");
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    if(failure)expect(renderToStaticMarkup(dialog.draw())).toContain("手动复制");
  });
  it("restores the actual captured opener through Radix close autofocus for every close path",()=>{
    const dialog=openDialog(),tree=dialog.draw(),preventDefault=vi.fn();const close=vi.fn();
    const content=nodes(tree).find(e=>e.type===DialogContent)!;(content.props.onCloseAutoFocus as (event:unknown)=>void)({preventDefault});
    expect(preventDefault).toHaveBeenCalledOnce();expect(dialog.opener.focus).toHaveBeenCalledWith({preventScroll:true});
    const fresh=dialog.draw({onClose:close});(nodes(fresh).find(e=>e.type===Dialog)!.props.onOpenChange as (open:boolean)=>void)(false);expect(close).toHaveBeenCalledOnce();
    (find(fresh,"data-action","close-feedback").props.onClick as ()=>void)();expect(close).toHaveBeenCalledTimes(2);
    (find(fresh,"className","feedback-close-icon").props.onClick as ()=>void)();expect(close).toHaveBeenCalledTimes(3);
  });
  it("starts fresh on each mount and exposes only a fixed external issue link",async()=>{
    vi.stubGlobal("navigator",{});const dialog=openDialog();let tree=dialog.draw();
    dialog.act(()=>(find(tree,"data-feedback-description",true).props.onChange as (e:unknown)=>void)({target:{value:"old report"}}));
    dialog.act(()=>(find(tree,"name","feedback-category").props.onChange as (e:unknown)=>void)({target:{value:"rule"}}));
    tree=dialog.draw();await dialog.act(()=>(find(tree,"data-action","copy-feedback").props.onClick as ()=>Promise<void>)());
    (dialog.element.props.onClose as ()=>void)();const reopened=openDialog();tree=reopened.draw();
    expect(find(tree,"data-feedback-description",true).props.value).toBe("");expect(find(tree,"name","feedback-category").props.value).toBe("operation");
    expect(renderToStaticMarkup(tree)).not.toContain("请选中下方反馈文本手动复制");
    const link=nodes(tree).find(e=>e.type==="a")!;expect(link.props.href).toBe("https://github.com/zwl522225/yijing-go/issues/new/choose");expect(link.props.target).toBe("_blank");expect(link.props.rel).toBe("noopener noreferrer");
    for(const label of ["找不到操作","不理解规则","落子/界面异常","其他"])expect(renderToStaticMarkup(tree)).toContain(label);
  });
});
