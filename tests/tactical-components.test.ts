import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePractice, PracticeDialog, PracticePicker } from "@/components/learning/practice-picker";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { TACTICAL_SEQUENCES, type TacticalSequence } from "@/lib/learning/tactical-sequences";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";

const host = vi.hoisted(() => ({ scope: "picker", scopes: {} as Record<string, { values: unknown[]; effects: { deps?: unknown[]; cleanup?: () => void }[] }>, cursor: 0, effectCursor: 0, pending: [] as (() => void)[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const values = host.scopes[host.scope].values; const i = host.cursor++; if (!(i in values)) values[i] = typeof initial === "function" ? (initial as () => unknown)() : initial; return [values[i], (next: unknown) => { values[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(values[i]) : next; }]; },
  useRef(initial: unknown) { const values = host.scopes[host.scope].values; const i = host.cursor++; return values[i] ?? (values[i] = { current: initial }); },
  useMemo(factory: () => unknown, deps: unknown[]) { const values=host.scopes[host.scope].values; const i=host.cursor++; const old=values[i] as {deps:unknown[];value:unknown}|undefined; if (!old || !deps.every((value,index)=>Object.is(value,old.deps[index]))) values[i]={deps,value:factory()}; return (values[i] as {value:unknown}).value; },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const effects = host.scopes[host.scope].effects; const i = host.effectCursor++; const old = effects[i]; if (deps && old?.deps && deps.length === old.deps.length && deps.every((v, n) => Object.is(v, old.deps![n]))) return; host.pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: effect() || undefined }; }); },
}));
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] { if (Array.isArray(node)) return node.flatMap(nodes); if (!node || typeof node !== "object") return []; const e = node as ReactElement<Record<string, unknown>>; return [e, ...nodes(e.props?.children as ReactNode)]; }
const focus = vi.fn();
function render<T extends ReactNode>(fn: () => T, scope = "picker"): T {
  host.scope = scope; host.scopes[scope] ??= { values: [], effects: [] }; host.cursor = 0; host.effectCursor = 0;
  const tree = fn();
  for (const node of nodes(tree)) {
    const ref = node.props?.ref;
    if (typeof ref === "function") ref({ focus, isConnected: true });
    else if (ref && typeof ref === "object") (ref as {current: unknown}).current ??= { focus, isConnected: true };
  }
  host.pending.splice(0).forEach(fn => fn()); return tree;
}
function find(tree: ReactNode, attr: string, value?: unknown) { const node = nodes(tree).find(e => value === undefined ? attr in e.props : e.props[attr] === value); expect(node, `${attr}=${String(value)}`).toBeDefined(); return node!; }
function invoke(node: ReactElement<Record<string, unknown>>) { (node.props.onClick as () => void)(); }
function action(tree: ReactNode, id: string) { return find(tree, "data-action", id); }
function click(tree: ReactNode, id: string) { invoke(action(tree, id)); }
function unmount(scope: string) { host.scopes[scope]?.effects.forEach(e => e.cleanup?.()); }
function unlocked() { const progress = createDefaultProgress(); progress.completedUnitIds = [...LESSON_UNIT_IDS]; progress.bestQuizScores = {"stage-1":100,"stage-2":100}; return progress; }
function picker(progress = unlocked()) { const close = vi.fn(); return { progress, close, view: () => render(() => PracticePicker({progress, onClose:close})) }; }
beforeEach(() => { host.scopes = {}; host.pending = []; focus.mockClear(); });
afterEach(() => { Object.keys(host.scopes).forEach(unmount); });

it("offers continuous examples only after both completion and normal unlock checks", () => {
  const h = picker(createDefaultProgress()); let tree = h.view();
  expect(find(tree, "data-tactical-entry", "net").props.disabled).toBe(true);
  expect(find(tree, "data-tactical-entry", "snapback").props.disabled).toBe(true);
  invoke(find(tree, "data-tactical-entry", "net")); expect(nodes(h.view()).some(e => e.props["data-tactical-entry"])).toBe(true);
  h.progress.completedUnitIds = ["s2-net", "s2-snapback"]; tree = h.view();
  expect(find(tree, "data-tactical-entry", "net").props.disabled).toBe(true);
  h.progress.completedUnitIds = [...LESSON_UNIT_IDS]; h.progress.bestQuizScores = {"stage-1":100,"stage-2":100}; tree = h.view();
  expect(find(tree, "data-tactical-entry", "net").props.disabled).toBe(false);
});

function tactical(id: "net" | "snapback" = "net", override?: TacticalSequence) {
  const h = picker(); invoke(find(h.view(), "data-tactical-entry", id));
  const element = nodes(h.view()).find(e => typeof e.type === "function")!;
  expect(element).toBeDefined();
  const Component = element.type as (props: Record<string, unknown>) => ReactNode;
  return {...h, element, board: () => render(() => Component(override ? {...element.props, scenario:override} : element.props), "tactical")};
}
function point(tree: ReactNode, x: number, y: number) { return find(tree, "data-tactical-point", `${x},${y}`); }
function phase(tree: ReactNode) { return find(tree, "data-tactical-practice").props["data-phase"]; }
function countStones(tree: ReactNode, color: string) { return nodes(tree).filter(e => e.props.className === `mini-stone ${color}`).length; }

for (const [id, branchId] of [["net","right"], ["net","down"], ["snapback","capture"]] as const) {
  it(`replays ${id}/${branchId} as two learner moves and one manual white reply with actual facts`, () => {
    const before = structuredClone(TACTICAL_SEQUENCES); const h = tactical(id); const progress = structuredClone(h.progress);
    const scenario = TACTICAL_SEQUENCES.find(s => s.id === id)!; const branch = scenario.branches.find(b => b.id === branchId)!;
    let tree = h.board(); expect(phase(tree)).toBe("first");
    expect(find(tree,"role","status").props["aria-live"]).toBe("polite");
    expect(nodes(tree).filter(e => e.props["data-tactical-point"])).toHaveLength(49);
    expect(point(tree,0,0).props["aria-label"]).toMatch(/第 1 列、第 1 行，(黑棋|白棋|空位)/);
    expect(renderToStaticMarkup(tree)).toContain("示范路线");
    invoke(point(tree,scenario.first.x,scenario.first.y)); tree = h.board(); expect(phase(tree)).toBe("reply");
    expect(nodes(tree).filter(e => e.props["data-tactical-point"]).every(e => e.props.disabled)).toBe(true);
    expect(nodes(tree).some(e => e.props["data-action"] === "tactical-hint")).toBe(false);
    expect(nodes(tree).some(e => "data-tactical-hints" in e.props)).toBe(false);
    if (id === "net") { expect(renderToStaticMarkup(tree)).toContain("目标白棋现有1颗子、2口气"); expect(renderToStaticMarkup(tree)).toContain("黑棋本手提子0颗"); }
    else expect(renderToStaticMarkup(tree)).toContain("投入的黑子现有1口气");
    invoke(find(tree,"data-tactical-reply",branchId)); tree = h.board(); expect(phase(tree)).toBe("second");
    expect(renderToStaticMarkup(tree)).toContain(`目标白棋现有${id === "net" ? 2 : 3}颗子、1口气`);
    if (id === "snapback") { expect(renderToStaticMarkup(tree)).toContain("白棋本手提掉1颗黑子"); expect(point(tree,0,2).props.children).toBeNull(); }
    invoke(point(tree,branch.second.x,branch.second.y)); tree = h.board(); expect(phase(tree)).toBe("complete");
    expect(renderToStaticMarkup(tree)).toContain(`黑棋本手提掉${id === "net" ? 2 : 3}颗白子`);
    expect(nodes(tree).filter(e => e.props["data-tactical-action"] !== undefined)).toHaveLength(3);
    expect(nodes(tree).filter(e => e.props["data-tactical-point"]).every(e => e.props.disabled)).toBe(true);
    expect(nodes(tree).some(e => e.props["data-action"] === "tactical-hint")).toBe(false);
    if (id === "snapback") { expect(renderToStaticMarkup(tree)).toContain("在这条示范变化中，先失一子，再反提三子"); expect(countStones(tree,"white")).toBeGreaterThan(0); expect(renderToStaticMarkup(find(tree,"aria-label","当前真实棋局事实"))).not.toContain("投入的黑子"); }
    expect(h.progress).toEqual(progress); expect(TACTICAL_SEQUENCES).toEqual(before);
  });
}

it("keeps legal off-route and occupied moves off the board and never focuses errors or hints", () => {
  const h = tactical(); let tree = h.board(); expect(focus).toHaveBeenCalledOnce();
  const initialWhite = countStones(tree,"white"), initialBlack = countStones(tree,"black");
  invoke(point(tree,6,6)); tree = h.board(); expect(phase(tree)).toBe("first");
  expect(renderToStaticMarkup(tree)).toContain("这手合法，但不在本次示范路线中");
  expect(countStones(tree,"white")).toBe(initialWhite); expect(countStones(tree,"black")).toBe(initialBlack);
  invoke(point(tree,3,3)); tree = h.board(); expect(renderToStaticMarkup(tree)).toContain("这里已有棋子");
  click(tree,"tactical-hint"); tree = h.board(); expect(focus).toHaveBeenCalledOnce();
  invoke(point(tree,4,4)); tree = h.board(); expect(focus).toHaveBeenCalledTimes(2);
  invoke(find(tree,"data-tactical-reply","right")); tree = h.board(); expect(focus).toHaveBeenCalledTimes(3);
  expect(find(tree,"data-tactical-heading").props.tabIndex).toBe(-1);
});

it("expands three progressive hints per learner stage and restarts with a new attempt and clean hints", () => {
  const h = tactical(); let tree = h.board();
  for (let i=1;i<=3;i++) { click(tree,"tactical-hint"); tree=h.board(); expect(nodes(find(tree,"data-tactical-hints")).filter(e=>e.type==="li")).toHaveLength(i); }
  expect(renderToStaticMarkup(find(tree,"data-tactical-hints"))).toContain("（5，5）"); expect(action(tree,"tactical-hint").props.disabled).toBe(true);
  invoke(point(tree,4,4)); tree=h.board(); invoke(find(tree,"data-tactical-reply","down")); tree=h.board();
  expect(nodes(find(tree,"data-tactical-hints")).filter(e=>e.type==="li")).toHaveLength(0);
  click(tree,"tactical-hint"); tree=h.board(); expect(nodes(find(tree,"data-tactical-hints")).filter(e=>e.type==="li")).toHaveLength(1);
  expect(renderToStaticMarkup(action(tree,"tactical-restart"))).toContain("新尝试");
  click(tree,"tactical-restart"); tree=h.board(); expect(phase(tree)).toBe("first"); expect(point(tree,4,4).props.children).toBeNull();
  expect(nodes(find(tree,"data-tactical-hints")).filter(e=>e.type==="li")).toHaveLength(0);
  expect(nodes(tree).filter(e=>e.props["data-tactical-action"]!==undefined)).toHaveLength(0);
});

it("invalidates every captured action after a revision, phase, reset, completion, back, reentry or unmount", () => {
  const h=tactical(); let tree=h.board(); const old=tree;
  const hint=action(tree,"tactical-hint"); invoke(hint); invoke(hint); tree=h.board();
  expect(nodes(find(tree,"data-tactical-hints")).filter(e=>e.type==="li")).toHaveLength(1);
  invoke(point(old,4,4)); expect(phase(h.board())).toBe("first");
  tree=h.board(); const restart=action(tree,"tactical-restart"); invoke(restart); tree=h.board();
  click(tree,"tactical-hint"); invoke(restart); tree=h.board(); expect(nodes(find(tree,"data-tactical-hints")).filter(e=>e.type==="li")).toHaveLength(1);
  const first=point(tree,4,4); invoke(first); invoke(first); tree=h.board(); expect(phase(tree)).toBe("reply");
  const reply=find(tree,"data-tactical-reply","right"); invoke(reply); invoke(reply); tree=h.board(); expect(phase(tree)).toBe("second");
  invoke(hint); invoke(reply); invoke(point(old,4,4)); expect(phase(h.board())).toBe("second");
  const second=point(tree,3,4); invoke(second); invoke(second); tree=h.board(); expect(phase(tree)).toBe("complete");
  const completed=renderToStaticMarkup(tree); invoke(first); invoke(reply); invoke(hint); expect(renderToStaticMarkup(h.board())).toBe(completed);
  click(tree,"tactical-restart"); tree=h.board(); invoke(second); invoke(reply); invoke(hint); invoke(first); expect(phase(h.board())).toBe("first");
  const back=action(tree,"tactical-back"); invoke(back); const pickerTree=h.view(); expect(find(pickerTree,"data-tactical-entry","net")).toBeDefined();
  invoke(point(tree,4,4)); invoke(back); expect(phase(h.board())).toBe("first");
  // Same scenario reentry is a different parent mode even before React unmount cleanup.
  invoke(find(pickerTree,"data-tactical-entry","net")); invoke(point(tree,4,4)); expect(phase(h.board())).toBe("first");
  unmount("tactical"); click(h.board(),"tactical-restart"); invoke(point(h.board(),4,4)); expect(phase(h.board())).toBe("first");
});

it("rejects captured picker callbacks across topics, free/round/tactical modes, back, reentry and close", () => {
  const h=picker(); const initial=h.view(); const net=find(initial,"data-tactical-entry","net");
  const start=action(initial,"start-practice-round"); const topic=find(initial,"data-practice-topic","wrong");
  const free=nodes(initial).find(e=>e.props["data-practice-exercise"])!;
  invoke(net); invoke(start); invoke(topic); invoke(free); let tree=h.view();
  expect(nodes(tree).some(e=>e.props["data-practice-topic"])).toBe(false);
  const tacticalElement=nodes(tree).find(e=>typeof e.type==="function")!;
  const Tactical=tacticalElement.type as (props:Record<string,unknown>)=>ReactNode;
  const board=()=>render(()=>Tactical(tacticalElement.props),"tactical");
  click(board(),"tactical-back"); tree=h.view(); expect(focus).toHaveBeenCalled();
  invoke(net); invoke(start); invoke(free); expect(nodes(h.view()).some(e=>e.props["data-tactical-entry"])).toBe(true);
  invoke(nodes(tree).find(e=>e.props["data-practice-exercise"])!); tree=h.view();
  expect(nodes(tree).some(e=>e.props["data-tactical-entry"])).toBe(false);
  const freeElement=nodes(tree).find(e=>e.type===ExercisePractice)!; expect(freeElement).toBeDefined();
  const oldFreeActive=freeElement.props.isActive as ()=>boolean;
  click(tree,"back-practice-picker"); expect(oldFreeActive()).toBe(false); tree=h.view();
  click(tree,"start-practice-round"); tree=h.view(); const round=nodes(tree).find(e=>typeof e.type==="function")!;
  expect((round.props.isActive as ()=>boolean)()).toBe(true);
  (round.props.onBack as ()=>void)(); tree=h.view(); expect((round.props.isActive as ()=>boolean)()).toBe(false);
  const close=nodes(tree).filter(e=>e.type==="button").at(-1)!; invoke(close); invoke(find(tree,"data-tactical-entry","net"));
  expect(h.close).toHaveBeenCalledOnce(); expect(nodes(h.view()).some(e=>e.props["data-tactical-entry"])).toBe(true);
});

it("checks live progress inside entry handlers and keeps captured child actions inert immediately on close", () => {
  const p=picker(); const entry=find(p.view(),"data-tactical-entry","net"); p.progress.completedUnitIds=[]; invoke(entry);
  expect(nodes(p.view()).some(e=>e.props["data-tactical-entry"])).toBe(true);
  host.scopes={}; const h=tactical(); const tree=h.board(); const close=nodes(h.view()).filter(e=>e.type==="button").at(-1)!;
  invoke(close); invoke(point(tree,4,4)); click(tree,"tactical-hint"); click(tree,"tactical-restart"); click(tree,"tactical-back");
  expect(phase(h.board())).toBe("first"); expect(h.close).toHaveBeenCalledOnce();
});

it("closes the dialog lifecycle synchronously so old board and old close callbacks cannot affect a reopening", () => {
  const close=vi.fn(); const progress=unlocked();
  const dialog=(open=true)=>render(()=>PracticeDialog({open,progress,onClose:close}),"dialog");
  const tree=dialog(); const pickerElement=nodes(tree).find(e=>e.type===PracticePicker)!;
  const view=()=>render(()=>PracticePicker(pickerElement.props as Parameters<typeof PracticePicker>[0]));
  invoke(find(view(),"data-tactical-entry","net"));
  const e=nodes(view()).find(e=>typeof e.type==="function")!; const Component=e.type as (p:Record<string,unknown>)=>ReactNode;
  const board=()=>render(()=>Component(e.props),"tactical"); const old=board();
  (tree.props.onOpenChange as (v:boolean)=>void)(false); invoke(point(old,4,4)); expect(phase(board())).toBe("first");
  dialog(false); dialog(); (tree.props.onOpenChange as (v:boolean)=>void)(false); expect(close).toHaveBeenCalledOnce();
});

it("shows only existing glossary body text in inline cards and degrades invalid scenarios safely", () => {
  const h=tactical(); const tree=h.board();
  for (const id of ["net","liberty","atari","capture"] as const) {
    const entry=GLOSSARY_BY_ID.get(id)!; const detail=find(tree,"data-tactical-term",id);
    expect(detail.type).toBe("details"); expect(renderToStaticMarkup(detail)).toContain(entry.plain); expect(renderToStaticMarkup(detail)).toContain(entry.formal);
  }
  expect(nodes(tree).some(e=>e.props.role==="dialog")).toBe(false);
  host.scopes={}; const invalid=structuredClone(TACTICAL_SEQUENCES[0]); invalid.initial.stones.push(["black",-1,0]);
  const bad=tactical("net",invalid); const badTree=bad.board(); expect(renderToStaticMarkup(badTree)).toContain("本题暂不可用");
  expect(nodes(badTree).some(e=>e.props["data-tactical-point"])).toBe(false); click(badTree,"tactical-back");
  expect(find(bad.view(),"data-tactical-entry","net")).toBeDefined();
});
