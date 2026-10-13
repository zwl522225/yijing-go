import { analyzeGroups, groupAt } from "@/lib/go/analysis";
import type { Color, GameState } from "@/lib/go/types";
import type { LessonUnitId, TermId } from "@/lib/learning/types";

export type ReviewMoment = {
  frame:number; color:Color; kind:"capture"|"atari"|"pass"|"end"|"placement";
  choice:string; consequence:string; direction:string; unitId:LessonUnitId; termId:TermId;
};
/** Frames borrow immutable snapshots; review never writes into them or the match. */
export function getReviewFrames(match:GameState): GameState[] {
  return [...match.past.map((snapshot,index) => ({...snapshot,past:match.past.slice(0,index)})),match];
}
export function getReviewMoments(match:GameState): ReviewMoment[] {
  const frames = getReviewFrames(match);
  const moments:ReviewMoment[] = [];
  for(let index=1;index<frames.length;index++) {
    const before=frames[index-1],after=frames[index],move=after.moves.at(-1);
    if(!move) continue;
    const color=before.toPlay,actor=color === "black" ? "黑棋（你）" : "白棋（电脑）";
    if("pass" in move) {
      const ended=after.consecutivePasses>=2;
      moments.push({frame:index,color,kind:ended ? "end" : "pass",choice:`${actor}停一手`,
        consequence:ended ? "双方连续停手，进入死子确认与计分。" : "交出回合，棋盘上的棋子没有变化。",
        direction:"停手前检查未安定的棋块和边界；终局先确认死子，再核对面积计分。",unitId:"s1-pass-ending",termId:"pass"});
      continue;
    }
    const choice=`${actor}落在（${move.x+1}，${move.y+1}）`;
    const captured=after.captures[color]-before.captures[color];
    if(captured>0) {
      moments.push({frame:index,color,kind:"capture",choice,consequence:`实际提掉对方 ${captured} 颗棋子。`,
        direction:"提子后重新数气，检查自己的棋块能否连接或被反提。",unitId:"s1-atari-capture",termId:"capture"});continue;
    }
    const newAtari=analyzeGroups(after.board,after.size).filter(group=>group.liberties.length===1 &&
      group.stones.some(point=>{const old=groupAt(before.board,before.size,point);return !old || old.liberties.length!==1;}));
    if(newAtari.length) {
      const own=newAtari.filter(group=>group.color===color).length,other=newAtari.length-own;
      moments.push({frame:index,color,kind:"atari",choice,consequence:`${own ? `己方 ${own} 块棋只剩一口气。` : ""}${other ? `对方 ${other} 块棋只剩一口气。` : ""}`,
        direction:"先数双方的气，再检查逃出、连接与提子的可能，避免只盯着一个落点。",unitId:"s1-atari-capture",termId:"atari"});continue;
    }
    const group=groupAt(after.board,after.size,move);
    moments.push({frame:index,color,kind:"placement",choice,consequence:`落子后的棋块有 ${group?.liberties.length ?? 0} 口气。`,
      direction:"下一手前先数气，观察相邻友军与对方棋块，找出可连接的方向。",unitId:"s1-liberties-groups",termId:"liberty"});
  }
  const priority={capture:0,atari:1,end:2,pass:3,placement:4};
  const end=moments.find(moment=>moment.kind==="end");
  const ranked=moments.filter(moment=>moment!==end).sort((a,b)=>priority[a.kind]-priority[b.kind] || a.frame-b.frame);
  return [...ranked.slice(0,end ? 2 : 3),...(end ? [end] : [])].sort((a,b)=>a.frame-b.frame);
}
