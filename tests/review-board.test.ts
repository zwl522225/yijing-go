import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoBoard } from "@/components/game/go-board";
import { ReviewPanel } from "@/components/game/review-panel";
import { createGame, passTurn } from "@/lib/go/rules";
import { analyzeReview, getReviewMoments, type ReviewStep } from "@/lib/go/review";
import { createDefaultProgress } from "@/lib/learning/progress";
function elements(node:ReactNode):ReactElement<Record<string,unknown>>[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=="object")return [];const e=node as ReactElement<Record<string,unknown>>;return [e,...elements(e.props?.children as ReactNode)];}
function currentPanel(step:ReviewStep,onOpenTerm=vi.fn()) {
  return ReviewPanel({index:1,total:2,step,moments:[],progress:createDefaultProgress(),onSeek(){},onExit(){},onStartLesson(){},onOpenTerm});
}
describe("review board and navigation",()=>{
  it("shows the verified current turn, observation question and linked glossary terms",()=>{
    const step=analyzeReview(passTurn(passTurn(createGame({size:5})))).steps[2];
    if(step.status!=="verified")throw new Error("expected real verified pass");
    const open=vi.fn(),tree=currentPanel(step,open),text=renderToStaticMarkup(tree);
    expect(text).toContain('aria-label="这一手发生了什么"');expect(text).toContain('class="review-current-step"');
    expect(text).toContain("电脑 · 白棋 · 第 2 手");expect(text).toContain(step.turn.summary);expect(text).toContain(`想一想：${step.turn.question}`);
    const terms=elements(tree).filter(e=>e.props["data-review-term"]);
    expect(terms.map(e=>e.props["data-review-term"])).toEqual(step.turn.terms);
    expect(open).not.toHaveBeenCalled();(terms[0].props.onClick as ()=>void)();expect(open).toHaveBeenCalledExactlyOnceWith("pass");
    expect(text.indexOf("退出复盘")).toBeLessThan(text.indexOf("这一手发生了什么"));expect(text.indexOf("这一手发生了什么")).toBeLessThan(text.indexOf("值得回看的时刻"));
  });
  it.each([
    [{status:"opening"},"这是本次复盘的起始局面。可以点击下一手开始回看。"],
    [{status:"unavailable"},"这一步的记录无法验证，暂不提供讲解。仍可只读查看棋盘或退出复盘。"],
  ] as const)("shows %s without fabricated current-turn facts or glossary actions",(step,message)=>{
    const tree=currentPanel(step),text=renderToStaticMarkup(tree);
    expect(text).toContain(message);expect(text).not.toContain("想一想");expect(text).not.toContain("口气");
    expect(elements(tree).filter(e=>e.props["data-review-term"])).toHaveLength(0);
  });
  it("keeps keyboard cells and announces read only frames while displaying an own candidate",()=>{
    const text=renderToStaticMarkup(createElement(GoBoard,{state:createGame({size:5}),mode:"play",title:"复盘",eyebrow:"复盘",prompt:"只读",hints:[],deadStones:new Set<string>(),aiThinking:false,onPlay(){},onToggleDead(){},readOnly:true,previewPoint:{x:1,y:1}}));
    expect(text).toContain('aria-readonly="true"');expect(text).toContain('tabindex="0"');expect(text.match(/role="gridcell"/g)).toHaveLength(25);
    expect(text).toContain("只读复盘");expect(text).toContain("等待确认");expect(text).toContain("stone-preview");
  });
  it("shows truthful moments and only enables unlocked course links",()=>{
    const jump=vi.fn(),lesson=vi.fn(),term=vi.fn();
    const tree=ReviewPanel({index:0,total:2,step:{status:"opening"},moments:getReviewMoments(passTurn(passTurn(createGame({size:5})))),progress:createDefaultProgress(),onSeek:jump,onExit(){},onStartLesson:lesson,onOpenTerm:term});
    const text=renderToStaticMarkup(tree);expect(text).toContain("第 0 / 2 手");expect(text).toContain("黑棋（你）停一手");expect(text).toContain("白棋（电脑）停一手");
    const buttons=elements(tree).filter(e=>e.type==="button");
    const next=buttons.find(e=>e.props["data-review-action"]==="next")!;(next.props.onClick as ()=>void)();expect(jump).toHaveBeenCalledWith(1);
    const linked=buttons.find(e=>e.props["data-review-lesson"]==="s1-pass-ending")!;expect(linked.props.disabled).toBe(true);(linked.props.onClick as ()=>void)();expect(lesson).not.toHaveBeenCalled();
  });
});
