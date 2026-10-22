import { describe, expect, it } from "vitest";
import { groupAt } from "@/lib/go/analysis";
import { hashBoard, playMove } from "@/lib/go/rules";
import type { Point } from "@/lib/go/types";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { TACTICAL_SEQUENCES, canStartTacticalSequence, type TacticalSequence } from "@/lib/learning/tactical-sequences";
import { applyTacticalEvent, createTacticalSession, type TacticalEvent, type TacticalSession } from "@/lib/learning/tactical-session";

const net = () => structuredClone(TACTICAL_SEQUENCES.find(s => s.id === "net")!);
const snapback = () => structuredClone(TACTICAL_SEQUENCES.find(s => s.id === "snapback")!);
const event = (s: TacticalSession, action: {kind:"move";point:Point}|{kind:"reply";branchId:string}|{kind:"hint"}): TacticalEvent => ({ sessionId:s.sessionId, scenarioId:s.scenarioId, revision:s.revision, phase:s.phase, ...action });
const move = (s: TacticalSession, point: Point) => applyTacticalEvent(s, event(s, {kind:"move", point}));
const reply = (s: TacticalSession, branchId: string) => applyTacticalEvent(s, event(s, {kind:"reply", branchId}));
const hint = (s: TacticalSession) => applyTacticalEvent(s, event(s, {kind:"hint"}));
function freeze<T>(v:T):T { if(v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

describe("real tactical sequence routes", () => {
  for (const direction of ["right", "down"] as const) it(`replays the entire net ${direction} route with actual captures and preserved history`, () => {
    const scenario = freeze(net());
    const s0 = createTacticalSession(scenario, "net-test")!;
    expect(s0).not.toBeNull();
    expect(s0.phase).toBe("first");
    expect(s0.game.toPlay).toBe("black");
    const s1 = move(freeze(s0), {x:4,y:4});
    expect(s1.phase).toBe("reply");
    expect(s1.facts.target?.stones).toHaveLength(1);
    expect(s1.facts.target?.liberties).toHaveLength(2);
    expect(s1.facts.captureDelta).toEqual({black:0,white:0});
    expect(s1.game.toPlay).toBe("white");
    const branch = scenario.branches.find(b => b.id === direction)!;
    const s2 = reply(freeze(s1), branch.id);
    expect(s2.phase).toBe("second");
    expect(s2.selectedBranchId).toBe(direction);
    expect(s2.game.toPlay).toBe("black");
    expect(s2.facts.target?.stones).toHaveLength(2);
    expect(s2.facts.target?.liberties).toEqual([branch.second]);
    const target = s2.facts.target!.stones;
    const s3 = move(freeze(s2), branch.second);
    expect(s3.phase).toBe("complete");
    expect(s3.game.toPlay).toBe("white");
    expect(s3.facts.target).toBeNull();
    expect(s3.facts.captureDelta).toEqual({black:2,white:0});
    target.forEach(p => expect(s3.game.board[p.y][p.x]).toBeNull());
    expect(s3.game.captures).toEqual({black:2,white:0});
    expect(s3.game.moves).toEqual([scenario.first,branch.reply,branch.second]);
    expect(s3.game.past).toHaveLength(3);
    expect(s3.game.history).toEqual([s0,s1,s2,s3].map(s => hashBoard(s.game.board)));
    expect(s3.game.past.map(s => s.board)).toEqual([s0,s1,s2].map(s => s.game.board));
    expect(s3.actions.map(a => a.phase)).toEqual(["first","reply","second"]);
    expect(s3.actions.at(-1)?.facts).toEqual(s3.facts);
    expect(scenario).toEqual(net());
  });

  it("invests one black stone, loses it, then legally recaptures three without losing the other white group", () => {
    const scenario = snapback();
    const s0 = createTacticalSession(scenario,"snap-test")!;
    const s1 = move(freeze(s0),scenario.first);
    expect(s1.facts.captureDelta).toEqual({black:0,white:0});
    expect(groupAt(s1.game.board,7,scenario.first)?.liberties).toEqual([{x:0,y:1}]);
    const s2 = reply(freeze(s1),scenario.branches[0].id);
    expect(s2.facts.captureDelta).toEqual({black:0,white:1});
    expect(s2.game.board[2][0]).toBeNull();
    expect(s2.facts.target?.stones).toHaveLength(3);
    expect(s2.facts.target?.liberties).toEqual([{x:0,y:2}]);
    expect(playMove(s2.game,scenario.branches[0].second).ok).toBe(true);
    const s3 = move(freeze(s2),scenario.branches[0].second);
    expect(s3.phase).toBe("complete");
    expect(s3.facts.captureDelta).toEqual({black:3,white:0});
    expect(s3.game.captures).toEqual({black:3,white:1});
    s2.facts.target!.stones.forEach(p => expect(s3.game.board[p.y][p.x]).toBeNull());
    expect(s3.game.board[3][0]).toBe("white");
    expect(s3.game.board[4][0]).toBe("white");
    expect(s3.game.toPlay).toBe("white");
    expect(s3.game.history).toEqual([s0,s1,s2,s3].map(s => hashBoard(s.game.board)));
    expect(s3.game.moves).toEqual([scenario.first,scenario.branches[0].reply,scenario.branches[0].second]);
    expect(s3.game.past).toHaveLength(3);
  });
});

describe("content validation", () => {
  it.each([
    (s:TacticalSequence) => { s.initial.size = 9; },
    (s:TacticalSequence) => { s.initial.toPlay = "white"; },
    (s:TacticalSequence) => { s.initial.stones.push(["black",7,0]); },
    (s:TacticalSequence) => { s.initial.stones.push(["black",3,3]); },
    (s:TacticalSequence) => { s.initial.stones.push(["white",3,3]); },
    (s:TacticalSequence) => { s.initial.stones[0][0] = "purple" as "white"; },
    (s:TacticalSequence) => { s.target = {x:0,y:0}; },
    (s:TacticalSequence) => { s.first = {x:0,y:0}; },
    (s:TacticalSequence) => { s.branches[1].second = {x:0,y:0}; },
    (s:TacticalSequence) => { s.branches[1].reply = {x:0,y:0}; },
    (s:TacticalSequence) => { s.branches[1].id = s.branches[0].id; },
    (s:TacticalSequence) => { s.branches = []; },
    (s:TacticalSequence) => { s.firstHints = [] as unknown as TacticalSequence["firstHints"]; },
    (s:TacticalSequence) => { s.initial.setupMoves = [{pass:true},{pass:true}]; },
    (s:TacticalSequence) => { s.unitId = "s2-snapback"; },
  ])("rejects corrupted content before starting, including any broken unselected branch", mutate => {
    const scenario=net(); mutate(scenario);
    expect(createTacticalSession(freeze(scenario),"bad")).toBeNull();
  });

  it.each([null,undefined,{}, {initial:null}, {id:"net",branches:null}])("rejects malformed content safely", scenario => {
    expect(() => createTacticalSession(scenario,"bad")).not.toThrow();
    expect(createTacticalSession(scenario,"bad")).toBeNull();
  });

  it("rejects empty identity and detaches the accepted session from mutable content", () => {
    const scenario=net();
    expect(createTacticalSession(scenario,"")).toBeNull();
    const session=createTacticalSession(scenario,"original")!;
    scenario.first.x=0;
    scenario.initial.stones[0][1]=0;
    expect(move(session,{x:4,y:4}).phase).toBe("reply");
    expect(session.scenario.first).toEqual({x:4,y:4});
    expect(session.game.board[3][3]).toBe("white");
  });

  it("rejects sparse hint arrays rather than accepting missing hint text", () => {
    const scenario=net();
    scenario.firstHints=new Array(3) as TacticalSequence["firstHints"];
    expect(createTacticalSession(scenario,"sparse")).toBeNull();
  });
});

describe("event and hint boundaries", () => {
  it("reports legal off-route neutrally without executing it", () => {
    const s=createTacticalSession(net(),"errors")!;
    const next=move(freeze(s),{x:0,y:0});
    expect(next.feedback?.message).toBe("这手合法，但不在本次示范路线中");
    expect(next.feedback?.kind).toBe("off-route");
    expect(next.game).toBe(s.game);
    expect(next.phase).toBe(s.phase);
    expect(next.actions).toBe(s.actions);
    expect(next.revision).toBe(s.revision+1);
  });

  it.each([
    [{x:3,y:3},"occupied"], [{x:-1,y:0},"out_of_bounds"], [{x:1.5,y:0},"out_of_bounds"],
  ] as const)("reports actual illegal point %j with %s", (point,reason) => {
    const s=createTacticalSession(net(),"illegal")!;
    const next=move(freeze(s),point);
    expect(next.feedback?.kind).toBe("illegal");
    expect(next.feedback?.reason).toBe(reason);
    expect(next.feedback?.message).not.toBe("这手合法，但不在本次示范路线中");
    expect(next.game).toBe(s.game);
  });

  it("uses the actual engine for suicide and repetition explanations", () => {
    const s=createTacticalSession(net(),"engine")!;
    // An independently constructed state keeps this error-path test separate from content validation.
    const suicide=structuredClone(s);
    suicide.game.board[0][1]="white"; suicide.game.board[1][0]="white";
    expect(move(freeze(suicide),{x:0,y:0}).feedback?.reason).toBe("suicide");
    const repeated=structuredClone(s);
    const legal=playMove(repeated.game,{x:0,y:0});
    expect(legal.ok).toBe(true);
    if(legal.ok) repeated.game.history.push(hashBoard(legal.state.board));
    expect(move(freeze(repeated),{x:0,y:0}).feedback?.reason).toBe("ko");
  });

  it("detaches accepted moves from mutable caller event points", () => {
    const s=createTacticalSession(net(),"point")!;
    const played={x:4,y:4};
    const next=move(s,played);
    played.x=0;
    expect(next.game.moves[0]).toEqual({x:4,y:4});
    expect(next.actions[0].point).toEqual({x:4,y:4});
  });

  it("rejects wrong identity, revision, phase, reply, and actions after completion", () => {
    const s=createTacticalSession(net(),"guard")!;
    const first=event(s,{kind:"move",point:{x:4,y:4}});
    for(const change of [{sessionId:"old"},{scenarioId:"snapback"},{revision:4},{phase:"second" as const}]) {
      expect(applyTacticalEvent(freeze(s),{...first,...change})).toBe(s);
    }
    expect(reply(s,"right")).toBe(s);
    const s1=applyTacticalEvent(s,first);
    expect(applyTacticalEvent(s1,first)).toBe(s1);
    expect(move(s1,{x:3,y:4})).toBe(s1);
    expect(reply(s1,"missing")).toBe(s1);
    const re=event(s1,{kind:"reply",branchId:"right"});
    const s2=applyTacticalEvent(s1,re);
    expect(applyTacticalEvent(s2,re)).toBe(s2);
    const s3=move(s2,{x:3,y:4});
    expect(move(s3,{x:0,y:0})).toBe(s3);
    expect(reply(s3,"right")).toBe(s3);
    expect(hint(s3)).toBe(s3);
    const reset=createTacticalSession(net(),"new")!;
    expect(applyTacticalEvent(reset,first)).toBe(reset);
  });

  it("reveals at most three hints per learner stage and a fresh session resets them", () => {
    let s=createTacticalSession(net(),"hints")!;
    const game=s.game;
    const oldHint=event(s,{kind:"hint"});
    s=applyTacticalEvent(freeze(s),oldHint);
    expect(s.hints).toEqual({first:1,second:0});
    expect(applyTacticalEvent(s,oldHint)).toBe(s);
    s=hint(hint(s));
    expect(s.hints.first).toBe(3);
    expect(hint(s)).toBe(s);
    expect(s.game).toBe(game);
    expect(s.actions).toHaveLength(0);
    s=move(s,{x:4,y:4});
    expect(hint(s)).toBe(s);
    s=reply(s,"down");
    expect(hint(s).hints).toEqual({first:3,second:1});
    expect(createTacticalSession(net(),"reset")?.hints).toEqual({first:0,second:0});
  });
});

describe("unlock boundary", () => {
  it("requires both corresponding completion and current lesson unlock conditions", () => {
    const progress=createDefaultProgress();
    const before=structuredClone(progress);
    expect(canStartTacticalSequence(net(),freeze(progress))).toBe(false);
    expect(progress).toEqual(before);
    const forged=createDefaultProgress(); forged.completedUnitIds=["s2-net","s2-ladder"];
    expect(canStartTacticalSequence(net(),forged)).toBe(false);
    const unlocked=createDefaultProgress();
    unlocked.completedUnitIds=[...LESSON_UNIT_IDS.slice(0,LESSON_UNIT_IDS.indexOf("s2-net"))];
    unlocked.bestQuizScores["stage-1"]=80;
    expect(canStartTacticalSequence(net(),unlocked)).toBe(false);
    unlocked.completedUnitIds.push("s2-net");
    expect(canStartTacticalSequence(net(),unlocked)).toBe(true);
    expect(canStartTacticalSequence(snapback(),unlocked)).toBe(false);
    unlocked.completedUnitIds.push("s2-snapback");
    expect(canStartTacticalSequence(snapback(),unlocked)).toBe(true);
  });
});
