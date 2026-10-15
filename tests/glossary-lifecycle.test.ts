import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createGame } from "@/lib/go/rules";
import { decodeSave, encodeSave, SAVE_KEY } from "@/lib/go/storage";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { GlossaryDialog } from "@/components/learning/glossary-dialog";
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
describe("glossary lifecycle and persistence",()=>{
  it("describes a rejected AI move as a rejection followed by a pass, never a placed stone",async()=>{
    class InvalidWorker {
      onmessage:((event:{data:{id:number;move:{x:number;y:number}}})=>void)|null=null;
      onerror:unknown;
      terminate(){}
      postMessage(request:{id:number}) {this.onmessage?.({data:{id:request.id,move:{x:2,y:2}}});}
    }
    vi.stubGlobal("Worker",InvalidWorker);
    render();await Promise.resolve();let game=render();game.startNewGame(5);game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});await vi.runAllTimersAsync();game=render();
    expect(game.moveExplanation).toContain("已有棋子");
    expect(game.moveExplanation).toContain("白棋停一手");
    expect(game.moveExplanation).not.toContain("白棋落在");
    expect(game.matchState.board[2][2]).toBe("black");
  });
  it("saves independent assists immediately and blocks preference changes during an active quiz",async()=>{
    render();await Promise.resolve();let game=render();
    game.setLearningAssist("showLiberties",true);
    game.setLearningAssist("showCoordinates",true);
    expect(decodeSave(storage.get(SAVE_KEY)!)!.learning.assists.showLiberties).toBe(true);
    expect(decodeSave(storage.get(SAVE_KEY)!)!.learning.assists.showCoordinates).toBe(true);
    expect(decodeSave(storage.get(SAVE_KEY)!)!.learning.assists.showAtari).toBe(false);
    game=render();
    for(let i=0;i<3;i++) {
      const expected=game.learningSession.session.exercise!.expected;
      if(expected.kind==="move") game.learningSession.submitMove(expected.point);
      else if(expected.kind==="choice") game.learningSession.submitChoice(expected.choiceId);
      game=render();
    }
    expect(game.learningProgress.assists.showLiberties).toBe(true);
  });
  it("explains accepted lesson moves with text when speech is absent and does not invent outcomes for wrong legal moves",async()=>{
    render();await Promise.resolve();let game=render();
    game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:0,y:0});game=render();
    expect(game.moveExplanation).not.toContain("落在");
    expect(game.moveExplanation).not.toContain("提掉");
    await game.play({x:2,y:2});game=render();
    expect(game.moveExplanation).toContain("（3，3）");
    expect(game.moveExplanation).toContain("4口气");
    expect(game.learningSession.session.exerciseIndex).toBe(1);
  });
  it("queues Chinese speech only when explicitly enabled and cancels on context changes",async()=>{
    const speak=vi.fn();const cancel=vi.fn();
    vi.stubGlobal("window",{speechSynthesis:{speak,cancel}});
    class Utterance {lang="";constructor(public text:string){}}
    vi.stubGlobal("SpeechSynthesisUtterance",Utterance);
    render();await Promise.resolve();let game=render();
    await game.play({x:0,y:0});expect(speak).not.toHaveBeenCalled();
    game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});
    expect(speak).toHaveBeenCalledOnce();expect(speak.mock.calls[0][0].lang).toBe("zh-CN");
    game=render();const before=cancel.mock.calls.length;
    game.startPlay();render();expect(cancel.mock.calls.length).toBeGreaterThan(before);
  });
  it("retains text and accepts the move when the browser refuses speech",async()=>{
    vi.stubGlobal("window",{speechSynthesis:{speak:()=>{throw new Error("Speech denied");},cancel:vi.fn()}});
    vi.stubGlobal("SpeechSynthesisUtterance",class {lang="";constructor(public text:string){}});
    render();await Promise.resolve();let game=render();game.setLearningAssist("explainMoves",true);game=render();
    await expect(game.play({x:2,y:2})).resolves.toMatchObject({ok:true});game=render();
    expect(game.moveExplanation).toContain("4口气");
    expect(game.learningSession.session.exerciseIndex).toBe(1);
  });
  it("clears explanations when switching units or modes and never revives a disabled explanation",async()=>{
    render();await Promise.resolve();let game=render();game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});game=render();expect(game.moveExplanation).toContain("（3，3）");
    game.startUnit("s1-intersections-turns");game=render();expect(game.moveExplanation).toBe("");
    expect(game.learningSession.session.exerciseIndex).toBe(1);
    game.learningSession.resetUnit();game=render();
    await game.play({x:2,y:2});game=render();expect(game.moveExplanation).toContain("（3，3）");
    game.startPlay();game=render();expect(game.moveExplanation).toBe("");
    game.startUnit("s1-intersections-turns");game=render();game.learningSession.resetUnit();game=render();await game.play({x:2,y:2});game=render();
    game.setLearningAssist("explainMoves",false);game=render();await game.play({x:0,y:2});game=render();
    game.setLearningAssist("explainMoves",true);game=render();expect(game.moveExplanation).toBe("");
  });
  it.each(["retryExercise","undoExercise","resetUnit"] as const)("clears discarded explanations and cancels speech on same-unit %s",async action=>{
    const speak=vi.fn();const cancel=vi.fn();
    vi.stubGlobal("window",{speechSynthesis:{speak,cancel}});
    vi.stubGlobal("SpeechSynthesisUtterance",class {lang="";constructor(public text:string){}});
    render();await Promise.resolve();let game=render();game.setLearningAssist("explainMoves",true);game=render();
    await game.play({x:2,y:2});game=render();
    expect(game.learningSession.session.exerciseIndex).toBe(1);
    expect(game.moveExplanation).toContain("（3，3）");expect(speak).toHaveBeenCalledOnce();expect(cancel).not.toHaveBeenCalled();
    game.learningSession[action]();game=render();
    expect(game.moveExplanation).toBe("");expect(cancel).toHaveBeenCalledOnce();
  });
  it("disables explanation and assist mutations in a quiz without erasing settings",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":100,"stage-2":100};
    progress.assists.explainMoves=true;progress.assists.showAtari=true;
    storage.set(SAVE_KEY,encodeSave({game:createGame(),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    render();await Promise.resolve();let game=render();game.startUnit("s1-checkpoint");game=render();
    game.setLearningAssist("showAtari",false);await game.play({x:0,y:0});game=render();
    expect(game.learningProgress.assists.showAtari).toBe(true);
    expect(game.moveExplanation).toBe("");
    game.startPlay();game=render();expect(game.learningProgress.assists.explainMoves).toBe(true);
  });
  it("closes through the controlled dialog and restores focus to its opener", () => {
    class FocusTarget {
      isConnected = true;
      focus = vi.fn();
    }
    const opener = new FocusTarget();
    vi.stubGlobal("HTMLElement", FocusTarget);
    vi.stubGlobal("document", { activeElement: opener });
    const close = vi.fn();
    host.refCursor = 0;
    const dialog = GlossaryDialog({
      open: true, termId: "liberty", progress: createDefaultProgress(),
      onClose: close, onOpenTerm: vi.fn(), onDictionary: vi.fn(),
      onPractice: vi.fn(), onStartLesson: vi.fn(),
    });
    const content = dialog.props.children as ReactElement<{
      onOpenAutoFocus(): void;
      onCloseAutoFocus(event: { preventDefault(): void }): void;
    }>;
    content.props.onOpenAutoFocus();
    dialog.props.onOpenChange(false);
    expect(close).toHaveBeenCalledOnce();
    const preventDefault = vi.fn();
    content.props.onCloseAutoFocus({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(opener.focus).toHaveBeenCalledOnce();
    opener.isConnected = false;
    content.props.onCloseAutoFocus({ preventDefault });
    expect(opener.focus).toHaveBeenCalledOnce();
  });
  it("opens only the first unseen term once per unit and persists seen/practiced immediately",async()=>{
    render();await Promise.resolve();let game=render();
    expect(game.glossaryOpen).toBe(false);
    game.setLearningAssist("autoOpenTerms",true);render();game=render();
    expect(game.glossaryTermId).toBe("intersection");
    expect(decodeSave(storage.get(SAVE_KEY)!)!.learning.termStates.intersection).toBe("seen");
    game.closeGlossary();game.recordTermPractice("intersection");render();game=render();
    expect(game.glossaryOpen).toBe(false);
    expect(decodeSave(storage.get(SAVE_KEY)!)!.learning.termStates.intersection).toBe("practiced");
    game.startUnit("s1-intersections-turns");render();expect(render().glossaryOpen).toBe(false);
  });
  it("skips known terms, auto-opens the next lesson once, and never opens in a quiz",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,-1)];progress.bestQuizScores={"stage-1":100,"stage-2":100};progress.assists.autoOpenTerms=true;progress.termStates.liberty="mastered";
    storage.set(SAVE_KEY,encodeSave({game:createGame(),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    render();await Promise.resolve();let game=render();
    game.startUnit("s1-liberties-groups");render();game=render();
    expect(game.glossaryTermId).toBe("group");expect(game.learningProgress.termStates.liberty).toBe("mastered");
    game.closeGlossary();render();expect(render().glossaryOpen).toBe(false);
    game.startUnit("s1-checkpoint");render();game=render();expect(game.glossaryOpen).toBe(false);
    expect(game.openDictionary()).toBe(false);expect(game.openTerm("atari")).toBe(false);
    game.startPlay();render();game=render();expect(game.openDictionary()).toBe(true);
    render();game=render();expect(game.glossaryOpen).toBe(true);
    const save=decodeSave(storage.get(SAVE_KEY)!)!;expect(save.learning.completedUnitIds).toEqual(progress.completedUnitIds);expect(save.learning.bestQuizScores).toEqual(progress.bestQuizScores);
  });
});
