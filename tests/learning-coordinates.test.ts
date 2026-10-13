import { describe, expect, it } from "vitest";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { GLOSSARY } from "@/lib/learning/glossary";
import { applyLessonAction } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import type { Exercise } from "@/lib/learning/types";

const exercises=CURRICULUM.flatMap(unit=>unit.kind === "lesson" ? unit.exercises : unit.kind === "quiz" ? unit.questions : []);
const tuple=(x:number,y:number)=>`（${x+1}，${y+1}）`;
function verifyHint(exercise:Exercise) {
  const action=exercise.expected;
  if(!("point" in action)) return;
  const text=exercise.hints[2].text;
  if(/（\d+，\d+）/.test(text)) expect(text,exercise.id).toContain(tuple(action.point.x,action.point.y));
  for(const hint of exercise.hints) for(const point of hint.points ?? []) {
    expect(hint.text,exercise.id).toContain(tuple(point.x,point.y));
  }
}
describe("learner coordinates use one-based column,row from the upper left",()=>{
  it("aligns every explicit answer hint with its actual zero-based engine point",()=>{
    exercises.forEach(verifyHint);
    GLOSSARY.forEach(entry=>verifyHint(entry.practice));
  });
  it.each([
    ["s1-center",2,2,""], ["s1-edge",0,2,""], ["s1-capture-exception",3,2,"（4，3）"],
    ["s2-snapback-capture",0,1,"（1，3）"], ["s3-close-gap",4,5,"（5，5）"],
    ["s3-strong-reduce",6,4,"（8，5）"],
  ] as const)("keeps %s replayable and matches its prompt and answer hint",(id,x,y,promptTuple)=>{
    const exercise=exercises.find(item=>item.id===id)!;
    expect(exercise.expected).toEqual({kind:"move",point:{x,y}});
    expect(exercise.hints[2].text).toContain(tuple(x,y));
    if(promptTuple) expect(exercise.prompt).toContain(promptTuple);
    expect(applyLessonAction(exercise,createPosition(exercise.position),exercise.expected).completed).toBe(true);
  });
  it.each(["intersection","snapback","enclosure"])("keeps the %s glossary hint aligned to its replayable action",id=>{
    const exercise=GLOSSARY.find(entry=>entry.id===id)!.practice;
    verifyHint(exercise);
    expect(applyLessonAction(exercise,createPosition(exercise.position),exercise.expected).completed).toBe(true);
  });
  it("never exposes a zero coordinate or a coordinate outside a unit's board",()=>{
    const verify=(data:unknown,size:number)=>{
      const text=JSON.stringify(data);
      for(const match of text.matchAll(/（(\d+)，(\d+)）/g)) for(const coordinate of match.slice(1)) {
        expect(Number(coordinate)).toBeGreaterThanOrEqual(1);
        expect(Number(coordinate)).toBeLessThanOrEqual(size);
      }
    };
    CURRICULUM.forEach(unit=>verify(unit,unit.boardSize));
    GLOSSARY.forEach(entry=>verify(entry,entry.practice.position.size));
  });
});
