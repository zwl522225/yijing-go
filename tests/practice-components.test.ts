import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePractice, PracticePicker } from "@/components/learning/practice-picker";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
const host=vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState(initial:unknown){const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function"?(next as (v:unknown)=>unknown)(host.values[i]):next;}];},useEffect(){}}));
function render<T>(fn:()=>T){host.cursor=0;return fn();}
function elements(node:ReactNode):ReactElement<Record<string,unknown>>[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=="object")return [];const e=node as ReactElement<Record<string,unknown>>;return [e,...elements(e.props?.children as ReactNode)];}
function click(tree:ReactNode,key:string,value:unknown){const button=elements(tree).find(e=>e.props[key]===value)!;expect(button).toBeDefined();(button.props.onClick as ()=>void)();}
beforeEach(()=>{host.values=[];});
describe("practice sandbox",()=>{
  it("replays and completes every curriculum action kind with hints and retry",()=>{
    const exercises=CURRICULUM.flatMap(unit=>unit.kind==="lesson"?unit.exercises:unit.kind==="quiz"?unit.questions:[]);
    for(const exercise of exercises){
      host.values=[];const complete=vi.fn();const view=()=>ExercisePractice({exercise,label:"独立练习",onComplete:complete,successLabel:"成功已重练"});
      let tree=render(view);expect(renderToStaticMarkup(tree)).toContain(exercise.prompt);
      const hint=elements(tree).find(e=>e.type==="button"&&e.props["data-action"]==="hint")!;(hint.props.onClick as ()=>void)();tree=render(view);expect(renderToStaticMarkup(tree)).toContain(exercise.hints[0].text);
      const action=exercise.expected;
      if(action.kind==="choice")click(tree,"data-choice-id",action.choiceId);
      else if(action.kind==="pass")click(tree,"data-action","pass");
      else {click(tree,"data-practice-point",`${action.point.x},${action.point.y}`);if(action.kind==="mark-dead"||action.kind==="select-group"){expect(complete).not.toHaveBeenCalled();tree=render(view);click(tree,"data-action",action.kind);}}
      tree=render(view);expect(complete).toHaveBeenCalledOnce();expect(renderToStaticMarkup(tree)).toContain("成功已重练");
      click(tree,"data-action","retry");tree=render(view);expect(renderToStaticMarkup(tree)).not.toContain("成功已重练");
    }
  });
  it("leaves scores, completion, mastery and wrong history unchanged after standalone success",()=>{
    const progress=createDefaultProgress();progress.completedUnitIds=[...LESSON_UNIT_IDS];progress.bestQuizScores={"stage-1":100,"stage-2":90};progress.termStates.liberty="mastered";
    const question=CURRICULUM.find(unit=>unit.kind==="quiz")!;if(question.kind!=="quiz")throw new Error("quiz");progress.wrongQuestionIds=[question.questions[0].id];
    const before=structuredClone(progress);const view=()=>PracticePicker({progress,onClose(){}});let tree=render(view);
    expect(renderToStaticMarkup(tree)).toContain("错题重练");expect(renderToStaticMarkup(tree)).toContain("练习不计入课程和测验成绩");
    click(tree,"data-practice-topic","wrong");tree=render(view);click(tree,"data-practice-exercise",question.questions[0].id);tree=render(view);
    const practice=elements(tree).find(e=>e.type===ExercisePractice)!;
    host.values=[];const practiceView=()=>ExercisePractice(practice.props as Parameters<typeof ExercisePractice>[0]);let exerciseTree=render(practiceView);const action=question.questions[0].expected;
    if(action.kind!=="move")throw new Error("first quiz question is a move");click(exerciseTree,"data-practice-point",action.point.x+","+action.point.y);exerciseTree=render(practiceView);
    expect(renderToStaticMarkup(exerciseTree)).toContain("成功已重练");
    expect(progress).toEqual(before);
  });
});
