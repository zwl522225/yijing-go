import { groupAt } from "@/lib/go/analysis";
import type { GameState, MoveError, MoveResult, Point } from "@/lib/go/types";

export const MOVE_REJECTION_TEXT: Record<MoveError,string> = {
  occupied:"这里已有棋子，不能重复落子。",
  suicide:"落子后无气，也没有提子，属于禁入点。",
  ko:"这一手会重复之前的棋形，不能立即提回，请先在别处落子。",
  out_of_bounds:"尝试的位置超出棋盘范围。",
  finished:"双方已连续停手，棋局已终局，不能继续落子。",
};

/** Only accepted engine results may describe a changed board. */
export function describeMove(before: GameState, point: Point, result: MoveResult): string {
  if(!result.ok) return MOVE_REJECTION_TEXT[result.reason];
  const color = before.toPlay;
  const name = color === "black" ? "黑棋" : "白棋";
  const opponent = color === "black" ? "白棋" : "黑棋";
  const captured = result.state.captures[color]-before.captures[color];
  const group = groupAt(result.state.board,result.state.size,point);
  const count = group?.liberties.length ?? 0;
  return `${name}落在（${point.x+1}，${point.y+1}）。${captured ? `提掉${captured}颗${opponent}。` : ""}落子后，这块棋有${count}口气。${count === 1 ? "仅剩一口气，已被打吃。" : ""}`;
}
