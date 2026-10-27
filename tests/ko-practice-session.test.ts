import { KO_PRACTICE_SCENARIO } from "@/lib/learning/ko-practice";
import { expect, it } from "vitest";
import { createKoPracticeSession, applyKoPracticeEvent, type KoPracticeSession, type KoPracticeEvent } from "@/lib/learning/ko-practice-session";
const send = (s: KoPracticeSession, action: Omit<KoPracticeEvent,"sessionId"|"scenarioId"|"revision"|"phase">) => applyKoPracticeEvent(s, {...action,sessionId:s.sessionId,scenarioId:s.scenarioId,revision:s.revision,phase:s.phase} as KoPracticeEvent);
it.each(["answer", "fill"])("executes real %s route and keeps probes read only", branchId => {
 let s = createKoPracticeSession("test")!;
 expect(s.facts.corner?.stones).toHaveLength(2);
 expect(s.facts.corner?.liberties).toHaveLength(2);
 s=send(s,{kind:"start"}); const before=s.game;
 s=send(s,{kind:"move",point:{x:2,y:2}} as KoPracticeEvent);
 expect(s.phase).toBe("probe-done");expect(s.game).toBe(before);expect(s.feedback?.reason).toBe("ko");
 s=send(s,{kind:"continue"});s=send(s,{kind:"move",point:{x:1,y:1}} as KoPracticeEvent);
 expect(s.facts.corner?.liberties).toEqual([{x:0,y:2}]);
 s=send(s,{kind:"reply",branchId} as KoPracticeEvent);
 if(branchId==="answer") {expect(s.facts.corner?.stones).toHaveLength(4);expect(s.facts.corner?.liberties).toHaveLength(3);}
 s=send(s,{kind:"move",point:branchId==="answer"?{x:2,y:2}:{x:0,y:2}} as KoPracticeEvent);
 expect(s.phase).toBe("complete");expect(s.actions).toHaveLength(4);expect(s.game.moves).toHaveLength(4);
 expect(s.facts.captureDelta.white).toBe(branchId==="answer"?1:2);
 if(branchId==="answer") {const game=s.game;s=send(s,{kind:"probe-black"});expect(s.game).toBe(game);expect(s.feedback?.reason).toBe("ko");}
});

function freeze<T>(v:T):T {if(v && typeof v==="object"){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
it("rejects blank ids and altered setup shapes",()=>{
 expect(createKoPracticeSession(" ")).toBeNull();
 const s=createKoPracticeSession("s")!.scenario;
 const bad=structuredClone(s);bad.initial.stones.push([...bad.initial.stones[0]]);
 expect(createKoPracticeSession("s",bad)).toBeNull();
 expect(createKoPracticeSession("s",{...s,initial:{...s.initial,size:7}})).toBeNull();
});
it("rejects stale, repeated, wrong-phase, and invalid branches by identity",()=>{
 const s=freeze(createKoPracticeSession("s")!);const e={kind:"start" as const,sessionId:s.sessionId,scenarioId:s.scenarioId,revision:0,phase:s.phase};
 const next=applyKoPracticeEvent(s,e);expect(applyKoPracticeEvent(next,e)).toBe(next);
 expect(send(s,{kind:"continue"})).toBe(s);
 expect(send(s,{kind:"reply",branchId:"bad"} as KoPracticeEvent)).toBe(s);
 expect(send(s,{kind:"probe-black"})).toBe(s);
 expect(s.game.moves).toHaveLength(0);
});
it.each(["board","history","past","toPlay","captures","facts","scenario"])("fails closed on corrupted %s",key=>{
 let s=send(createKoPracticeSession("s")!,{kind:"start"});s=structuredClone(s);
 if(key==="board")s.game.board[4][4]="black";
 if(key==="history")s.game.history[0]="forged";
 if(key==="past")s.game.past[0].board[4][4]="white";
 if(key==="toPlay")s.game.toPlay="black";
 if(key==="captures")s.game.captures.black=99;
 if(key==="facts")s.facts.captureDelta.black=99;
 if(key==="scenario")s.scenario.initial.stones.push(["white",4,4]);
 expect(send(freeze(s),{kind:"move",point:{x:2,y:2}} as KoPracticeEvent)).toBe(s);
});
it("keeps non-target probes on the probe step with actual illegal or legal feedback",()=>{
 let s=send(createKoPracticeSession("s")!,{kind:"start"});const game=s.game;
 s=send(freeze(s),{kind:"move",point:{x:4,y:4}} as KoPracticeEvent);
 expect(s.phase).toBe("probe");expect(s.feedback?.kind).toBe("off-route");expect(s.game).toBe(game);
 s=send(s,{kind:"move",point:{x:3,y:2}} as KoPracticeEvent);
 expect(s.feedback?.reason).toBe("occupied");expect(s.stats.threat.extraAttempts).toBe(0);
});
it("caps hints and counts unsuccessful learner attempts once without committing moves",()=>{
 let s=send(createKoPracticeSession("s")!,{kind:"start"});s=send(s,{kind:"move",point:{x:2,y:2}} as KoPracticeEvent);s=send(s,{kind:"continue"});
 const game=s.game;
 for(let i=0;i<3;i++)s=send(freeze(s),{kind:"hint"});
 expect(s.hints.threat).toBe(3);expect(s.stats.threat.usedHint).toBe(true);expect(send(s,{kind:"hint"})).toBe(s);
 s=send(s,{kind:"move",point:{x:4,y:4}} as KoPracticeEvent);expect(s.feedback?.kind).toBe("off-route");
 s=send(s,{kind:"move",point:{x:3,y:2}} as KoPracticeEvent);expect(s.feedback?.reason).toBe("occupied");
 expect(s.stats.threat.extraAttempts).toBe(2);expect(s.game).toBe(game);
 s=send(s,{kind:"move",point:{x:1,y:1}} as KoPracticeEvent);expect(send(s,{kind:"reply",branchId:"bad"} as KoPracticeEvent)).toBe(s);
 s=send(s,{kind:"reply",branchId:"fill"} as KoPracticeEvent);const before=s.game;
 s=send(s,{kind:"move",point:{x:2,y:2}} as KoPracticeEvent);expect(s.feedback?.reason).toBe("occupied");expect(s.stats.followUp.extraAttempts).toBe(1);expect(s.game).toBe(before);
 s=send(s,{kind:"hint"});expect(s.stats.followUp.usedHint).toBe(true);
});
it("rejects a forged scenario identity even when the event matches it",()=>{
 const s=createKoPracticeSession("s")!;Object.assign(s,{scenarioId:"other"});
 expect(send(s,{kind:"start"})).toBe(s);
});
it("clones scenario data for each session and preserves real captures and complete histories",()=>{
 for(const branchId of ["answer","fill"]){let s=createKoPracticeSession(branchId)!;const initial=s.game;
  const other=createKoPracticeSession("other")!;expect(s.scenario).not.toBe(other.scenario);expect(s.scenario.initial.stones).not.toBe(other.scenario.initial.stones);
  s=send(s,{kind:"start"});s=send(s,{kind:"move",point:{x:2,y:2}} as KoPracticeEvent);s=send(s,{kind:"continue"});s=send(s,{kind:"move",point:{x:1,y:1}} as KoPracticeEvent);s=send(s,{kind:"reply",branchId} as KoPracticeEvent);
  const before=structuredClone(s.game.board);
  s=send(freeze(s),{kind:"move",point:branchId==="answer"?{x:2,y:2}:{x:0,y:2}} as KoPracticeEvent);
  const removed=[];for(let y=0;y<5;y++)for(let x=0;x<5;x++)if(before[y][x]==="black" && s.game.board[y][x]!=="black")removed.push({x,y});
  expect(removed).toEqual(branchId==="answer"?[{x:3,y:2}]:[{x:0,y:0},{x:0,y:1}]);
  expect(s.game.history).toHaveLength(5);expect(s.game.past).toHaveLength(4);expect(s.game.past[0].board).toEqual(initial.board);
  if(branchId==="fill"){expect(s.game.board[2][2]).toBe("black");expect(send(s,{kind:"probe-black"})).toBe(s);}
 }
});

it("rejects invalid shapes even after the public scenario export is altered",()=>{
 const original=structuredClone(KO_PRACTICE_SCENARIO);
 try {
  KO_PRACTICE_SCENARIO.initial.stones.push([...KO_PRACTICE_SCENARIO.initial.stones[0]]);
  expect(createKoPracticeSession("bad")).toBeNull();
 } finally {Object.assign(KO_PRACTICE_SCENARIO,original);}
 const shapes:unknown[]=[{...original,branches:[...original.branches].reverse()}, {...original,branches:[{...original.branches[0],id:"bad"},original.branches[1]]}, {...original,initial:{...original.initial,stones:[...original.initial.stones,["white",5,0]]}}];
 for(const shape of shapes)expect(createKoPracticeSession("bad",shape)).toBeNull();
});
it.each([
 ["missing hints",(s:KoPracticeSession)=>{Reflect.deleteProperty(s,"hints");}],
 ["null hints",(s:KoPracticeSession)=>{Object.assign(s,{hints:null});}],
 ["negative hint",(s:KoPracticeSession)=>{s.hints.threat=-1;}],
 ["fractional hint",(s:KoPracticeSession)=>{s.hints.followUp=0.5;}],
 ["infinite hint",(s:KoPracticeSession)=>{s.hints.threat=Infinity;}],
 ["excess hint",(s:KoPracticeSession)=>{s.hints.threat=4;}],
 ["missing stats",(s:KoPracticeSession)=>{Reflect.deleteProperty(s,"stats");}],
 ["null stats",(s:KoPracticeSession)=>{Object.assign(s,{stats:null});}],
 ["null stage stats",(s:KoPracticeSession)=>{Object.assign(s.stats,{threat:null});}],
 ["missing stage stats",(s:KoPracticeSession)=>{Reflect.deleteProperty(s.stats,"followUp");}],
 ["nonboolean usedHint",(s:KoPracticeSession)=>{Object.assign(s.stats.threat,{usedHint:1});}],
 ["negative attempts",(s:KoPracticeSession)=>{s.stats.threat.extraAttempts=-1;}],
 ["fractional attempts",(s:KoPracticeSession)=>{s.stats.followUp.extraAttempts=0.5;}],
 ["NaN attempts",(s:KoPracticeSession)=>{s.stats.threat.extraAttempts=NaN;}],
 ["infinite attempts",(s:KoPracticeSession)=>{s.stats.threat.extraAttempts=Infinity;}],
 ["missing attempts",(s:KoPracticeSession)=>{Reflect.deleteProperty(s.stats.threat,"extraAttempts");}],
 ["hint count without usage",(s:KoPracticeSession)=>{s.hints.threat=1;}],
 ["usage without hint count",(s:KoPracticeSession)=>{s.stats.threat.usedHint=true;}],
] as const)("fails closed for malformed assistance state: %s",(_name,corrupt)=>{
 let s=send(createKoPracticeSession("corrupt-assists")!,{kind:"start"});
 s=send(s,{kind:"move",point:{x:2,y:2}} as KoPracticeEvent);s=send(s,{kind:"continue"});
 corrupt(s);freeze(s);
 expect(send(s,{kind:"hint"})).toBe(s);
 expect(send(s,{kind:"move",point:{x:4,y:4}} as KoPracticeEvent)).toBe(s);
});
