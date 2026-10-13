import type { BoardSize, Color, Move, Point, StoneSetup } from "@/lib/go/types";

export type StageId = "stage-1" | "stage-2" | "stage-3";
export type TermStatus = "seen" | "practiced" | "mastered";

export const LESSON_UNIT_IDS = Object.freeze([
  "s1-intersections-turns", "s1-liberties-groups", "s1-atari-capture",
  "s1-escape-connect", "s1-suicide-exception", "s1-ko-threat",
  "s1-pass-ending", "s1-checkpoint",
  "s2-connect-cut", "s2-ladder", "s2-net", "s2-snapback",
  "s2-real-false-eyes", "s2-two-eyes", "s2-dead-seki", "s2-checkpoint",
  "s3-corner-side-center", "s3-territory-boundary", "s3-weak-groups",
  "s3-invasion-reduction", "s3-sente-gote-endgame", "s3-pass-dead-stones",
  "s3-chinese-area-komi", "s3-graduation",
] as const);
export type LessonUnitId = (typeof LESSON_UNIT_IDS)[number];

export const TERM_IDS = Object.freeze([
  "intersection", "liberty", "group", "atari", "capture",
  "connect", "cut", "suicide", "ko", "ko-threat",
  "ladder", "net", "snapback", "eye", "true-eye",
  "false-eye", "alive", "dead", "seki", "territory",
  "enclosure", "invasion", "reduction", "weak-group", "sente",
  "gote", "endgame", "pass", "dead-stones", "komi",
  "scoring", "chinese-rules",
] as const);
export type TermId = (typeof TERM_IDS)[number];

export type PositionSpec = {
  size: BoardSize;
  stones: StoneSetup[];
  toPlay: Color;
  /** Replay from stones/toPlay to obtain the displayed board, turn, and history. */
  setupMoves?: Move[];
};

export type LessonAction =
  | { kind: "move"; point: Point }
  | { kind: "pass" }
  | { kind: "select-group"; point: Point }
  | { kind: "mark-dead"; point: Point }
  | { kind: "choice"; choiceId: string };

export type LessonHint = { level: 1 | 2 | 3; text: string; points?: Point[] };
export type LessonErrorKey = "wrong_answer" | "occupied" | "suicide" | "ko" | "out_of_bounds" | "finished";

export type Exercise = {
  id: string;
  prompt: string;
  position: PositionSpec;
  expected: LessonAction;
  choices?: { id: string; label: string }[];
  initialHintLevel: 0 | 1 | 2;
  hints: [LessonHint, LessonHint, LessonHint];
  success: string;
  errors: Partial<Record<LessonErrorKey, string>> & { wrong_answer: string };
};

export type DemoFrame = Omit<PositionSpec, "size"> & { caption: string; move?: LessonAction };

export type LessonUnit = {
  kind: "lesson";
  id: LessonUnitId;
  stageId: StageId;
  order: number;
  boardSize: BoardSize;
  title: string;
  objective: string;
  story: string;
  terms: TermId[];
  demo: DemoFrame[];
  exercises: Exercise[];
};

export type QuizQuestion = Exercise & { termId: TermId };
export type QuizUnit = Omit<LessonUnit, "kind" | "exercises"> & {
  kind: "quiz";
  passingScore: 80;
  questions: QuizQuestion[];
};
export type GraduationUnit = Omit<LessonUnit, "kind" | "demo" | "exercises"> & {
  kind: "graduation";
  requiredBoardSize: 9;
};
export type CurriculumUnit = LessonUnit | QuizUnit | GraduationUnit;

export type GlossaryEntry = {
  id: TermId;
  name: string;
  aliases: string[];
  plain: string;
  formal: string;
  misconception: string;
  animation: { position: PositionSpec; frames: DemoFrame[] };
  practice: Exercise;
  lessonIds: LessonUnitId[];
  relatedTermIds: TermId[];
};
