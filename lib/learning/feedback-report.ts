import type { BoardSize } from "@/lib/go/types";
import type { LessonAction } from "@/lib/learning/types";

export type FeedbackContext = {
  mode: "lesson" | "quiz" | "play" | "scoring" | "review";
  boardSize: BoardSize;
  lessonTitle?: string;
  actionKind?: LessonAction["kind"];
};
export type FeedbackCategory = "operation" | "rule" | "interface" | "other";
export type FeedbackReport = { version: 1; category: FeedbackCategory; description: string; context: FeedbackContext };

export function createFeedbackReport(context: FeedbackContext, category: FeedbackCategory, description: string): FeedbackReport {
  const picked: FeedbackContext = { mode: context.mode, boardSize: context.boardSize };
  if (context.mode !== "quiz") {
    if (context.lessonTitle !== undefined) picked.lessonTitle = context.lessonTitle;
    if (context.actionKind !== undefined) picked.actionKind = context.actionKind;
  }
  return { version: 1, category, description: Array.from(description.trim()).slice(0, 600).join(""), context: picked };
}

const MODE_LABELS: Record<FeedbackContext["mode"], string> = {
  lesson: "学堂", quiz: "阶段测验作答中", play: "人机对局", scoring: "终局计分", review: "棋局复盘",
};
const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  operation: "找不到操作", rule: "不理解规则", interface: "落子/界面异常", other: "其他",
};
const ACTION_LABELS: Record<LessonAction["kind"], string> = {
  move: "落子", pass: "停一手", choice: "选择答案", "select-group": "选择棋块", "mark-dead": "标记死子",
};

/** The selectable text follows the same field selection and quiz redaction as the downloadable report. */
export function formatFeedbackReport(report: FeedbackReport): string {
  const safe = createFeedbackReport(report.context, report.category, report.description);
  const { context } = safe;
  return ["弈境试用反馈（版本 1）", `困难类型：${CATEGORY_LABELS[safe.category]}`,
    `当前模式：${MODE_LABELS[context.mode]}`, `棋盘大小：${context.boardSize} 路`,
    ...(context.lessonTitle !== undefined ? [`当前课程：${context.lessonTitle}`] : []),
    ...(context.actionKind !== undefined ? [`当前行动：${ACTION_LABELS[context.actionKind]}`] : []),
    `说明：${safe.description}`].join("\n");
}
