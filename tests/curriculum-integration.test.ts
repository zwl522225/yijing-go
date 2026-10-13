import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoGame } from "@/hooks/use-go-game";
import { useWebMcp } from "@/hooks/use-webmcp";
import type { SoundscapeController } from "@/hooks/use-soundscape";
import { completeUnit, createDefaultProgress, isGraduated, recordQuizScore } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS, TERM_IDS } from "@/lib/learning/types";
import { createGame, passTurn } from "@/lib/go/rules";
import { decodeSave, encodeSave, SAVE_KEY, type SaveData } from "@/lib/go/storage";

const host=vi.hoisted(()=>({values:[] as unknown[],refs:[] as {current:unknown}[],deps:[] as (unknown[]|undefined)[],pending:[] as (()=>unknown)[],cursor:0,refCursor:0,effectCursor:0}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState(initial:unknown) {const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;
    return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function"?(next as (v:unknown)=>unknown)(host.values[i]):next;}];},
  useRef(value:unknown) {const i=host.refCursor++;return host.refs[i]??(host.refs[i]={current:value});},
  useCallback:(fn:unknown)=>fn,
  useEffect(fn:()=>unknown,deps?:unknown[]) {const i=host.effectCursor++;if(!host.deps[i]||!deps||deps.some((d,j)=>d!==host.deps[i]![j]))host.pending.push(fn);host.deps[i]=deps;},
}));
function useTestGame() { return useGoGame({volume:.5,category:"pop",restore(){}}); }
function useTestWebGame() {
  const game=useGoGame({volume:.5,category:"pop",restore(){}});
  useWebMcp(game,{category:"pop",setCategory:vi.fn(),play:vi.fn(),pause:vi.fn()} as unknown as SoundscapeController);
  return game;
}
function render(web=false) {host.cursor=host.refCursor=host.effectCursor=0;const hook=web?useTestWebGame:useTestGame;return hook();}
function effects() {const pending=host.pending;host.pending=[];for(const effect of pending)effect();}
function ready() {
  let progress=createDefaultProgress();
  for(const id of LESSON_UNIT_IDS.slice(0,-1)) progress=id==="s1-checkpoint"?recordQuizScore(progress,"stage-1",80,[]):id==="s2-checkpoint"?recordQuizScore(progress,"stage-2",80,[]):completeUnit(progress,id);
  return progress;
}
const saves=new Map<string,string>();
beforeEach(()=>{
  host.values=[];host.refs=[];host.deps=[];host.pending=[];saves.clear();
  vi.stubGlobal("localStorage",{getItem:(key:string)=>saves.get(key)??null,setItem:(key:string,value:string)=>saves.set(key,value),removeItem:(key:string)=>saves.delete(key)});
  vi.stubGlobal("Worker",undefined);
});
afterEach(()=>vi.unstubAllGlobals());
async function hydrate(saved:SaveData,web=false) {saves.set(SAVE_KEY,encodeSave(saved));render(web);effects();await Promise.resolve();return render(web);}
function fixture():SaveData {
  const learning=ready(); learning.graduation={completedNineLineGame:true,enteredScoring:true,confirmedDeadStones:false,finalizedScore:false};
  return {game:passTurn(passTurn(createGame({size:9,stones:[["black",0,0],["black",1,0],["white",8,8]]}))),learning,difficulty:"beginner",volume:.5,category:"pop",
    scoring:{phase:"dead-stones",deadStones:[],outcome:null,graduationEligible:true}};
}
describe("course, glossary and restored scoring integration",()=>{
  it("restores dead-stone review, marks connected groups without mutating the board and persists explicit confirmation",async()=>{
    let game=await hydrate(fixture());
    const board=structuredClone(game.matchState.board);
    game.toggleDeadStone({x:0,y:0});game=render();
    expect(game.deadStones).toEqual(new Set(["0,0","1,0"]));expect(game.matchState.board).toEqual(board);
    game.confirmDeadStones();game=render();effects();
    const saved=decodeSave(saves.get(SAVE_KEY)!)!;
    expect(saved.scoring?.phase).toBe("score-review");expect(saved.learning.graduation.confirmedDeadStones).toBe(true);
    expect(saved.learning.graduation.finalizedScore).toBe(false);
    game.toggleDeadStone({x:8,y:8});expect(render().deadStones).toEqual(new Set(["0,0","1,0"]));
    host.values=[];host.refs=[];host.deps=[];host.pending=[];
    game=await hydrate(saved);expect(game.scorePhase).toBe("score-review");expect(isGraduated(game.learningProgress)).toBe(false);
    expect(game.confirmFinalScore()).toBe(true);expect(isGraduated(render().learningProgress)).toBe(true);
  });
  it("restores terminal matches and phases without fabricating graduation events",async()=>{
    const saved=fixture();saved.learning.graduation={completedNineLineGame:false,enteredScoring:false,confirmedDeadStones:false,finalizedScore:false};
    saved.scoring!.phase="final";
    const game=await hydrate(saved);expect(game.mode).toBe("scoring");expect(game.scorePhase).toBe("final");
    expect(Object.values(game.learningProgress.graduation)).toEqual([false,false,false,false]);expect(isGraduated(game.learningProgress)).toBe(false);
  });
  it("rejects stale group geometry after beginning another match",async()=>{
    let game=await hydrate(fixture());const oldToggle=game.toggleDeadStone;
    game.startNewGame(9);game=render();await game.play({x:0,y:0});game=render();game.pass();await Promise.resolve();game=render();
    oldToggle({x:0,y:0});game=render();
    expect(game.deadStones).toEqual(new Set(["0,0"]));
    expect(game.matchState.board[0][1]).not.toBe("black");
  });
  it("publishes the two strict current tools, rejects locked units and records lookup only as seen",()=>{
    const tools=new Map<string,WebMcpTool>();
    vi.stubGlobal("document",{modelContext:{registerTool(tool:WebMcpTool,{signal}:{signal:AbortSignal}){tools.set(tool.name,tool);signal.addEventListener("abort",()=>tools.delete(tool.name));}}});
    let game=render(true);effects();
    expect(tools.has("start_go_lesson")).toBe(false);
    const unit=tools.get("open_go_learning_unit")!;const term=tools.get("open_go_glossary_term")!;
    expect((unit.inputSchema.properties as Record<string,{enum:string[]}>).unitId.enum).toEqual([...LESSON_UNIT_IDS]);
    expect((term.inputSchema.properties as Record<string,{enum:string[]}>).termId.enum).toEqual([...TERM_IDS]);
    expect(()=>unit.execute({unitId:"s2-two-eyes"})).toThrow("尚未解锁");
    expect(render().learningSession.unit.id).toBe("s1-intersections-turns");
    expect(term.execute({termId:"liberty"})).toEqual({accepted:true,termId:"liberty"});
    game=render();expect(game.learningProgress.termStates.liberty).toBe("seen");expect(game.learningProgress.completedUnitIds).toEqual([]);
    expect(unit.execute({unitId:"s1-intersections-turns"})).toEqual({accepted:true,unitId:"s1-intersections-turns"});
    expect(render().learningProgress.completedUnitIds).toEqual([]);
  });
  it("rejects glossary lookup during an active quiz but accepts normal play with quiz memory",async()=>{
    const tools=new Map<string,WebMcpTool>();vi.stubGlobal("document",{modelContext:{registerTool(tool:WebMcpTool){tools.set(tool.name,tool);}}});
    const saved=fixture();let game=await hydrate(saved,true);effects();
    game.startUnit("s1-checkpoint");game=render(true);effects();
    expect(()=>tools.get("open_go_glossary_term")!.execute({termId:"liberty"})).toThrow("阶段测验");
    const before=structuredClone(game.learningProgress);game.startNewGame(9);game=render(true);effects();
    expect(tools.get("open_go_glossary_term")!.execute({termId:"liberty"})).toEqual({accepted:true,termId:"liberty"});
    expect(render().learningProgress.completedUnitIds).toEqual(before.completedUnitIds);
  });
});
