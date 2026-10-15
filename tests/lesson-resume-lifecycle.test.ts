import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createGame, playMove } from "@/lib/go/rules";
import { encodeSave, SAVE_KEY } from "@/lib/go/storage";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { createLearningSession, submitLearningAction } from "@/lib/learning/session";
import { createLessonResume } from "@/lib/learning/session-resume";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { passTurn } from "@/lib/go/rules";

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




function unmount() {
  host.effects.forEach(e=>e.cleanup?.());
  host.values=[];host.refs=[];host.effects=[];host.callbacks=[];host.pending=[];
}
async function mount() { render();await Promise.resolve();render();await Promise.resolve();return render(); }
function saved() { return JSON.parse(storage.get(SAVE_KEY)!).data; }
function answer(game:ReturnType<typeof render>) {
  const action=game.learningSession.session.exercise!.expected;
  if(action.kind==="choice")game.learningSession.submitChoice(action.choiceId);
  else if(action.kind==="pass")game.learningSession.submitPass();
  else if(action.kind==="move")game.learningSession.submitMove(action.point);
  else if(action.kind==="select-group")game.learningSession.submitGroup(action.point);
  else game.learningSession.submitDeadStone(action.point);
}

describe("ordinary lesson resume lifecycle",()=>{
  it("persists actual accepted actions and hints, restores without speech, progress or term side effects",async()=>{
    const speak=vi.fn();vi.stubGlobal("window",{speechSynthesis:{speak,cancel:vi.fn()}});
    vi.stubGlobal("SpeechSynthesisUtterance",class {lang="";constructor(public text:string){}});
    let game=await mount();answer(game);game=render();game.learningSession.requestHint();game=render();
    game.setLearningAssist("explainMoves",true);game.setLearningAssist("autoOpenTerms",true);
    const snapshot=saved();expect(snapshot.lessonResume.acceptedActions).toHaveLength(1);
    expect(snapshot.lastView).toBe("lesson");unmount();speak.mockClear();game=await mount();
    expect(game.mode).toBe("lesson");expect(game.learningSession.session.exerciseIndex).toBe(1);
    expect(game.learningSession.session.hintLevel).toBe(snapshot.lessonResume.hintLevel);
    expect(game.learningSession.restored).toBe(true);expect(game.learningSession.feedback).toBeNull();
    expect(game.learningProgress).toEqual(snapshot.learning);expect(game.matchState).toEqual(snapshot.game);
    expect(game.glossaryOpen).toBe(false);expect(speak).not.toHaveBeenCalled();
  });
  it("keeps the ordinary position while playing and continues it from the shared entry",async()=>{
    let game=await mount();answer(game);game=render();game.startPlay();game=render();
    expect(saved().lastView).toBe("play");unmount();game=await mount();expect(game.mode).toBe("play");
    game.continueLearning();game=render();expect(game.mode).toBe("lesson");expect(game.learningSession.session.exerciseIndex).toBe(1);
    game.startUnit("s1-intersections-turns");game=render();expect(game.learningSession.session.exerciseIndex).toBe(1);
  });
  it("trims undo, preserves retry hints, restarts explicitly and clears completion",async()=>{
    let game=await mount();answer(game);game=render();game.learningSession.requestHint();game=render();const hint=game.learningSession.session.hintLevel;
    game.learningSession.retryExercise();game=render();expect(saved().lessonResume.hintLevel).toBe(hint);
    unmount();game=await mount();game.learningSession.undoExercise();game=render();expect(saved().lessonResume.acceptedActions).toEqual([]);
    answer(game);game=render();game.learningSession.resetUnit();game=render();expect(saved().lessonResume.acceptedActions).toEqual([]);expect(game.learningSession.restored).toBe(false);
    while(!game.learningSession.session.completed){answer(game);game=render();}
    expect(saved().lessonResume).toBeUndefined();expect(saved().lastView).toBeUndefined();
  });
  it("uses current refs for immediate settings writes and same-frame accepted actions",async()=>{
    let game=await mount();answer(game);game.setLearningAssist("showCoordinates",true);game.setConfirmMoves(true);
    expect(saved().lessonResume.acceptedActions).toHaveLength(1);expect(saved().confirmMoves).toBe(true);
    expect(saved().learning.assists.showCoordinates).toBe(true);
    game=render();answer(game);game.setConfirmMoves(false);
    expect(saved().lessonResume.acceptedActions).toHaveLength(2);expect(saved().confirmMoves).toBe(false);
  });
  it("rejects callbacks from an earlier course while keeping same-frame quiz first attempts",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,7)];
    storage.set(SAVE_KEY,encodeSave({game:createGame({size:5}),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    let game=await mount();game.startUnit("s1-intersections-turns");game=render();const old=game.learningSession;
    game.startUnit("s1-checkpoint");game=render();const before=game.learningSession.session;
    old.submitMove({x:2,y:2});old.requestHint();old.resetUnit();game=render();expect(game.learningSession.session).toBe(before);
    const quiz=CURRICULUM_BY_ID.get("s1-checkpoint")!;if(quiz.kind!=="quiz")throw new Error("quiz");
    const submit=game.learningSession.submitMove;const expected=quiz.questions[0].expected;if(expected.kind!=="move")throw new Error("move");
    submit({x:0,y:0});submit(expected.point);game=render();expect(game.learningSession.session.answers[0].correct).toBe(false);
    expect(game.learningSession.session.exerciseIndex).toBe(1);expect(game.learningSession.session.acceptedActions).toEqual([]);
  });
  it("does not persist preview or errors and preserves an old ordinary resume when a quiz reloads",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,7)];
    const lesson=submitLearningAction(createLearningSession("s1-intersections-turns"),{kind:"move",point:{x:2,y:2}});
    storage.set(SAVE_KEY,encodeSave({game:createGame({size:5}),learning:progress,difficulty:"beginner",volume:.5,category:"pop",lessonResume:createLessonResume(lesson)!,lastView:"lesson"}));
    let game=await mount();game.setConfirmMoves(true);game=render();await game.selectPoint({x:0,y:0});game=render();
    expect(saved().lessonResume.acceptedActions).toHaveLength(1);game.startUnit("s1-checkpoint");game=render();answer(game);game=render();
    expect(saved().lessonResume.unitId).toBe(lesson.unitId);expect(saved().lastView).toBe("play");
    expect(JSON.stringify(saved())).not.toContain('"answers"');unmount();game=await mount();expect(game.mode).toBe("play");
    game.startUnit("s1-checkpoint");game=render();expect(game.learningSession.session.exerciseIndex).toBe(0);expect(game.learningSession.visibleHints).toEqual([]);
  });
  it.each(["dead-stones","score-review","final"] as const)("preserves scoring %s and resume through immediate settings and read-only review",async phase=>{
    const progress=createDefaultProgress();let board=createGame({size:5});const move=playMove(board,{x:2,y:2});if(!move.ok)throw new Error("move");board=passTurn(passTurn(move.state));
    storage.set(SAVE_KEY,encodeSave({game:board,learning:progress,difficulty:"challenge",volume:.5,category:"pop",lessonResume:createLessonResume(createLearningSession("s1-intersections-turns"))!,lastView:"play",scoring:{phase,deadStones:["2,2"],outcome:phase==="final"?"你已认输，白方获胜":null,graduationEligible:false}}));
    let game=await mount();expect(game.mode).toBe("scoring");game.setLearningAssist("showAtari",true);game.setConfirmMoves(true);
    expect(saved().scoring).toEqual({phase,deadStones:["2,2"],outcome:phase==="final"?"你已认输，白方获胜":null,graduationEligible:false});expect(saved().lessonResume).toBeDefined();
    game=render();const raw=storage.get(SAVE_KEY);game.startReview();game=render();game.seekReview(0);game=render();expect(storage.get(SAVE_KEY)).toBe(raw);expect(game.matchState).toEqual(board);
    unmount();game=await mount();expect(game.scorePhase).toBe(phase);expect(game.mode).toBe("scoring");
  });
  it("reports write failures visibly while preserving playable in-memory progress",async()=>{
    vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{throw new Error("denied");}});
    let game=await mount();expect(game.storageUnavailable).toBe(true);answer(game);game=render();expect(game.learningSession.session.exerciseIndex).toBe(1);
  });
  it("contains storage getter failures and exposes the unavailable state",async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,"localStorage");Object.defineProperty(globalThis,"localStorage",{configurable:true,get(){throw new Error("denied");}});
    try{const game=await mount();expect(game.storageUnavailable).toBe(true);}finally{if(descriptor)Object.defineProperty(globalThis,"localStorage",descriptor);}
  });
  it("does not write before hydration and preserves independent saved game, difficulty and settings",async()=>{
    const progress=createDefaultProgress();progress.assists.showAtari=true;
    const match=playMove(createGame({size:9}),{x:1,y:1});if(!match.ok)throw new Error("move");
    const board=passTurn(match.state);
    const raw=encodeSave({game:board,learning:progress,difficulty:"challenge",volume:.5,category:"pop",lessonResume:createLessonResume(createLearningSession("s1-intersections-turns"))!,lastView:"lesson",confirmMoves:true});
    storage.set(SAVE_KEY,raw);render();expect(storage.get(SAVE_KEY)).toBe(raw);
    await Promise.resolve();let game=render();game.setLearningAssist("showCoordinates",true);game.setConfirmMoves(false);
    expect(saved().game).toEqual(board);expect(saved().difficulty).toBe("challenge");expect(saved().learning.assists.showAtari).toBe(true);
    game=render();expect(game.mode).toBe("lesson");expect(game.aiThinking).toBe(false);
  });
  it("replaces the one ordinary lesson record and preserves it through quiz and graduation entries",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":100,"stage-2":100};
    storage.set(SAVE_KEY,encodeSave({game:createGame({size:9}),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    let game=await mount();game.startUnit("s1-intersections-turns");game=render();answer(game);game=render();
    game.startUnit("s1-liberties-groups");game=render();expect(saved().lessonResume.unitId).toBe("s1-liberties-groups");expect(saved().lessonResume.acceptedActions).toEqual([]);
    game.startUnit("s1-checkpoint");game=render();expect(saved().lessonResume.unitId).toBe("s1-liberties-groups");
    game.startUnit("s3-graduation");game=render();expect(saved().lessonResume.unitId).toBe("s1-liberties-groups");expect(saved().lastView).toBe("play");
    game.continueLearning();game=render();expect(game.learningSession.unit.id).toBe("s1-liberties-groups");
  });
  it("falls back to the graduation unit when all units are complete and no resume remains",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":100,"stage-2":100};
    progress.graduation={completedNineLineGame:true,enteredScoring:true,confirmedDeadStones:true,finalizedScore:true};
    storage.set(SAVE_KEY,encodeSave({game:createGame({size:9}),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    let game=await mount();game.continueLearning();game=render();expect(game.learningSession.unit.id).toBe("s3-graduation");
  });
  it("never persists an unconfirmed dead-stone selection",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":100,"stage-2":100};
    storage.set(SAVE_KEY,encodeSave({game:createGame({size:9}),learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    const unit=[...CURRICULUM_BY_ID.values()].find(u=>u.kind==="lesson"&&u.exercises.some(e=>e.expected.kind==="mark-dead"))!;
    let game=await mount();game.startUnit(unit.id);game=render();
    while(game.learningSession.session.exercise!.expected.kind!=="mark-dead"){answer(game);game=render();}
    const expected=game.learningSession.session.exercise!.expected;if(expected.kind!=="mark-dead")throw new Error("mark-dead");
    const raw=storage.get(SAVE_KEY);game.learningSession.selectDeadStone(expected.point);game=render();expect(game.learningSession.selectedDeadStone).toEqual(expected.point);expect(storage.get(SAVE_KEY)).toBe(raw);
    unmount();game=await mount();expect(game.learningSession.selectedDeadStone).toBeNull();expect(game.learningSession.session.exercise!.expected.kind).toBe("mark-dead");
  });
  it("ignores a late AI reply after continuing the ordinary lesson",async()=>{
    let reply:()=>void=()=>{};const requests=vi.fn();
    class DelayedWorker {
      onmessage:((event:{data:{id:number;move:{x:number;y:number}}})=>void)|null=null;onerror:unknown;terminate(){}
      postMessage(request:{id:number}){requests();reply=()=>this.onmessage?.({data:{id:request.id,move:{x:1,y:2}}});}
    }
    vi.stubGlobal("Worker",DelayedWorker);let game=await mount();answer(game);game=render();game.startNewGame(5);game=render();
    await game.play({x:2,y:2});game=render();const before=game.matchState;expect(game.aiThinking).toBe(true);
    game.continueLearning();game=render();reply();await vi.runAllTimersAsync();game=render();
    expect(game.mode).toBe("lesson");expect(game.matchState).toBe(before);expect(game.learningSession.session.exerciseIndex).toBe(1);expect(game.aiThinking).toBe(false);expect(requests).toHaveBeenCalledOnce();
  });
  it("keeps graduation eligibility and same-frame final scoring when settings are saved",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":100,"stage-2":100};progress.graduation.completedNineLineGame=true;progress.graduation.enteredScoring=true;
    const board=passTurn(passTurn(createGame({size:9})));
    storage.set(SAVE_KEY,encodeSave({game:board,learning:progress,difficulty:"beginner",volume:.5,category:"pop",lessonResume:createLessonResume(createLearningSession("s1-intersections-turns"))!,lastView:"play",scoring:{phase:"dead-stones",deadStones:[],outcome:null,graduationEligible:true}}));
    const game=await mount();game.confirmDeadStones();game.confirmFinalScore();game.setLearningAssist("showCoordinates",true);game.setConfirmMoves(true);
    expect(saved().scoring.phase).toBe("final");expect(saved().scoring.graduationEligible).toBe(true);expect(saved().learning.graduation.finalizedScore).toBe(true);expect(saved().lessonResume).toBeDefined();
  });
  it.each(["startPlay","newGame"] as const)("blocks cached lesson controls after %s without changing the bookmark or awarding completion",async leave=>{
    let game=await mount();answer(game);game=render();const controls=game.learningSession;
    game[leave]();game=render();const progress=game.learningProgress;const raw=storage.get(SAVE_KEY);const session=game.learningSession.session;
    const action=session.exercise!.expected;if(action.kind!=="move")throw new Error("move");
    controls.submitMove(action.point);controls.requestHint();controls.retryExercise();controls.undoExercise();controls.resetUnit();game=render();
    expect(game.learningSession.session).toBe(session);expect(game.learningProgress).toBe(progress);expect(storage.get(SAVE_KEY)).toBe(raw);
  });
});
