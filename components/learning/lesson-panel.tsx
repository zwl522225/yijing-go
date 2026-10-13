import Image from "next/image";
import { LessonDemo } from "@/components/learning/lesson-demo";
import { TermLink } from "@/components/learning/term-link";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import type { TermId } from "@/lib/learning/types";
import type { LearningSessionController } from "@/hooks/use-learning-session";
const HINT_LABELS = ["思考方向", "关键位置", "答案解释"];
export function LessonPanel({ learning, onStartGraduation, onOpenTerm=()=>{}, graduated=false }: {
    learning: LearningSessionController;
    graduated?: boolean;
    onStartGraduation?(): void;
    onOpenTerm?(id:TermId):void;
}) {
    const { unit, session, feedback, visibleHints } = learning;
    const quiz = unit.kind === "quiz";
    const total = unit.kind === "lesson" ? unit.exercises.length : unit.kind === "quiz" ? unit.questions.length : 0;
    const exercise = session.exercise;
    return <section className="panel lesson-card academy-task" aria-labelledby="lesson-title">
    <div className="lesson-heading"><div className="lesson-guide" aria-hidden="true"><Image src="/qitong.webp" alt="" width={82} height={82}/></div><div><span className="eyebrow">{quiz ? "阶段检查点" : "新手学堂"} · {unit.boardSize} 路</span><h2 id="lesson-title">{unit.title}</h2></div></div>
    <p className="lesson-story">{unit.story}</p>
    <strong className="lesson-objective">{unit.objective}</strong>
    <div className="lesson-terms"><h3>本课术语</h3><div className="term-links">{unit.terms.map(id=><TermLink key={id} entry={GLOSSARY_BY_ID.get(id)!} onOpen={onOpenTerm} disabled={quiz && !session.completed}/>)}</div>{quiz && !session.completed ? <p>完成测验后查词</p> : null}</div>
    {unit.kind === "graduation" ? <div className="graduation-task"><p role="status">{graduated ? "毕业已完成 · 胜负不影响毕业，可以再练一盘。" : "毕业尚未完成 · 完成一盘 9 路对局，连续停手后确认死子，再确认最终计分。"}</p><button type="button" onClick={onStartGraduation}>开始 9 路毕业对局</button></div> : <>
      {!quiz ? <details className="demo-disclosure"><summary>棋形演示 · 展开观看</summary><LessonDemo key={unit.id} unit={unit}/></details> : null}
      <div className="exercise-heading"><h3>{quiz ? "独立作答" : "动手练习"}</h3><span>{Math.min(session.exerciseIndex + 1, total)} / {total}</span></div>
      <progress aria-label="本课练习进度" value={session.exerciseIndex} max={total}/>
      {session.completed ? <div className="unit-completion" role="status">{quiz ? `检查点完成 · 首次作答 ${session.answers.filter(a => a.correct).length / total * 100} 分${session.answers.filter(a => a.correct).length / total * 100 < 80 ? "，重学本课再试一次" : "，已通过"}` : "本课三轮练习已完成，可以继续下一课。"}</div> : exercise ? <>
        <p className="exercise-prompt">任务：{exercise.prompt}</p>
        {exercise.expected.kind === "move" ? <p>在棋盘上点击交叉点落子。</p> : null}
        {exercise.expected.kind === "select-group" ? <p>在棋盘上选择一块棋，点击其中任一棋子。</p> : null}
        {exercise.expected.kind === "mark-dead" ? <p>在棋盘上选择死子，再点击“确认死子”。{learning.selectedDeadStone ? `已选择第 ${learning.selectedDeadStone.x + 1} 列、第 ${learning.selectedDeadStone.y + 1} 行。` : "尚未选择。"}</p> : null}
        <div className="exercise-controls">
          {exercise.expected.kind === "pass" ? <button type="button" data-action="pass" onClick={learning.submitPass}>停一手</button> : null}
          {exercise.expected.kind === "choice" ? <><strong>选择答案</strong>{exercise.choices?.map(choice => <button type="button" key={choice.id} data-choice-id={choice.id} onClick={() => learning.submitChoice(choice.id)}>{choice.label}</button>)}</> : null}
          {exercise.expected.kind === "mark-dead" ? <button type="button" data-action="mark-dead" disabled={!learning.selectedDeadStone} onClick={() => { if (learning.selectedDeadStone)
                learning.submitDeadStone(learning.selectedDeadStone); }}>确认死子</button> : null}
        </div>
      </> : null}
      {feedback ? <div className={`lesson-feedback ${feedback.completed ? "success" : "retry"}`} role="status"><span>{feedback.completed && !session.completed ? "上一题完成：" : ""}{feedback.message}</span></div> : null}
      {!quiz && !session.completed ? <div className="lesson-hints">{HINT_LABELS.map((label, index) => <div key={label}><button type="button" disabled={session.hintLevel !== index} onClick={learning.requestHint}>{index + 1}. {label}{session.hintLevel > index ? " · 已展开" : ""}</button>{visibleHints[index] ? <p>{visibleHints[index].text}</p> : null}</div>)}</div> : null}
      <div className="lesson-actions"><button type="button" disabled={session.completed} onClick={learning.retryExercise}>重来本题</button>{!quiz ? <button type="button" disabled={!session.previous} onClick={learning.undoExercise}>悔棋</button> : null}<button type="button" onClick={learning.resetUnit}>重学本课</button></div>
    </>}
  </section>;
}
