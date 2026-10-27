import { groupAt } from "@/lib/go/analysis";
import { hashBoard, playMove } from "@/lib/go/rules";
import type { GameState, MoveError, Point } from "@/lib/go/types";
import { createPosition, isPointOnBoard } from "@/lib/learning/positions";
import { KO_PRACTICE_SCENARIO, type KoPracticeScenario } from "@/lib/learning/ko-practice";
export type KoPracticePhase = "ready"|"probe"|"probe-done"|"threat"|"reply"|"follow-up"|"complete";
export type KoPracticeFacts = ReturnType<typeof factsFor>;
export type KoPracticeSession = {
 sessionId:string;scenarioId:"ko";revision:number;phase:KoPracticePhase;scenario:KoPracticeScenario;game:GameState;
 branchId:"answer"|"fill"|null;actions:{actor:GameState["toPlay"];point:Point}[];
 feedback:{kind:"step"|"illegal"|"off-route"|"hint";message:string;reason?:MoveError}|null;
 facts:KoPracticeFacts;hints:{threat:number;followUp:number};stats:Record<"threat"|"followUp",{usedHint:boolean;extraAttempts:number}>;
};
type Action = {kind:"start"|"continue"|"hint"|"probe-black"}|{kind:"move";point:Point}|{kind:"reply";branchId:string};
export type KoPracticeEvent = {sessionId:string;scenarioId:string;revision:number;phase:KoPracticePhase}&Action;
const trustedScenario = structuredClone(KO_PRACTICE_SCENARIO);
const equal = (a:unknown,b:unknown) => JSON.stringify(a)===JSON.stringify(b);
const same = (a:Point,b:Point) => a.x===b.x && a.y===b.y;
function factsFor(game:GameState,s:KoPracticeScenario,previous=game) {
 return {corner:groupAt(game.board,game.size,s.cornerTarget),ko:groupAt(game.board,game.size,s.capture),captures:{...game.captures},captureDelta:{black:game.captures.black-previous.captures.black,white:game.captures.white-previous.captures.white}};
}
function step(game:GameState,p:Point):GameState {const r=playMove(game,p);if(!r.ok)throw new Error(r.reason);return r.state;}
function validatedScenario(value:unknown):KoPracticeScenario {
 // This exercise has one fixed, versioned route. Reject altered shapes, duplicate setup and untrusted text alike.
 if(!equal(value,trustedScenario))throw new Error("invalid scenario");
 const s=structuredClone(value) as KoPracticeScenario;
 const initial=createPosition(s.initial);const corner=groupAt(initial.board,5,s.cornerTarget);
 if(corner?.stones.length!==2 || corner.liberties.length!==2)throw new Error("corner");
 const capture=step(initial,s.capture);const probe=playMove(capture,s.recapture);
 if(capture.captures.black!==1 || probe.ok || probe.reason!=="ko")throw new Error("ko");
 const threat=step(capture,s.threat);const threatened=groupAt(threat.board,5,s.cornerTarget);
 if(threatened?.stones.length!==2 || threatened.liberties.length!==1 || !same(threatened.liberties[0],{x:0,y:2}))throw new Error("threat");
 for(const b of s.branches){const reply=step(threat,b.reply);const end=step(reply,b.followUp);
  if(b.id==="answer") {const corner=groupAt(reply.board,5,s.cornerTarget);const probe=playMove(end,s.capture);
   if(corner?.stones.length!==4 || corner.liberties.length!==3 || end.captures.white!==1 || hashBoard(end.board)===hashBoard(initial.board) || probe.ok || probe.reason!=="ko")throw new Error("answer");
  }else if(end.captures.white!==2 || end.board[0][0]!==null || end.board[1][0]!==null || end.board[2][2]!=="black")throw new Error("fill");
 }
 return s;
}
export function createKoPracticeSession(sessionId:string,value:unknown=KO_PRACTICE_SCENARIO):KoPracticeSession|null {
 try {if(typeof sessionId!=="string" || !sessionId.trim())return null;const scenario=validatedScenario(value);const game=createPosition(scenario.initial);
 return {sessionId,scenarioId:"ko",revision:0,phase:"ready",scenario,game,branchId:null,actions:[],feedback:null,facts:factsFor(game,scenario),hints:{threat:0,followUp:0},stats:{threat:{usedHint:false,extraAttempts:0},followUp:{usedHint:false,extraAttempts:0}}};
 }catch{return null;}
}
/** Reconstruct the only permitted route, including all historical snapshots, before explaining it. */
function intact(s:KoPracticeSession):boolean {
 try {
  for (const key of ["threat", "followUp"] as const) {
   const count = s.hints?.[key];
   const stats = s.stats?.[key];
   if (!Number.isInteger(count) || count < 0 || count > 3 || !stats ||
    typeof stats.usedHint !== "boolean" || stats.usedHint !== (count > 0) ||
    !Number.isSafeInteger(stats.extraAttempts) || stats.extraAttempts < 0) return false;
  }
  if(s.scenarioId!=="ko" || typeof s.sessionId!=="string" || !s.sessionId.trim() || !Number.isInteger(s.revision) || s.revision<0)return false;validatedScenario(s.scenario);let game=createPosition(s.scenario.initial);let previous=game;
 const branch=s.scenario.branches.find(b=>b.id===s.branchId);
 const length={ready:0,probe:1,"probe-done":1,threat:1,reply:2,"follow-up":3,complete:4}[s.phase];
 if(length===undefined || s.actions.length!==length || (length<3?s.branchId!==null:!branch))return false;
 const points=[s.scenario.capture,s.scenario.threat,branch?.reply,branch?.followUp];
 for(let i=0;i<length;i++){const p=points[i];if(!p || !equal(s.actions[i],{actor:game.toPlay,point:p}))return false;previous=game;game=step(game,p);}
 return equal(game,s.game) && equal(factsFor(game,s.scenario,previous),s.facts);
 }catch{return false;}
}
const errorMessage:Record<MoveError,string>={ko:"这手会重复之前的棋形，不能立即回提。",occupied:"这里已有棋子。",suicide:"这手没有气且不能提子，是禁入点。",out_of_bounds:"请在五路棋盘内落子。",finished:"棋局已经终局。"};
export function applyKoPracticeEvent(s:KoPracticeSession,e:KoPracticeEvent):KoPracticeSession {
 if(!e || e.sessionId!==s.sessionId || e.scenarioId!==s.scenarioId || e.revision!==s.revision || e.phase!==s.phase || !intact(s))return s;
 const update=(patch:Partial<KoPracticeSession>):KoPracticeSession=>({...s,revision:s.revision+1,...patch});
 const branch=s.scenario.branches.find(b=>b.id===s.branchId);
 if(e.kind==="continue")return s.phase==="probe-done"?update({phase:"threat",feedback:{kind:"step",message:"请白棋先在别处下劫材，观察角上黑棋的气。"}}):s;
 if(e.kind==="hint"){
  const key=s.phase==="threat"?"threat":s.phase==="follow-up"?"followUp":null;
  if(!key || s.hints[key]>=3)return s;const texts=key==="threat"?s.scenario.threatHints:branch?.followUpHints;if(!texts)return s;
  return update({hints:{...s.hints,[key]:s.hints[key]+1},stats:{...s.stats,[key]:{...s.stats[key],usedHint:true}},feedback:{kind:"hint",message:texts[s.hints[key]]}});
 }
 if(e.kind==="probe-black"){
  if(s.phase!=="complete" || s.branchId!=="answer")return s;const r=playMove(s.game,s.scenario.capture);
  return !r.ok?update({feedback:{kind:"illegal",reason:r.reason,message:errorMessage[r.reason]}}):s;
 }
 let point:Point;let phase:KoPracticePhase;let branchId=s.branchId;
 if(e.kind==="start" && s.phase==="ready"){point=s.scenario.capture;phase="probe";}
 else if(e.kind==="reply" && s.phase==="reply"){const selected=s.scenario.branches.find(b=>b.id===e.branchId);if(!selected)return s;point=selected.reply;branchId=selected.id;phase="follow-up";}
 else if(e.kind==="move" && ["probe","threat","follow-up"].includes(s.phase)){point=e.point;phase=s.phase==="probe"?"probe-done":s.phase==="threat"?"reply":"complete";}
 else return s;
 const r=isPointOnBoard(point,5)?playMove(s.game,point):{ok:false as const,reason:"out_of_bounds" as const};
 if(s.phase==="probe" && same(point??{x:-1,y:-1},s.scenario.recapture) && !r.ok && r.reason==="ko")return update({phase,feedback:{kind:"illegal",reason:"ko",message:errorMessage.ko}});
 const expected=s.phase==="ready"?s.scenario.capture:s.phase==="threat"?s.scenario.threat:s.phase==="follow-up"?branch?.followUp:s.phase==="reply"?point:undefined;
 if(!r.ok || !expected || !same(point,expected)){
  const key=s.phase==="threat"?"threat":s.phase==="follow-up"?"followUp":null;
  return update({...(key?{stats:{...s.stats,[key]:{...s.stats[key],extraAttempts:s.stats[key].extraAttempts+1}}}:{}),feedback:r.ok?{kind:"off-route",message:"这手合法，但不在本次示范路线中。"}:{kind:"illegal",reason:r.reason,message:errorMessage[r.reason]}});
 }
 const facts=factsFor(r.state,s.scenario,s.game);
 const message=phase==="probe"?"黑棋提掉一颗白子，请白棋尝试立即回提。":phase==="reply"?"角上两颗黑子现在只剩一口气。":phase==="follow-up"?(branchId==="answer"?"黑棋应劫后，角上四颗黑子有三口气。":"黑棋填劫，原劫点已有棋子；角上仍只剩一口气。"):`这条示范变化完成：白棋本手提掉${facts.captureDelta.white}颗黑子。`;
 return update({game:r.state,phase,branchId,facts,actions:[...s.actions,{actor:s.game.toPlay,point:{...point}}],feedback:{kind:"step",message}});
}
