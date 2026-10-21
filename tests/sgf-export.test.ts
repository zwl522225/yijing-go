import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createGame, passTurn, playMove } from "@/lib/go/rules";
import { encodeSave, SAVE_KEY, type ScorePhase } from "@/lib/go/storage";
import type { GameState } from "@/lib/go/types";
import { scoreArea } from "@/lib/go/scoring";
const host=vi.hoisted(()=>({values:[] as unknown[],refs:[] as {current:unknown}[],cursor:0,refCursor:0,effectCursor:0,callbackCursor:0,callbacks:[] as {deps:unknown[];fn:unknown}[],effects:[] as {deps?:unknown[];cleanup?:()=>void}[],pending:[] as (()=>void)[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState:(initial:unknown)=>{const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function"?(next as (value:unknown)=>unknown)(host.values[i]):next;}];},
  useRef:(initial:unknown)=>{const i=host.refCursor++;return host.refs[i]??(host.refs[i]={current:initial});},
  useCallback:(fn:unknown,deps:unknown[])=>{const i=host.callbackCursor++,p=host.callbacks[i];if(p&&deps.length===p.deps.length&&deps.every((v,n)=>Object.is(v,p.deps[n])))return p.fn;host.callbacks[i]={deps,fn};return fn;},
  useEffect:(effect:()=>void|(()=>void),deps?:unknown[])=>{const i=host.effectCursor++,p=host.effects[i];if(deps&&p?.deps&&deps.length===p.deps.length&&deps.every((v,n)=>Object.is(v,p.deps![n])))return;host.pending.push(()=>{p?.cleanup?.();host.effects[i]={deps,cleanup:effect()||undefined};});},
}));
const storage=new Map<string,string>();
const writes=vi.fn((key:string,value:string)=>storage.set(key,value));
function useTestGame(){return useGoGame({volume:.5,category:"pop",restore(){}});}
function renderHook<T>(hook:()=>T,effects=true){host.cursor=host.refCursor=host.effectCursor=host.callbackCursor=0;const game=hook();if(effects)host.pending.splice(0).forEach(fn=>fn());return game;}
const render=(effects=true)=>renderHook(useTestGame,effects);
async function mount(){render();await Promise.resolve();render();await Promise.resolve();return render();}
function move(state:GameState,x:number,y:number){const result=playMove(state,{x,y});if(!result.ok)throw Error(result.reason);return result.state;}
const board=()=>move(move(createGame({size:9}),2,2),6,6);
function save(state=board(),phase?:ScorePhase,outcome:string|null=null,deadStones:string[]=[]){storage.set(SAVE_KEY,encodeSave({game:state,learning:createDefaultProgress(),difficulty:"beginner",volume:.5,category:"pop",scoring:phase?{phase,outcome,deadStones,graduationEligible:false}:undefined}));}
function content(game:ReturnType<typeof render>){const result=game.exportSgf();expect(result.ok).toBe(true);if(!result.ok)throw Error(result.error);return result.content;}
beforeEach(()=>{host.values=[];host.refs=[];host.effects=[];host.pending=[];host.callbacks=[];storage.clear();writes.mockClear();vi.stubGlobal("Worker",undefined);vi.stubGlobal("localStorage",{getItem:(key:string)=>storage.get(key)??null,setItem:writes,removeItem:(key:string)=>storage.delete(key)});});
afterEach(()=>{host.effects.forEach(e=>e.cleanup?.());vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("SGF controller snapshot",()=>{
  it("requires real hydration, a supported nonempty match, and a current mode",async()=>{
    save();const unhydrated=render();expect(unhydrated.exportSgf()).toMatchObject({ok:false,error:expect.stringContaining("读取")});await Promise.resolve();let game=render();expect(content(game)).toContain(";B[cc];W[gg]");
    const old=game.exportSgf;game.startUnit("s1-intersections-turns");expect(old().ok).toBe(false);game=render();expect(game.exportSgf().ok).toBe(false);game.startNewGame(9);game=render();expect(game.sgfBlockedReason).toContain("先下一手");expect(game.exportSgf().ok).toBe(false);
  });
  it("reads current refs without persistence, board mutation, or changing progress/settings",async()=>{
    save();const game=await mount(),before=structuredClone({state:game.matchState,progress:game.learningProgress,phase:game.scorePhase,index:game.reviewIndex});writes.mockClear();const text=content(game);expect(text).not.toContain("RE[");expect(writes).not.toHaveBeenCalled();expect({state:game.matchState,progress:game.learningProgress,phase:game.scorePhase,index:game.reviewIndex}).toEqual(before);
    vi.stubGlobal("localStorage",{getItem(){throw Error("denied");},setItem(){throw Error("denied");}});expect(content(game)).toBe(text);
  });
  it("rejects restored white to play before the AI effect acquires busy",async()=>{
    save(move(createGame({size:9}),2,2));render();await Promise.resolve();const game=render(false);expect(game.aiThinking).toBe(false);expect(game.exportSgf()).toMatchObject({ok:false,error:expect.stringContaining("电脑")});
  });
  it("checks same-frame preview and auxiliary open/close refs even for a cached export",async()=>{
    save();let game=await mount();const cached=game.exportSgf;game.setConfirmMoves(true);game=render();await game.selectPoint({x:3,y:3});expect(cached()).toMatchObject({ok:false,error:expect.stringContaining("落子")});game.cancelMove();expect(cached().ok).toBe(true);
    game.openDictionary();expect(cached().ok).toBe(false);game.closeGlossary();expect(cached().ok).toBe(true);game.openPractice();expect(cached().ok).toBe(false);game.closePractice();expect(cached().ok).toBe(true);
    game.setSgfOverlayOpen("backup",true);game.setSgfOverlayOpen("feedback",true);game.setSgfOverlayOpen("backup",false);expect(cached().ok).toBe(false);game.setSgfOverlayOpen("feedback",false);expect(cached().ok).toBe(true);
  });
  it("rejects cached exports after new game and review entry/exit but accepts seeking",async()=>{
    save();let game=await mount();const playExport=game.exportSgf;expect(game.startReview()).toBe(true);expect(playExport().ok).toBe(false);game=render();const reviewExport=game.exportSgf,whole=content(game),context=game.sgfContext;
    for(const index of [0,1,2]){game.seekReview(index);expect(reviewExport()).toMatchObject({ok:true,content:whole});game=render();expect(game.reviewIndex).toBe(index);expect(game.sgfContext).toBe(context);expect(content(game)).toBe(whole);}
    game.endReview();expect(reviewExport().ok).toBe(false);game=render();const old=game.exportSgf;game.newGame();expect(old().ok).toBe(false);expect(render().sgfContext).not.toBe(context);
  });
  it.each(["play", "scoring"] as const)("rejects a cached review export when the active match tab exits review in %s", async mode => {
    const source = mode === "play" ? board() : passTurn(passTurn(board()));
    save(source, mode === "scoring" ? "final" : undefined);
    let game = await mount();
    const originalMatch = game.matchState;
    const whole = content(game);
    expect(game.startReview()).toBe(true);
    game = render();
    game.seekReview(0);
    game = render();
    const cachedReviewExport = game.exportSgf;
    expect(cachedReviewExport()).toMatchObject({ok:true,content:whole});

    // Clicking the already-active match tab clears review without a new match generation.
    game.startPlay();
    expect(cachedReviewExport()).toMatchObject({ok:false,error:expect.stringContaining("状态已变化")});
    game = render();
    expect(game.reviewing).toBe(false);
    expect(game.mode).toBe(mode);
    expect(game.matchState).toBe(originalMatch);
    expect(content(game)).toBe(whole);
    expect(cachedReviewExport().ok).toBe(false);
  });
  it.each(["dead-stones","score-review"] as const)("blocks %s normally but reviews the whole pending record without RE",async phase=>{
    save(passTurn(passTurn(board())),phase);let game=await mount();expect(game.exportSgf().ok).toBe(false);expect(game.startReview()).toBe(true);game=render();expect(content(game)).not.toContain("RE[");game.seekReview(0);expect(content(game)).not.toContain("RE[");
  });
  it.each([false,true])("exports the confirmed area result using current dead stones (black wins %s)",async black=>{
    const start=black?createGame({size:9,stones:[["black",2,2]]}):board();const state=passTurn(passTurn(start));save(state,"final",null,black?[]:["2,2"]);let game=await mount();const score=scoreArea(state.board,new Set(black?[]:["2,2"]));expect(content(game)).toContain(`RE[${score.winner==="black"?"B":"W"}+${score.margin}]`);if(!black)expect(content(game)).toContain("MA[cc]");
    game.startUnit("s1-intersections-turns");game=render();expect(game.exportSgf().ok).toBe(false);
  });
  it("exports known zero-move resignation and invalidates the earlier callback",async()=>{
    save(createGame({size:9}));let game=await mount();const old=game.exportSgf;game.resign();expect(old().ok).toBe(false);game=render();expect(content(game)).toContain("RE[W+R]");expect(game.exportSgf()).toMatchObject({moves:0});
  });
  it("does not infer a resignation from arbitrary outcome text",async()=>{
    save(passTurn(passTurn(board())),"final","白方获胜，黑方认输");const game=await mount();expect(content(game)).not.toContain("RE[W+R]");
  });
  it("blocks a synchronous human move before a later render",async()=>{save();const game=await mount(),cached=game.exportSgf;void game.play({x:3,y:3});expect(cached().ok).toBe(false);await Promise.resolve();});
});
