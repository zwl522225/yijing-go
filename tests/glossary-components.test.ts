import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TermLink } from "@/components/learning/term-link";
import { GlossaryContent, GlossaryDictionary, TermPractice } from "@/components/learning/glossary-dialog";
import { ExercisePractice } from "@/components/learning/practice-picker";
import { GLOSSARY, GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { createDefaultProgress } from "@/lib/learning/progress";
import { createPosition } from "@/lib/learning/positions";
const host = vi.hoisted(() => ({values: [] as unknown[], cursor: 0}));
vi.mock("react", async original => ({...await original<typeof import("react")>(),
  useState: (initial: unknown) => {const i=host.cursor++; if(!(i in host.values)) host.values[i]=typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [host.values[i], (next: unknown) => {host.values[i]=typeof next === "function" ? (next as (value: unknown)=>unknown)(host.values[i]) : next;}];},
  useEffect: () => {},
}));
function render<T>(fn:()=>T) {host.cursor=0; return fn();}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if(Array.isArray(node)) return node.flatMap(elements);
  if(!node || typeof node !== "object") return [];
  const e=node as ReactElement<Record<string,unknown>>;
  return [e,...elements(e.props?.children as ReactNode)];
}
function click(tree:ReactNode, attribute:string, value:unknown) {
  const button=elements(tree).find(e=>e.type==="button" && e.props[attribute]===value)!;
  expect(button).toBeDefined(); (button.props.onClick as ()=>void)();
}
beforeEach(()=>{host.values=[];});
describe("interactive glossary",()=>{
  it("opens a real accessible term button and blocks it during quizzes",()=>{
    const entry=GLOSSARY_BY_ID.get("liberty")!; const open=vi.fn();
    const button=TermLink({entry,onOpen:open});
    expect(button.type).toBe("button"); expect(button.props["aria-label"]).toBe("查看围棋术语：气");
    button.props.onClick(); expect(open).toHaveBeenCalledWith("liberty");
    const blocked=TermLink({entry,onOpen:open,disabled:true});
    blocked.props.onClick(); expect(open).toHaveBeenCalledTimes(1); expect(blocked.props.disabled).toBe(true);
  });
  it("renders explanations, animation, practice, linked lessons, related terms and mastery",()=>{
    const entry=GLOSSARY_BY_ID.get("liberty")!; const lesson=vi.fn(); const open=vi.fn();
    const progress=createDefaultProgress(); progress.completedUnitIds=["s1-intersections-turns"];
    const tree=GlossaryContent({entry,status:"mastered",onPractice:vi.fn(),onOpenTerm:open,onStartLesson:lesson,progress});
    const text=renderToStaticMarkup(tree);
    for(const value of [entry.name,...entry.aliases,entry.plain,entry.formal,entry.misconception,"白话解释","专业定义","易错点","播放","上一步","下一步",entry.practice.prompt,"已掌握","关联课程","相关术语"]) expect(text).toContain(value);
    const buttons=elements(tree);
    const lessonButton=buttons.find(e=>e.props["data-lesson-id"]===entry.lessonIds[0])!;
    (lessonButton.props.onClick as ()=>void)(); expect(lesson).toHaveBeenCalledWith(entry.lessonIds[0]);
    expect(buttons.some(e=>e.type===TermLink)).toBe(true);
  });
  it("lists all terms with statuses and searches Chinese names and aliases",()=>{
    const progress=createDefaultProgress(); progress.termStates.liberty="mastered";
    const view=()=>GlossaryDictionary({progress,onOpenTerm:vi.fn()});
    let tree=render(view); let text=renderToStaticMarkup(tree);
    for(const entry of GLOSSARY) expect(text).toContain(entry.name);
    expect(text).toContain("已掌握"); expect(text).toContain("未学习");
    const input=elements(tree).find(e=>e.type==="input")!;
    (input.props.onChange as (e:{target:{value:string}})=>void)({target:{value:"气"}});
    text=renderToStaticMarkup(render(view)); expect(text).toContain("气"); expect(text).not.toContain("交叉点");
    const alias=GLOSSARY.find(e=>e.aliases.length)!.aliases[0];
    (input.props.onChange as (e:{target:{value:string}})=>void)({target:{value:alias}});
    tree=render(view); expect(renderToStaticMarkup(tree)).toContain(GLOSSARY.find(e=>e.aliases.includes(alias))!.name);
  });
  it("replays every practice, rejects wrong answers, and records practice only after the required action",()=>{
    for(const entry of GLOSSARY) {
      host.values=[]; const practiced=vi.fn(); const view=()=>{const wrapper=TermPractice({entry,onPractice:practiced});return ExercisePractice(wrapper.props);};
      let tree=render(view); const expected=entry.practice.expected;
      expect(renderToStaticMarkup(tree)).toContain(entry.practice.prompt);
      const state=createPosition(entry.practice.position);
      expect(elements(tree).filter(e=>e.props["data-practice-point"]!==undefined)).toHaveLength(state.size**2);
      if(expected.kind==="choice") {
        const wrong=entry.practice.choices!.find(c=>c.id!==expected.choiceId)!;
        click(tree,"data-choice-id",wrong.id); expect(practiced).not.toHaveBeenCalled();
        tree=render(view); expect(renderToStaticMarkup(tree)).toContain(entry.practice.errors.wrong_answer);
        click(tree,"data-action","retry"); tree=render(view);
        click(tree,"data-choice-id",expected.choiceId);
      } else if(expected.kind==="pass") click(tree,"data-action","pass");
      else {
        click(tree,"data-practice-point",`${expected.point.x},${expected.point.y}`);
        if(expected.kind==="mark-dead" || expected.kind==="select-group") {
          expect(practiced).not.toHaveBeenCalled(); tree=render(view);
          click(tree,"data-action",expected.kind);
        }
      }
      expect(practiced).toHaveBeenCalledExactlyOnceWith(entry.id);
      tree=render(view); expect(renderToStaticMarkup(tree)).toContain(entry.practice.success);
    }
  });
});
