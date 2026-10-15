import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonTask, LessonDetails, focusLessonBoard } from "@/components/learning/lesson-panel";
import { LessonFeedback } from "@/components/learning/lesson-feedback";
import { CoachPanel } from "@/components/game/coach-panel";
import { GoBoard } from "@/components/game/go-board";
import { createLearningSession, type LearningSessionController } from "@/hooks/use-learning-session";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { applyLessonAction } from "@/lib/learning/evaluate";
import { createGame, playMove } from "@/lib/go/rules";
import { getCoachRound } from "@/lib/go/coach";

afterEach(()=>vi.unstubAllGlobals());
const markup = renderToStaticMarkup;
function controller(): LearningSessionController {
  const session=createLearningSession("s1-intersections-turns");
  return {session,getSession:()=>session,restored:false,restoreSession:vi.fn(),unit:CURRICULUM_BY_ID.get(session.unitId)!,state:session.state,feedback:null,visibleHints:session.exercise!.hints.slice(0,session.hintLevel),selectedDeadStone:null,startUnit:vi.fn(),isQuizActive:vi.fn(),reportRejectedMove:vi.fn(),submitMove:vi.fn(),submitPass:vi.fn(),submitGroup:vi.fn(),submitDeadStone:vi.fn(),selectDeadStone:vi.fn(),submitChoice:vi.fn(),requestHint:vi.fn(),retryExercise:vi.fn(),undoExercise:vi.fn(),resetUnit:vi.fn()};
}
describe("compact beginner presentation",()=>{
  it("keeps resume and storage status in lesson details and explains quiz restarts",()=>{
    const learning=controller();learning.restored=true;
    const task=markup(createElement(LessonTask,{learning}));const details=markup(createElement(LessonDetails,{learning,storageUnavailable:true}));
    expect(details).toContain("已恢复本课进度");expect(details).toContain("无法保存进度");expect(task).not.toContain("已恢复本课进度");
    const session=createLearningSession("s1-checkpoint");learning.session=session;learning.unit=CURRICULUM_BY_ID.get(session.unitId)!;learning.restored=false;
    expect(markup(createElement(LessonDetails,{learning}))).toContain("阶段测验重新进入时从第一题开始");
  });
  it("focuses the existing roving point and scrolls without making a move, respecting reduced motion",()=>{
    const focus=vi.fn(), scrollIntoView=vi.fn(), pointQuery=vi.fn(()=>({focus}));
    const board={querySelector:pointQuery,scrollIntoView};const query=vi.fn(()=>board);
    vi.stubGlobal("document",{querySelector:query});vi.stubGlobal("matchMedia",vi.fn(()=>({matches:true})));
    focusLessonBoard();expect(query).toHaveBeenCalledWith("#game .go-board");expect(pointQuery).toHaveBeenCalledWith('.go-point[tabindex="0"]');
    expect(focus).toHaveBeenCalledWith({preventScroll:true});expect(scrollIntoView).toHaveBeenCalledWith({behavior:"auto",block:"center"});
    vi.stubGlobal("matchMedia",vi.fn(()=>({matches:false})));focusLessonBoard();expect(scrollIntoView).toHaveBeenLastCalledWith({behavior:"smooth",block:"center"});
  });
  it("keeps current actions separate from story, terms, demo and hints",()=>{
    const learning=controller();
    const task=markup(createElement(LessonTask,{learning}));const details=markup(createElement(LessonDetails,{learning}));
    expect(task).toContain('data-action="go-board"');expect(task).toContain("任务：");expect(task).not.toContain("本课术语");expect(task).not.toContain("棋形演示");
    expect(details).toContain("本课术语");expect(details).toContain("思考方向");expect(details).toContain("重来本题");expect(details).toContain("讲解与提示");expect(details).toContain("已展开 2 / 3 级提示");
  });
  it("explains a legal wrong target as an uncommitted attempt and redacts active quiz feedback",()=>{
    const learning=controller();const feedback=applyLessonAction(learning.session.exercise!,learning.state,{kind:"move",point:{x:0,y:0}});
    expect(feedback.nextState).toBe(learning.state);
    const ordinary=markup(createElement(LessonFeedback,{feedback,isQuiz:false}));expect(ordinary).toContain("练习棋盘保持原状");expect(ordinary).toContain("下一步");
    const quiz=markup(createElement(LessonFeedback,{feedback,isQuiz:true}));expect(quiz).toContain("本次还不正确，请再检查任务");expect(quiz).not.toContain(feedback.message);expect(quiz).not.toContain("下一步");
  });
  it("marks an attempted point separately from hints and suppresses it in a quiz",()=>{
    const props={state:createGame({size:5}),mode:"lesson" as const,title:"练习",eyebrow:"学堂",prompt:"操作",hints:[],deadStones:new Set<string>(),aiThinking:false,attemptedPoint:{x:0,y:0},onPlay:vi.fn(),onToggleDead:vi.fn()};
    const text=markup(createElement(GoBoard,props));expect(text).toContain('data-attempted="true"');expect(text).toContain("刚尝试的位置");expect(text).not.toContain("提示落点");
    expect(markup(createElement(GoBoard,{...props,isQuiz:true}))).not.toContain("刚尝试的位置");
  });
  it("renders both actual actors with verified text and user initiated term links",()=>{
    const black=playMove(createGame({size:5}),{x:2,y:2});if(!black.ok)throw new Error("black");const white=playMove(black.state,{x:1,y:2});if(!white.ok)throw new Error("white");
    const text=markup(createElement(CoachPanel,{turns:getCoachRound(white.state),onOpenTerm:vi.fn()}));expect(text).toContain('data-coach-actor="black"');expect(text).toContain('data-coach-actor="white"');expect(text).toContain("下一手前");expect(text).toContain("查看围棋术语：气");
  });
});
