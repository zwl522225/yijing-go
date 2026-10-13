import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoBoard } from "@/components/game/go-board";
import { ReviewPanel } from "@/components/game/review-panel";
import { createGame, passTurn } from "@/lib/go/rules";
import { getReviewMoments } from "@/lib/go/review";
import { createDefaultProgress } from "@/lib/learning/progress";
describe("review board and navigation",()=>{
  it("keeps keyboard cells and announces read only frames while displaying an own candidate",()=>{
    const text=renderToStaticMarkup(createElement(GoBoard,{state:createGame({size:5}),mode:"play",title:"复盘",eyebrow:"复盘",prompt:"只读",hints:[],deadStones:new Set<string>(),aiThinking:false,onPlay(){},onToggleDead(){},readOnly:true,previewPoint:{x:1,y:1}}));
    expect(text).toContain('aria-readonly="true"');expect(text).toContain('tabindex="0"');expect(text.match(/role="gridcell"/g)).toHaveLength(25);
    expect(text).toContain("只读复盘");expect(text).toContain("等待确认");expect(text).toContain("stone-preview");
  });
  it("shows truthful moments and only enables unlocked course links",()=>{
    const jump=vi.fn(),lesson=vi.fn(),term=vi.fn();
    const tree=ReviewPanel({index:0,total:2,moments:getReviewMoments(passTurn(passTurn(createGame({size:5})))),progress:createDefaultProgress(),onSeek:jump,onExit(){},onStartLesson:lesson,onOpenTerm:term});
    const text=renderToStaticMarkup(tree);expect(text).toContain("第 0 / 2 手");expect(text).toContain("黑棋（你）停一手");expect(text).toContain("白棋（电脑）停一手");
    function elements(node:ReactNode):ReactElement<Record<string,unknown>>[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=="object")return [];const e=node as ReactElement<Record<string,unknown>>;return [e,...elements(e.props?.children as ReactNode)];}
    const buttons=elements(tree).filter(e=>e.type==="button");
    const next=buttons.find(e=>e.props["data-review-action"]==="next")!;(next.props.onClick as ()=>void)();expect(jump).toHaveBeenCalledWith(1);
    const linked=buttons.find(e=>e.props["data-review-lesson"]==="s1-pass-ending")!;expect(linked.props.disabled).toBe(true);(linked.props.onClick as ()=>void)();expect(lesson).not.toHaveBeenCalled();
  });
});
