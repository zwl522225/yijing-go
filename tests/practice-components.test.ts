import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePractice, PracticePicker } from "@/components/learning/practice-picker";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
const host=vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState(initial:unknown){const i=host.cursor++;if(!(i in host.values))host.values[i]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [host.values[i],(next:unknown)=>{host.values[i]=typeof next==="function"?(next as (v:unknown)=>unknown)(host.values[i]):next;}];},useRef(initial:unknown){const i=host.cursor++;return host.values[i]??(host.values[i]={current:initial});},useEffect(){}}));
function render<T>(fn:()=>T){host.cursor=0;return fn();}
function elements(node:ReactNode):ReactElement<Record<string,unknown>>[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=="object")return [];const e=node as ReactElement<Record<string,unknown>>;return [e,...elements(e.props?.children as ReactNode)];}
function click(tree:ReactNode,key:string,value:unknown){const button=elements(tree).find(e=>e.props[key]===value)!;expect(button).toBeDefined();(button.props.onClick as ()=>void)();}
beforeEach(()=>{host.values=[];});
describe("practice sandbox",()=>{
  it("offers two area counting entries with full prerequisite guards and rejects retained callbacks after progress replacement",()=>{
    let progress=createDefaultProgress(); const view=()=>PracticePicker({progress,onClose(){}});
    let tree=render(view); let entry=elements(tree).find(e=>e.props["data-area-entry"]==="balanced");
    expect(entry).toBeDefined(); expect(entry!.props.disabled).toBe(true);
    progress={...progress,completedUnitIds:["s3-chinese-area-komi"]}; tree=render(view);
    expect(elements(tree).find(e=>e.props["data-area-entry"]==="shifted")!.props.disabled).toBe(true);
    progress={...progress,completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":100,"stage-2":100}}; tree=render(view);
    entry=elements(tree).find(e=>e.props["data-area-entry"]==="balanced")!; expect(entry.props.disabled).toBe(false);
    progress=createDefaultProgress(); render(view); (entry.props.onClick as ()=>void)();
    expect(elements(render(view)).some(e=>e.props["data-area-entry"]==="balanced")).toBe(true);
  });
  it("keeps a legal wrong attempt off the board and offers recovery without awarding completion in standalone and term practice",()=>{
    const lesson=CURRICULUM.find(unit=>unit.id==="s1-intersections-turns")!;if(lesson.kind!=="lesson")throw new Error("lesson");
    for(const exercise of [lesson.exercises[0],GLOSSARY_BY_ID.get("intersection")!.practice]) {
      host.values=[];const complete=vi.fn();const view=()=>ExercisePractice({exercise,label:"练习",onComplete:complete,successLabel:"成功已重练"});
      let tree=render(view);click(tree,"data-practice-point","0,0");tree=render(view);let text=renderToStaticMarkup(tree);
      expect(text).toContain("这一手可以落");expect(text).toContain("练习棋盘保持原状");expect(text).toContain("下一步：");expect(text).not.toContain("mini-stone");
      expect(text).toContain("查看提示（0/3）");expect(complete).not.toHaveBeenCalled();
      click(tree,"data-action","retry");tree=render(view);text=renderToStaticMarkup(tree);expect(text).not.toContain("lesson-feedback");expect(text).not.toContain("mini-stone");
      const expected=exercise.expected;if(expected.kind!=="move")throw new Error("move");click(tree,"data-practice-point",`${expected.point.x},${expected.point.y}`);tree=render(view);
      expect(renderToStaticMarkup(tree)).toContain("成功已重练");expect(complete).toHaveBeenCalledOnce();
    }
  });
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

it("offers independently guarded ko practice entry",()=>{
 let progress=createDefaultProgress();const view=()=>PracticePicker({progress,onClose(){}});let tree=render(view);let entry=elements(tree).find(e=>e.props["data-ko-entry"]==="ko");expect(entry).toBeDefined();expect(entry!.props.disabled).toBe(true);
 progress={...progress,completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":100,"stage-2":100}};tree=render(view);entry=elements(tree).find(e=>e.props["data-ko-entry"]==="ko")!;expect(entry.props.disabled).toBe(false);progress=createDefaultProgress();render(view);(entry.props.onClick as ()=>void)();expect(elements(render(view)).some(e=>e.props["data-ko-entry"]==="ko")).toBe(true);
});
