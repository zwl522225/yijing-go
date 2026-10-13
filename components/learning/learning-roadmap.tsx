import { CURRICULUM } from "@/lib/learning/curriculum";
import { getRecommendedUnit, isGraduated, isUnitUnlocked, type LearningProgress } from "@/lib/learning/progress";
import type { LessonUnitId, StageId } from "@/lib/learning/types";
const STAGES: {
    id: StageId;
    title: string;
}[] = [
    { id: "stage-1", title: "规则启蒙" }, { id: "stage-2", title: "吃子与死活" }, { id: "stage-3", title: "完整 9 路对局" },
];
export function LearningRoadmap({ progress, currentUnitId, onSelectUnit }: {
    progress: LearningProgress;
    currentUnitId: LessonUnitId;
    onSelectUnit(id: LessonUnitId): void;
}) {
    const recommended = getRecommendedUnit(progress);
    const completedIds = progress.completedUnitIds.filter(id=>id!=="s3-graduation" || isGraduated(progress));
    return <section className="panel learning-roadmap" aria-label="学习路线">
    <h2>你的围棋之路</h2>
    <p>已完成 {completedIds.length} / {CURRICULUM.length} 单元</p>
    {recommended ? <button type="button" className="academy-recommendation" onClick={() => onSelectUnit(recommended)}>推荐下一课 · {CURRICULUM.find(u => u.id === recommended)?.title}</button> : <p>课程已完成</p>}
    {STAGES.map(stage => <details key={stage.id} open={CURRICULUM.find(u => u.id === currentUnitId)?.stageId === stage.id}>
      <summary>{stage.title}</summary>
      <ol>{CURRICULUM.filter(u => u.stageId === stage.id).map(unit => {
                const completed = unit.kind === "graduation" ? isGraduated(progress) : completedIds.includes(unit.id);
                const unlocked = isUnitUnlocked(unit.id, progress);
                const current = currentUnitId === unit.id;
                return <li key={unit.id}><button type="button" data-unit-id={unit.id} className={completed ? "complete" : current ? "current" : unlocked ? "available" : "locked"} aria-current={current ? "step" : undefined} aria-disabled={!unlocked} disabled={!unlocked} onClick={() => { if (unlocked)
                    onSelectUnit(unit.id); }}><span aria-hidden="true">{completed ? "✓" : !unlocked ? "🔒" : unit.order}</span>{unit.title}<small>{completed ? "已完成" : !unlocked ? "未解锁" : current ? "当前" : "可学习"}</small></button></li>;
            })}</ol>
    </details>)}
    <button type="button" className="future-stage" disabled aria-disabled="true">标准棋盘 · 敬请期待</button>
  </section>;
}
