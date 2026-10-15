import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { decodeSave, encodeSave } from "@/lib/go/storage";
import { createGame } from "@/lib/go/rules";
import { createDefaultProgress } from "@/lib/learning/progress";
import * as reviewAnalysis from "@/lib/go/review";
const host = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as {current: unknown}[], cursor: 0, refCursor: 0 }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const i=host.cursor++; if(!(i in host.values)) host.values[i]=typeof initial==="function" ? (initial as ()=>unknown)() : initial;
    return [host.values[i], (next: unknown)=>{host.values[i]=typeof next==="function" ? (next as (v:unknown)=>unknown)(host.values[i]) : next;}]; },
  useRef(value:unknown) { const i=host.refCursor++; return host.refs[i] ?? (host.refs[i]={current:value}); },
  useCallback: (fn:unknown)=>fn, useEffect() {},
}));
function useTestGame(){return useGoGame({volume:.5,category:"pop",restore(){}});}
function renderHook<T>(hook:()=>T){host.cursor=0;host.refCursor=0;return hook();}
const render=()=>renderHook(useTestGame);
beforeEach(()=>{host.values=[];host.refs=[];vi.stubGlobal("Worker",undefined);});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("move confirmation",()=>{
  it("defaults off and roundtrips independently of learning assists with safe legacy defaults",()=>{
    expect(render().confirmMoves).toBe(false);
    const saved={game:createGame(),learning:createDefaultProgress(),difficulty:"beginner" as const,volume:.5,category:"pop" as const,confirmMoves:true};
    expect(decodeSave(encodeSave(saved))?.confirmMoves).toBe(true);
    const old=JSON.parse(encodeSave(saved));delete old.data.confirmMoves;
    expect(decodeSave(JSON.stringify(old))?.confirmMoves).toBe(false);
    old.data.confirmMoves="true";expect(decodeSave(JSON.stringify(old))?.confirmMoves).toBe(false);
    expect(decodeSave(JSON.stringify({version:2,data:{...saved,lessonIds:[]}}))?.confirmMoves).toBe(false);
  });
  it("previews without history or AI and commits exactly once on confirmation",async()=>{
    let game=render();game.startNewGame(5);game.setConfirmMoves(true);game=render();
    const before=structuredClone(game.matchState);await game.selectPoint({x:0,y:0});game=render();
    expect(game.previewPoint).toEqual({x:0,y:0});expect(game.matchState).toEqual(before);expect(game.aiThinking).toBe(false);
    const confirm=game.confirmMove;expect((await confirm()).ok).toBe(true);expect((await confirm()).ok).toBe(false);
    await Promise.resolve();game=render();expect(game.matchState.moves).toHaveLength(2);expect(game.previewPoint).toBeNull();
  });
  it("rejects retained confirmation after a context reset and after another direct commit",async()=>{
    let game=render();game.startNewGame(5);game.setConfirmMoves(true);game=render();await game.selectPoint({x:0,y:0});game=render();const oldConfirm=game.confirmMove;
    game.startNewGame(7);expect((await oldConfirm()).ok).toBe(false);game=render();expect(game.matchState.moves).toHaveLength(0);
    await game.selectPoint({x:0,y:0});game=render();const stale=game.confirmMove;await game.play({x:1,y:1});
    expect((await stale()).ok).toBe(false);game=render();expect(game.matchState.board[0][0]).toBeNull();expect(game.matchState.moves).toHaveLength(2);
  });
  it("clears preview on cancel, preference change, pass and lesson retry before render",async()=>{
    let game=render();game.setConfirmMoves(true);game=render();await game.selectPoint({x:2,y:2});game=render();const before=structuredClone(game.learningSession.session);
    game.cancelMove();expect((await game.confirmMove()).ok).toBe(false);game=render();expect(game.learningSession.session).toEqual(before);
    await game.selectPoint({x:2,y:2});game=render();const confirm=game.confirmMove;game.learningSession.retryExercise();expect((await confirm()).ok).toBe(false);
    game=render();await game.selectPoint({x:2,y:2});game=render();game.setConfirmMoves(false);expect((await game.confirmMove()).ok).toBe(false);
    game.startNewGame(5);game.setConfirmMoves(true);game=render();await game.selectPoint({x:0,y:0});game=render();game.pass();expect((await game.confirmMove()).ok).toBe(false);
  });
  it("rejects occupied selection with actual rule reason and no history mutation",async()=>{
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game.setConfirmMoves(true);game=render();
    const before=structuredClone(game.matchState);expect(await game.selectPoint({x:0,y:0})).toEqual({ok:false,reason:"occupied"});
    game=render();expect(game.previewPoint).toBeNull();expect(game.matchState).toEqual(before);
  });
});
describe("review runtime guards",()=>{
  it("analyzes only on entry and reuses current-step facts and highlights across renders and navigation",async()=>{
    const analyze=vi.spyOn(reviewAnalysis,"analyzeReview");
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();
    expect(game.reviewStep).toBeNull();expect(game.reviewMoments).toEqual([]);expect(analyze).not.toHaveBeenCalled();
    const speak=vi.fn();vi.stubGlobal("window",{speechSynthesis:{speak,cancel:vi.fn()}});
    vi.stubGlobal("SpeechSynthesisUtterance",class {lang="";constructor(public text:string){}});
    game.setLearningAssist("explainMoves",true);game=render();
    const source=game.matchState,progress=structuredClone(game.learningProgress),lesson=structuredClone(game.learningSession.session);
    expect(game.startReview()).toBe(true);game=render();
    expect(analyze).toHaveBeenCalledExactlyOnceWith(source);
    expect(analyze.mock.calls[0][0]).toBe(source);
    const lastStep=game.reviewStep,moments=game.reviewMoments;
    expect(lastStep).toMatchObject({status:"verified",turn:{actor:"white",moveNumber:2}});
    game=render();expect(game.reviewStep).toBe(lastStep);expect(game.reviewMoments).toBe(moments);
    game.seekReview(0);game=render();expect(game.reviewStep).toEqual({status:"opening"});expect(game.state.moves).toHaveLength(0);
    game.seekReview(1);game=render();expect(game.reviewStep).toMatchObject({status:"verified",turn:{actor:"black",moveNumber:1}});
    expect(game.learningProgress).toEqual(progress);
    const blackStep=game.reviewStep;game.openTerm("liberty");game=render();game.closeGlossary();game=render();
    expect(game.reviewStep).toBe(blackStep);expect(game.reviewIndex).toBe(1);expect(game.glossaryOpen).toBe(false);
    game.seekReview(999);game=render();expect(game.reviewStep).toBe(lastStep);expect(game.reviewMoments).toBe(moments);
    expect(analyze).toHaveBeenCalledTimes(1);expect(game.matchState).toBe(source);expect(game.learningSession.session).toEqual(lesson);expect(speak).not.toHaveBeenCalled();
    expect(game.learningProgress).toEqual({...progress,termStates:{...progress.termStates,liberty:"seen"}});
    game.endReview();game=render();expect(game.reviewStep).toBeNull();expect(game.reviewMoments).toEqual([]);expect(game.state).toBe(source);
    game.startReview();game=render();expect(analyze).toHaveBeenCalledTimes(2);expect(game.reviewStep).toEqual(lastStep);expect(game.reviewStep).not.toBe(lastStep);
  });
  it("preserves an accepted ordinary lesson bookmark while reviewing and returning to learning",async()=>{
    let game=render();game.learningSession.submitMove({x:2,y:2});game=render();
    expect(game.learningSession.session.exerciseIndex).toBe(1);const lesson=structuredClone(game.learningSession.session);
    game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();const progress=structuredClone(game.learningProgress);
    game.startReview();game=render();game.seekReview(0);game=render();game.seekReview(1);game=render();game.endReview();game=render();
    expect(game.learningProgress).toEqual(progress);expect(game.learningSession.session).toEqual(lesson);
    game.continueLearning();game=render();expect(game.mode).toBe("lesson");expect(game.learningSession.session.exerciseIndex).toBe(1);
    expect(game.learningSession.session.acceptedActions).toEqual(lesson.acceptedActions);
  });
  it("keeps retained navigation isolated after exit, a new review and a new match",async()=>{
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();game.startReview();game=render();
    const oldSeek=game.seekReview;game.endReview();oldSeek(0);game=render();expect(game.reviewStep).toBeNull();
    game.startReview();game=render();const step=game.reviewStep;oldSeek(0);game=render();expect(game.reviewIndex).toBe(2);expect(game.reviewStep).toBe(step);
    const retainedSeek=game.seekReview;game.startNewGame(7);retainedSeek(0);game=render();expect(game.reviewing).toBe(false);expect(game.reviewStep).toBeNull();expect(game.state.size).toBe(7);
  });
  it("exposes unavailable recorded frames without changing the original source",async()=>{
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();
    game.matchState.captures.white=42;const source=structuredClone(game.matchState);
    game.startReview();game=render();expect(game.reviewStep).toEqual({status:"unavailable"});expect(game.state).toEqual(source);
    game.seekReview(1);game=render();expect(game.reviewStep?.status).toBe("verified");
    game.endReview();game=render();expect(game.matchState).toEqual(source);
  });
  it("ignores a retained exit callback from an earlier review session",async()=>{
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();game.startReview();game=render();const oldExit=game.endReview;
    game.endReview();game=render();game.startReview();game=render();oldExit();game=render();expect(game.reviewing).toBe(true);
  });
  it("keeps an ongoing match unchanged under play, pass, undo and resign during review",async()=>{
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();const source=structuredClone(game.matchState);
    game.startReview();game=render();expect((await game.play({x:1,y:1})).ok).toBe(false);game.pass();game.undo();game.resign();game=render();
    expect(game.matchState).toEqual(source);expect(game.mode).toBe("play");expect(game.outcome).toBeNull();game.endReview();game=render();expect(game.matchState).toEqual(source);
  });
  it("freezes dead marking and phase advancement when reviewing a pending scoring board",async()=>{
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();game.pass();await Promise.resolve();game=render();
    const before=structuredClone(game.learningProgress);game.startReview();game=render();game.toggleDeadStone({x:0,y:0});expect(game.confirmDeadStones()).toBe(false);expect(game.confirmFinalScore()).toBe(false);
    game=render();expect(game.deadStones.size).toBe(0);expect(game.scorePhase).toBe("dead-stones");expect(game.learningProgress).toEqual(before);
  });
  it("navigates passes and restores exact terminal phase and source, rejecting all match mutations",async()=>{
    let game=render();game.startNewGame(5);game=render();await game.play({x:0,y:0});game=render();game.pass();await Promise.resolve();game=render();
    game.toggleDeadStone({x:0,y:0});game.confirmDeadStones();game.confirmFinalScore();game=render();
    const source=structuredClone(game.matchState),progress=structuredClone(game.learningProgress),dead=[...game.deadStones];
    const play=game.play,pass=game.pass,undo=game.undo,mark=game.toggleDeadStone;
    expect(game.startReview()).toBe(true);game=render();game.seekReview(0);game=render();expect(game.state.moves).toHaveLength(0);
    expect((await play({x:1,y:1})).ok).toBe(false);pass();undo();mark({x:0,y:0});game.resign();
    expect(game.confirmDeadStones()).toBe(false);expect(game.confirmFinalScore()).toBe(false);
    game=render();expect(game.matchState).toEqual(source);expect(game.learningProgress).toEqual(progress);expect([...game.deadStones]).toEqual(dead);
    game.seekReview(999);game=render();expect(game.state.moves).toHaveLength(source.moves.length);
    game.endReview();game=render();expect(game.state).toEqual(source);expect(game.scorePhase).toBe("final");expect([...game.deadStones]).toEqual(dead);
  });
  it("refuses review in lessons or while AI is pending and clears it when context changes",async()=>{
    let game=render();expect(game.startReview()).toBe(false);game.startNewGame(5);game=render();const pending=game.play({x:0,y:0});expect(game.startReview()).toBe(false);await pending;await Promise.resolve();game=render();
    expect(game.startReview()).toBe(true);game=render();const oldSeek=game.seekReview;game.startUnit("s1-intersections-turns");oldSeek(0);game=render();expect(game.reviewing).toBe(false);expect(game.mode).toBe("lesson");
  });
});
