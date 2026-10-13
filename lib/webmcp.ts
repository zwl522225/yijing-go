import type { Difficulty } from "@/lib/go/ai";
import { LESSON_UNIT_IDS, TERM_IDS, type LessonUnitId, type TermId } from "@/lib/learning/types";
import type { SoundscapeCategory } from "@/lib/audio/soundscapes";
import type { BoardSize, Point } from "@/lib/go/types";

type PlayBoardSize = Extract<BoardSize, 9 | 13 | 19>;

function exactObject(input: unknown, keys: string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new TypeError("输入必须是对象");
  }
  const record = input as Record<string, unknown>;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !keys.includes(key)) ||
      Object.values(Object.getOwnPropertyDescriptors(record)).some(descriptor => !Object.hasOwn(descriptor,"value"))) {
    throw new TypeError("输入包含未知字段");
  }
  return record;
}

export function parseMoveInput(input: unknown, boardSize: BoardSize = 19): Point {
  const record = exactObject(input, ["x", "y"]);
  if (
    !Number.isInteger(record.x) ||
    !Number.isInteger(record.y) ||
    Number(record.x) < 0 ||
    Number(record.x) >= boardSize ||
    Number(record.y) < 0 ||
    Number(record.y) >= boardSize
  ) {
    throw new TypeError(`x 和 y 必须是 0 到 ${boardSize - 1} 的整数`);
  }
  return { x: Number(record.x), y: Number(record.y) };
}

export function parseDifficultyInput(input: unknown): { difficulty: Difficulty } {
  const record = exactObject(input, ["difficulty"]);
  if (
    record.difficulty !== "beginner" &&
    record.difficulty !== "intermediate" &&
    record.difficulty !== "challenge"
  ) {
    throw new TypeError("difficulty 无效");
  }
  return { difficulty: record.difficulty as Difficulty };
}

export function parseStartGameInput(input: unknown): {
  difficulty: Difficulty;
  boardSize: PlayBoardSize;
} {
  const record = exactObject(input, ["difficulty", "boardSize"]);
  const { difficulty } = parseDifficultyInput({ difficulty: record.difficulty });
  if (
    record.boardSize !== undefined &&
    record.boardSize !== 9 &&
    record.boardSize !== 13 &&
    record.boardSize !== 19
  ) {
    throw new TypeError("boardSize 必须是 9、13 或 19");
  }
  return { difficulty, boardSize: (record.boardSize ?? 19) as PlayBoardSize };
}

export function parseLearningUnitInput(input: unknown): { unitId: LessonUnitId } {
  const record = exactObject(input, ["unitId"]);
  if (
    !Object.hasOwn(record,"unitId") || typeof record.unitId !== "string" ||
    !LESSON_UNIT_IDS.some(id => id === record.unitId)
  ) {
    throw new TypeError("unitId 无效");
  }
  return { unitId: record.unitId as LessonUnitId };
}

export function parseGlossaryInput(input: unknown): { termId: TermId } {
  const record = exactObject(input, ["termId"]);
  if (!Object.hasOwn(record,"termId") || typeof record.termId !== "string" || !TERM_IDS.some(id=>id===record.termId)) {
    throw new TypeError("termId 无效");
  }
  return {termId:record.termId as TermId};
}

export function parseMusicInput(input: unknown): {
  playing: boolean;
  category?: SoundscapeCategory;
} {
  const record = exactObject(input, ["playing", "category"]);
  if (typeof record.playing !== "boolean") throw new TypeError("playing 必须是布尔值");
  if (
    record.category !== undefined &&
    record.category !== "pop" &&
    record.category !== "instrumental"
  ) {
    throw new TypeError("category 无效");
  }
  return {
    playing: record.playing,
    ...(record.category ? { category: record.category } : {}),
  };
}
