import { useMemo, type MouseEventHandler } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { scoreArea } from "@/lib/go/scoring";
import type { GameState, Point } from "@/lib/go/types";
import type { ScorePhase } from "@/lib/go/storage";
import { cn } from "@/lib/utils";

type ResultDialogProps = {
  open: boolean;
  state: GameState;
  deadStones: Set<string>;
  outcome: string | null;
  phase: ScorePhase;
  graduated: boolean;
  onToggleDead(point: Point): void;
  onNewGame(): void;
  onConfirmDead(): void;
  onConfirmScore(): void;
  onReturnAcademy(): void;
  onReview?(): void;
  onFeedback?: MouseEventHandler<HTMLButtonElement>;
};

export function ResultDialog({
  open,
  state,
  deadStones,
  outcome,
  phase,
  graduated,
  onToggleDead,
  onNewGame,
  onConfirmDead,
  onConfirmScore,
  onReturnAcademy,
  onReview,
  onFeedback,
}: ResultDialogProps) {
  const score = useMemo(
    () => scoreArea(state.board, deadStones, 7.5),
    [deadStones, state.board],
  );
  const boardStyle = {
    "--board-size": state.size,
  } as React.CSSProperties;
  let graduationStatus: string | null = null;
  if (outcome) {
    graduationStatus = `${graduated ? "历史毕业记录已保留 · " : ""}本局认输不授予毕业。`;
  } else if (graduated) {
    const currentRound = phase === "final"
      ? "本局对局、死子确认与最终计分均已完成。"
      : phase === "dead-stones"
        ? "本局仍需确认死子，再核对并确认最终计分。"
        : "本局仍需核对计分并确认最终计分。";
    graduationStatus = `毕业已完成 · 历史毕业记录已保留。${currentRound}`;
  } else if (phase === "final") {
    graduationStatus = "本局已结束。毕业还需完成前置课程与完整的 9 路计分流程。";
  }

  return (
    <Dialog open={open}>
      <DialogContent className="result-dialog" data-score-phase={phase} showCloseButton={false}>
        <DialogHeader>
          <span className="result-seal">终局</span>
          <DialogTitle>{outcome ?? (phase === "final" ? `${score.winner === "black" ? "黑方" : "白方"}胜 ${score.margin.toFixed(1)} 目` : phase === "dead-stones" ? "第一步 · 确认死子" : "第二步 · 计分预览")}</DialogTitle>
          <DialogDescription>
            {outcome ?? (phase === "dead-stones" ? "点击下方棋盘上的整块棋可标记或恢复死子；没有死子也需点击确认。当前仅为分数预览。" : phase === "score-review" ? "死子已确认。请核对中国面积计分，白贴 7.5 目，再确认最终计分。" : "最终计分已确认。采用中国面积规则，白贴 7.5 目。")}
          </DialogDescription>
        </DialogHeader>

        {!outcome ? (
          <>
            <ol className="scoring-steps" aria-label="终局计分步骤">
              <li data-step="dead-stones" aria-current={phase === "dead-stones" ? "step" : undefined}>1. 确认死子</li>
              <li data-step="score-review" aria-current={phase === "score-review" ? "step" : undefined}>2. 核对计分</li>
              <li data-step="final" aria-current={phase === "final" ? "step" : undefined}>3. 完成</li>
            </ol>
            <div
              className="score-board"
              role="grid"
              aria-label={`${state.size}路终局死子确认棋盘`}
              style={boardStyle}
            >
              <svg className="score-grid-lines" aria-hidden="true" viewBox={`0 0 ${state.size - 1} ${state.size - 1}`} preserveAspectRatio="none">
                {Array.from({length:state.size},(_,index)=><path key={index} d={`M 0 ${index} H ${state.size - 1} M ${index} 0 V ${state.size - 1}`} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none"/>)}
              </svg>
              {state.board.flatMap((row, y) => row.map((stone, x) => {
                const key = `${x},${y}`;
                return (
                  <button
                    type="button"
                    role="gridcell"
                    key={key}
                    aria-label={`${x + 1}列${y + 1}行${stone ? `，${stone === "black" ? "黑棋" : "白棋"}` : "，空位"}`}
                    aria-selected={stone ? deadStones.has(key) : undefined}
                    onClick={() => stone && onToggleDead({ x, y })}
                    disabled={!stone || phase !== "dead-stones"}
                  >
                    {stone ? <i className={cn(`mini-stone ${stone}`, deadStones.has(key) && "dead")} /> : null}
                  </button>
                );
              }))}
            </div>
            <div className="score-summary">
              <div><span className="score-dot black" /><strong>黑 {score.black.total}</strong><small>子 {score.black.stones} · 地 {score.black.territory}</small></div>
              <div><span className="score-dot white" /><strong>白 {score.white.total}</strong><small>子 {score.white.stones} · 地 {score.white.territory} · 贴 {score.komi}</small></div>
            </div>
            {phase !== "dead-stones" ? <div className="score-explanation">
              <p>黑：子 {score.black.stones} + 地 {score.black.territory} = {score.black.total}</p>
              <p>白：子 {score.white.stones} + 地 {score.white.territory} + 贴目 {score.komi} = {score.white.total}</p>
              <p>中立空点 {score.neutral}：双方共享或不属于任何一方的空点，不计入双方面积。提掉的棋子不额外加分。</p>
            </div> : null}
          </>
        ) : null}

        {graduationStatus ? <p role="status" className={graduated ? "graduation-status" : undefined}>{graduationStatus}</p> : null}

        {onFeedback ? <button type="button" className="dictionary-button feedback-entry" data-action="open-feedback" onClick={onFeedback}>遇到困难？反馈一下</button> : null}

        <DialogFooter>
          {phase === "dead-stones" && !outcome ? <Button data-action="confirm-dead" onClick={onConfirmDead}>确认死子</Button> : null}
          {phase === "score-review" && !outcome ? <Button data-action="confirm-score" onClick={onConfirmScore}>确认最终计分</Button> : null}
          {phase === "final" ? <>{onReview && state.past.length ? <Button variant="outline" data-action="review" onClick={onReview}>逐手复盘</Button> : null}<Button variant="outline" onClick={onReturnAcademy}>返回新手学堂</Button><Button onClick={onNewGame}>收好棋子 · 再来一局</Button></> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
