import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonDemo, PauseableLessonDemo } from "@/components/learning/lesson-demo";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import type { LessonUnit } from "@/lib/learning/types";
// A small hook host exercises the actual component and effect lifecycle in the
// project's Node test environment without requiring a simulated browser.
const host = vi.hoisted(() => ({ key: null as string | null, values: [] as unknown[], cursor: 0, effects: [] as {
        deps: unknown[];
        cleanup?: () => void;
    }[], effectCursor: 0, pending: [] as (() => void)[] }));
vi.mock("react", async (importOriginal) => ({
    ...await importOriginal<typeof import("react")>(),
    useState: (initial: unknown) => {
        const index = host.cursor++;
        if (!(index in host.values))
            host.values[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
        return [host.values[index], (next: unknown) => { host.values[index] = typeof next === "function" ? (next as (current: unknown) => unknown)(host.values[index]) : next; }];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
        const index = host.effectCursor++;
        const previous = host.effects[index];
        if (previous && deps.every((value, i) => Object.is(value, previous.deps[i])))
            return;
        host.pending.push(() => { previous?.cleanup?.(); host.effects[index] = { deps, cleanup: effect() || undefined }; });
    },
}));
function render(unit: LessonUnit) {
    return renderPlayback(LessonDemo({ unit }));
}
function renderPlayback(element: ReturnType<typeof LessonDemo>) {
    if (host.key !== element.key) {
        host.effects.forEach(effect => effect.cleanup?.());
        host.key = element.key;
        host.values = [];
        host.effects = [];
        host.pending = [];
    }
    host.cursor = 0;
    host.effectCursor = 0;
    const tree = (element.type as (props: {
        unit: LessonUnit;
    }) => ReactNode)(element.props);
    host.pending.splice(0).forEach(effect => effect());
    return tree;
}
function findButton(node: ReactNode, label: string): ReactElement<{
    onClick: () => void;
}> | undefined {
    if (Array.isArray(node))
        return node.map(child => findButton(child, label)).find(Boolean);
    if (!node || typeof node !== "object")
        return;
    const element = node as ReactElement<{
        children: ReactNode;
        onClick: () => void;
    }>;
    if (element.type === "button" && element.props.children === label)
        return element;
    return findButton(element.props.children, label);
}
const first = CURRICULUM_BY_ID.get("s1-intersections-turns") as LessonUnit;
const second = CURRICULUM_BY_ID.get("s1-liberties-groups") as LessonUnit;
beforeEach(() => { host.key = null; host.values = []; host.effects = []; host.pending = []; vi.useFakeTimers(); });
afterEach(() => { host.effects.forEach(effect => effect.cleanup?.()); vi.useRealTimers(); });
describe("lesson demonstration playback", () => {
    it("clears glossary playback when changing terms and starts at frame one when returning", () => {
        const renderTerm = (id: "liberty" | "group") => {
            const entry = GLOSSARY_BY_ID.get(id)!;
            return renderPlayback(PauseableLessonDemo({
                id: `term-${id}`, boardSize: entry.animation.position.size,
                frames: entry.animation.frames, choices: entry.practice.choices,
            }));
        };
        let tree = renderTerm("liberty");
        findButton(tree, "播放")!.props.onClick();
        renderTerm("liberty");
        expect(vi.getTimerCount()).toBe(1);
        vi.advanceTimersByTime(1600);
        tree = renderTerm("group");
        expect(vi.getTimerCount()).toBe(0);
        expect(findButton(tree, "上一步")!.props).toMatchObject({ disabled: true });
        findButton(tree, "播放")!.props.onClick();
        renderTerm("group");
        expect(vi.getTimerCount()).toBe(1);
        tree = renderTerm("liberty");
        expect(vi.getTimerCount()).toBe(0);
        expect(findButton(tree, "上一步")!.props).toMatchObject({ disabled: true });
        expect(findButton(tree, "播放")).toBeDefined();
    });
    it("runs a single timer only while playing and clears it on pause and unmount", () => {
        let tree = render(first);
        expect(vi.getTimerCount()).toBe(0);
        findButton(tree, "播放")!.props.onClick();
        tree = render(first);
        expect(vi.getTimerCount()).toBe(1);
        vi.advanceTimersByTime(1600);
        tree = render(first);
        findButton(tree, "暂停")!.props.onClick();
        tree = render(first);
        expect(vi.getTimerCount()).toBe(0);
        findButton(tree, "播放")!.props.onClick();
        render(first);
        host.effects.forEach(effect => effect.cleanup?.());
        expect(vi.getTimerCount()).toBe(0);
    });
    it("resets playback on unit change without starting a new timer", () => {
        const tree = render(first);
        findButton(tree, "播放")!.props.onClick();
        render(first);
        vi.advanceTimersByTime(1600);
        const changed = render(second);
        expect(vi.getTimerCount()).toBe(0);
        expect(findButton(changed, "播放")).toBeDefined();
        const returned = render(first);
        expect(vi.getTimerCount()).toBe(0);
        expect(findButton(returned, "播放")).toBeDefined();
    });
});
