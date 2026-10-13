import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { isGraduated } from "@/lib/learning/progress";
import { scoreArea } from "@/lib/go/scoring";

const host = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as {current: unknown}[], cursor: 0, refCursor: 0 }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const i=host.cursor++; if(!(i in host.values)) host.values[i]=typeof initial==="function" ? (initial as ()=>unknown)() : initial;
    return [host.values[i], (next: unknown)=>{host.values[i]=typeof next==="function" ? (next as (v:unknown)=>unknown)(host.values[i]) : next;}]; },
  useRef(value:unknown) { const i=host.refCursor++; return host.refs[i] ?? (host.refs[i]={current:value}); },
  useCallback: (fn:unknown)=>fn, useEffect() {},
}));
function useTestGame() { return useGoGame({volume:.5,category:"pop",restore() {}}); }
function renderHook<T>(hook:()=>T) { host.cursor=0; host.refCursor=0; return hook(); }
function render() { return renderHook(useTestGame); }
function finishCurriculum() {
  let game=render();
  for(const id of LESSON_UNIT_IDS.slice(0,-1)) {
    expect(game.startUnit(id)).toBe(true); game=render();
    const unit=game.learningSession.unit;
    if(unit.kind==="graduation") throw new Error("Unexpected graduation unit");
    for(const exercise of unit.kind==="quiz" ? unit.questions : unit.exercises) {
      const action=exercise.expected;
      if(action.kind==="move") game.learningSession.submitMove(action.point);
      else if(action.kind==="choice") game.learningSession.submitChoice(action.choiceId);
      else if(action.kind==="pass") game.learningSession.submitPass();
      else if(action.kind==="select-group") game.learningSession.submitGroup(action.point);
      else game.learningSession.submitDeadStone(action.point);
      game=render();
    }
  }
  expect(game.learningProgress.bestQuizScores).toEqual({"stage-1":100,"stage-2":100});
  expect(game.startUnit("s3-graduation")).toBe(true);
  return render();
}
beforeEach(()=>{host.values=[]; host.refs=[]; vi.stubGlobal("Worker",undefined);});
afterEach(()=>vi.unstubAllGlobals());

describe("graduation match lifecycle",()=>{
  it("restarts the current board size when a new-game callback is retained",()=>{
    let game=render();game.startNewGame(9);game=render();const oldNewGame=game.newGame;
    game.startNewGame(13);game=render();oldNewGame();game=render();
    expect(game.matchState.size).toBe(13);expect(game.matchState.moves).toEqual([]);expect(game.mode).toBe("play");
  });
  it("does not repeat an AI reply through a retained resume in the same match",async()=>{
    let game=render();game.startNewGame(9);game=render();const pending=game.play({x:0,y:0});game=render();
    expect(game.matchState.toPlay).toBe("white");const oldResume=game.startPlay;
    await pending;await Promise.resolve();game=render();const before=structuredClone(game.matchState);
    expect(before.moves).toHaveLength(2);expect(before.toPlay).toBe("black");
    oldResume();await Promise.resolve();game=render();expect(game.matchState).toEqual(before);expect(game.aiThinking).toBe(false);
  });
  it("rejects a retained pending-AI resume callback after a new match",async()=>{
    let game=render();game.startNewGame(9);game=render();const pending=game.play({x:0,y:0});game=render();
    expect(game.matchState.toPlay).toBe("white");const oldResume=game.startPlay;
    game.startNewGame(13);game=render();const before=structuredClone(game.matchState);
    oldResume();await pending;await Promise.resolve();game=render();
    expect(game.matchState).toEqual(before);expect(game.mode).toBe("play");expect(game.aiThinking).toBe(false);
  });
  it("rejects a retained resume callback after resignation",()=>{
    let game=render();game.startNewGame(9);game=render();const oldResume=game.startPlay;
    game.resign();game=render();const before=structuredClone(game.matchState);
    oldResume();game=render();
    expect(game.mode).toBe("scoring");expect(game.outcome).toBe("你已认输，白方获胜");expect(game.scorePhase).toBe("final");
    expect(game.matchState).toEqual(before);expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);
  });
  it("rejects a retained 9-line pass callback after starting a 13-line match",async()=>{
    let game=finishCurriculum();game.startNewGame(9);game=render();const oldPass=game.pass;
    game.startNewGame(13);game=render();const before=structuredClone(game.matchState);
    oldPass();await Promise.resolve();game=render();
    expect(game.matchState).toEqual(before);expect(game.mode).toBe("play");
    expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);
  });
  it("rejects retained match callbacks after switching to a lesson",async()=>{
    let game=finishCurriculum();game.startNewGame(9);game=render();const oldPlay=game.play;const oldPass=game.pass;
    game.startUnit("s1-intersections-turns");game=render();const before=structuredClone(game.matchState);const lesson=structuredClone(game.learningSession.session);
    expect((await oldPlay({x:0,y:0})).ok).toBe(false);oldPass();await Promise.resolve();game=render();
    expect(game.mode).toBe("lesson");expect(game.matchState).toEqual(before);expect(game.learningSession.session).toEqual(lesson);
    expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);
  });
  it("uses the current board for successive normal actions before rerender",async()=>{
    let game=render();game.startNewGame(9);game=render();const play=game.play;
    expect((await play({x:0,y:0})).ok).toBe(true);
    expect((await play({x:1,y:0})).ok).toBe(true);
    game=render();expect(game.matchState.board[0][0]).toBe("black");expect(game.matchState.board[0][1]).toBe("black");
    expect(game.matchState.moves).toHaveLength(4);
    game.pass();await Promise.resolve();game=render();expect(game.mode).toBe("scoring");expect(game.matchState.moves).toHaveLength(6);
  });
  it("requires a completed 9-line match, explicit dead-stone confirmation and a separate final score even after a loss",async()=>{
    let game=finishCurriculum();
    game.startNewGame(9); game=render();
    expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);
    expect(game.confirmFinalScore()).toBe(false);
    expect(game.confirmDeadStones()).toBe(false);
    game.pass(); await Promise.resolve(); game=render();
    expect(game.mode).toBe("scoring");
    expect(game.scorePhase).toBe("dead-stones");
    expect(Object.values(game.learningProgress.graduation)).toEqual([true,true,false,false]);
    expect(game.confirmFinalScore()).toBe(false);
    expect(game.confirmDeadStones()).toBe(true);
    expect(game.confirmFinalScore()).toBe(true); // Ref guards also work before rerender.
    game=render();
    expect(game.scorePhase).toBe("final");
    expect(scoreArea(game.matchState.board,game.deadStones,7.5).winner).toBe("white");
    expect(isGraduated(game.learningProgress)).toBe(true);
    expect(game.learningProgress.completedUnitIds).toContain("s3-graduation");
    expect(game.confirmFinalScore()).toBe(false);
    expect(game.confirmDeadStones()).toBe(false);
    game.newGame(); game=render();
    expect(game.scorePhase).toBe("dead-stones");
    expect(game.deadStones.size).toBe(0);
    expect(isGraduated(game.learningProgress)).toBe(true);
  });
  it.each([13,19] as const)("scores a %i-line game without awarding graduation events",async size=>{
    let game=finishCurriculum(); game.startNewGame(size); game=render();
    game.pass(); await Promise.resolve(); game=render();
    game.confirmDeadStones(); game.confirmFinalScore(); game=render();
    expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);
    expect(isGraduated(game.learningProgress)).toBe(false);
  });
  it("does not award graduation for resignation or a locked curriculum",async()=>{
    let game=finishCurriculum(); game.startNewGame(9); game=render(); game.resign(); game=render();
    expect(game.scorePhase).toBe("final");
    expect(game.confirmDeadStones()).toBe(false); expect(game.confirmFinalScore()).toBe(false);
    expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);
    host.values=[];host.refs=[]; game=render(); game.startNewGame(9); game=render();
    game.pass(); await Promise.resolve(); game=render(); game.confirmDeadStones(); game.confirmFinalScore(); game=render();
    expect(isGraduated(game.learningProgress)).toBe(false);
    expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);
  });
});
