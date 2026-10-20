import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePractice, PracticePicker } from "@/components/learning/practice-picker";
import { getPracticeTopics } from "@/lib/learning/practice";
import { createPracticeRound, type PracticeRound } from "@/lib/learning/practice-round";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { createDefaultProgress } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS, type Exercise } from "@/lib/learning/types";
const host = vi.hoisted(() => ({ scope: "picker", scopes: {} as Record<string, { values: unknown[]; effects: { deps?: unknown[]; cleanup?: () => void }[] }>, cursor: 0, effectCursor: 0, pending: [] as (() => void)[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const values = host.scopes[host.scope].values; const i = host.cursor++; if (!(i in values)) values[i] = typeof initial === "function" ? (initial as () => unknown)() : initial; return [values[i], (next: unknown) => { values[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(values[i]) : next; }]; },
  useRef(initial: unknown) { const values = host.scopes[host.scope].values; const i = host.cursor++; return values[i] ?? (values[i] = { current: initial }); },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const effects = host.scopes[host.scope].effects; const i = host.effectCursor++; const old = effects[i]; if (deps && old?.deps && deps.length === old.deps.length && deps.every((v, n) => Object.is(v, old.deps![n]))) return; host.pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: effect() || undefined }; }); },
}));
function renderComponent<T>(fn: () => T, scope = "picker"): T { host.scope = scope; host.scopes[scope] ??= { values: [], effects: [] }; host.cursor = 0; host.effectCursor = 0; const tree = fn(); host.pending.splice(0).forEach(fn => fn()); return tree; }
function render() { return renderComponent(() => PracticePicker({ progress: createDefaultProgress(), onClose() {} })); }
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] { if (Array.isArray(node)) return node.flatMap(elements); if (!node || typeof node !== "object") return []; const e = node as ReactElement<Record<string, unknown>>; return [e, ...elements(e.props?.children as ReactNode)]; }
function button(tree: ReactNode, action: string) { const e = elements(tree).find(e => e.props["data-action"] === action); expect(e).toBeDefined(); return e!; }
function click(tree: ReactNode, action: string) { (button(tree, action).props.onClick as () => void)(); }
function unmount(scope: string) { host.scopes[scope]?.effects.forEach(e => e.cleanup?.()); }
beforeEach(() => { host.scopes = {}; host.pending = []; });
afterEach(() => { Object.keys(host.scopes).forEach(unmount); });
it("starts a filtered topic snapshot and hides free selection while a round is mounted", () => {
  let tree = render(); const start = elements(tree).find(e => e.props["data-action"] === "start-practice-round"); expect(start).toBeDefined();
  (start!.props.onClick as () => void)(); tree = render(); expect(elements(tree).some(e => e.props["data-practice-exercise"])).toBe(false); expect(elements(tree).some(e => e.props["data-practice-topic"])).toBe(false);
});

function setup(initialRound?: PracticeRound) {
  const progress = createDefaultProgress(); progress.completedUnitIds = [...LESSON_UNIT_IDS]; progress.bestQuizScores = { "stage-1": 100, "stage-2": 100 };
  const close = vi.fn(); const picker = () => renderComponent(() => PracticePicker({ progress, onClose: close }));
  click(picker(), "start-practice-round");
  const roundElement = elements(picker()).find(e => typeof e.type === "function")!; expect(roundElement).toBeDefined();
  const Round = roundElement.type as (props: Record<string, unknown>) => ReactNode;
  const round = () => renderComponent(() => Round(initialRound ? { ...roundElement.props, initialRound } : roundElement.props), "round");
  const child = () => { const e = elements(round()).find(e => e.type === ExercisePractice); expect(e).toBeDefined(); return e!; };
  const board = () => { const e = child(); return renderComponent(() => ExercisePractice(e.props as Parameters<typeof ExercisePractice>[0]), `child:${e.key}`); };
  const answer = () => {
    const e = child(); const exercise = e.props.exercise as Exercise; const tree = board(); const action = exercise.expected;
    const invoke = (tree: ReactNode, attr: string, value: string) => { const point = elements(tree).find(e => e.props[attr] === value); expect(point).toBeDefined(); (point!.props.onClick as () => void)(); };
    if (action.kind === "choice") invoke(tree, "data-choice-id", action.choiceId);
    else if (action.kind === "pass") click(tree, "pass");
    else { invoke(tree, "data-practice-point", `${action.point.x},${action.point.y}`); if (action.kind !== "move") click(board(), action.kind); }
  };
  return { progress, picker, round, child, board, answer, close };
}
it("keeps success visible, focuses headings and consumes a double next only once", () => {
  const h = setup(); let tree = h.round(); const heading = elements(tree).find(e => e.props["data-practice-round-heading"] !== undefined)!;
  expect(heading.props.tabIndex).toBe(-1); const focus = vi.fn(); const ref = heading.props.ref as { current: unknown }; ref.current = { focus }; h.round();
  h.answer(); tree = h.round(); expect(h.child().props.exercise).toMatchObject({ id: "s1-center" });
  const next = button(tree, "next-practice-question").props.onClick as () => void; next(); next(); tree = h.round();
  expect(renderToStaticMarkup(elements(tree).find(e => e.props["data-practice-round-heading"] !== undefined))).toContain("第 2 / 5 题"); expect(focus).toHaveBeenCalled();
});
it("records wrong answers, hints and resets truthfully and retries only non-independent items", () => {
  const h = setup(); const tree = h.board(); const wrong = elements(tree).find(e => e.props["data-practice-point"] === "0,0")!; (wrong.props.onClick as () => void)();
  click(h.board(), "hint"); click(h.board(), "retry"); h.answer(); click(h.round(), "next-practice-question");
  for (let i = 1; i < 5; i++) { h.answer(); click(h.round(), "next-practice-question"); }
  const summary = h.round(); const text = renderToStaticMarkup(summary); expect(text).toContain("本轮完成 5 / 5 题"); expect(text).toContain("独立首答完成 4 题"); expect(text).toContain("已使用提示");
  const rows = elements(summary).filter(e => e.props["data-practice-result"]); expect(rows.map(e => e.props["data-status"])).toEqual(["practiced", "independent", "independent", "independent", "independent"]);
  expect(renderToStaticMarkup(rows[0])).toContain("提交 2 次 · 重试 1 次"); expect(renderToStaticMarkup(rows[1])).toContain("提交 1 次 · 重试 0 次");
  const staleRetry = button(summary, "retry-practice-round").props.onClick as () => void; staleRetry(); h.answer(); click(h.round(), "next-practice-question");
  expect(renderToStaticMarkup(h.round())).toContain("本轮完成 1 / 1 题"); staleRetry(); expect(elements(h.round()).some(e => e.props["data-practice-summary"] !== undefined)).toBe(true);
  click(h.round(), "next-practice-round"); const source = getPracticeTopics(h.progress).find(t => t.id === "placement")!.items;
  expect(h.child().props.exercise).toMatchObject({ id: source[5].exercise.id });
});
it("marks early exit unfinished, preserves the cursor through retry, tail and restart, and rejects old events", () => {
  const h = setup(); const oldChild = h.child(); const oldBoard = h.board(); click(h.round(), "finish-practice-round");
  let summary = h.round(); expect(elements(summary).filter(e => e.props["data-status"] === "unfinished")).toHaveLength(5); expect(renderToStaticMarkup(summary)).toContain("本轮完成 0 / 5 题");
  click(summary, "retry-practice-round"); (oldChild.props.onInteraction as (e: unknown) => void)({ type: "answer", result: { completed: true } }); click(oldBoard, "hint");
  click(h.round(), "finish-practice-round"); summary = h.round(); expect(renderToStaticMarkup(summary)).toContain("本轮完成 0 / 5 题");
  click(summary, "next-practice-round"); click(h.round(), "finish-practice-round"); click(h.round(), "next-practice-round");
  expect((h.child().props.exercise as Exercise).id).toBe(getPracticeTopics(h.progress)[0].items[10].exercise.id);
  click(h.round(), "finish-practice-round"); expect(renderToStaticMarkup(h.round())).toContain("从本主题重新开始"); click(h.round(), "next-practice-round"); expect((h.child().props.exercise as Exercise).id).toBe("s1-center");
  const stale = h.child(); click(h.round(), "finish-practice-round"); const oldSummary = h.round(); click(oldSummary, "back-practice-picker");
  (stale.props.onInteraction as (e: unknown) => void)({ type: "answer", result: { completed: true } }); click(oldSummary, "next-practice-round");
  expect(elements(h.picker()).some(e => e.props["data-action"] === "start-practice-round")).toBe(true);
});
it("disables retry after all independent answers and ignores unmounted handlers", () => {
  const h = setup(); for (let i = 0; i < 5; i++) { h.answer(); click(h.round(), "next-practice-question"); }
  const tree = h.round(); expect(button(tree, "retry-practice-round").props.disabled).toBe(true); unmount("round"); click(tree, "next-practice-round"); expect(elements(h.round()).some(e => e.props["data-practice-summary"] !== undefined)).toBe(true);
});
it("runs all five real action kinds through the round model without treating group selection as an answer", () => {
  const progress = createDefaultProgress(); progress.completedUnitIds = [...LESSON_UNIT_IDS]; progress.bestQuizScores = { "stage-1": 100, "stage-2": 100 };
  const items = getPracticeTopics(progress).flatMap(topic => topic.items);
  const kinds = ["move", "pass", "choice", "select-group", "mark-dead"];
  const round = createPracticeRound(kinds.map(kind => items.find(item => item.exercise.expected.kind === kind)!))!;
  const h = setup(round);
  for (const kind of kinds) { expect((h.child().props.exercise as Exercise).expected.kind).toBe(kind); h.answer(); click(h.round(), "next-practice-question"); }
  expect(renderToStaticMarkup(h.round())).toContain("独立首答完成 5 题");
});
it("keeps an invalid position unfinished and still allows ending the round", () => {
  const unit = CURRICULUM.find(unit => unit.kind === "lesson")!; if (unit.kind !== "lesson") throw new Error("lesson");
  const exercise = structuredClone(unit.exercises[0]); exercise.position.setupMoves = [{ x: -1, y: 0 }];
  const h = setup(createPracticeRound([{ unitId: unit.id, title: unit.title, exercise, terms: unit.terms }])!);
  expect(renderToStaticMarkup(h.board())).toContain("本题暂不可用"); expect(button(h.round(), "next-practice-question").props.disabled).toBe(true);
  click(h.round(), "finish-practice-round"); expect(renderToStaticMarkup(h.round())).toContain("本轮完成 0 / 1 题"); expect(elements(h.round()).some(e => e.props["data-status"] === "unfinished")).toBe(true);
});
it("disables empty wrong-question groups and snapshots only filtered current-topic items", () => {
  const progress = createDefaultProgress(); const view = () => renderComponent(() => PracticePicker({ progress, onClose() {} }));
  let tree = view(); const wrong = elements(tree).find(e => e.props["data-practice-topic"] === "wrong")!; (wrong.props.onClick as () => void)(); tree = view();
  expect(button(tree, "start-practice-round").props.disabled).toBe(true); click(tree, "start-practice-round"); expect(elements(view()).some(e => e.props["data-practice-topic"])).toBe(true);
  const topic = elements(tree).find(e => e.props["data-practice-topic"] === "placement")!; (topic.props.onClick as () => void)(); tree = view(); click(tree, "start-practice-round");
  const e = elements(view()).find(e => typeof e.type === "function")!; const snapshot = e.props.initialRound as PracticeRound;
  expect(snapshot.items.map(item => item.exercise.id)).toEqual(getPracticeTopics(progress)[0].items.slice(0, 5).map(item => item.exercise.id));
  progress.completedUnitIds = [...LESSON_UNIT_IDS]; expect(snapshot.source).toHaveLength(3); expect(progress.termStates).toEqual({});
});
it("rejects round and board callbacks immediately after the picker closes", () => {
  const h = setup(); const child = h.child(); const tree = h.board(); const pickerTree = h.picker();
  const close = elements(pickerTree).filter(e => e.type === "button").at(-1)!; (close.props.onClick as () => void)(); expect(h.close).toHaveBeenCalledOnce();
  (child.props.onInteraction as (e: unknown) => void)({ type: "answer", result: { completed: true } }); click(tree, "hint"); click(tree, "retry");
  expect(button(h.round(), "next-practice-question").props.disabled).toBe(true);
});
