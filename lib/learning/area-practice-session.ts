import { analyzeArea, type AreaAnalysis, type AreaPointKind, type AreaScore } from "@/lib/go/scoring";
import { hashBoard } from "@/lib/go/rules";
import type { GameState, Point } from "@/lib/go/types";
import { AREA_PRACTICE_SCENARIOS, type AreaPracticeScenario, type AreaPracticeScenarioId } from "@/lib/learning/area-practice";
import { createPosition, isPointOnBoard, isValidSetupMove } from "@/lib/learning/positions";

export type AreaPracticePhase = "black" | "white" | "result" | "complete";
export type AreaPracticeField = "stones" | "territory" | "neutral" | "whiteTotal" | "winner";
export type AreaPracticeHelpCategory = "stones" | "territory" | "neutral";
export type AreaPracticeSession = {
  sessionId: string; scenarioId: AreaPracticeScenarioId; revision: number;
  scenario: AreaPracticeScenario; game: GameState; analysis: AreaAnalysis; phase: AreaPracticePhase;
  inputs: Record<AreaPracticeField,string>; checked: boolean;
  feedback: {kind:"correct"|"retry";message:string;wrongFields:AreaPracticeField[]} | null;
  help: {enabled:boolean;category:AreaPracticeHelpCategory};
  stats: Record<Exclude<AreaPracticePhase,"complete">,{usedHelp:boolean;retries:number}>;
  revealedAreas: {black:number|null;white:number|null}; summary: AreaScore|null;
};
export type AreaPracticeEvent = {sessionId:string;scenarioId:string;revision:number;phase:AreaPracticePhase} & (
  {kind:"input";field:AreaPracticeField;value:string} | {kind:"check"} | {kind:"next"} |
  {kind:"toggle-help"} | {kind:"help-category";category:AreaPracticeHelpCategory}
);
const record = (v:unknown):v is Record<string,unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v:unknown):v is string => typeof v === "string" && v.trim().length > 0;
const emptyInputs = ():AreaPracticeSession["inputs"] => ({stones:"",territory:"",neutral:"",whiteTotal:"",winner:""});
const emptyStats = () => ({usedHelp:false,retries:0});
const fields = (phase:AreaPracticePhase):AreaPracticeField[] => phase === "black" || phase === "white" ? ["stones","territory"] : phase === "result" ? ["neutral","whiteTotal","winner"] : [];
const categories = (phase:AreaPracticePhase):AreaPracticeHelpCategory[] => phase === "black" || phase === "white" ? ["stones","territory"] : phase === "result" ? ["neutral"] : [];

function validShape(v:unknown):v is AreaPracticeScenario {
  if (!record(v) || !["balanced","shifted"].includes(v.id as string) || !text(v.title) || !text(v.description) || v.allStonesAlive !== true || "deadStones" in v) return false;
  const p=v.initial;
  if (!record(p) || p.size !== 9 || p.toPlay !== "black" || !Array.isArray(p.stones) || !p.stones.length) return false;
  const occupied=new Set<string>();
  for(const stone of p.stones) {
    if (!Array.isArray(stone) || stone.length !== 3 || !["black","white"].includes(stone[0]) || !isPointOnBoard({x:stone[1],y:stone[2]},9)) return false;
    const key=`${stone[1]},${stone[2]}`;
    if (occupied.has(key)) return false;
    occupied.add(key);
  }
  return Array.isArray(p.setupMoves) && p.setupMoves.length === 2 && p.setupMoves.every(m=>isValidSetupMove(m,9) && "pass" in m);
}

/** These fixtures contain only two passes: every snapshot must preserve the setup board. */
function validPassHistory(game:GameState):boolean {
  const hash=hashBoard(game.board);
  return [...game.past,game].every((snapshot,index)=>
    snapshot.size === game.size && snapshot.toPlay === (index === 1 ? "white" : "black") &&
    snapshot.consecutivePasses === index && snapshot.captures.black === 0 && snapshot.captures.white === 0 &&
    snapshot.moves.length === index && snapshot.moves.every(move=>isValidSetupMove(move,game.size) && "pass" in move) &&
    snapshot.history.length === index+1 && snapshot.history.every(value=>value === hash) &&
    snapshot.board.length === game.size && snapshot.board.every((row,y)=>row.length === game.size && row.every((cell,x)=>cell === game.board[y][x])) &&
    hashBoard(snapshot.board) === hash,
  );
}

/** Validate scorer output, without inferring life/death or introducing another region scorer. */
function validFacts(game:GameState, a:AreaAnalysis, scenario:AreaPracticeScenario):boolean {
  if (game.size !== 9 || game.toPlay !== "black" || game.consecutivePasses !== 2 || game.moves.length !== 2 ||
    !game.moves.every(m=>"pass" in m && m.pass === true) || game.past.length !== 2 || game.history.length !== 3 ||
    game.past[0].consecutivePasses !== 0 || game.past[1].consecutivePasses !== 1 ||
    game.captures.black !== 0 || game.captures.white !== 0 || a.removed.length !== 0 ||
    game.board.length !== game.size || a.board.length !== game.size || a.points.length !== game.size) return false;
  if (!validPassHistory(game)) return false;
  const counts:Record<AreaPointKind,number>={"black-stone":0,"white-stone":0,"black-territory":0,"white-territory":0,neutral:0};
  const setup = new Map(scenario.initial.stones.map(([color,x,y])=>[`${x},${y}`,color]));
  const emptyPoints=new Set<string>();
  for(let y=0;y<game.size;y++) {
    if (game.board[y].length !== game.size || a.board[y].length !== game.size || a.points[y].length !== game.size) return false;
    for(let x=0;x<game.size;x++) {
      const stone=game.board[y][x], p=a.points[y][x];
      if (stone !== (setup.get(`${x},${y}`) ?? null) || a.board[y][x] !== stone || !p || !(p.kind in counts)) return false;
      if (stone ? p.kind !== `${stone}-stone` || p.regionId !== null : p.kind === "black-stone" || p.kind === "white-stone" || !Number.isInteger(p.regionId)) return false;
      if (!stone) emptyPoints.add(`${x},${y}`);
      counts[p.kind]++;
    }
  }
  const ids=new Set<number>();
  for(const region of a.regions) {
    if (!Number.isInteger(region.id) || ids.has(region.id) || !region.points.length || !Array.isArray(region.borders)) return false;
    ids.add(region.id);
    const borders=new Set<string>();
    for(const point of region.points) {
      if (!isPointOnBoard(point,game.size) || !emptyPoints.delete(`${point.x},${point.y}`)) return false;
      const p=a.points[point.y][point.x];
      if (p.regionId !== region.id || p.kind !== (region.owner ? `${region.owner}-territory` : "neutral")) return false;
      for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const n={x:point.x+dx,y:point.y+dy};
        if (!isPointOnBoard(n,game.size)) continue;
        const stone=game.board[n.y][n.x];
        if (stone) borders.add(stone);
        else if (a.points[n.y][n.x].regionId !== region.id) return false;
      }
    }
    if (new Set(region.borders).size !== region.borders.length || borders.size !== region.borders.length || !region.borders.every(b=>borders.has(b))) return false;
    if (region.owner !== (borders.size === 1 ? [...borders][0] : null)) return false;
  }
  if (emptyPoints.size) return false;
  const s=a.score;
  if (s.komi !== 7.5 || s.dead.black !== 0 || s.dead.white !== 0 || s.neutral !== counts.neutral) return false;
  for(const color of ["black","white"] as const) {
    const value=s[color];
    if (!Object.values(value).every(Number.isFinite) || value.stones !== counts[`${color}-stone`] || value.territory !== counts[`${color}-territory`] ||
      value.area !== value.stones+value.territory || value.total !== value.area+(color === "white" ? s.komi : 0)) return false;
  }
  return s.black.area+s.white.area+s.neutral === game.size*game.size &&
    s.winner === (s.black.total > s.white.total ? "black" : "white") && Number.isFinite(s.margin) && s.margin === Math.abs(s.black.total-s.white.total);
}

export function createAreaPracticeSession(scenarioId:string,sessionId:string):AreaPracticeSession|null {
  try {
    if (!text(sessionId)) return null;
    const source=AREA_PRACTICE_SCENARIOS.find(s=>s.id === scenarioId);
    if (!validShape(source)) return null;
    const scenario=structuredClone(source);
    // createPosition replays the fixture's two actual passTurn actions.
    const game=createPosition(scenario.initial);
    const analysis=analyzeArea(game.board,new Set());
    if (!validFacts(game,analysis,scenario)) return null;
    return {sessionId,scenarioId:scenario.id,revision:0,scenario,game,analysis,phase:"black",inputs:emptyInputs(),checked:false,feedback:null,
      help:{enabled:false,category:"stones"},stats:{black:emptyStats(),white:emptyStats(),result:emptyStats()},revealedAreas:{black:null,white:null},summary:null};
  } catch { return null; }
}

function parsedNumber(value:string,field:AreaPracticeField):number|null {
  const decimal=field === "whiteTotal";
  if (!(decimal ? /^\d+(?:\.[05])?$/ : /^\d+$/).test(value)) return null;
  const n=Number(value);
  return Number.isFinite(n) && n >= (decimal ? 7.5 : 0) && n <= (decimal ? 88.5 : 81) ? n : null;
}

function wrongFields(s:AreaPracticeSession):AreaPracticeField[] {
  const score=s.analysis.score;
  return fields(s.phase).filter(field=> {
    if (field === "winner") return s.inputs.winner !== score.winner;
    const expected=field === "neutral" ? score.neutral : field === "whiteTotal" ? score.white.total : score[s.phase as "black"|"white"][field];
    return parsedNumber(s.inputs[field],field) !== expected;
  });
}
const labels:Record<AreaPracticeField,string>={stones:"活子数",territory:"围住空点数",neutral:"公空点数",whiteTotal:"白棋含贴目总分",winner:"胜方"};

export function applyAreaPracticeEvent(session:AreaPracticeSession,event:AreaPracticeEvent):AreaPracticeSession {
  if (!event || event.sessionId !== session.sessionId || event.scenarioId !== session.scenarioId || event.revision !== session.revision || event.phase !== session.phase || session.phase === "complete") return session;
  const phase=session.phase;
  if (event.kind === "next") {
    if (!session.checked || phase === "result") return session;
    const newPhase=phase === "black" ? "white" : "result";
    return {...session,revision:session.revision+1,phase:newPhase,inputs:emptyInputs(),checked:false,feedback:null,help:{enabled:false,category:newPhase === "result" ? "neutral" : "stones"}};
  }
  if (session.checked) return session;
  if (event.kind === "input") {
    if (!fields(phase).includes(event.field) || typeof event.value !== "string" || session.inputs[event.field] === event.value) return session;
    return {...session,revision:session.revision+1,inputs:{...session.inputs,[event.field]:event.value},feedback:null};
  }
  if (event.kind === "toggle-help") {
    const enabled=!session.help.enabled;
    return {...session,revision:session.revision+1,help:{...session.help,enabled},stats:{...session.stats,[phase]:{...session.stats[phase],usedHelp:session.stats[phase].usedHelp || enabled}}};
  }
  if (event.kind === "help-category") {
    if (!session.help.enabled || !categories(phase).includes(event.category) || event.category === session.help.category) return session;
    return {...session,revision:session.revision+1,help:{...session.help,category:event.category}};
  }
  if (event.kind !== "check") return session;
  const wrong=wrongFields(session);
  if (wrong.length) return {...session,revision:session.revision+1,feedback:{kind:"retry",message:`请重新核对：${wrong.map(f=>labels[f]).join("、")}。`,wrongFields:wrong},stats:{...session.stats,[phase]:{...session.stats[phase],retries:session.stats[phase].retries+1}}};
  if (phase === "result") return {...session,revision:session.revision+1,phase:"complete",checked:true,help:{...session.help,enabled:false},summary:structuredClone(session.analysis.score),feedback:{kind:"correct",message:"本题核对完成。公空不计入任何一方，提子不再单独加分。",wrongFields:[]}};
  return {...session,revision:session.revision+1,checked:true,help:{...session.help,enabled:false},revealedAreas:{...session.revealedAreas,[phase]:session.analysis.score[phase].area},feedback:{kind:"correct",message:`本步核对正确，${phase === "black" ? "黑" : "白"}方面积为 ${session.analysis.score[phase].area}。`,wrongFields:[]}};
}

export function getAreaPracticeMarkers(session:AreaPracticeSession):Point[] {
  if (!session.help.enabled || session.checked || session.phase === "complete" || !categories(session.phase).includes(session.help.category)) return [];
  const kind:AreaPointKind=session.help.category === "neutral" ? "neutral" : `${session.phase as "black"|"white"}-${session.help.category === "stones" ? "stone" : "territory"}`;
  const points:Point[]=[];
  session.analysis.points.forEach((row,y)=>row.forEach((p,x)=>{if(p.kind===kind)points.push({x,y});}));
  return points;
}
