"use client";

import { useLayoutEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { analyzeArea, type AreaPointKind } from "@/lib/go/scoring";
import { describeAreaPoint, validateAreaAnalysis } from "@/lib/go/score-ownership";
import type { GameState, Point } from "@/lib/go/types";
import type { ScorePhase } from "@/lib/go/storage";
import { cn } from "@/lib/utils";

type Props = { state: GameState; deadStones: Set<string>; open: boolean; phase: ScorePhase; outcome: string | null };
type Filter = "all" | "black" | "white" | "neutral";
type View = { expanded: boolean; filter: Filter; selected: Point | null; column: number; row: number; focus: string };
const initialView = (): View => ({ expanded: false, filter: "all", selected: null, column: 1, row: 1, focus: "0,0" });
const labels: Record<AreaPointKind, string> = { "black-stone": "黑棋，计入黑方的棋子", "white-stone": "白棋，计入白方的棋子", "black-territory": "黑方空点", "white-territory": "白方空点", neutral: "未归属点" };
const pointKey = ({ x, y }: Point) => `${x},${y}`;

/** Local explanation state only; no game or learning write callbacks enter this component. */
export function ScoreOwnershipBoard({ state, deadStones, open, phase, outcome }: Props) {
  const id = useId();
  const alive = useRef(true);
  const context = [open, phase, state.board, deadStones, state.size, outcome, state.consecutivePasses, state.moves];
  const [stored, setStored] = useState(() => ({ context, view: initialView() }));
  let current = stored;
  if (!context.every((value, i) => Object.is(value, stored.context[i]))) {
    current = { context, view: initialView() };
    setStored(current);
  }
  const latest = useRef(current);
  // This event guard must invalidate old handlers before passive effects can run.
  // eslint-disable-next-line react-hooks/refs -- display comes from state; this ref only guards retained event closures synchronously.
  latest.current = current;
  const view = current.view;
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const eligible = open && !outcome && (phase === "score-review" || phase === "final") && state.consecutivePasses >= 2 &&
    state.moves.length >= 2 && state.moves.slice(-2).every(move => "pass" in move);
  const analysis = useMemo(() => {
    if (!eligible) return null;
    try {
      const result = analyzeArea(state.board, deadStones, 7.5);
      return validateAreaAnalysis(result, state.size, { source: state.board, deadStones }) ? result : null;
    } catch { return null; }
  }, [eligible, state.board, deadStones, state.size]);
  const valid = () => alive.current && eligible && latest.current === current && latest.current.view === view;
  const update = (next: View) => { if (!valid()) return false; const nextState = { context: current.context, view: next }; latest.current = nextState; setStored(nextState); return true; };
  const inspect = (point: Point) => {
    if (!view.expanded || !analysis) return;
    update({ ...view, selected: point, focus: pointKey(point) });
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, point: Point) => {
    if (!valid()) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspect(point); return; }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = { x: Math.max(0, Math.min(state.size - 1, point.x + delta[0])), y: Math.max(0, Math.min(state.size - 1, point.y + delta[1])) };
    if (update({ ...view, focus: pointKey(next) })) cells.current.get(pointKey(next))?.focus();
  };
  const expanded = eligible && !!analysis && view.expanded;
  const selectedFact = expanded && view.selected ? analysis.points[view.selected.y][view.selected.x] : null;
  const description = expanded && view.selected ? describeAreaPoint(analysis, view.selected) : null;
  const counts = analysis ? { black: analysis.score.black.territory, white: analysis.score.white.territory, neutral: analysis.score.neutral } : { black: 0, white: 0, neutral: 0 };
  const filters: { value: Filter; label: string }[] = [{ value: "all", label: "全部" }, { value: "black", label: `黑方空点 ${counts.black}` }, { value: "white", label: `白方空点 ${counts.white}` }, { value: "neutral", label: `未归属点 ${counts.neutral}` }];
  const emptyFilter = view.filter !== "all" && counts[view.filter] === 0 ? `本局没有${view.filter === "black" ? "黑方空点" : view.filter === "white" ? "白方空点" : "未归属点"}。仍可点查任意棋子或空点。` : null;
  const removed = new Map(analysis?.removed.map(({ point, color }) => [pointKey(point), color]));
  if (phase === "dead-stones" || outcome) return null;
  return <div className="score-ownership">
    {eligible ? analysis ? <button type="button" className="score-ownership-toggle" data-action="toggle-score-ownership" aria-expanded={expanded} aria-controls={id}
      onClick={() => update(initialViewWithExpansion(!view.expanded))}>{expanded ? "收起计分归属" : "查看计分归属"}</button> : <p role="status">计分归属暂不可用</p> : null}
    <div id={id} className="score-ownership-content">
      {expanded ? <>
        <p className="score-ownership-note">显示移除已确认死子后的计分棋盘；原棋谱不变。按当前已确认死子和本游戏计分规则计算。</p>
        <div className="score-ownership-filters" role="group" aria-label="空点归属筛选">{filters.map(filter => <button key={filter.value} type="button" data-score-ownership-filter={filter.value} aria-pressed={view.filter === filter.value} onClick={() => update({ ...view, filter: filter.value, selected: null })}>{filter.label}</button>)}</div>
      </> : null}
      <div className={cn("score-board", expanded && "score-ownership-grid")} role="grid" aria-label={`${state.size}路${expanded ? "只读计分归属棋盘" : "终局死子确认棋盘"}`} style={{ "--board-size": state.size } as CSSProperties}>
        <svg className="score-grid-lines" aria-hidden="true" viewBox={`0 0 ${state.size - 1} ${state.size - 1}`} preserveAspectRatio="none">{Array.from({ length: state.size }, (_, index) => <path key={index} d={`M 0 ${index} H ${state.size - 1} M ${index} 0 V ${state.size - 1}`} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />)}</svg>
        {(expanded ? analysis.board : state.board).map((row, y) => <div role="row" className="score-ownership-row" key={y}>{row.map((stone, x) => {
          const key = `${x},${y}`, fact = expanded ? analysis.points[y][x] : null;
          const regionSelected = !!fact && selectedFact?.regionId !== null && selectedFact?.regionId !== undefined && selectedFact.regionId === fact.regionId;
          const selected = view.selected?.x === x && view.selected?.y === y;
          const marker = fact && !stone && (view.filter === "all" || (view.filter === "neutral" ? fact.kind === "neutral" : fact.kind === `${view.filter}-territory`));
          const original = removed.get(key);
          return <button key={key} ref={node => { if (node) cells.current.set(key, node); else cells.current.delete(key); }} type="button" role="gridcell" disabled={!expanded}
            data-score-ownership-point={expanded ? key : undefined} data-kind={fact?.kind} data-region-id={fact?.regionId ?? undefined} data-score-ownership-region-selected={regionSelected || undefined}
            aria-label={`${x + 1}列${y + 1}行，${fact ? labels[fact.kind] : stone ? stone === "black" ? "黑棋" : "白棋" : "空位"}${expanded && original ? `，原${original === "black" ? "黑" : "白"}子已按确认结果移除` : ""}`}
            aria-selected={expanded ? selected : stone ? deadStones.has(key) : undefined} tabIndex={expanded && view.focus === key ? 0 : -1}
            onFocus={() => { if (view.focus !== key) update({ ...view, focus: key }); }} onClick={() => inspect({ x, y })} onKeyDown={event => onKey(event, { x, y })}>
            {stone ? <i aria-hidden="true" className={cn(`mini-stone ${stone}`, !expanded && deadStones.has(key) && "dead")} /> : marker ? <span aria-hidden="true" className={`ownership-marker ${fact!.kind}`}>{fact!.kind === "black-territory" ? "■" : fact!.kind === "white-territory" ? "□" : "×"}</span> : null}
          </button>;
        })}</div>)}
      </div>
      {expanded ? <>
        <p className="score-ownership-legend">图例：■ 黑方空点 · □ 白方空点 · × 未归属点；描边表示选中的点或连通空区。筛选只改变普通空点标记。</p>
        {state.size === 19 ? <div className="score-ownership-coordinates">
          <label>列<select aria-label="列" value={view.column} onChange={event => { const column = Number(event.target.value); if (Number.isInteger(column) && column >= 1 && column <= state.size) update({ ...view, column }); }}>{Array.from({ length: state.size }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label>
          <label>行<select aria-label="行" value={view.row} onChange={event => { const row = Number(event.target.value); if (Number.isInteger(row) && row >= 1 && row <= state.size) update({ ...view, row }); }}>{Array.from({ length: state.size }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label>
          <button type="button" data-action="inspect-score-point" onClick={() => inspect({ x: view.column - 1, y: view.row - 1 })}>查看此点</button>
        </div> : null}
        <div className="score-ownership-description" role="status" aria-live="polite" aria-atomic="true">{description ?? emptyFilter ?? "点查任意棋子或空点，查看此点如何计分。"}</div>
        <p className="score-ownership-note">子：计入本方的棋子。地：按棋子边界归属的空点。白贴 7.5 目：贴目只参与算式，不对应棋盘点位；提子不额外加分。这里不自动判定死活，也不将未归属点等同于公气或双活。</p>
      </> : null}
    </div>
  </div>;
}

function initialViewWithExpansion(expanded: boolean): View { return { ...initialView(), expanded }; }
