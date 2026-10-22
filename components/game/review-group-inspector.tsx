"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { GoBoard } from "@/components/game/go-board";
import type { GameMode } from "@/hooks/use-go-game";
import type { ReviewStep } from "@/lib/go/review";
import { inspectReviewGroup, type ReviewGroupInspection } from "@/lib/go/review-liberties";
import type { GameState, Point } from "@/lib/go/types";
import type { LearningAssists } from "@/lib/learning/progress";

type Props = { state: GameState; source: GameState; index: number; step: ReviewStep; title: string; eyebrow: string; prompt: string; mode: GameMode; assists?: LearningAssists };
type View = { expanded: boolean; result: ReviewGroupInspection | null; column: number; row: number; page: number };
const initialView = (): View => ({ expanded: false, result: null, column: 1, row: 1, page: 0 });
const noWrite = () => {};

/** Owns only ephemeral observation state; no game or learning writers enter here. */
export function ReviewGroupInspector({ state, source, index, step, title, eyebrow, prompt, mode, assists }: Props) {
  const id = useId();
  const alive = useRef(true);
  const context = [source, state.board, state.size, index, step.status];
  const [stored, setStored] = useState(() => ({ context, view: initialView() }));
  let current = stored;
  if (!context.every((value, i) => Object.is(value, stored.context[i]))) {
    current = { context, view: initialView() };
    setStored(current);
  }
  const latest = useRef(current);
  // eslint-disable-next-line react-hooks/refs -- state renders the view; synchronously invalidate retained event closures before effects.
  latest.current = current;
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const view = current.view;
  const eligible = step.status === "opening" || step.status === "verified";
  const valid = () => alive.current && eligible && latest.current === current && latest.current.view === view;
  const update = (next: View) => {
    if (!valid()) return false;
    const nextState = { context: current.context, view: next };
    latest.current = nextState;
    setStored(nextState);
    return true;
  };
  const inspect = (point: Point) => {
    if (!valid() || !view.expanded) return;
    update({ ...view, result: inspectReviewGroup(state, point), page: 0 });
  };
  const expanded = eligible && view.expanded;
  const group = expanded && view.result?.kind === "group" ? view.result : null;
  const points = group ? [...group.liberties].sort((a, b) => a.y - b.y || a.x - b.x) : [];
  const pages = Math.ceil(points.length / 8);
  const changePage = (delta: number) => {
    const next = view.page + delta;
    if (expanded && next >= 0 && next < pages) update({ ...view, page: next });
  };
  const changeCoordinate = (field: "column" | "row", value: string) => {
    const next = Number(value);
    if (expanded && Number.isInteger(next) && next >= 1 && next <= state.size) update({ ...view, [field]: next });
  };
  return <div className="review-group-inspector">
    <GoBoard state={state} title={title} eyebrow={eyebrow} prompt={prompt} mode={mode} assists={assists} hints={[]} deadStones={new Set()} aiThinking={false} readOnly onPlay={noWrite} onToggleDead={noWrite}
      inspection={expanded ? { stones: group?.stones ?? [], liberties: group?.liberties ?? [], onInspect: inspect } : undefined} />
    <section className="review-inspection-panel" aria-label="复盘棋块查气">
      {eligible ? <button type="button" className="dictionary-button" data-action="toggle-review-inspection" aria-expanded={expanded} aria-controls={id}
        onClick={() => update({ ...initialView(), expanded: !view.expanded })}>点选棋块查气{expanded ? " · 收起" : ""}</button>
        : <p role="status">此手记录无法验证，暂不可查气</p>}
      <div id={id}>
        {expanded ? <>
          {step.status === "opening" ? <p className="review-inspection-note">当前显示本次复盘的起始摆子；此前历史并未因此得到验证。</p> : null}
          <p className="review-inspection-legend">图例：棋子描边表示选中棋块；空心圆表示本块棋的气。方向键浏览，Enter 或空格查看此点。</p>
          {state.size === 19 ? <div className="review-inspection-coordinates">
            <label>列<select aria-label="列" value={view.column} onChange={event => changeCoordinate("column", event.target.value)}>{Array.from({ length: state.size }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
            <label>行<select aria-label="行" value={view.row} onChange={event => changeCoordinate("row", event.target.value)}>{Array.from({ length: state.size }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
            <button type="button" className="dictionary-button" data-action="inspect-review-point" onClick={() => inspect({ x: view.column - 1, y: view.row - 1 })}>查看此点</button>
          </div> : null}
          <div className="review-inspection-description" role="status" aria-live="polite" aria-atomic="true">{view.result?.description ?? "点一颗黑子或白子，查看整块棋和它的气。"}</div>
          {group ? <>
            <ul className="review-liberty-coordinates" aria-label="本块棋的气点坐标">{points.slice(view.page * 8, (view.page + 1) * 8).map(point => <li key={`${point.x},${point.y}`} data-liberty-coordinate={`${point.x},${point.y}`}>（{point.x + 1}，{point.y + 1}）</li>)}</ul>
            <div className="review-liberty-pagination" aria-label="气点坐标翻页">
              <button type="button" className="dictionary-button" data-action="previous-liberty-page" aria-disabled={view.page === 0} onClick={() => changePage(-1)}>上一页</button>
              <span>第 {view.page + 1} / {pages} 页 · 共 {points.length} 个气点</span>
              <button type="button" className="dictionary-button" data-action="next-liberty-page" aria-disabled={view.page + 1 >= pages} onClick={() => changePage(1)}>下一页</button>
            </div>
          </> : null}
        </> : null}
      </div>
    </section>
  </div>;
}
