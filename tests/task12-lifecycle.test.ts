import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createGame, playMove } from "@/lib/go/rules";
import { decodeSave, encodeSave, SAVE_KEY } from "@/lib/go/storage";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { PracticeDialog } from "@/components/learning/practice-picker";
import type { ReactElement } from "react";

const host=vi.hoisted(()=>({values:[] as unknown[],refs:[] as {current:unknown}[],cursor:0,refCursor:0,effectCursor:0,callbackCursor:0,callbacks:[] as {deps:unknown[];fn:unknown}[],memoCursor:0,memos:[] as {deps:unknown[];value:unknown}[],
  effects:[] as {deps?:unknown[];cleanup?:()=>void}[], pending:[] as (()=>void)[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState:(initial:unknown)=>{const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function" ? (initial as ()=>unknown)():initial;return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function" ? (next as (value:unknown)=>unknown)(host.values[i]):next;}];},
  useRef:(initial:unknown)=>{const i=host.refCursor++;return host.refs[i]??(host.refs[i]={current:initial});},
  useCallback:(callback:unknown,deps:unknown[])=>{const i=host.callbackCursor++;const previous=host.callbacks[i];if(previous && deps.length===previous.deps.length && deps.every((v,n)=>Object.is(v,previous.deps[n])))return previous.fn;host.callbacks[i]={deps,fn:callback};return callback;},
  useMemo:(factory:()=>unknown,deps:unknown[])=>{const i=host.memoCursor++;const previous=host.memos[i];if(previous && deps.length===previous.deps.length && deps.every((v,n)=>Object.is(v,previous.deps[n])))return previous.value;const value=factory();host.memos[i]={deps,value};return value;},
  useEffect:(effect:()=>void|(()=>void),deps?:unknown[])=>{const i=host.effectCursor++;const previous=host.effects[i];if(deps&&previous?.deps&&deps.length===previous.deps.length&&deps.every((v,n)=>Object.is(v,previous.deps![n])))return;host.pending.push(()=>{previous?.cleanup?.();host.effects[i]={deps,cleanup:effect()||undefined};});},
}));
const storage=new Map<string,string>();
function renderHook<T>(hook: () => T): T {
  host.cursor = 0;
  host.refCursor = 0;
  host.effectCursor = 0;
  host.callbackCursor = 0;
  host.memoCursor = 0;
  const result = hook();
  host.pending.splice(0).forEach(fn => fn());
  return result;
}
const render = () => renderHook(() => useGoGame({ volume: .5, category: "pop", restore: vi.fn() }));
beforeEach(()=>{host.values=[];host.refs=[];host.effects=[];host.pending=[];host.callbacks=[];host.memos=[];storage.clear();vi.useFakeTimers();vi.stubGlobal("localStorage",{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});});
afterEach(()=>{host.effects.forEach(e=>e.cleanup?.());vi.useRealTimers();vi.unstubAllGlobals();});

describe("practice, confirmation and review persistence",()=>{
  it("restores focus to the practice opener when the controlled dialog closes",()=>{
    class FocusTarget {isConnected=true;focus=vi.fn();}
    const opener=new FocusTarget();vi.stubGlobal("HTMLElement",FocusTarget);vi.stubGlobal("document",{activeElement:opener});
    const close=vi.fn();const dialog=renderHook(()=>PracticeDialog({open:true,progress:createDefaultProgress(),onClose:close}));
    const content=dialog.props.children as ReactElement<{onOpenAutoFocus():void;onCloseAutoFocus(event:{preventDefault():void}):void}>;
    content.props.onOpenAutoFocus();dialog.props.onOpenChange(false);const preventDefault=vi.fn();content.props.onCloseAutoFocus({preventDefault});
    expect(close).toHaveBeenCalledOnce();expect(preventDefault).toHaveBeenCalledOnce();expect(opener.focus).toHaveBeenCalledOnce();
    opener.isConnected=false;content.props.onCloseAutoFocus({preventDefault});expect(opener.focus).toHaveBeenCalledOnce();
    const sameOpening=renderHook(()=>PracticeDialog({open:true,progress:createDefaultProgress(),onClose:close}));
    sameOpening.props.onOpenChange(false);expect(close).toHaveBeenCalledOnce();
    renderHook(()=>PracticeDialog({open:false,progress:createDefaultProgress(),onClose:close}));
    const reopened=renderHook(()=>PracticeDialog({open:true,progress:createDefaultProgress(),onClose:close}));
    dialog.props.onOpenChange(false);expect(close).toHaveBeenCalledOnce();
    reopened.props.onOpenChange(false);expect(close).toHaveBeenCalledTimes(2);
  });
  it("saves confirmation immediately, restores it on refresh and keeps assists independent",async()=>{
    render();await Promise.resolve();let game=render();game.setConfirmMoves(true);
    expect(decodeSave(storage.get(SAVE_KEY)!)?.confirmMoves).toBe(true);
    game.setLearningAssist("showCoordinates",true);game=render();expect(game.confirmMoves).toBe(true);
    host.effects.forEach(e=>e.cleanup?.());host.values=[];host.refs=[];host.effects=[];host.callbacks=[];host.memos=[];host.pending=[];
    render();await Promise.resolve();game=render();expect(game.confirmMoves).toBe(true);expect(game.learningProgress.assists.showCoordinates).toBe(true);expect(game.previewPoint).toBeNull();
  });
  it("does not persist a preview or review frame over the actual match and scoring phase",async()=>{
    vi.stubGlobal("Worker",undefined);render();await Promise.resolve();let game=render();game.startNewGame(5);game.setConfirmMoves(true);game=render();
    await game.selectPoint({x:0,y:0});game=render();expect(decodeSave(storage.get(SAVE_KEY)!)!.game.moves).toHaveLength(0);
    await game.confirmMove();await Promise.resolve();game=render();game.pass();await Promise.resolve();game=render();game.toggleDeadStone({x:0,y:0});game.confirmDeadStones();game=render();
    const match=structuredClone(game.matchState);expect(game.startReview()).toBe(true);game=render();game.seekReview(0);game=render();expect(game.state.moves).toHaveLength(0);
    game.setConfirmMoves(false);game=render();const saved=decodeSave(storage.get(SAVE_KEY)!)!;
    expect(saved.game).toEqual(match);expect(saved.scoring?.phase).toBe("score-review");expect(saved.scoring?.deadStones).toContain("0,0");
    host.effects.forEach(e=>e.cleanup?.());host.values=[];host.refs=[];host.effects=[];host.callbacks=[];host.memos=[];host.pending=[];
    render();await Promise.resolve();game=render();expect(game.reviewing).toBe(false);expect(game.previewPoint).toBeNull();expect(game.state).toEqual(match);expect(game.scorePhase).toBe("score-review");
  });
  it("closes practice on context changes and rejects openings synchronously during an active quiz",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,7)];
    const quiz=CURRICULUM_BY_ID.get("s1-checkpoint")!;if(quiz.kind!=="quiz")throw new Error("quiz");
    progress.wrongQuestionIds=[quiz.questions[0].id];progress.termStates.liberty="mastered";
    storage.set(SAVE_KEY,encodeSave({game:createGame({size:5}),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    render();await Promise.resolve();let game=render();game.startUnit("s1-intersections-turns");game=render();
    const match=structuredClone(game.matchState),lesson=structuredClone(game.learningSession.session),before=structuredClone(game.learningProgress);
    expect(game.openPractice()).toBe(true);game=render();expect(game.practiceOpen).toBe(true);game.closePractice();game=render();expect(game.matchState).toEqual(match);expect(game.learningSession.session).toEqual(lesson);expect(game.learningProgress).toEqual(before);
    game.openPractice();game=render();game.startUnit("s1-checkpoint");expect(game.openPractice()).toBe(false);game=render();expect(game.practiceOpen).toBe(false);expect(game.glossaryBlocked).toBe(true);
    game.setConfirmMoves(true);game=render();const question=game.learningSession.session.exercise!;
    if(question.expected.kind!=="move")throw new Error("first quiz question is a move");
    const initial=structuredClone(game.learningProgress);await game.selectPoint(question.expected.point);game=render();expect(game.previewPoint).toEqual(question.expected.point);expect(game.learningProgress).toEqual(initial);expect(game.learningSession.session.answers).toEqual([]);
    await game.confirmMove();game=render();expect(game.learningSession.session.answers).toHaveLength(1);expect(game.previewPoint).toBeNull();
  });
  it("rejects suicide and ko candidates through the actual rule state without grading or history changes",async()=>{
    const suicide=createGame({size:5,stones:[["white",0,1],["white",1,0]],toPlay:"black"});
    const capture=playMove(createGame({size:5,stones:[["black",2,1],["black",1,2],["black",3,2],["black",2,3],["white",1,1],["white",2,0],["white",3,1]],toPlay:"white"}),{x:2,y:2});
    if(!capture.ok)throw new Error("replayed ko setup");
    for(const [state,point,reason] of [[suicide,{x:0,y:0},"suicide"],[capture.state,{x:2,y:1},"ko"]] as const) {
      host.effects.forEach(e=>e.cleanup?.());host.values=[];host.refs=[];host.effects=[];host.callbacks=[];host.memos=[];host.pending=[];
      storage.set(SAVE_KEY,encodeSave({game:state,learning:createDefaultProgress(),difficulty:"beginner",volume:.5,category:"pop",confirmMoves:true}));
      render();await Promise.resolve();let game=render();const before=structuredClone(game.matchState);expect(await game.selectPoint(point)).toEqual({ok:false,reason});game=render();expect(game.previewPoint).toBeNull();expect(game.matchState).toEqual(before);
    }
  });
});
