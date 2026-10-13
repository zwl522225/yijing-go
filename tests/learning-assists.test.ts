import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoBoard } from "@/components/game/go-board";
import { LearningAssistPanel } from "@/components/learning/learning-assist-panel";
import { createGame, playMove } from "@/lib/go/rules";
import { describeMove } from "@/lib/go/explain";
import { DEFAULT_ASSISTS } from "@/lib/learning/progress";

const assists={...DEFAULT_ASSISTS,showLiberties:true,showAtari:true,showCoordinates:true,explainMoves:true,autoOpenTerms:true};
const state=createGame({size:5,stones:[["black",0,0],["black",0,1],["white",1,0],["white",1,1]]});
const board=(isQuiz=false)=>renderToStaticMarkup(createElement(GoBoard,{state,mode:"lesson",title:"测试",eyebrow:"测试",prompt:"任务",hints:[{x:0,y:2}],deadStones:isQuiz ? new Set(["0,0"]) : new Set<string>(),selectedPoints:[{x:0,y:0}],assists,isQuiz,aiThinking:false,onPlay:vi.fn(),onToggleDead:vi.fn()}));
describe("learning assists",()=>{
  it("renders one count per group and an accessible atari warning with visible symbol",()=>{
    const text=board();
    expect(text.match(/class="group-liberties"/g)).toHaveLength(2);
    expect(text).toContain("黑棋棋块，1口气");
    expect(text).toContain("仅剩一口气");
    expect(text).toContain("⚠");
    expect(text).toContain("第1列");
    expect(text).toContain("第5行");
    expect(text).toContain("左上角为（1，1）");
    expect(text).toContain('aria-label="1列1行，黑棋，已选择，等待确认，棋块1口气，仅剩一口气"');
  });
  it("outlines every stone in a multi-stone atari group with only one warning",()=>{
    const text=board();
    expect(text.match(/stone stone-black stone-atari/g)).toHaveLength(2);
    expect(text.match(/class="group-atari"/g)).toHaveLength(1);
    expect(text).not.toContain("stone-white stone-atari");
    expect(board(true)).not.toContain("stone-atari");
    const withoutAtari=renderToStaticMarkup(createElement(GoBoard,{state,mode:"lesson",title:"测试",eyebrow:"测试",prompt:"任务",hints:[],deadStones:new Set<string>(),assists:{...assists,showAtari:false},aiThinking:false,onPlay:vi.fn(),onToggleDead:vi.fn()}));
    expect(withoutAtari).not.toContain("stone-atari");
  });
  it("masks assist and hint overlays during quiz while retaining the learner selection and baseline cell labels",()=>{
    const text=board(true);
    for(const leak of ["group-liberties","仅剩一口气","board-coordinate","提示落点","data-suggested","stone-dead","已标为死子"]) expect(text).not.toContain(leak);
    expect(text).toContain("1列1行，黑棋，已选择");
    expect(text).toContain('data-selected="true"');
    expect(assists.showLiberties).toBe(true);
  });
  it("provides five independent settings, retaining values while quiz disables controls",()=>{
    const text=renderToStaticMarkup(createElement(LearningAssistPanel,{assists,isQuiz:true,onChange:vi.fn()}));
    for(const label of ["显示气数","标记打吃","显示坐标","播放落子解释","自动打开术语"]) expect(text).toContain(label);
    expect(text.match(/type="checkbox"/g)).toHaveLength(5);
    expect(text.match(/checked=""/g)).toHaveLength(5);
    expect(text.match(/disabled=""/g)).toHaveLength(5);
  });
});
describe("real move explanations",()=>{
  it("describes capture and the resulting actual group liberties",()=>{
    const before=createGame({size:5,stones:[["white",0,0],["black",1,0]]});
    const point={x:0,y:1};const result=playMove(before,point);
    expect(describeMove(before,point,result)).toContain("提掉1颗白棋");
    expect(describeMove(before,point,result)).toContain("3口气");
    expect(describeMove(before,point,result)).toContain("（1，2）");
  });
  it("explains suicide and occupied rejections without claiming a new board outcome",()=>{
    const before=createGame({size:5,stones:[["white",1,0],["white",0,1]]});
    expect(describeMove(before,{x:0,y:0},playMove(before,{x:0,y:0}))).toContain("禁入点");
    expect(describeMove(before,{x:1,y:0},playMove(before,{x:1,y:0}))).toContain("已有棋子");
  });
});
