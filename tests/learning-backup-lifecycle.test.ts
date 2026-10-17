import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLearningBackup } from "@/lib/learning/backup";
import { useGoGame } from "@/hooks/use-go-game";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createGame, playMove } from "@/lib/go/rules";
import { encodeSave, SAVE_KEY } from "@/lib/go/storage";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { createLearningSession } from "@/lib/learning/session";
import { createLessonResume } from "@/lib/learning/session-resume";
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


describe("learning backup controller",()=>{
  it("exports current refs including same-frame hints without reading storage",async()=>{
    const game=await mount();answer(game);game.learningSession.requestHint();game.setLearningAssist("showCoordinates",true);
    const result=game.exportLearningBackup();expect(result.ok).toBe(true);if(!result.ok)throw Error(result.error);
    const data=JSON.parse(result.text);expect(data.lessonResume.acceptedActions).toHaveLength(1);expect(data.lessonResume.hintLevel).toBeGreaterThan(0);expect(data.learning.assists).toBeUndefined();
  });
  it("previews and cancels without writes, and opaque latest tickets replace rather than merge",async()=>{
    const high=createDefaultProgress();high.bestQuizScores["stage-1"]=100;storage.set(SAVE_KEY,encodeSave({game:createGame({size:9}),learning:high,difficulty:"beginner",volume:.5,category:"pop"}));
    let game=await mount();const low=createDefaultProgress();low.bestQuizScores["stage-1"]=85;
    game.setLearningAssist("showAtari",true);game=render();const before=storage.get(SAVE_KEY);
    const first=game.previewLearningBackup(createLearningBackup(low,null));expect(first.ok).toBe(true);expect(storage.get(SAVE_KEY)).toBe(before);
    game.cancelLearningRestore();if(!first.ok)throw Error(first.error);expect(game.confirmLearningRestore(first.ticket).ok).toBe(false);expect(storage.get(SAVE_KEY)).toBe(before);
    const next=game.previewLearningBackup(createLearningBackup(low,null));if(!next.ok)throw Error(next.error);
    expect(game.confirmLearningRestore({...next.ticket}).ok).toBe(false);
    const latest=game.previewLearningBackup(createLearningBackup(low,null));if(!latest.ok)throw Error(latest.error);
    expect(game.confirmLearningRestore(latest.ticket)).toEqual({ok:true});expect(game.confirmLearningRestore(latest.ticket).ok).toBe(false);game=render();
    expect(game.learningProgress.bestQuizScores["stage-1"]).toBe(85);expect(game.learningProgress.assists.showAtari).toBe(true);expect(game.mode).toBe("lesson");
  });
  it("rejects changed progress/session contexts and preserves memory on failed writes",async()=>{
    let game=await mount();const raw=createLearningBackup(createDefaultProgress(),null);let preview=game.previewLearningBackup(raw);if(!preview.ok)throw Error(preview.error);
    game.learningSession.requestHint();expect(game.confirmLearningRestore(preview.ticket).ok).toBe(false);game=render();
    preview=game.previewLearningBackup(raw);if(!preview.ok)throw Error(preview.error);const before=game.learningProgress,session=game.learningSession.session,stored=storage.get(SAVE_KEY);
    vi.stubGlobal("localStorage",{getItem:()=>stored,setItem:()=>{throw Error("denied");}});
    expect(game.confirmLearningRestore(preview.ticket)).toMatchObject({ok:false,error:expect.stringContaining("无法保存")});game=render();
    expect(game.learningProgress).toBe(before);expect(game.learningSession.session).toBe(session);expect(storage.get(SAVE_KEY)).toBe(stored);expect(game.exportLearningBackup().ok).toBe(true);
  });
  it("restores an imported higher unlocked bookmark against imported progress and invalidates old controls",async()=>{
    let game=await mount();const old=game.learningSession,oldStart=game.startUnit;const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,10)];progress.bestQuizScores["stage-1"]=85;
    const session=createLearningSession("s2-connect-cut");const preview=game.previewLearningBackup(createLearningBackup(progress,createLessonResume(session)));if(!preview.ok)throw Error(preview.error);
    expect(game.confirmLearningRestore(preview.ticket).ok).toBe(true);old.requestHint();old.resetUnit();oldStart("s1-intersections-turns");game=render();expect(game.learningSession.unit.id).toBe("s2-connect-cut");expect(game.learningSession.restored).toBe(true);
    unmount();game=await mount();expect(game.learningSession.unit.id).toBe("s2-connect-cut");expect(game.learningProgress.bestQuizScores["stage-1"]).toBe(85);
  });
  it("invalidates cached match reset, resign and lesson navigation after a restore",async()=>{
    let game=await mount();const old=game;const originalSize=game.matchState.size;const progress=createDefaultProgress();progress.bestQuizScores["stage-1"]=85;
    const preview=game.previewLearningBackup(createLearningBackup(progress,null));if(!preview.ok)throw Error(preview.error);expect(game.confirmLearningRestore(preview.ticket).ok).toBe(true);
    old.startNewGame(9);old.newGame();old.resign();old.undo();old.continueLearning();old.startPlay();game=render();expect(game.mode).toBe("lesson");expect(game.matchState.size).toBe(originalSize);expect(game.outcome).toBeNull();expect(game.learningProgress.bestQuizScores["stage-1"]).toBe(85);
  });
  it("rejects a same-frame preview made through a stale lesson context before writing",async()=>{
    let game=await mount();const oldProgress=game.learningProgress;const before=storage.get(SAVE_KEY);game.learningSession.resetUnit();
    const incoming=createDefaultProgress();incoming.bestQuizScores["stage-1"]=85;const preview=game.previewLearningBackup(createLearningBackup(incoming,null));if(!preview.ok)throw Error(preview.error);
    expect(game.confirmLearningRestore(preview.ticket).ok).toBe(false);expect(storage.get(SAVE_KEY)).toBe(before);game=render();expect(game.learningProgress).toBe(oldProgress);
  });
  it("rejects old terminal confirmation callbacks after restoring and returning to the match",async()=>{
    const progress=createDefaultProgress();const board=passTurn(passTurn(createGame({size:9})));storage.set(SAVE_KEY,encodeSave({game:board,learning:progress,difficulty:"beginner",volume:.5,category:"pop",scoring:{phase:"dead-stones",deadStones:[],outcome:null,graduationEligible:false}}));
    let game=await mount();const oldConfirm=game.confirmDeadStones;game.startUnit("s1-intersections-turns");game=render();const preview=game.previewLearningBackup(createLearningBackup(progress,null));if(!preview.ok)throw Error(preview.error);expect(game.confirmLearningRestore(preview.ticket).ok).toBe(true);game=render();game.startPlay();game=render();
    expect(oldConfirm()).toBe(false);game=render();expect(game.scorePhase).toBe("dead-stones");
  });
  it("reparses its private candidate and never trusts edited summary objects or extra fields",async()=>{
    let game=await mount();const originalSize=game.matchState.size;const low=createDefaultProgress();low.bestQuizScores["stage-1"]=85;const raw=JSON.parse(createLearningBackup(low,null));raw.game=createGame({size:9});raw.learning.assists={showAtari:true};raw.personal={secret:"ignored"};
    const preview=game.previewLearningBackup(JSON.stringify(raw));if(!preview.ok)throw Error(preview.error);preview.summary.quizScores["stage-1"]=100;preview.summary.completedCount=999;
    expect(game.confirmLearningRestore(preview.ticket).ok).toBe(true);game=render();expect(game.learningProgress.bestQuizScores["stage-1"]).toBe(85);expect(game.matchState.size).toBe(originalSize);expect(game.learningProgress.assists.showAtari).toBe(false);expect(storage.get(SAVE_KEY)).not.toContain("secret");
  });
  it("checks a hydrated white turn before the AI effect has acquired busy",async()=>{
    const moved=playMove(createGame({size:9}),{x:2,y:2});if(!moved.ok)throw Error("move");storage.set(SAVE_KEY,encodeSave({game:moved.state,learning:createDefaultProgress(),difficulty:"beginner",volume:.5,category:"pop"}));
    const game=render();await Promise.resolve();expect(game.exportLearningBackup()).toMatchObject({ok:false,error:expect.stringContaining("电脑")});
  });
  it("blocks an active quiz and read-only review without storage writes",async()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,7)];let board=createGame({size:9});const moved=playMove(board,{x:2,y:2});if(!moved.ok)throw Error("move");board=passTurn(moved.state);storage.set(SAVE_KEY,encodeSave({game:board,learning:progress,difficulty:"beginner",volume:.5,category:"pop"}));
    let game=await mount();game.startUnit("s1-checkpoint");game=render();const raw=createLearningBackup(progress,null);expect(game.backupBlockedReason).toContain("测验");expect(game.previewLearningBackup(raw).ok).toBe(false);game.startPlay();game=render();game.startReview();game=render();expect(game.backupBlockedReason).toContain("复盘");expect(game.exportLearningBackup().ok).toBe(false);expect(game.previewLearningBackup(raw).ok).toBe(false);
  });
  it.each(([9,13,19] as const).flatMap(size=>(["dead-stones","score-review","final"] as const).map(phase=>({size,phase}))))("preserves original $size board $phase scoring settings and qualification across refresh",async({size,phase})=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":100,"stage-2":100};progress.graduation.completedNineLineGame=true;progress.graduation.enteredScoring=true;
    const move=playMove(createGame({size}),{x:2,y:2});if(!move.ok)throw Error("move");const board=passTurn(passTurn(move.state));
    const scoring={phase,deadStones:["2,2"],outcome:null,graduationEligible:size===9};storage.set(SAVE_KEY,encodeSave({game:board,learning:progress,difficulty:"challenge",volume:.5,category:"pop",confirmMoves:true,scoring}));
    let game=await mount();expect(game.backupBlockedReason).toBeTruthy();game.startUnit("s1-intersections-turns");game=render();const preview=game.previewLearningBackup(createLearningBackup(createDefaultProgress(),null));if(!preview.ok)throw Error(preview.error);
    expect(game.confirmLearningRestore(preview.ticket).ok).toBe(true);game=render();expect(saved().game).toEqual(board);expect(saved().scoring).toEqual(scoring);expect(saved().difficulty).toBe("challenge");expect(saved().confirmMoves).toBe(true);expect(game.learningProgress.graduation).toEqual(createDefaultProgress().graduation);
    unmount();game=await mount();expect(saved().scoring).toEqual(scoring);game.startPlay();game=render();game.confirmFinalScore();game=render();expect(game.learningProgress.graduation).toEqual(createDefaultProgress().graduation);
  });
  it("blocks unhydrated, quiz, pending move, review and AI state through current refs",async()=>{
    expect(render().exportLearningBackup().ok).toBe(false);await Promise.resolve();let game=render();game=render();
    game.setConfirmMoves(true);game=render();await game.selectPoint({x:2,y:2});expect(game.exportLearningBackup().ok).toBe(false);game.cancelMove();game=render();game.startPlay();game=render();const pending=game.play({x:2,y:2});expect(game.exportLearningBackup().ok).toBe(false);await pending;
  });
});
