import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResultDialog } from "@/components/game/result-dialog";
import { ControlPanel } from "@/components/game/control-panel";
import { createGame, passTurn } from "@/lib/go/rules";
import { scoreArea } from "@/lib/go/scoring";
import type { GoGameController } from "@/hooks/use-go-game";

vi.mock("react",async original=>({...await original<typeof import("react")>(),useMemo:(fn:()=>unknown)=>fn()}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({children}:{children:ReactNode})=>createElement("div",null,children),
  DialogContent:({children,className,...props}:{children:ReactNode;className:string;showCloseButton?:boolean})=>{delete props.showCloseButton;return createElement("section",{className,...props},children);},
  DialogHeader:"header",DialogTitle:"h2",DialogDescription:"p",DialogFooter:"footer"}));
const base={open:true,state:passTurn(passTurn(createGame({size:5,stones:[["black",0,0],["white",4,4]]}))),deadStones:new Set<string>(),outcome:null,
  phase:"dead-stones" as const,graduated:false,onToggleDead:vi.fn(),onNewGame:vi.fn(),onConfirmDead:vi.fn(),onConfirmScore:vi.fn(),onReturnAcademy:vi.fn(),onFeedback:vi.fn()};
function nodes(node: unknown): ReactElement<Record<string,unknown>>[] {
  if(!node || typeof node!=="object")return [];if(Array.isArray(node))return node.flatMap(nodes);
  const e=node as ReactElement<Record<string,unknown>>;return [e,...nodes(e.props?.children)];
}
describe("beginner scoring guide",()=>{
  it.each(["dead-stones","score-review","final"] as const)("announces only the actual %s step in a noninteractive ordered list",phase=>{
    const html=renderToStaticMarkup(createElement(ResultDialog,{...base,phase}));
    expect(html).toContain('<ol');expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain(`data-step="${phase}" aria-current="step"`);
    expect(html).toContain("1. 确认死子");expect(html).toContain("2. 核对计分");expect(html).toContain("3. 完成");
  });
  it.each([new Set<string>(),new Set(["4,4"])])("shows scoreArea arithmetic including neutral points for confirmed dead stones",deadStones=>{
    const score=scoreArea(base.state.board,deadStones,7.5);
    for(const phase of ["score-review","final"] as const){
      const html=renderToStaticMarkup(createElement(ResultDialog,{...base,phase,deadStones}));
      expect(html).toContain(`黑：子 ${score.black.stones} + 地 ${score.black.territory} = ${score.black.total}`);
      expect(html).toContain(`白：子 ${score.white.stones} + 地 ${score.white.territory} + 贴目 ${score.komi} = ${score.white.total}`);
      expect(html).toContain(`中立空点 ${score.neutral}`);expect(html).toContain("不计入双方面积");expect(html).toContain("提掉的棋子不额外加分");
    }
  });
  it("keeps the provisional preview and real guarded actions",()=>{
    const tree=ResultDialog(base), all=nodes(tree);
    const html=renderToStaticMarkup(createElement(ResultDialog,base));expect(html).toContain("当前仅为分数预览");
    const confirm=all.find(e=>e.props["data-action"]==="confirm-dead")!;(confirm.props.onClick as ()=>void)();expect(base.onConfirmDead).toHaveBeenCalledOnce();
    const stone=all.find(e=>e.props["aria-label"]==="1列1行，黑棋")!;(stone.props.onClick as ()=>void)();expect(base.onToggleDead).toHaveBeenCalledWith({x:0,y:0});
    expect(stone.props.disabled).toBe(false);
    const review=nodes(ResultDialog({...base,phase:"score-review"}));const reviewHtml=renderToStaticMarkup(createElement(ResultDialog,{...base,phase:"score-review"}));expect(reviewHtml.match(/<button[^>]*aria-label="1列1行，黑棋"[^>]*>/)?.[0]).toContain('disabled=""');
    (review.find(e=>e.props["data-action"]==="confirm-score")!.props.onClick as ()=>void)();expect(base.onConfirmScore).toHaveBeenCalledOnce();
    (all.find(e=>e.props["data-action"]==="open-feedback")!.props.onClick as ()=>void)();expect(base.onFeedback).toHaveBeenCalledOnce();
  });
  it.each([false,true])("does not misrepresent resignation or historical graduation (%s)",graduated=>{
    const html=renderToStaticMarkup(createElement(ResultDialog,{...base,phase:"final",graduated,outcome:"你认输了，白方获胜"}));
    expect(html).not.toContain("score-summary");expect(html).not.toContain("中立空点");expect(html).not.toContain("对局、死子确认与最终计分均已完成");
    expect(html).toContain("本局认输不授予毕业");if(graduated)expect(html).toContain("历史毕业记录");
  });
  it.each(["dead-stones","score-review"] as const)("separates historical graduation from the unfinished current %s phase",phase=>{
    const html=renderToStaticMarkup(createElement(ResultDialog,{...base,phase,graduated:true}));
    expect(html).toContain("历史毕业记录已保留");
    expect(html).not.toContain("对局、死子确认与最终计分均已完成");
    expect(html).toContain(phase === "dead-stones" ? "本局仍需确认死子" : "本局仍需核对计分并确认最终计分");
    expect(html).toContain(`data-step="${phase}" aria-current="step"`);
    expect(html).toContain(`data-action="${phase === "dead-stones" ? "confirm-dead" : "confirm-score"}"`);
  });
  it("keeps the normal final graduation label while distinguishing the historical record and completed current flow",()=>{
    const html=renderToStaticMarkup(createElement(ResultDialog,{...base,phase:"final",graduated:true}));
    expect(html).toContain("毕业已完成");expect(html).toContain("历史毕业记录已保留");
    expect(html).toContain("本局对局、死子确认与最终计分均已完成");expect(html).not.toContain("本局仍需");
  });
  it("explains the rule and this AI's deliberate pass response visibly",()=>{
    const game={matchState:createGame({size:9}),difficulty:"beginner",aiThinking:false} as unknown as GoGameController;
    const html=renderToStaticMarkup(createElement(ControlPanel,{game}));
    expect(html).toContain("停一手会把回合交给对方");expect(html).toContain("本游戏的入门电脑会跟随停一手");expect(html).toContain("连续两次停一手");expect(html).toContain("棋盘不必填满");
  });
});
