import Image from "next/image";
import { LessonDemo } from "@/components/learning/lesson-demo";
import { TermLink } from "@/components/learning/term-link";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import type { TermId } from "@/lib/learning/types";
import type { LearningSessionController } from "@/hooks/use-learning-session";
import { LessonFeedback } from "@/components/learning/lesson-feedback";
const HINT_LABELS = ["思考方向", "关键位置", "答案解释"];
type LessonPanelProps = {
    learning: LearningSessionController;
    graduated?: boolean;
    onStartGraduation?(): void;
    onOpenTerm?(id:TermId):void;
    storageUnavailable?: boolean;
};
/** Focus the current roving point, never a lesson's expected answer. */
export function focusLessonBoard() {
    const board=document.querySelector<HTMLElement>("#game .go-board");
    if (!board) return;
    const reduced=typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    board.querySelector<HTMLElement>('.go-point[tabindex="0"]')?.focus({preventScroll:true});
    board.scrollIntoView({behavior:reduced ? "auto" : "smooth",block:"center"});
}
export function LessonTask({ learning, onStartGraduation, graduated=false }: LessonPanelProps) {
    const { unit, session, feedback } = learning;
    const quiz = unit.kind === "quiz";
    const total = unit.kind === "lesson" ? unit.exercises.length : unit.kind === "quiz" ? unit.questions.length : 0;
    const exercise = session.exercise;
    return <section className="panel lesson-card academy-task" aria-labelledby="lesson-title">
    <div className="lesson-heading"><div><span className="eyebrow">{quiz ? "阶段检查点 · 独立作答" : "新手学堂"} · {unit.boardSize} 路{unit.kind !== "graduation" ? ` · ${Math.min(session.exerciseIndex + 1, total)} / ${total}` : ""}</span><h2 id="lesson-title">{unit.title}</h2></div></div>
    <strong className="lesson-objective">{unit.objective}</strong>
    {unit.kind === "graduation" ? <div className="graduation-task"><p role="status">{graduated ? "毕业已完成 · 胜负不影响毕业，可以再练一盘。" : "毕业尚未完成 · 完成一盘 9 路对局，连续停手后确认死子，再确认最终计分。"}</p><button type="button" onClick={onStartGraduation}>开始 9 路毕业对局</button></div> : <>
      <progress aria-label="本课练习进度" value={session.exerciseIndex} max={total}/>
      {session.completed ? <div className="unit-completion" role="status">{quiz ? `检查点完成 · 首次作答 ${session.answers.filter(a => a.correct).length / total * 100} 分${session.answers.filter(a => a.correct).length / total * 100 < 80 ? "，重学本课再试一次" : "，已通过"}` : "本课三轮练习已完成，可以继续下一课。"}</div> : exercise ? <>
        <p className="exercise-prompt">任务：{exercise.prompt}</p>
        {exercise.expected.kind === "move" ? <p>在棋盘上点击交叉点落子。</p> : null}
        {exercise.expected.kind === "select-group" ? <p>在棋盘上选择一块棋，点击其中任一棋子。</p> : null}
        {exercise.expected.kind === "mark-dead" ? <p>在棋盘上选择死子，再点击“确认死子”。{learning.selectedDeadStone ? `已选择第 ${learning.selectedDeadStone.x + 1} 列、第 ${learning.selectedDeadStone.y + 1} 行。` : "尚未选择。"}</p> : null}
        <div className="exercise-controls">
          {["move","select-group","mark-dead"].includes(exercise.expected.kind) ? <button type="button" data-action="go-board" onClick={focusLessonBoard}>去棋盘操作</button> : null}
          {exercise.expected.kind === "pass" ? <button type="button" data-action="pass" onClick={learning.submitPass}>停一手</button> : null}
          {exercise.expected.kind === "choice" ? <><strong>选择答案</strong>{exercise.choices?.map(choice => <button type="button" key={choice.id} data-choice-id={choice.id} onClick={() => learning.submitChoice(choice.id)}>{choice.label}</button>)}</> : null}
          {exercise.expected.kind === "mark-dead" ? <button type="button" data-action="mark-dead" disabled={!learning.selectedDeadStone} onClick={() => { if (learning.selectedDeadStone)
                learning.submitDeadStone(learning.selectedDeadStone); }}>确认死子</button> : null}
        </div>
      </> : null}
      <LessonFeedback feedback={feedback} isQuiz={quiz && !session.completed} previous={!session.completed} actionKind={exercise?.expected.kind}/>
    </>}
  </section>;
}
export function LessonDetails({ learning, onOpenTerm=()=>{}, storageUnavailable=false }: LessonPanelProps) {
    const {unit,session,visibleHints}=learning;
    const quiz=unit.kind === "quiz";
    return <details className="panel lesson-card academy-details" open={quiz || undefined}>
      <summary>讲解与提示{!quiz && !session.completed ? ` · 已展开 ${session.hintLevel} / 3 级提示` : ""}{learning.restored && !session.completed ? " · 已恢复本课进度" : ""}{storageUnavailable ? " · 无法保存进度" : ""}</summary>
      {storageUnavailable ? <p role="status">无法保存进度：浏览器存储不可用，刷新后可能丢失本次位置。</p> : null}
      {quiz ? <p>阶段测验重新进入时从第一题开始；独立作答，完成前不开放提示。</p> : null}
      <div className="lesson-story-row"><div className="lesson-guide" aria-hidden="true"><Image src="/qitong.webp" alt="" width={82} height={82}/></div><p className="lesson-story">{unit.story}</p></div>
      <div className="lesson-terms"><h3>本课术语</h3><div className="term-links">{unit.terms.map(id=><TermLink key={id} entry={GLOSSARY_BY_ID.get(id)!} onOpen={onOpenTerm} disabled={quiz && !session.completed}/>)}</div>{quiz && !session.completed ? <p>完成测验后查词</p> : null}</div>
      {unit.kind !== "graduation" ? <>
        {!quiz ? <details className="demo-disclosure"><summary>棋形演示 · 展开观看</summary><LessonDemo key={unit.id} unit={unit}/></details> : null}
        {!quiz && !session.completed ? <div className="lesson-hints">{HINT_LABELS.map((label, index) => <div key={label}><button type="button" disabled={session.hintLevel !== index} onClick={learning.requestHint}>{index + 1}. {label}{session.hintLevel > index ? " · 已展开" : ""}</button>{visibleHints[index] ? <p>{visibleHints[index].text}</p> : null}</div>)}</div> : null}
        <div className="lesson-actions"><button type="button" disabled={session.completed} onClick={learning.retryExercise}>重来本题</button>{!quiz ? <button type="button" disabled={!session.previous} onClick={learning.undoExercise}>悔棋</button> : null}<button type="button" onClick={learning.resetUnit}>重学本课</button></div>
      </> : null}
    </details>;
}
/** Combined presentation retained for existing consumers. */
export function LessonPanel(props: LessonPanelProps) {
    return <>{LessonTask(props)}{LessonDetails(props)}</>;
}
