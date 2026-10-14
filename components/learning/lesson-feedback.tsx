import type { ExerciseResult } from "@/lib/learning/evaluate";
import type { LessonAction } from "@/lib/learning/types";

const RULE_EXPLANATIONS = {
  occupied: ["这里已有棋子", "交叉点被占用，不能把另一颗棋子放在同一点。"],
  suicide: ["这次落子没有被接受", "落子后棋块没有气，也没有提掉对方棋子。"],
  ko: ["这次落子会重复历史棋形", "规则引擎判定局面会重复，当前不能直接提回。"],
  out_of_bounds: ["尝试位置在棋盘外", "落子和棋块选择都需要在当前棋盘内操作。"],
  finished: ["当前棋局已结束", "双方已经连续停手，不能继续落子。"],
} as const;

export function LessonFeedback({ feedback, isQuiz=false, previous=false, successLabel, actionKind="move" }: {
  feedback: ExerciseResult | null;
  isQuiz?: boolean;
  previous?: boolean;
  successLabel?: string;
  actionKind?: LessonAction["kind"];
}) {
  if (!feedback) return null;
  const failure = feedback.failure;
  let explanation = null;
  if (!feedback.completed && !isQuiz && failure) {
    if (failure.kind === "rule" && failure.reason in RULE_EXPLANATIONS) {
      const [what, why] = RULE_EXPLANATIONS[failure.reason as keyof typeof RULE_EXPLANATIONS];
      explanation = <><strong>{what}</strong><p>原因：{why}</p></>;
    } else if (failure.kind === "goal") {
      explanation = <><strong>{actionKind === "move" ? "这一手可以落，但没有达到本题目标；练习棋盘保持原状。" : "这次选择没有达到本题目标；练习棋盘保持原状。"}</strong><p>原因：{feedback.message}</p></>;
    } else explanation = <><strong>请使用当前任务要求的操作</strong><p>原因：这次操作的种类与任务不符。</p></>;
  }
  return <div className={`lesson-feedback ${feedback.completed ? "success" : "retry"}`} role="status">
    {isQuiz && !feedback.completed ? <span>本次还不正确，请再检查任务。</span> : explanation ? <div>{explanation}<p>下一步：{failure!.nextStep}</p></div> : <span>{feedback.completed && previous ? "上一题完成：" : ""}{feedback.completed && successLabel ? successLabel+" · " : ""}{feedback.message}</span>}
  </div>;
}
