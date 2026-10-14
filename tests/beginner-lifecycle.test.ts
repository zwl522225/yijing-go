import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createGame, playMove } from "@/lib/go/rules";
import { encodeSave, SAVE_KEY } from "@/lib/go/storage";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { toast } from "sonner";
import { BeginnerGuide } from "@/components/game/beginner-guide";
import { ONBOARDING_KEY } from "@/lib/learning/onboarding";
import type { ReactElement } from "react";

const host=vi.hoisted(()=>({values:[] as unknown[],refs:[] as {current:unknown}[],cursor:0,refCursor:0,effectCursor:0,callbackCursor:0,callbacks:[] as {deps:unknown[];fn:unknown}[],
  effects:[] as {deps?:unknown[];cleanup?:()=>void}[], pending:[] as (()=>void)[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState:(initial:unknown)=>{const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function" ? (initial as ()=>unknown)():initial;return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function" ? (next as (value:unknown)=>unknown)(host.values[i]):next;}];},
  useRef:(initial:unknown)=>{const i=host.refCursor++;return host.refs[i]??(host.refs[i]={current:initial});},
  useCallback:(callback:unknown,deps:unknown[])=>{const i=host.callbackCursor++;const previous=host.callbacks[i];if(previous && deps.length===previous.deps.length && deps.every((v,n)=>Object.is(v,previous.deps[n])))return previous.fn;host.callbacks[i]={deps,fn:callback};return callback;},
  useEffect:(effect:()=>void|(()=>void),deps?:unknown[])=>{const i=host.effectCursor++;const previous=host.effects[i];if(deps&&previous?.deps&&deps.length===previous.deps.length&&deps.every((v,n)=>Object.is(v,previous.deps![n])))return;host.pending.push(()=>{previous?.cleanup?.();host.effects[i]={deps,cleanup:effect()||undefined};});},
}));
const storage=new Map<string,string>();
function renderHook<T>(hook: () => T): T {
  host.cursor = 0;
  host.refCursor = 0;
  host.effectCursor = 0;
  host.callbackCursor = 0;
  const result = hook();
  host.pending.splice(0).forEach(fn => fn());
  return result;
}
const render = () => renderHook(() => useGoGame({ volume: .5, category: "pop", restore: vi.fn() }));
beforeEach(()=>{host.values=[];host.refs=[];host.effects=[];host.pending=[];host.callbacks=[];storage.clear();vi.useFakeTimers();vi.stubGlobal("localStorage",{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});});
afterEach(()=>{host.effects.forEach(e=>e.cleanup?.());vi.useRealTimers();vi.unstubAllGlobals();});

function nodes(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const element=node as ReactElement<Record<string, unknown>>;
  return [element,...nodes(element.props?.children)];
}
describe("beginner lifecycle",()=>{
  it("replaces stale feedback for a rejected ordinary lesson preview without submitting an answer",async()=>{
    const speak=vi.fn(),cancel=vi.fn();
    vi.stubGlobal("window",{speechSynthesis:{speak,cancel}});
    vi.stubGlobal("SpeechSynthesisUtterance",class {lang="";constructor(public text:string){}});
    render();await Promise.resolve();let game=render();
    game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});game=render();game.setConfirmMoves(true);game=render();
    const board=game.learningSession.state;const progress=game.learningProgress;
    await game.selectPoint({x:0,y:0});game=render();await game.confirmMove();game=render();
    expect(game.attemptedPoint).toEqual({x:0,y:0});
    expect(game.moveExplanation).not.toBe("");
    expect(speak).toHaveBeenCalled();cancel.mockClear();
    const rejected=await game.selectPoint({x:2,y:2});game=render();
    expect(rejected).toMatchObject({ok:false,reason:"occupied"});
    expect(game.learningSession.feedback?.failure).toMatchObject({kind:"rule",reason:"occupied",point:{x:2,y:2}});
    expect(game.learningSession.feedback?.failure?.nextStep).toContain("空交叉点");
    expect(game.attemptedPoint).toEqual({x:2,y:2});expect(game.previewPoint).toBeNull();
    expect(game.moveExplanation).toBe("");
    expect(cancel).toHaveBeenCalledOnce();
    expect(game.learningSession.state).toBe(board);expect(game.learningProgress).toBe(progress);
    expect(game.learningSession.session.answers).toEqual([]);expect(game.learningSession.session.exerciseIndex).toBe(1);
    game.learningSession.retryExercise();game=render();expect(game.attemptedPoint).toBeNull();
  });
  it("contains storage property getter failures in both hydration and onboarding",async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
    Object.defineProperty(globalThis,"localStorage",{configurable:true,get(){throw new Error("getter denied");}});
    try {
      expect(()=>render()).not.toThrow();await Promise.resolve();let game=render();expect(game.firstVisit).toBe(true);
      expect(()=>game.setLearningAssist("showAtari",true)).not.toThrow();expect(()=>game.setConfirmMoves(false)).not.toThrow();
      await game.play({x:2,y:2});game=render();expect(game.learningSession.session.exerciseIndex).toBe(1);
      host.effects.forEach(e=>e.cleanup?.());host.values=[];host.refs=[];host.effects=[];host.callbacks=[];host.pending=[];
      const props={firstVisit:true,quizActive:false,onContinueLearning:vi.fn()};expect(()=>renderHook(()=>BeginnerGuide(props))).not.toThrow();
      await Promise.resolve();const guide=renderHook(()=>BeginnerGuide(props));expect(()=> (nodes(guide).find(e=>e.props["data-action"]==="dismiss-guide")!.props.onClick as ()=>void)()).not.toThrow();
    } finally { if(descriptor)Object.defineProperty(globalThis,"localStorage",descriptor); }
  });
  it("redacts illegal confirmation feedback during an active quiz without recording a preview as an answer",async()=>{
    const warning=vi.spyOn(toast,"warning");const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,7)];
    storage.set(SAVE_KEY,encodeSave({game:createGame({size:5}),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    render();await Promise.resolve();let game=render();game.startUnit("s1-checkpoint");game.setConfirmMoves(true);game=render();
    const state=game.learningSession.state;let occupied:null|{x:number;y:number}=null;
    state.board.forEach((row,y)=>row.forEach((stone,x)=>{if(stone)occupied={x,y};}));
    // First quiz question has no occupied point; a board-outside attempt exercises the same rejection path.
    await game.selectPoint(occupied ?? {x:-1,y:0});game=render();expect(warning).toHaveBeenCalledWith("本次还不正确，请再检查任务。");
    expect(game.previewPoint).toBeNull();expect(game.learningSession.session.answers).toEqual([]);expect(game.attemptedPoint).toBeNull();expect(game.coachRound).toEqual([]);warning.mockRestore();
  });
  it("never pairs a pending black move with an older white reply or accepts an old reply after reset",async()=>{
    let reply:()=>void=()=>{};
    class DelayedWorker {
      onmessage:((event:{data:{id:number;move:{x:number;y:number}}})=>void)|null=null;
      onerror:unknown;terminate(){}
      postMessage(request:{id:number}) {reply=()=>this.onmessage?.({data:{id:request.id,move:{x:1,y:2}}});}
    }
    vi.stubGlobal("Worker",DelayedWorker);render();await Promise.resolve();let game=render();game.startNewGame(5);game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});game=render();expect(game.coachRound.map(t=>t.actor)).toEqual(["black"]);reply();await vi.runAllTimersAsync();game=render();expect(game.coachRound.map(t=>t.actor)).toEqual(["black","white"]);
    await game.play({x:0,y:0});game=render();expect(game.coachRound.map(t=>t.actor)).toEqual(["black"]);game.newGame();reply();await vi.runAllTimersAsync();game=render();expect(game.coachRound).toEqual([]);expect(game.matchState.moves).toEqual([]);
  });
  it("only identifies a fresh visit after hydration and preserves a valid restored board",async()=>{
    expect(render().firstVisit).toBe(false);await Promise.resolve();expect(render().firstVisit).toBe(true);
    host.effects.forEach(e=>e.cleanup?.());host.values=[];host.refs=[];host.effects=[];host.callbacks=[];host.pending=[];
    const move=playMove(createGame({size:5}),{x:1,y:1});if(!move.ok)throw new Error("move");
    storage.set(SAVE_KEY,encodeSave({game:move.state,learning:createDefaultProgress(),difficulty:"beginner",volume:.5,category:"pop"}));
    expect(render().firstVisit).toBe(false);await Promise.resolve();const game=render();
    expect(game.firstVisit).toBe(false);expect(game.matchState).toEqual(move.state);
  });
  it("keeps lessons and preferences usable when localStorage itself is denied",async()=>{
    vi.stubGlobal("localStorage",{getItem(){throw new Error("denied");},setItem(){throw new Error("denied");},removeItem(){throw new Error("denied");}});
    expect(()=>render()).not.toThrow();await Promise.resolve();let game=render();expect(game.firstVisit).toBe(true);
    expect(()=>game.setConfirmMoves(true)).not.toThrow();expect(()=>game.setLearningAssist("showCoordinates",true)).not.toThrow();game=render();
    await game.selectPoint({x:2,y:2});game=render();await game.confirmMove();game=render();
    expect(game.learningSession.session.exerciseIndex).toBe(1);expect(game.learningProgress.assists.showCoordinates).toBe(true);
    expect(()=>render()).not.toThrow();
  });
  it("dismisses and reopens the guide without changing board or learning progress",async()=>{
    storage.set(SAVE_KEY,"existing game");const continueLearning=vi.fn();
    let guide=renderHook(()=>BeginnerGuide({firstVisit:true,quizActive:false,onContinueLearning:continueLearning}));
    await Promise.resolve();guide=renderHook(()=>BeginnerGuide({firstVisit:true,quizActive:false,onContinueLearning:continueLearning}));
    const button=nodes(guide).find(e=>e.props["data-action"]==="dismiss-guide")!;
    expect(button).toBeDefined();(button.props.onClick as ()=>void)();
    guide=renderHook(()=>BeginnerGuide({firstVisit:true,quizActive:false,onContinueLearning:continueLearning}));
    expect(nodes(guide).some(e=>e.props["data-action"]==="dismiss-guide")).toBe(false);
    expect(storage.get(ONBOARDING_KEY)).toBe('{"version":1,"dismissed":true}');expect(storage.get(SAVE_KEY)).toBe("existing game");expect(continueLearning).not.toHaveBeenCalled();
    (nodes(guide).find(e=>e.props["data-action"]==="open-guide")!.props.onClick as ()=>void)();
    expect(nodes(renderHook(()=>BeginnerGuide({firstVisit:true,quizActive:true,onContinueLearning:continueLearning}))).some(e=>e.props["data-action"]==="dismiss-guide")).toBe(false);
  });
  it("reconstructs both accepted turns and clears coaching in other contexts",async()=>{
    vi.stubGlobal("Worker",undefined);render();await Promise.resolve();let game=render();game.startNewGame(5);game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});await Promise.resolve();game=render();expect(game.coachRound.map(t=>t.actor)).toEqual(["black","white"]);
    game.startReview();game=render();expect(game.coachRound).toEqual([]);game.endReview();game=render();game.newGame();game=render();expect(game.coachRound).toEqual([]);
  });
  it("cancels live round speech on entering read-only review without changing the source or progress",async()=>{
    const speak=vi.fn(),cancel=vi.fn();
    vi.stubGlobal("window",{speechSynthesis:{speak,cancel}});
    vi.stubGlobal("SpeechSynthesisUtterance",class {lang="";constructor(public text:string){}});
    vi.stubGlobal("Worker",undefined);
    render();await Promise.resolve();let game=render();game.startNewGame(5);game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});await vi.runAllTimersAsync();game=render();
    expect(game.coachRound.map(turn=>turn.actor)).toEqual(["black","white"]);
    expect(speak).toHaveBeenCalledTimes(2);expect(game.moveExplanation).not.toBe("");
    const source=game.matchState,progress=game.learningProgress,answers=structuredClone(game.learningSession.session.answers),saved=storage.get(SAVE_KEY);
    cancel.mockClear();expect(game.startReview()).toBe(true);game=render();game.seekReview(0);game=render();
    expect(cancel).toHaveBeenCalledOnce();expect(game.moveExplanation).toBe("");expect(game.coachRound).toEqual([]);
    expect(game.state.moves).toHaveLength(0);expect(game.matchState).toBe(source);expect(game.learningProgress).toBe(progress);
    expect(await game.play({x:0,y:0})).toEqual({ok:false,reason:"finished"});game.pass();game.undo();game=render();
    expect(game.matchState).toBe(source);expect(game.learningProgress).toBe(progress);expect(game.learningSession.session.answers).toEqual(answers);
    expect(storage.get(SAVE_KEY)).toBe(saved);expect(speak).toHaveBeenCalledTimes(2);expect(cancel).toHaveBeenCalledOnce();
    game.endReview();game=render();expect(game.matchState).toBe(source);expect(game.moveExplanation).toBe("");expect(speak).toHaveBeenCalledTimes(2);
  });
  it("only marks a current failed attempt and clears it after retry, undo and advancing",async()=>{
    render();await Promise.resolve();let game=render();await game.play({x:0,y:0});game=render();expect(game.attemptedPoint).toEqual({x:0,y:0});
    game.learningSession.retryExercise();game=render();expect(game.attemptedPoint).toBeNull();
    await game.play({x:0,y:0});game=render();await game.play({x:2,y:2});game=render();expect(game.attemptedPoint).toBeNull();
    game.learningSession.undoExercise();game=render();expect(game.attemptedPoint).toBeNull();
  });
});
