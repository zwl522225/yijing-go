import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePractice } from "@/components/learning/practice-picker";
import type { PracticeInteraction } from "@/components/learning/exercise-practice";
import { CURRICULUM } from "@/lib/learning/curriculum";
import type { Exercise } from "@/lib/learning/types";

const host = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effectCursor: 0,
  effects: [] as { deps?: unknown[]; cleanup?: () => void }[], pending: [] as (() => void)[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const i = host.cursor++; if (!(i in host.values)) host.values[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [host.values[i], (next: unknown) => { host.values[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(host.values[i]) : next; }]; },
  useRef(initial: unknown) { const i = host.cursor++; return host.values[i] ?? (host.values[i] = { current: initial }); },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const i = host.effectCursor++; const old = host.effects[i];
    if (deps && old?.deps && deps.length === old.deps.length && deps.every((v, n) => Object.is(v, old.deps![n]))) return;
    host.pending.push(() => { old?.cleanup?.(); host.effects[i] = { deps, cleanup: effect() || undefined }; }); },
}));
function render(fn: () => ReactNode) { host.cursor = 0; host.effectCursor = 0; const tree = fn(); host.pending.splice(0).forEach(fn => fn()); return tree; }
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] { if (Array.isArray(node)) return node.flatMap(elements); if (!node || typeof node !== "object") return []; const e = node as ReactElement<Record<string, unknown>>; return [e, ...elements(e.props?.children as ReactNode)]; }
function handler(tree: ReactNode, attr: string, value: string) { const el = elements(tree).find(e => e.props[attr] === value); expect(el).toBeDefined(); return el!.props.onClick as () => void; }
const exercises = CURRICULUM.flatMap(unit => unit.kind === "lesson" ? unit.exercises : unit.kind === "quiz" ? unit.questions : []);
function answer(tree: ReactNode, exercise: Exercise, view: () => ReactNode) { const action = exercise.expected;
  if (action.kind === "choice") handler(tree, "data-choice-id", action.choiceId)();
  else if (action.kind === "pass") handler(tree, "data-action", "pass")();
  else { handler(tree, "data-practice-point", `${action.point.x},${action.point.y}`)(); if (action.kind === "select-group" || action.kind === "mark-dead") handler(render(view), "data-action", action.kind)(); }
}
beforeEach(() => { host.values = []; host.effects = []; host.pending = []; });
afterEach(() => host.effects.forEach(e => e.cleanup?.()));
describe("real exercise interaction events", () => {
  it.each(["move", "pass", "choice", "select-group", "mark-dead"])("reports the actual %s result once even for a same-frame double submission", kind => {
    const exercise = exercises.find(e => e.expected.kind === kind)!; const events = vi.fn(); const complete = vi.fn();
    const view = () => ExercisePractice({ exercise, label: "练习", onInteraction: events, onComplete: complete });
    const tree = render(view); const action = exercise.expected;
    if (action.kind === "select-group" || action.kind === "mark-dead") {
      handler(tree, "data-action", action.kind)(); expect(events).not.toHaveBeenCalled();
      handler(tree, "data-practice-point", `${action.point.x},${action.point.y}`)(); expect(events).not.toHaveBeenCalled();
      const submit = handler(render(view), "data-action", action.kind); submit(); submit();
    } else {
      const submit = action.kind === "choice" ? handler(tree, "data-choice-id", action.choiceId) : action.kind === "pass" ? handler(tree, "data-action", "pass") : handler(tree, "data-practice-point", `${action.point.x},${action.point.y}`);
      submit(); submit();
    }
    expect(events).toHaveBeenCalledOnce(); expect(events.mock.calls[0][0]).toMatchObject({ type: "answer", result: { completed: true } }); expect(complete).toHaveBeenCalledOnce();
  });
  it("reports goal and rule failures and reveals at most three hints synchronously", () => {
    const exercise = exercises.find(e => e.expected.kind === "move")!; const events: PracticeInteraction[] = [];
    const view = () => ExercisePractice({ exercise, label: "练习", onInteraction: e => events.push(e) }); let tree = render(view);
    handler(tree, "data-practice-point", "0,0")(); expect(events[0]).toMatchObject({ type: "answer", result: { completed: false, failure: { kind: "goal" } } });
    tree = render(view); const hint = handler(tree, "data-action", "hint"); for (let n = 0; n < 5; n++) hint();
    expect(events.filter(e => e.type === "hint")).toHaveLength(3);
    handler(tree, "data-action", "retry")(); expect(events.at(-1)).toEqual({ type: "reset" });
    const occupied = exercises.find(e => e.expected.kind === "move" && e.position.stones.length)!; host.values = []; host.effects = [];
    const occupiedView = () => ExercisePractice({ exercise: occupied, label: "练习", onInteraction: e => events.push(e) }); tree = render(occupiedView);
    const point = occupied.position.stones[0]; handler(tree, "data-practice-point", `${point[1]},${point[2]}`)();
    expect(events.at(-1)).toMatchObject({ type: "answer", result: { completed: false, failure: { kind: "rule", reason: "occupied" } } });
  });
  it("locks completed round resets while free practice can restart and complete again", () => {
    for (const lockCompleted of [true, false]) {
      host.values = []; host.effects = []; const exercise = exercises[0]; const events = vi.fn(); const complete = vi.fn();
      const view = () => ExercisePractice({ exercise, label: "练习", lockCompleted, onInteraction: events, onComplete: complete });
      answer(render(view), exercise, view); const tree = render(view); handler(tree, "data-action", "retry")();
      expect(events.mock.calls.filter(([e]) => e.type === "reset")).toHaveLength(lockCompleted ? 0 : 1);
      if (!lockCompleted) { answer(render(view), exercise, view); expect(complete).toHaveBeenCalledTimes(2); }
    }
  });
  it("blocks all old callbacks when inactive or unmounted", () => {
    let active = true; const events = vi.fn(); const exercise = exercises[0]; const complete = vi.fn();
    const view = () => ExercisePractice({ exercise, label: "练习", isActive: () => active, onInteraction: events, onComplete: complete }); const tree = render(view);
    active = false; answer(tree, exercise, view); handler(tree, "data-action", "hint")(); handler(tree, "data-action", "retry")();
    expect(events).not.toHaveBeenCalled(); active = true; host.effects.forEach(e => e.cleanup?.()); answer(tree, exercise, view); handler(tree, "data-action", "hint")(); handler(tree, "data-action", "retry")();
    expect(events).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });
  it("contains invalid position errors locally without reporting success", () => {
    const exercise = structuredClone(exercises[0]); exercise.position.setupMoves = [{ x: -1, y: 0 }]; const complete = vi.fn(); const events = vi.fn();
    const tree = render(() => ExercisePractice({ exercise, label: "练习", onComplete: complete, onInteraction: events }));
    expect(renderToStaticMarkup(tree)).toContain("本题暂不可用"); expect(complete).not.toHaveBeenCalled(); expect(events).not.toHaveBeenCalled();
  });
});
