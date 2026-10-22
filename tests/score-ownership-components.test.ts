import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultDialog } from "@/components/game/result-dialog";
import { createGame, passTurn } from "@/lib/go/rules";
import { ScoreOwnershipBoard } from "@/components/game/score-ownership-board";
import * as scoring from "@/lib/go/scoring";

const host = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as { deps?: unknown[]; cleanup?: () => void }[], effectCursor: 0, pending: [] as (() => void)[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useId: () => "ownership-test", useMemo: (fn: () => unknown) => fn(),
  useState(initial: unknown) { const i = host.cursor++; if (!(i in host.values)) host.values[i] = typeof initial === "function" ? (initial as () => unknown)() : initial; return [host.values[i], (next: unknown) => { host.values[i] = typeof next === "function" ? (next as (v: unknown) => unknown)(host.values[i]) : next; }]; },
  useRef(initial: unknown) { const i = host.cursor++; return host.values[i] ?? (host.values[i] = { current: initial }); },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const i = host.effectCursor++, old = host.effects[i]; if (deps && old?.deps && deps.length === old.deps.length && deps.every((v, n) => Object.is(v, old.deps![n]))) return; host.pending.push(() => { old?.cleanup?.(); host.effects[i] = { deps, cleanup: effect() || undefined }; }); },
  useLayoutEffect(effect: () => void | (() => void), deps?: unknown[]) { const i = host.effectCursor++, old = host.effects[i]; if (deps && old?.deps && deps.length === old.deps.length && deps.every((v, n) => Object.is(v, old.deps![n]))) return; host.pending.push(() => { old?.cleanup?.(); host.effects[i] = { deps, cleanup: effect() || undefined }; }); },
}));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ children }: { children: ReactNode }) => createElement("div", null, children), DialogContent: ({ children }: { children: ReactNode }) => createElement("section", null, children), DialogHeader: "header", DialogTitle: "h2", DialogDescription: "p", DialogFooter: "footer" }));
const base = { open: true, state: passTurn(passTurn(createGame({ size: 5, stones: [["black", 0, 0], ["white", 4, 4]] }))), deadStones: new Set<string>(), outcome: null, phase: "score-review" as const, graduated: false, onToggleDead: vi.fn(), onNewGame: vi.fn(), onConfirmDead: vi.fn(), onConfirmScore: vi.fn(), onReturnAcademy: vi.fn() };
beforeEach(() => { host.values = []; host.effects = []; host.pending = []; });
afterEach(() => { host.effects.forEach(e => e.cleanup?.()); vi.restoreAllMocks(); });
function nodes(node: unknown): ReactElement<Record<string, unknown>>[] { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); const e = node as ReactElement<Record<string, unknown>>; return [e, ...nodes(e.props?.children)]; }
function find(tree: unknown, attribute: string, value: unknown) { const e = nodes(tree).find(e => e.props?.[attribute] === value); expect(e, `${attribute}=${value}`).toBeDefined(); return e!; }
function invoke(tree: unknown, attribute: string, value: unknown) { (find(tree, attribute, value).props.onClick as () => void)(); }
function setup(overrides: Partial<Parameters<typeof ScoreOwnershipBoard>[0]> = {}) {
  let props: Parameters<typeof ScoreOwnershipBoard>[0] = { ...base, ...overrides };
  const draw = (flush = true) => { host.cursor = host.effectCursor = 0; const tree = ScoreOwnershipBoard(props); if (flush) host.pending.splice(0).forEach(fn => fn()); return tree; };
  return { draw, change(next: Partial<typeof props>, flush = true) { props = { ...props, ...next }; return draw(flush); }, expand() { invoke(draw(), "data-action", "toggle-score-ownership"); return draw(); } };
}
function html(tree: ReactNode) { return renderToStaticMarkup(tree); }
describe("confirmed score ownership", () => {
  it("offers the reader only for an open real two-pass confirmed result", () => {
    expect(renderToStaticMarkup(createElement(ResultDialog, base))).toContain('data-action="toggle-score-ownership"');
    for (const props of [{ ...base, phase: "dead-stones" as const }, { ...base, open: false }, { ...base, outcome: "白方认输" }, { ...base, state: createGame({ size: 5 }) }, { ...base, state: { ...createGame({ size: 5 }), consecutivePasses: 2 } }]) {
      expect(renderToStaticMarkup(createElement(ResultDialog, props))).not.toContain('data-action="toggle-score-ownership"');
    }
  });
  it("starts with one disabled original board, then exposes real facts and all four count filters", () => {
    const h = setup(); const initial = h.draw(); expect(find(initial, "data-action", "toggle-score-ownership").props["aria-expanded"]).toBe(false);
    expect(nodes(initial).filter(e => e.props.role === "grid")).toHaveLength(1);
    expect(nodes(initial).filter(e => e.props.role === "gridcell").every(e => e.props.disabled)).toBe(true);
    const tree = h.expand(); expect(nodes(tree).filter(e => e.props.role === "gridcell")).toHaveLength(25);
    expect(nodes(tree).filter(e => e.props["data-score-ownership-filter"])).toHaveLength(4);
    expect(html(tree)).toContain("黑方空点 0"); expect(html(tree)).toContain("白方空点 0"); expect(html(tree)).toContain("未归属点 23");
    expect(html(tree)).toContain("原棋谱不变"); expect(html(tree)).toContain("贴目只参与算式");
    const control = find(tree, "data-action", "toggle-score-ownership"); expect(find(tree, "id", control.props["aria-controls"])).toBeDefined();
  });
  it("groups read-only gridcells into board rows", () => {
    const h = setup(); const tree = h.expand(); const rows = nodes(find(tree, "role", "grid")).filter(e => e.props.role === "row");
    expect(rows).toHaveLength(base.state.size);
    for (const row of rows) expect(nodes(row).filter(e => e.props.role === "gridcell")).toHaveLength(base.state.size);
  });
  it("announces the point explanation as a polite status", () => {
    const h = setup(); const status = find(h.expand(), "aria-live", "polite");
    expect(status.props.role).toBe("status"); expect(status.props["aria-atomic"]).toBe("true");
  });
  it("keeps every point queryable through zero filters and clears selection on filtering", () => {
    const h = setup(); let tree = h.expand(); invoke(tree, "data-score-ownership-point", "1,0"); tree = h.draw();
    expect(html(tree)).toContain("第2列，第1行：未归属点"); expect(html(tree)).toContain("共23个空点"); expect(html(tree)).toContain("接触黑白双方");
    expect(nodes(tree).filter(e => e.props["data-score-ownership-region-selected"])).toHaveLength(23);
    invoke(tree, "data-score-ownership-filter", "black"); tree = h.draw(); expect(html(tree)).toContain("本局没有黑方空点"); expect(html(tree)).not.toContain("第2列，第1行：");
    expect(find(tree, "data-score-ownership-filter", "black").props["aria-pressed"]).toBe(true);
    invoke(tree, "data-score-ownership-point", "4,4"); expect(html(h.draw())).toContain("这是一颗计入白方的棋子");
  });
  it("describes removed original colors, clears the board only in the illustration and never mutates input", () => {
    const state = structuredClone(base.state), deadStones = new Set(["4,4"]), before = JSON.stringify(state); const h = setup({ state, deadStones });
    let tree = h.expand(); expect(find(tree, "data-score-ownership-point", "4,4").props["aria-label"]).toContain("原白子已按确认结果移除");
    invoke(tree, "data-score-ownership-point", "4,4"); tree = h.draw(); expect(html(tree)).toContain("原白子已按确认结果移除"); expect(html(tree)).toContain("黑方空点");
    expect(JSON.stringify(state)).toBe(before); expect([...deadStones]).toEqual(["4,4"]);
  });
  it("has a single grid Tab stop, arrow focus movement and keyboard inspection without forcing answer focus", () => {
    const h = setup(); let tree = h.expand(); const first = find(tree, "data-score-ownership-point", "0,0"), focus = vi.fn();
    (find(tree, "data-score-ownership-point", "1,0").props.ref as (node: unknown) => void)({ focus });
    const preventDefault = vi.fn(); (first.props.onKeyDown as (e: unknown) => void)({ key: "ArrowRight", preventDefault }); tree = h.draw();
    expect(focus).toHaveBeenCalledOnce(); expect(nodes(tree).filter(e => e.props.role === "gridcell" && e.props.tabIndex === 0)).toHaveLength(1);
    const next = find(tree, "data-score-ownership-point", "1,0"); expect(next.props.tabIndex).toBe(0);
    (next.props.onKeyDown as (e: unknown) => void)({ key: " ", preventDefault }); tree = h.draw(); expect(html(tree)).toContain("第2列，第1行");
    expect(find(tree, "aria-live", "polite").props.tabIndex).toBeUndefined(); expect(focus).toHaveBeenCalledOnce();
  });
  it("queries 19路 with one-based coordinate controls, and collapse resets coordinates, focus, selection and filter", () => {
    const state = passTurn(passTurn(createGame({ size: 19 }))); const h = setup({ state }); let tree = h.expand();
    (find(tree, "aria-label", "列").props.onChange as (e: unknown) => void)({ target: { value: "19" } }); tree = h.draw();
    (find(tree, "aria-label", "行").props.onChange as (e: unknown) => void)({ target: { value: "18" } }); tree = h.draw();
    invoke(tree, "data-action", "inspect-score-point"); tree = h.draw(); expect(html(tree)).toContain("第19列，第18行"); expect(html(tree)).toContain("没有棋子边界");
    invoke(tree, "data-score-ownership-filter", "white"); tree = h.draw(); invoke(tree, "data-action", "toggle-score-ownership"); tree = h.expand();
    expect(find(tree, "aria-label", "列").props.value).toBe(1); expect(find(tree, "aria-label", "行").props.value).toBe(1);
    expect(find(tree, "data-score-ownership-filter", "all").props["aria-pressed"]).toBe(true); expect(html(tree)).not.toContain("第19列，第18行："); expect(find(tree, "data-score-ownership-point", "0,0").props.tabIndex).toBe(0);
  });
  it("rejects same-render double toggles and all retained prior-view handlers", () => {
    const h = setup(); const collapsed = h.draw(); invoke(collapsed, "data-action", "toggle-score-ownership"); invoke(collapsed, "data-action", "toggle-score-ownership"); let tree = h.draw();
    const oldPoint = find(tree, "data-score-ownership-point", "1,0").props.onClick as () => void;
    const oldFilter = find(tree, "data-score-ownership-filter", "white").props.onClick as () => void;
    invoke(tree, "data-action", "toggle-score-ownership"); tree = h.expand(); oldPoint(); oldFilter(); tree = h.draw(); expect(html(tree)).not.toContain("第2列，第1行："); expect(find(tree, "data-score-ownership-filter", "all").props["aria-pressed"]).toBe(true);
  });
  it.each(["open", "phase", "dead-phase", "board", "dead", "size", "outcome"])("invalidates old events synchronously on %s context change and on returning", kind => {
    const h = setup(); const tree = h.expand(); const old = find(tree, "data-score-ownership-point", "1,0").props.onClick as () => void;
    const changes = { open: { open: false }, phase: { phase: "final" as const }, "dead-phase": { phase: "dead-stones" as const }, board: { state: { ...base.state, board: base.state.board.map(row => [...row]) } }, dead: { deadStones: new Set(["4,4"]) }, size: { state: passTurn(passTurn(createGame({ size: 9 }))) }, outcome: { outcome: "黑方认输" } };
    h.change(changes[kind as keyof typeof changes], false); old(); h.change(base); const fresh = h.expand(); old(); expect(html(h.draw())).not.toContain("第2列，第1行："); expect(find(fresh, "data-score-ownership-filter", "all").props["aria-pressed"]).toBe(true);
  });
  it("ignores a retained callback after unmount", () => {
    const h = setup(); const tree = h.expand(); const old = find(tree, "data-score-ownership-point", "1,0").props.onClick as () => void;
    host.effects.forEach(e => e.cleanup?.()); const before = [...host.values]; old(); expect(host.values).toEqual(before);
  });
  it.each(["bad-facts", "wrong-source", "throw"])("falls back to the original board on %s analysis without changing summary or actions", kind => {
    const analysis = scoring.analyzeArea(base.state.board, base.deadStones);
    vi.spyOn(scoring, "analyzeArea").mockImplementation(() => { if (kind === "throw") throw Error("bad"); if (kind === "bad-facts") return { ...analysis, points: [] }; return scoringResult; });
    const scoringResult = { ...analysis, board: analysis.board.map(row => [...row]), removed: [{ point: { x: 4, y: 4 }, color: "white" as const }] };
    const h = setup(); const tree = h.draw(); expect(html(tree)).toContain("计分归属暂不可用"); expect(nodes(tree).filter(e => e.props.role === "gridcell").every(e => e.props.disabled)).toBe(true);
  });
});
