import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import type { LessonUnitId, TermId } from "@/lib/learning/types";
import type { ReviewMoment } from "@/lib/go/review";

export function ReviewPanel({index,total,moments,progress,onSeek,onExit,onStartLesson,onOpenTerm}: {
  index:number;total:number;moments:ReviewMoment[];progress:LearningProgress;
  onSeek(index:number):void;onExit():void;onStartLesson(id:LessonUnitId):void;onOpenTerm(id:TermId):void;
}) {
  return <section className="panel review-panel" aria-label="逐手复盘">
    <h2>逐手复盘</h2><p role="status" data-review-frame={index}>第 {index} / {total} 手 · 只读查看</p>
    <div className="review-controls">
      <button type="button" data-review-action="start" disabled={index===0} onClick={()=>onSeek(0)}>开局</button>
      <button type="button" data-review-action="previous" disabled={index===0} onClick={()=>onSeek(index-1)}>上一手</button>
      <button type="button" data-review-action="next" disabled={index===total} onClick={()=>onSeek(index+1)}>下一手</button>
      <button type="button" data-review-action="end" disabled={index===total} onClick={()=>onSeek(total)}>最后一手</button>
    </div>
    <button type="button" data-review-action="exit" onClick={onExit}>退出复盘 · 返回棋局</button>
    <h3>值得回看的时刻</h3><p>根据实际提子、气数与停手记录整理，供你检查下一次的思考方向。</p>
    <ol className="review-moments">{moments.map(moment=><li key={moment.frame}>
      <button type="button" data-review-jump={moment.frame} onClick={()=>onSeek(moment.frame)}>查看第 {moment.frame} 手</button>
      <strong>{moment.choice}</strong><p>{moment.consequence}</p><p>再想一步：{moment.direction}</p>
      <div className="term-links"><button type="button" data-review-lesson={moment.unitId} disabled={!isUnitUnlocked(moment.unitId,progress)} onClick={()=>{if(isUnitUnlocked(moment.unitId,progress))onStartLesson(moment.unitId);}}>{CURRICULUM_BY_ID.get(moment.unitId)?.title}{!isUnitUnlocked(moment.unitId,progress) ? " · 待解锁" : ""}</button>
        <button type="button" onClick={()=>onOpenTerm(moment.termId)}>术语：{GLOSSARY_BY_ID.get(moment.termId)?.name}</button></div>
    </li>)}</ol>
  </section>;
}
