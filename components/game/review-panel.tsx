import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import type { LessonUnitId, TermId } from "@/lib/learning/types";
import type { ReviewMoment, ReviewStep } from "@/lib/go/review";

export function ReviewPanel({index,total,step,moments,progress,onSeek,onExit,onStartLesson,onOpenTerm}: {
  index:number;total:number;step:ReviewStep;moments:ReviewMoment[];progress:LearningProgress;
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
    <section className="review-current-step" aria-label="这一手发生了什么">
      <h3>这一手发生了什么</h3>
      {step.status === "opening" ? <p>这是本次复盘的起始局面。可以点击下一手开始回看。</p> :
        step.status === "unavailable" ? <p>这一步的记录无法验证，暂不提供讲解。仍可只读查看棋盘或退出复盘。</p> : <>
          <p><strong>{step.turn.actor === "black" ? "你 · 黑棋" : "电脑 · 白棋"} · 第 {step.turn.moveNumber} 手</strong></p>
          <p>{step.turn.summary}</p><p>想一想：{step.turn.question}</p>
          <div className="term-links">{step.turn.terms.map(id=><button key={id} type="button" data-review-term={id} onClick={()=>onOpenTerm(id)}>术语：{GLOSSARY_BY_ID.get(id)?.name}</button>)}</div>
        </>}
    </section>
    <h3>值得回看的时刻</h3><p>根据实际提子、气数与停手记录整理，供你检查下一次的思考方向。</p>
    <ol className="review-moments">{moments.map(moment=><li key={moment.frame}>
      <button type="button" data-review-jump={moment.frame} onClick={()=>onSeek(moment.frame)}>查看第 {moment.frame} 手</button>
      <strong>{moment.choice}</strong><p>{moment.consequence}</p><p>再想一步：{moment.direction}</p>
      <div className="term-links"><button type="button" data-review-lesson={moment.unitId} disabled={!isUnitUnlocked(moment.unitId,progress)} onClick={()=>{if(isUnitUnlocked(moment.unitId,progress))onStartLesson(moment.unitId);}}>{CURRICULUM_BY_ID.get(moment.unitId)?.title}{!isUnitUnlocked(moment.unitId,progress) ? " · 待解锁" : ""}</button>
        <button type="button" onClick={()=>onOpenTerm(moment.termId)}>术语：{GLOSSARY_BY_ID.get(moment.termId)?.name}</button></div>
    </li>)}</ol>
  </section>;
}
