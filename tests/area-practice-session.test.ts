import { describe, expect, it } from "vitest";
import { applyAreaPracticeEvent, createAreaPracticeSession, getAreaPracticeMarkers, type AreaPracticeEvent, type AreaPracticeField, type AreaPracticeSession } from "@/lib/learning/area-practice-session";

type Action = AreaPracticeEvent extends infer E ? E extends AreaPracticeEvent ? Omit<E,"sessionId"|"scenarioId"|"revision"|"phase"> : never : never;
const start=(id="balanced",sessionId="one")=>createAreaPracticeSession(id,sessionId)!;
const event=(s:AreaPracticeSession,action:Action):AreaPracticeEvent=>({...action,sessionId:s.sessionId,scenarioId:s.scenarioId,revision:s.revision,phase:s.phase});
const act=(s:AreaPracticeSession,action:Action)=>applyAreaPracticeEvent(s,event(s,action));
const input=(s:AreaPracticeSession,field:AreaPracticeField,value:string)=>act(s,{kind:"input",field,value});
const check=(s:AreaPracticeSession)=>act(s,{kind:"check"});
const next=(s:AreaPracticeSession)=>act(s,{kind:"next"});
function freeze<T>(v:T):T { if(v&&typeof v==="object") {Object.values(v).forEach(freeze);Object.freeze(v);} return v; }
function correctSide(s:AreaPracticeSession) { const score=s.analysis.score[s.phase as "black"|"white"]; return check(input(input(s,"stones",String(score.stones)),"territory",String(score.territory))); }
const result=()=>next(correctSide(next(correctSide(start()))));

describe("three explicit steps",()=>{
  it.each(["balanced","shifted"])("finishes %s with all facts and isolated current-attempt statistics",id=>{
    let s=start(id);
    expect(s.inputs).toEqual({stones:"",territory:"",neutral:"",whiteTotal:"",winner:""});
    expect(s.help).toEqual({enabled:false,category:"stones"});
    expect(s.summary).toBeNull();
    const first=s;
    s=correctSide(freeze(s));
    expect(s.phase).toBe("black");
    expect(s.checked).toBe(true);
    expect(s.revealedAreas).toEqual({black:36,white:null});
    expect(s.summary).toBeNull();
    expect(first.checked).toBe(false);
    expect(act(s,{kind:"input",field:"stones",value:"0"})).toBe(s);
    expect(check(s)).toBe(s);
    s=next(freeze(s));
    expect(s.phase).toBe("white");
    expect(s.inputs.stones).toBe("");
    s=correctSide(freeze(s));
    expect(s.phase).toBe("white");
    expect(s.revealedAreas.white).toBe(s.analysis.score.white.area);
    s=next(s);
    expect(s.phase).toBe("result");
    expect(s.help).toEqual({enabled:false,category:"neutral"});
    const score=s.analysis.score;
    s=input(input(input(s,"neutral",String(score.neutral)),"whiteTotal",String(score.white.total)),"winner",score.winner);
    s=check(freeze(s));
    expect(s.phase).toBe("complete");
    expect(s.summary).toEqual(score);
    expect(s.feedback?.message).toContain("提子不再单独加分");
    expect(s.stats).toEqual({black:{usedHelp:false,retries:0},white:{usedHelp:false,retries:0},result:{usedHelp:false,retries:0}});
    expect(next(s)).toBe(s);
    expect(act(s,{kind:"toggle-help"})).toBe(s);
  });
  it("cannot advance before checking, and error feedback names fields without answers",()=>{
    let s=start();
    expect(next(s)).toBe(s);
    s=check(freeze(s));
    expect(s.phase).toBe("black");
    expect(s.checked).toBe(false);
    expect(s.feedback?.wrongFields).toEqual(["stones","territory"]);
    expect(s.feedback?.message).toContain("活子");
    expect(s.feedback?.message).toContain("空点");
    expect(s.feedback?.message).not.toMatch(/\d/);
    expect(s.revealedAreas).toEqual({black:null,white:null});
    expect(s.stats.black.retries).toBe(1);
    s=check(input(s,"stones","9"));
    expect(s.feedback?.wrongFields).toEqual(["territory"]);
    expect(s.stats.black.retries).toBe(2);
    s=correctSide(s);
    expect(s.stats.black.retries).toBe(2);
  });
  it.each([""," ","NaN","Infinity","1e1","9e0","0x9","-0","-1","82","9.0","9.5","+9","9cats"])("rejects invalid integer syntax %j without treating blank as zero",value=>{
    const s=check(input(input(start(),"stones",value),"territory","27"));
    expect(s.checked).toBe(false);
    expect(s.feedback?.wrongFields).toEqual(["stones"]);
    expect(s.stats.black.retries).toBe(1);
  });
  it.each([""," ","NaN","Infinity","4.35e1","-1","7","89","43.25","0x2b","+43.5"])("rejects invalid white total %j",value=>{
    const s=check(input(input(input(result(),"neutral","9"),"whiteTotal",value),"winner","white"));
    expect(s.phase).toBe("result");
    expect(s.feedback?.wrongFields).toEqual(["whiteTotal"]);
  });
  it.each(["0","81"])("accepts bounded integer syntax %s but still compares against actual facts",value=>{
    const s=check(input(input(start(),"stones",value),"territory","27"));
    expect(s.feedback?.wrongFields).toEqual(["stones"]);
  });
  it.each(["7.5","8","88.5"])("accepts bounded half integer syntax %s but still compares facts",value=>{
    const s=check(input(input(input(result(),"neutral","9"),"whiteTotal",value),"winner","white"));
    expect(s.feedback?.wrongFields).toEqual(["whiteTotal"]);
  });
  it("requires winner and neutral as well as total",()=>{
    const s=check(input(result(),"whiteTotal","43.5"));
    expect(s.feedback?.wrongFields).toEqual(["neutral","winner"]);
    expect(s.stats.result.retries).toBe(1);
  });
  it("tracks white and result retries separately and never reveals unchecked answers",()=>{
    let s=next(correctSide(start()));
    s=check(input(input(s,"stones","9"),"territory","-1"));
    expect(s.feedback?.wrongFields).toEqual(["territory"]);
    expect(s.feedback?.message).not.toMatch(/\d/);
    expect(s.revealedAreas.white).toBeNull();
    expect(s.stats.white.retries).toBe(1);
    expect(s.stats.black.retries).toBe(0);
    s=next(correctSide(s));
    s=check(input(input(input(s,"neutral","82"),"whiteTotal","43.5"),"winner","black"));
    expect(s.feedback?.wrongFields).toEqual(["neutral","winner"]);
    expect(s.summary).toBeNull();
    expect(s.stats.result.retries).toBe(1);
    expect(s.stats.white.retries).toBe(1);
    s=check(input(input(s,"neutral","9"),"winner","white"));
    expect(s.phase).toBe("complete");
    expect(s.stats.result.retries).toBe(1);
  });
});

describe("event identity and immutable inputs",()=>{
  it("rejects stale identities, revisions and phases including duplicate failed checks",()=>{
    const s=start();
    const pending=event(s,{kind:"check"});
    const failed=applyAreaPracticeEvent(freeze(s),pending);
    expect(applyAreaPracticeEvent(failed,pending)).toBe(failed);
    expect(failed.stats.black.retries).toBe(1);
    for(const override of [{sessionId:"old"},{scenarioId:"shifted"},{revision:-1},{phase:"white" as const}]) {
      expect(applyAreaPracticeEvent(s,{...pending,...override})).toBe(s);
    }
    const fresh=start("balanced","two");
    expect(applyAreaPracticeEvent(fresh,pending)).toBe(fresh);
    expect(fresh.stats.black.retries).toBe(0);
  });
  it("rejects old help and next callbacks after a new step or restarted attempt",()=>{
    const first=start();
    const oldHelp=event(first,{kind:"toggle-help"});
    const checked=correctSide(first);
    const oldNext=event(checked,{kind:"next"});
    const white=applyAreaPracticeEvent(checked,oldNext);
    expect(applyAreaPracticeEvent(white,oldHelp)).toBe(white);
    expect(applyAreaPracticeEvent(white,oldNext)).toBe(white);
    const restarted=start("balanced","restart");
    expect(applyAreaPracticeEvent(restarted,oldHelp)).toBe(restarted);
    expect(applyAreaPracticeEvent(restarted,oldNext)).toBe(restarted);
  });
  it("copies event data and ignores out-of-phase fields/categories",()=>{
    const s=freeze(start());
    const e=event(s,{kind:"input",field:"stones",value:"9"});
    const updated=applyAreaPracticeEvent(s,e);
    if(e.kind==="input")e.value="0";
    expect(updated.inputs.stones).toBe("9");
    expect(s.inputs.stones).toBe("");
    expect(input(s,"neutral","9")).toBe(s);
    expect(act(s,{kind:"help-category",category:"neutral"})).toBe(s);
    expect(input(result(),"stones","9").inputs.stones).toBe("");
  });
});

describe("optional point markers",()=>{
  it("derives current category points, preserves all used-help statistics, and clears on advance",()=>{
    let s=start();
    expect(getAreaPracticeMarkers(s)).toEqual([]);
    s=act(freeze(s),{kind:"toggle-help"});
    expect(s.stats.black.usedHelp).toBe(true);
    expect(getAreaPracticeMarkers(s)).toEqual(Array.from({length:9},(_,y)=>({x:3,y})));
    s=act(s,{kind:"help-category",category:"territory"});
    const points=getAreaPracticeMarkers(s);
    expect(points).toHaveLength(27);
    points.forEach(p=>expect(s.analysis.points[p.y][p.x].kind).toBe("black-territory"));
    points[0].x=8;
    expect(getAreaPracticeMarkers(s)[0].x).toBe(0);
    s=act(s,{kind:"toggle-help"});
    expect(s.stats.black.usedHelp).toBe(true);
    expect(getAreaPracticeMarkers(s)).toEqual([]);
    s=next(correctSide(s));
    expect(s.help).toEqual({enabled:false,category:"stones"});
    expect(s.feedback).toBeNull();
    expect(s.checked).toBe(false);
    expect(s.stats.white.usedHelp).toBe(false);
    s=act(s,{kind:"toggle-help"});
    expect(getAreaPracticeMarkers(s)).toHaveLength(9);
    getAreaPracticeMarkers(s).forEach(p=>expect(s.analysis.points[p.y][p.x].kind).toBe("white-stone"));
    s=next(correctSide(s));
    expect(act(s,{kind:"help-category",category:"stones"})).toBe(s);
    s=act(s,{kind:"toggle-help"});
    expect(s.stats.result.usedHelp).toBe(true);
    expect(getAreaPracticeMarkers(s)).toHaveLength(9);
    getAreaPracticeMarkers(s).forEach(p=>expect(s.analysis.points[p.y][p.x].kind).toBe("neutral"));
    const fresh=start("shifted","restart");
    expect(fresh.phase).toBe("black");
    expect(fresh.help.enabled).toBe(false);
    expect(fresh.stats.black).toEqual({usedHelp:false,retries:0});
  });
});
