import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResultDialog } from "@/components/game/result-dialog";
import { createGame, passTurn } from "@/lib/go/rules";
vi.mock("@/components/ui/dialog",()=>({Dialog:({children}:{children:ReactNode})=>createElement("div",null,children),
  DialogContent:({children,className}:{children:ReactNode;className:string})=>createElement("section",{className},children),
  DialogHeader:"header",DialogTitle:"h2",DialogDescription:"p",DialogFooter:"footer"}));
function markup(phase:"dead-stones"|"score-review"|"final") {
  return renderToStaticMarkup(createElement(ResultDialog,{open:true,state:passTurn(passTurn(createGame({size:9}))),
    deadStones:new Set<string>(),outcome:null,phase,graduated:phase==="final",onToggleDead(){},onNewGame(){},onConfirmDead(){},onConfirmScore(){},onReturnAcademy(){}}));
}
describe("explicit scoring interface",()=>{
  it("shows a dead-stone confirmation even when nothing is marked",()=>{
    const html=markup("dead-stones");
    expect(html).toContain("确认死子"); expect(html).toContain("分数预览"); expect(html).not.toContain("确认最终计分");
    expect(html.match(/role="gridcell"/g)).toHaveLength(81);
    expect(html).toContain("M 0 0 H 8"); expect(html).toContain("M 8 0 V 8");
  });
  it("reviews the score with a separate confirmation and locks dead-stone editing",()=>{
    const html=markup("score-review");
    expect(html).toContain("确认最终计分"); expect(html).toContain("计分预览");
    expect(html).not.toContain('data-action="confirm-dead"');
  });
  it("shows the final loss and graduation status with an academy return",()=>{
    const html=markup("final");
    expect(html).toContain("白方胜 7.5 目"); expect(html).toContain("毕业已完成"); expect(html).toContain("返回新手学堂");
    expect(html).not.toContain("确认最终计分");
  });
});
