"use client";

import { Fragment, useMemo, useRef, useState } from "react";

import type { GameMode } from "@/hooks/use-go-game";
import { centerPoint, starPointKeys } from "@/lib/go/board-geometry";
import { analyzeGroups } from "@/lib/go/analysis";
import { DEFAULT_ASSISTS, type LearningAssists } from "@/lib/learning/progress";
import type { Color, GameState, Point } from "@/lib/go/types";

type GoBoardProps = {
  state: GameState;
  mode: GameMode;
  title: string;
  eyebrow: string;
  prompt: string;
  hints: Point[];
  deadStones: Set<string>;
  selectedPoints?: Point[];
  assists?: LearningAssists;
  isQuiz?: boolean;
  aiThinking: boolean;
  previewPoint?: Point|null;
  attemptedPoint?: Point|null;
  readOnly?: boolean;
  inspection?: { stones: Point[]; liberties: Point[]; onInspect(point: Point): void };
  captured?: { points: Point[]; color: Color };
  onPlay(point: Point): void;
  onToggleDead(point: Point): void;
};

export function GoBoard({
  state,
  mode,
  title,
  eyebrow,
  prompt,
  hints,
  deadStones,
  selectedPoints = [],
  assists = DEFAULT_ASSISTS,
  isQuiz = false,
  aiThinking,
  previewPoint = null,
  attemptedPoint = null,
  readOnly = false,
  inspection,
  captured,
  onPlay,
  onToggleDead,
}: GoBoardProps) {
  const size = state.size;
  const lastMove = state.moves.at(-1);
  const lastPoint = lastMove && !("pass" in lastMove) ? lastMove : null;
  const initialFocus = lastPoint ?? centerPoint(size);
  const [focusPoint, setFocusPoint] = useState(initialFocus);
  const activeFocus = focusPoint.x < size && focusPoint.y < size
    ? focusPoint
    : initialFocus;
  const pointRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stars = useMemo(() => starPointKeys(size), [size]);
  const groups = useMemo(() => analyzeGroups(state.board,size), [state.board,size]);
  const atariKeys = useMemo(() => new Set(groups.filter(group=>group.liberties.length===1).flatMap(group=>group.stones.map(({x,y})=>`${x},${y}`))), [groups]);
  const groupAnchors = new Map(groups.map(group=>[`${group.stones[0].x},${group.stones[0].y}`,group]));
  const hintKeys = useMemo(
    () => new Set((isQuiz ? [] : hints).map(({ x, y }) => `${x},${y}`)),
    [hints,isQuiz],
  );
  const inspectedKeys = new Set((readOnly ? inspection?.stones : [])?.map(({ x, y }) => `${x},${y}`));
  const libertyKeys = new Set((readOnly ? inspection?.liberties : [])?.map(({ x, y }) => `${x},${y}`));
  const capturedKeys = new Set((readOnly ? captured?.points : [])?.map(({ x, y }) => `${x},${y}`));
  const boardStyle = {
    "--board-size": size,
    "--board-intervals": size - 1,
  } as React.CSSProperties;

  const moveFocus = (point: Point) => {
    setFocusPoint(point);
    pointRefs.current[point.y * size + point.x]?.focus();
  };

  const handleKey = (event: React.KeyboardEvent<HTMLButtonElement>, point: Point) => {
    const next = { ...point };
    if (event.key === "ArrowLeft") next.x = Math.max(0, point.x - 1);
    else if (event.key === "ArrowRight") next.x = Math.min(size - 1, point.x + 1);
    else if (event.key === "ArrowUp") next.y = Math.max(0, point.y - 1);
    else if (event.key === "ArrowDown") next.y = Math.min(size - 1, point.y + 1);
    else if (event.key === "Home") next.x = 0;
    else if (event.key === "End") next.x = size - 1;
    else return;
    event.preventDefault();
    moveFocus(next);
  };

  const turnText = readOnly ? "只读复盘" : mode === "scoring"
    ? "确认死子"
    : aiThinking
      ? "白方思考中"
      : `${state.toPlay === "black" ? "黑方" : "白方"} · ${mode === "play" ? (state.toPlay === "black" ? "轮到你" : "电脑回合") : "请落子"}`;

  return (
    <div className="board-stage">
      <div className="board-caption">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <strong>{title}</strong>
        </div>
        <span className="turn-badge" aria-live="polite">
          <i className={state.toPlay === "white" ? "white" : ""} /> {turnText}
        </span>
      </div>
      <div
        className="go-board"
        role="grid"
        aria-readonly={readOnly || undefined}
        aria-label={`${size}路围棋棋盘`}
        style={boardStyle}
      >
        {!isQuiz && assists.showCoordinates ? <div className="board-coordinates">
          {Array.from({length:size},(_,index)=><span key={`column-${index}`} className="board-coordinate column" role="img" aria-label={`第${index+1}列`} style={{left:`${index/(size-1)*100}%`}}>{index+1}</span>)}
          {Array.from({length:size},(_,index)=><span key={`row-${index}`} className="board-coordinate row" role="img" aria-label={`第${index+1}行`} style={{top:`${index/(size-1)*100}%`}}>{index+1}</span>)}
        </div> : null}
        <svg className="go-grid-lines" aria-hidden="true" viewBox={`0 0 ${size - 1} ${size - 1}`} preserveAspectRatio="none">
          <path d={Array.from({ length: size }, (_, index) => `M 0 ${index} H ${size - 1} M ${index} 0 V ${size - 1}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="go-points">
          {Array.from({ length: readOnly ? size : 1 }, (_, row) => {
            const Row = readOnly ? "div" : Fragment;
            return <Row key={row} {...(readOnly ? { role: "row", className: "go-inspection-row" } : {})}>{Array.from({ length: readOnly ? size : size * size }, (_, column) => {
            const index = readOnly ? row * size + column : column;
            const x = index % size;
            const y = Math.floor(index / size);
            const point = { x, y };
            const key = `${x},${y}`;
            const stone = state.board[y][x];
            const isCapturedPosition = !stone && capturedKeys.has(key);
            const suggested = hintKeys.has(key);
            const isLast = lastPoint?.x === x && lastPoint.y === y;
            const isDead = !isQuiz && deadStones.has(key);
            const isAtari = !isQuiz && assists.showAtari && atariKeys.has(key);
            const attempted = !isQuiz && attemptedPoint?.x === x && attemptedPoint.y === y;
            const candidate = previewPoint?.x === x && previewPoint.y === y;
            const selected = selectedPoints.some(point => point.x === x && point.y === y);
            const group = groupAnchors.get(key);

            return (
              <button
                ref={(element) => { pointRefs.current[index] = element; }}
                className="go-point"
                data-star={stars.has(key) || undefined}
                data-suggested={suggested || undefined}
                data-last={isLast || undefined}
                data-selected={selected || undefined}
                data-preview={candidate || undefined}
                data-attempted={attempted || undefined}
                data-inspected-group={inspectedKeys.has(key) || undefined}
                data-liberty={libertyKeys.has(key) || undefined}
                data-captured-position={isCapturedPosition || undefined}
                key={key}
                role="gridcell"
                aria-label={`${x + 1}列${y + 1}行${stone ? `，${stone === "black" ? "黑棋" : "白棋"}${isDead ? "，已标为死子" : ""}` : "，空位"}${suggested ? "，提示落点" : ""}${attempted ? "，刚尝试的位置，棋盘未改变" : ""}${selected || candidate ? "，已选择，等待确认" : ""}${!isQuiz && assists.showLiberties && group ? `，棋块${group.liberties.length}口气` : ""}${!isQuiz && assists.showAtari && group?.liberties.length === 1 ? "，仅剩一口气" : ""}${inspectedKeys.has(key) ? "，选中棋块成员" : ""}${libertyKeys.has(key) ? "，本块棋的气" : ""}${isCapturedPosition ? `，本手被提走的${captured?.color === "black" ? "黑棋" : "白棋"}原位置` : ""}`}
                tabIndex={activeFocus.x === x && activeFocus.y === y ? 0 : -1}
                type="button"
                onFocus={() => setFocusPoint(point)}
                onKeyDown={(event) => handleKey(event, point)}
                onClick={() => {
                  if (readOnly) { inspection?.onInspect(point); return; }
                  if (mode === "scoring") onToggleDead(point);
                  else onPlay(point);
                }}
              >
                {isCapturedPosition ? <span className="captured-position-cross" aria-hidden="true">×</span> : null}
                {attempted ? <span className="attempted-point" aria-hidden="true">×</span> : null}
                {stone ? (
                  <span className={`stone stone-${stone}${isDead ? " stone-dead" : ""}${isAtari ? " stone-atari" : ""}`}>
                    {isLast ? <i className="last-move-dot" /> : null}
                    {!isQuiz && assists.showLiberties && group ? <span className="group-liberties" aria-label={`${stone === "black" ? "黑棋" : "白棋"}棋块，${group.liberties.length}口气`}>{group.liberties.length}</span> : null}
                    {!isQuiz && assists.showAtari && group?.liberties.length === 1 ? <span className="group-atari" aria-label="仅剩一口气"><span aria-hidden="true">⚠</span><span className="sr-only">仅剩一口气</span></span> : null}
                  </span>
                ) : candidate ? <span className={"stone stone-"+state.toPlay+" stone-preview"} aria-hidden="true"/> : null}
              </button>
            );
          })}</Row>;
          })}
        </div>
      </div>
      {!isQuiz && assists.showCoordinates ? <p className="coordinate-help">坐标按列、行，从左上角开始；左上角为（1，1）。</p> : null}
      <div className="board-footer">
        <span>黑方提子 {state.captures.black}</span>
        <span className="lesson-prompt" aria-live="polite">{prompt}</span>
        <span>白方提子 {state.captures.white}</span>
      </div>
    </div>
  );
}
