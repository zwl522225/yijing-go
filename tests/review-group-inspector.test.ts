import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewGroupInspector } from "@/components/game/review-group-inspector";
import { GoBoard } from "@/components/game/go-board";
import { createGame, passTurn } from "@/lib/go/rules";
import { analyzeReview } from "@/lib/go/review";
import * as liberties from "@/lib/go/review-liberties";

const host = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[], pending: [] as (() => void)[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useId: () => "inspection-test", useMemo: (fn: () => unknown) => fn(),
  useState(initial: unknown) { const i = host.cursor++; if (!(i in host.values)) host.values[i] = typeof initial === "function" ? (initial as () => unknown)() : initial; return [host.values[i], (next: unknown) => { host.values[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(host.values[i]) : next; }]; },
  useRef(initial: unknown) { const i = host.cursor++; return host.values[i] ?? (host.values[i] = { current: initial }); },
  useLayoutEffect(effect: () => void | (() => void)) { const i = host.cursor++; if (i in host.values) return; host.values[i] = true; host.pending.push(() => { const cleanup = effect(); if (cleanup) host.effects.push(cleanup); }); },
}));
beforeEach(() => { host.values = []; host.effects = []; host.pending = []; host.cursor = 0; });
afterEach(() => { host.effects.forEach(cleanup => cleanup()); vi.restoreAllMocks(); });
function nodes(node: unknown): ReactElement<Record<string, unknown>>[] { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); const e = node as ReactElement<Record<string, unknown>>; return [e, ...nodes(e.props?.children)]; }
function find(tree: unknown, attribute: string, value: unknown) { const e = nodes(tree).find(e => e.props?.[attribute] === value); expect(e, `${attribute}=${value}`).toBeDefined(); return e!; }
function click(tree: unknown, value: string) { (find(tree, "data-action", value).props.onClick as () => void)(); }
function boardProps(tree: unknown) { return nodes(tree).find(e => e.type === GoBoard)!.props as Parameters<typeof GoBoard>[0]; }
function inspect(tree: unknown, x: number, y: number) { boardProps(tree).inspection?.onInspect({ x, y }); }
const state = createGame({ size: 9, stones: [["black", 1, 1], ["black", 2, 1], ["black", 3, 1], ["black", 4, 1], ["white", 8, 8]] });
const base = { state, source: state, index: 0, step: { status: "opening" as const }, mode: "play" as const, title: "复盘", eyebrow: "复盘", prompt: "只读" };
function setup(overrides: Partial<Parameters<typeof ReviewGroupInspector>[0]> = {}) {
  let props: Parameters<typeof ReviewGroupInspector>[0] = { ...base, ...overrides };
  const draw = (flush = true) => { host.cursor = 0; const tree = ReviewGroupInspector(props); if (flush) host.pending.splice(0).forEach(fn => fn()); return tree; };
  return { draw, change(next: Partial<typeof props>, flush = true) { props = { ...props, ...next }; return draw(flush); }, expand() { click(draw(), "toggle-review-inspection"); return draw(); } };
}
const html = (tree: ReactNode) => renderToStaticMarkup(tree);

describe("review group inspection", () => {
  it("starts collapsed with the single original read-only board and no write capabilities", () => {
    const tree = setup().draw(), props = boardProps(tree);
    expect(find(tree, "data-action", "toggle-review-inspection").props["aria-expanded"]).toBe(false);
    expect(props.readOnly).toBe(true); expect(props.inspection).toBeUndefined();
    expect(nodes(tree).filter(e => e.type === GoBoard)).toHaveLength(1);
    expect(Object.keys(props)).not.toContain("onConfirm");
    const before = JSON.stringify(state); props.onPlay({ x: 0, y: 0 }); props.onToggleDead({ x: 1, y: 1 }); expect(JSON.stringify(state)).toBe(before);
  });
  it("uses one real group result for all markers, sorted coordinates, counts and empty-point explanation", () => {
    const query = vi.spyOn(liberties, "inspectReviewGroup"), h = setup(); let tree = h.expand();
    expect(html(tree)).toContain("起始摆子"); expect(html(tree)).toContain("此前历史");
    inspect(tree, 2, 1); tree = h.draw();
    expect(query).toHaveBeenCalledExactlyOnceWith(state, { x: 2, y: 1 });
    const text = html(tree); expect(text).toContain("共4颗子，有10口气");
    expect(text.match(/data-inspected-group="true"/g)).toHaveLength(4); expect(text.match(/data-liberty="true"/g)).toHaveLength(10);
    expect(nodes(tree).filter(e => e.props["data-liberty-coordinate"]).map(e => e.props["data-liberty-coordinate"])).toEqual(["1,0", "2,0", "3,0", "4,0", "0,1", "5,1", "1,2", "2,2"]);
    expect(text).not.toContain("等待确认"); expect(text).not.toContain("stone-preview");
    inspect(tree, 0, 0); tree = h.draw(); expect(html(tree)).toContain("这是空点，请点一颗棋子"); expect(html(tree)).not.toContain('data-inspected-group="true"'); expect(html(tree)).not.toContain('data-liberty="true"');
  });
  it("paginates eight coordinates while retaining every marker and guarding focused boundary controls", () => {
    const h = setup(); let tree = h.expand(); inspect(tree, 1, 1); tree = h.draw();
    expect(find(tree, "data-action", "previous-liberty-page").props["aria-disabled"]).toBe(true);
    expect(find(tree, "data-action", "previous-liberty-page").props.disabled).toBeUndefined();
    const next = find(tree, "data-action", "next-liberty-page").props.onClick as () => void; next(); next(); tree = h.draw();
    expect(nodes(tree).filter(e => e.props["data-liberty-coordinate"]).map(e => e.props["data-liberty-coordinate"])).toEqual(["3,2", "4,2"]);
    expect(html(tree).match(/data-liberty="true"/g)).toHaveLength(10);
    expect(find(tree, "data-action", "next-liberty-page").props["aria-disabled"]).toBe(true);
    click(tree, "next-liberty-page"); expect(nodes(h.draw()).filter(e => e.props["data-liberty-coordinate"])).toHaveLength(2);
    inspect(h.draw(), 8, 8); tree = h.draw(); expect(html(tree)).toContain("白棋"); expect(nodes(tree).filter(e => e.props["data-liberty-coordinate"])).toHaveLength(2);
  });
  it("has a polite status and controls 19路 queries without focusing the explanation", () => {
    const large = createGame({ size: 19 }), h = setup({ state: large, source: large }); let tree = h.expand();
    const change = (label: string, value: string) => { (find(tree, "aria-label", label).props.onChange as (e: unknown) => void)({ target: { value } }); tree = h.draw(); };
    change("列", "19"); change("行", "18"); click(tree, "inspect-review-point"); tree = h.draw();
    expect(html(tree)).toContain("（19，18）这是空点");
    const status = find(tree, "className", "review-inspection-description"); expect(status.props.role).toBe("status"); expect(status.props["aria-live"]).toBe("polite"); expect(status.props.tabIndex).toBeUndefined();
    click(tree, "toggle-review-inspection"); tree = h.expand(); expect(find(tree, "aria-label", "列").props.value).toBe(1); expect(find(tree, "aria-label", "行").props.value).toBe(1); expect(html(tree)).not.toContain("（19，18）");
  });
  it("collapsing clears selection and pages, rejects old callbacks and rapid duplicate toggles", () => {
    const h = setup(); const collapsed = h.draw(); click(collapsed, "toggle-review-inspection"); click(collapsed, "toggle-review-inspection"); let tree = h.draw();
    expect(boardProps(tree).inspection).toBeDefined(); inspect(tree, 1, 1); tree = h.draw();
    const oldInspect = boardProps(tree).inspection!.onInspect, oldPage = find(tree, "data-action", "next-liberty-page").props.onClick as () => void, oldToggle = find(tree, "data-action", "toggle-review-inspection").props.onClick as () => void;
    click(tree, "toggle-review-inspection"); tree = h.expand(); oldInspect({ x: 1, y: 1 }); oldPage(); oldToggle(); tree = h.draw();
    expect(find(tree, "data-action", "toggle-review-inspection").props["aria-expanded"]).toBe(true); expect(nodes(tree).filter(e => e.props["data-liberty-coordinate"])).toHaveLength(0); expect(html(tree)).not.toContain("共4颗");
  });
  it.each(["index", "board", "source", "size", "status"])("synchronously resets and rejects retained events before effects on %s change and return", kind => {
    const h = setup(); let tree = h.expand(); inspect(tree, 1, 1); tree = h.draw(); const oldInspect = boardProps(tree).inspection!.onInspect;
    const changes = { index: { index: 1 }, board: { state: { ...state, board: state.board.map(row => [...row]) } }, source: { source: structuredClone(state) }, size: { state: createGame({ size: 13 }) }, status: { step: { status: "unavailable" as const } } };
    tree = h.change(changes[kind as keyof typeof changes], false); oldInspect({ x: 1, y: 1 });
    expect(boardProps(tree).inspection).toBeUndefined(); tree = h.change(base, false); oldInspect({ x: 1, y: 1 }); tree = h.expand(); oldInspect({ x: 1, y: 1 }); expect(html(h.draw())).not.toContain("共4颗");
  });
  it("keeps the selection across wrapper state objects with the same source, board and frame", () => {
    const h = setup(); let tree = h.expand(); inspect(tree, 1, 1); tree = h.change({ state: { ...state }, step: { status: "opening" } }); expect(html(tree)).toContain("共4颗");
  });
  it("does not restore state after unmount or allow retained queries to update it", () => {
    const h = setup(); const tree = h.expand(), oldInspect = boardProps(tree).inspection!.onInspect;
    host.effects.forEach(cleanup => cleanup()); const before = [...host.values]; oldInspect({ x: 1, y: 1 }); expect(host.values).toEqual(before);
    host.values = []; host.effects = []; expect(boardProps(h.draw()).inspection).toBeUndefined();
  });
  it("invalidates retained coordinate and query handlers on a new source at the same index", () => {
    const large = createGame({ size: 19 }), h = setup({ state: large, source: large }); const tree = h.expand();
    const oldChange = find(tree, "aria-label", "列").props.onChange as (e: unknown) => void, oldQuery = find(tree, "data-action", "inspect-review-point").props.onClick as () => void;
    h.change({ source: structuredClone(large) }, false); let fresh = h.expand(); oldChange({ target: { value: "19" } }); oldQuery(); fresh = h.draw(); expect(find(fresh, "aria-label", "列").props.value).toBe(1); expect(html(fresh)).not.toContain("这是空点");
  });
  it("allows verified frames, hides the toggle on unavailable frames and safely reports unavailable queries", () => {
    const source = passTurn(state), step = analyzeReview(source).steps[1], h = setup({ source, step, index: 1 }); let tree = h.expand(); expect(boardProps(tree).inspection).toBeDefined();
    vi.spyOn(liberties, "inspectReviewGroup").mockReturnValue({ kind: "unavailable", description: "查气暂不可用" }); inspect(tree, 1, 1); tree = h.draw(); expect(html(tree)).toContain("查气暂不可用"); expect(html(tree)).not.toContain('data-liberty="true"');
    tree = h.change({ step: { status: "unavailable" } }); expect(html(tree)).toContain("此手记录无法验证，暂不可查气"); expect(nodes(tree).some(e => e.props["data-action"] === "toggle-review-inspection")).toBe(false); expect(boardProps(tree).inspection).toBeUndefined();
  });
});

describe("GoBoard read-only inspection contract", () => {
  const props = () => ({ state, mode: "play" as const, title: "复盘", eyebrow: "复盘", prompt: "只读", hints: [], deadStones: new Set<string>(), aiThinking: false, onPlay: vi.fn(), onToggleDead: vi.fn(), inspection: { stones: [{ x: 1, y: 1 }], liberties: [{ x: 0, y: 1 }], onInspect: vi.fn() } });
  it.each(["play", "scoring"] as const)("ignores accidental inspection props for ordinary %s writers and markers", mode => {
    const p = { ...props(), mode }, tree = GoBoard(p); const point = find(tree, "aria-label", "2列2行，黑棋"); (point.props.onClick as () => void)();
    expect(mode === "play" ? p.onPlay : p.onToggleDead).toHaveBeenCalledExactlyOnceWith({ x: 1, y: 1 }); expect(p.inspection.onInspect).not.toHaveBeenCalled(); expect(html(tree)).not.toContain('data-inspected-group="true"'); expect(html(tree)).not.toContain('data-liberty="true"');
  });
  it("queries only read-only expanded boards with independent ARIA and complete row semantics", () => {
    const p = { ...props(), readOnly: true }, tree = GoBoard(p), rows = nodes(tree).filter(e => e.props.role === "row");
    expect(rows).toHaveLength(9); for (const row of rows) expect(nodes(row).filter(e => e.props.role === "gridcell")).toHaveLength(9);
    const point = find(tree, "data-inspected-group", true); expect(point.props["aria-label"]).toContain("选中棋块成员"); (point.props.onClick as () => void)(); expect(p.inspection.onInspect).toHaveBeenCalledExactlyOnceWith({ x: 1, y: 1 }); expect(p.onPlay).not.toHaveBeenCalled(); expect(p.onToggleDead).not.toHaveBeenCalled(); expect(find(tree, "data-liberty", true).props["aria-label"]).toContain("本块棋的气"); expect(html(tree)).not.toContain("等待确认");
    expect(nodes(tree).filter(e => e.props.role === "gridcell" && e.props.tabIndex === 0)).toHaveLength(1);
  });
  it("keeps collapsed read-only cells inert and retains arrow focus plus native Enter/Space button querying", () => {
    const p = { ...props(), readOnly: true, inspection: undefined }, tree = GoBoard(p), cells = nodes(tree).filter(e => e.props.role === "gridcell"); (cells[0].props.onClick as () => void)(); expect(p.onPlay).not.toHaveBeenCalled(); expect(p.onToggleDead).not.toHaveBeenCalled();
    const focus = vi.fn(); (cells[1].props.ref as (node: unknown) => void)({ focus }); const preventDefault = vi.fn(); (cells[0].props.onKeyDown as (event: unknown) => void)({ key: "ArrowRight", preventDefault }); expect(focus).toHaveBeenCalledOnce(); expect(preventDefault).toHaveBeenCalledOnce();
  });
});
