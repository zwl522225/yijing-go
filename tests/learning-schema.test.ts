import { describe, expect, it } from "vitest";

import { passTurn } from "@/lib/go/rules";
import { applyLessonAction } from "@/lib/learning/evaluate";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { GLOSSARY } from "@/lib/learning/glossary";
import { createPosition, isPointOnBoard } from "@/lib/learning/positions";
import { assertValidLearningCatalog, validateLearningCatalog } from "@/lib/learning/validate";
import { LESSON_UNIT_IDS, TERM_IDS } from "@/lib/learning/types";
import type { CurriculumUnit, Exercise, GlossaryEntry, LessonUnit, QuizUnit, GraduationUnit } from "@/lib/learning/types";

it("accepts the frozen complete catalogs without losing validation", () => {
  expect(Object.isFrozen(CURRICULUM)).toBe(true);
  expect(Object.isFrozen(GLOSSARY)).toBe(true);
  expect(() => assertValidLearningCatalog(CURRICULUM, GLOSSARY)).not.toThrow();
});

const exercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: "place-center",
  prompt: "在中央落子",
  position: { size: 5, stones: [], toPlay: "black" },
  expected: { kind: "move", point: { x: 2, y: 2 } },
  initialHintLevel: 2,
  hints: [
    { level: 1, text: "找中央" },
    { level: 2, text: "看中间", points: [{ x: 2, y: 2 }] },
    { level: 3, text: "下在这里", points: [{ x: 2, y: 2 }] },
  ],
  success: "成功",
  errors: { wrong_answer: "再试一次", occupied: "已有棋子", suicide: "不能自杀", ko: "劫争", out_of_bounds: "棋盘外" },
  ...overrides,
});

const lesson = (overrides: Partial<LessonUnit> = {}): LessonUnit => ({
  kind: "lesson",
  id: "s1-intersections-turns",
  stageId: "stage-1",
  order: 1,
  boardSize: 5,
  title: "交叉点",
  objective: "认识棋盘",
  story: "黑棋先下",
  terms: ["intersection"],
  demo: [{ stones: [], toPlay: "black", caption: "黑棋先行" }],
  exercises: [exercise(), exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })],
  ...overrides,
});

const term = (overrides: Partial<GlossaryEntry> = {}): GlossaryEntry => ({
  id: "intersection",
  name: "交叉点",
  aliases: [],
  plain: "线交会的地方",
  formal: "棋盘线的交点",
  misconception: "不是格子中间",
  animation: { position: exercise().position, frames: [] },
  practice: exercise({ id: "glossary-practice" }),
  lessonIds: ["s1-intersections-turns"],
  relatedTermIds: [],
  ...overrides,
});

const issues = (units: Parameters<typeof validateLearningCatalog>[0], terms: Parameters<typeof validateLearningCatalog>[1] = [term()]) =>
  validateLearningCatalog(units, terms).join(" | ");
const malformed = <T>(value: unknown): T => value as T;

describe("learning positions and evaluation", () => {
  it("replays legal setup moves and rejects illegal or malformed preludes", () => {
    const setup: Exercise["position"] = { size: 5, stones: [], toPlay: "black", setupMoves: [{ x: 2, y: 2 }, { pass: true }] };
    const replayed = createPosition(setup);
    expect(replayed.board[2][2]).toBe("black");
    expect(replayed.history).toHaveLength(3);
    expect(replayed.toPlay).toBe("black");
    expect(() => createPosition({ ...setup, setupMoves: [{ x: 2, y: 2 }, { x: 2, y: 2 }] })).toThrow(/setup move/i);
    expect(() => createPosition(malformed<Exercise["position"]>({ ...setup, setupMoves: [{ x: 1, y: 1, pass: false }] }))).toThrow(/setup move/i);
    expect(() => createPosition({ ...setup, setupMoves: [{ pass: true }, { pass: true }, { pass: true }] })).toThrow(/finished/);
    const invalid = exercise({ position: malformed<Exercise["position"]>({ ...setup, setupMoves: [{ x: 9, y: 0 }] }) });
    const malformedMoves = exercise({ id: "broken-prelude", position: malformed<Exercise["position"]>({ ...setup, setupMoves: "bad" }) });
    const illegalSequence = exercise({ id: "illegal-prelude", position: { ...setup, setupMoves: [{ x: 2, y: 2 }, { x: 2, y: 2 }] } });
    const malformedAction = exercise({ id: "bad-action", position: malformed<Exercise["position"]>({ ...setup, setupMoves: [{ x: 1, y: 1, pass: false }] }) });
    const text = issues([lesson({ exercises: [invalid, malformedMoves, illegalSequence] }), lesson({ id: "s1-liberties-groups", order: 2, exercises: [malformedAction, exercise({ id: "other-1", initialHintLevel: 1 }), exercise({ id: "other-2", initialHintLevel: 0 })] })]);
    expect(text).toContain("setupMoves/0");
    expect(text).toContain("broken-prelude/setupMoves");
    expect(text).toContain("illegal-prelude: invalid position");
    expect(text).toContain("Illegal setup move 1: occupied");
    expect(text).toContain("bad-action/setupMoves/0");
    expect(text).toContain("out of bounds");
  });
  it("creates a playable position and rejects malformed coordinates", () => {
    const state = createPosition({ size: 5, stones: [["white", 1, 1]], toPlay: "black" });
    expect(state.board[1][1]).toBe("white");
    expect(state.toPlay).toBe("black");
    expect(isPointOnBoard({ x: Number.NaN, y: 1 }, 5)).toBe(false);
    expect(isPointOnBoard({ x: 1.5, y: 1 }, 5)).toBe(false);
    expect(isPointOnBoard({ x: 5, y: 0 }, 5)).toBe(false);
  });

  it("completes the expected move and retries a different legal move without changing the position", () => {
    const state = createPosition(exercise().position);
    expect(applyLessonAction(exercise(), state, { kind: "move", point: { x: 2, y: 2 } })).toMatchObject({ completed: true, message: "成功", nextState: { board: expect.any(Array) } });
    const wrong = applyLessonAction(exercise(), state, { kind: "move", point: { x: 1, y: 1 } });
    expect(wrong).toMatchObject({ completed: false, retryable: true, message: "再试一次" });
    expect(wrong.nextState).toBe(state);
  });

  it("reports the exact rule failure and preserves state for occupied, suicide, and malformed points", () => {
    const occupied = exercise({ position: { size: 5, stones: [["white", 1, 1]], toPlay: "black" } });
    const occupiedState = createPosition(occupied.position);
    expect(applyLessonAction(occupied, occupiedState, { kind: "move", point: { x: 1, y: 1 } })).toMatchObject({ completed: false, message: "已有棋子", nextState: occupiedState });
    const suicide = exercise({ position: { size: 5, stones: [["white", 0, 1], ["white", 1, 0], ["white", 2, 1], ["white", 1, 2]], toPlay: "black" } });
    const suicideState = createPosition(suicide.position);
    expect(applyLessonAction(suicide, suicideState, { kind: "move", point: { x: 1, y: 1 } })).toMatchObject({ completed: false, message: "不能自杀", nextState: suicideState });
    expect(applyLessonAction(exercise(), occupiedState, { kind: "move", point: { x: Number.NaN, y: 1 } })).toMatchObject({ completed: false, message: "棋盘外", nextState: occupiedState });
  });

  it("reports the real finished rule error without advancing a completed game", () => {
    const finished = passTurn(passTurn(createPosition(exercise().position)));
    const move = { kind: "move", point: { x: 2, y: 2 } } as const;
    const custom = exercise({ errors: { wrong_answer: "再试一次", finished: "对局已结束" } });
    expect(applyLessonAction(custom, finished, move)).toMatchObject({ completed: false, retryable: true, message: "对局已结束", nextState: finished });
    expect(applyLessonAction(exercise(), finished, move)).toMatchObject({ completed: false, message: "finished", nextState: finished });
  });

  it("accepts any stone in the expected connected group, but not an empty or opponent point", () => {
    const selection = exercise({ position: { size: 5, stones: [["black", 0, 0], ["black", 1, 0], ["black", 1, 1], ["white", 3, 3]], toPlay: "white" }, expected: { kind: "select-group", point: { x: 0, y: 0 } } });
    expect(applyLessonAction(selection, selection.position, { kind: "select-group", point: { x: 1, y: 1 } }).completed).toBe(true);
    for (const point of [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 999, y: 0 }]) {
      expect(applyLessonAction(selection, selection.position, { kind: "select-group", point })).toMatchObject({ completed: false, retryable: true });
    }
    const marking = exercise({ ...selection, expected: { kind: "mark-dead", point: { x: 0, y: 0 } } });
    const before = createPosition(marking.position);
    const onePass = passTurn(before);
    for (const state of [before, onePass]) {
      const result = applyLessonAction(marking, state, { kind: "mark-dead", point: { x: 1, y: 1 } });
      expect(result).toMatchObject({ completed: false, retryable: true, nextState: state });
      expect(result.nextState).toBe(state);
    }
    const ended = passTurn(onePass);
    expect(applyLessonAction(marking, ended, { kind: "mark-dead", point: { x: 1, y: 1 } })).toMatchObject({ completed: true, nextState: ended });
    expect(applyLessonAction(marking, ended, { kind: "mark-dead", point: { x: 3, y: 3 } })).toMatchObject({ completed: false, nextState: ended });
  });

  it("compares pass and choice payloads exactly", () => {
    const pass = exercise({ expected: { kind: "pass" } });
    expect(applyLessonAction(pass, pass.position, { kind: "pass" }).completed).toBe(true);
    expect(applyLessonAction(pass, pass.position, { kind: "choice", choiceId: "pass" }).completed).toBe(false);
    const choice = exercise({ expected: { kind: "choice", choiceId: "yes" }, choices: [{ id: "yes", label: "是" }, { id: "no", label: "否" }] });
    expect(applyLessonAction(choice, choice.position, { kind: "choice", choiceId: "yes" }).completed).toBe(true);
    expect(applyLessonAction(choice, choice.position, { kind: "choice", choiceId: "no" }).completed).toBe(false);
  });
});

describe("learning catalog validation", () => {
  it("exports the exact stable runtime identifier catalogs", () => {
    expect(Object.isFrozen(LESSON_UNIT_IDS)).toBe(true);
    expect(Object.isFrozen(TERM_IDS)).toBe(true);
    expect(LESSON_UNIT_IDS).toEqual([
      "s1-intersections-turns", "s1-liberties-groups", "s1-atari-capture", "s1-escape-connect",
      "s1-suicide-exception", "s1-ko-threat", "s1-pass-ending", "s1-checkpoint",
      "s2-connect-cut", "s2-ladder", "s2-net", "s2-snapback", "s2-real-false-eyes",
      "s2-two-eyes", "s2-dead-seki", "s2-checkpoint", "s3-corner-side-center",
      "s3-territory-boundary", "s3-weak-groups", "s3-invasion-reduction",
      "s3-sente-gote-endgame", "s3-pass-dead-stones", "s3-chinese-area-komi", "s3-graduation",
    ]);
    expect(TERM_IDS).toEqual([
      "intersection", "liberty", "group", "atari", "capture", "connect", "cut", "suicide",
      "ko", "ko-threat", "ladder", "net", "snapback", "eye", "true-eye", "false-eye",
      "alive", "dead", "seki", "territory", "enclosure", "invasion", "reduction",
      "weak-group", "sente", "gote", "endgame", "pass", "dead-stones", "komi",
      "scoring", "chinese-rules",
    ]);
  });

  it.each([undefined, "", "  ", "s1-unknown", new String("s1-intersections-turns"), Symbol("unit")])("rejects invalid unit ID %s without registering it", (id) => {
    const invalid = malformed<CurriculumUnit>({ ...lesson(), id });
    const text = issues([invalid, malformed<CurriculumUnit>({ ...lesson(), id, order: 2 })]);
    expect(text).toContain("units/0/id");
    expect(text).toContain("units/1/id");
    expect(text).not.toContain("duplicate unit ID");
    expect(text).toContain("unknown lesson s1-intersections-turns");
  });

  it.each([undefined, "", "  ", "unknown-term", new String("intersection"), Symbol("term")])("rejects invalid term ID %s without registering it", (id) => {
    const invalid = malformed<GlossaryEntry>({ ...term(), id });
    const text = issues([lesson()], [invalid, malformed<GlossaryEntry>({ ...term(), id, practice: exercise({ id: "other-practice" }) })]);
    expect(text).toContain("terms/0/id");
    expect(text).toContain("terms/1/id");
    expect(text).not.toContain("duplicate term ID");
    expect(text).toContain("unknown term intersection");
  });

  it.each([undefined, "", "  ", new String("place-center")])("rejects invalid exercise ID %s", (id) => {
    const invalid = malformed<Exercise>({ ...exercise(), id });
    const text = issues([lesson({ exercises: [invalid, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })]);
    expect(text).toContain("invalid exercise ID");
  });

  it("checks quiz question and glossary practice IDs without registering invalid values", () => {
    const base = lesson();
    const invalidQuestion = malformed<QuizUnit["questions"][number]>({ ...exercise({ initialHintLevel: 0 }), id: " ", termId: "intersection" });
    const quiz: QuizUnit = {
      kind: "quiz", id: "s1-checkpoint", stageId: "stage-1", order: 2,
      boardSize: 5, title: base.title, objective: base.objective, story: base.story,
      terms: base.terms, demo: base.demo, passingScore: 80,
      questions: [invalidQuestion, invalidQuestion, invalidQuestion, invalidQuestion, invalidQuestion],
    };
    const text = issues([base, quiz], [term({ practice: malformed<Exercise>({ ...exercise(), id: " " }) })]);
    expect(text.match(/invalid exercise ID/g)).toHaveLength(6);
    expect(text).not.toContain("duplicate exercise ID:  ");
  });

  it("rejects missing, blank, boxed, and repeated choice IDs while checking later choices", () => {
    const choice = exercise({
      expected: { kind: "choice", choiceId: "yes" },
      choices: malformed<Exercise["choices"]>([null, {}, { id: " ", label: "空" }, { id: new String("yes"), label: "装箱" }, { id: "yes", label: "是" }, { id: "yes", label: "重复" }]),
    });
    const text = issues([lesson({ exercises: [choice, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })]);
    expect(text.match(/invalid choice/g)?.length).toBeGreaterThanOrEqual(4);
    expect(text).toContain("duplicate choice ID: yes");
  });

  it("rejects a blank expected choice ID even if an invalid option carries the same value", () => {
    const choice = exercise({ expected: { kind: "choice", choiceId: "  " }, choices: [{ id: "  ", label: "空" }] });
    const text = issues([lesson({ exercises: [choice, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })]);
    expect(text).toContain("choice action requires a choiceId");
    expect(text).toContain("invalid choice");
    expect(text).toContain("missing from choices");
  });

  it("continues past malformed catalog and exercise items", () => {
    const text = issues([
      malformed<CurriculumUnit>(null),
      lesson({ exercises: malformed<Exercise[]>([null, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })]) }),
    ], [malformed<GlossaryEntry>(null), term()]);
    expect(text).toContain("units/0: invalid unit");
    expect(text).toContain("terms/0: invalid term");
    expect(text).toContain("invalid exercise ID");
    expect(text).toContain("s1-intersections-turns/exercises/0: invalid exercise");
  });

  it("accepts a coherent lesson and glossary entry", () => {
    expect(validateLearningCatalog([lesson()], [term()])).toEqual([]);
  });

  it("reports missing glossary terms and an incomplete lesson", () => {
    const result = issues([lesson({ exercises: [exercise()] })], []);
    expect(result).toContain("intersection");
    expect(result).toContain("three exercises");
  });

  it("requires the 2, 1, 0 hint sequence and exactly three distinct hint levels", () => {
    expect(issues([lesson({ exercises: [exercise(), exercise({ id: "second", initialHintLevel: 2 }), exercise({ id: "third", initialHintLevel: 0 })] })])).toContain("2, 1, 0");
    expect(issues([lesson({ exercises: [exercise({ hints: [{ level: 1, text: "a" }, { level: 1, text: "b" }, { level: 3, text: "c" }] }), exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })])).toContain("1, 2, 3");
  });

  it("finds unknown lesson and related term links", () => {
    const result = issues([lesson()], [term({ lessonIds: ["s2-ladder"], relatedTermIds: ["ko"] })]);
    expect(result).toContain("s2-ladder");
    expect(result).toContain("ko");
  });

  it("rejects expected and hinted points beyond the board", () => {
    const bad = exercise({ expected: { kind: "move", point: { x: 5, y: 0 } }, hints: [{ level: 1, text: "a", points: [{ x: -1, y: 0 }] }, { level: 2, text: "b" }, { level: 3, text: "c" }] });
    const result = issues([lesson({ exercises: [bad, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })]);
    expect(result).toContain("out of bounds");
  });

  it("rejects missing choice options, unusable choices, and choices on non-choice actions", () => {
    const bad = exercise({ expected: { kind: "choice", choiceId: "yes" }, choices: [{ id: "no", label: "否" }] });
    expect(issues([lesson({ exercises: [bad, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })])).toContain("yes");
    const stray = exercise({ choices: [{ id: "yes", label: "是" }] });
    expect(issues([lesson({ exercises: [stray, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })])).toContain("non-choice");
  });

  it("rejects an expected move that the Go rules make impossible", () => {
    const blocked = exercise({ position: { size: 5, stones: [["white", 2, 2]], toPlay: "black" } });
    expect(issues([lesson({ exercises: [blocked, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })])).toContain("cannot complete");
  });

  it("rejects duplicate identifiers and orders within one stage", () => {
    const result = issues([lesson(), lesson({ order: 1 })], [term(), term()]);
    expect(result).toContain("duplicate unit");
    expect(result).toContain("duplicate term");
    expect(result).toContain("duplicate order");
  });

  it("rejects duplicate exercise IDs within a lesson and across glossary practice", () => {
    const repeated = lesson({ exercises: [exercise(), exercise({ initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] });
    expect(issues([repeated])).toContain("duplicate exercise ID: place-center");
    expect(issues([lesson()], [term({ practice: exercise({ id: "place-center" }) })])).toContain("duplicate exercise ID: place-center");
  });

  it("rejects duplicate quiz question IDs across the catalog", () => {
    const base = lesson();
    const question = (id: string) => ({ ...exercise({ id, initialHintLevel: 0 }), termId: "intersection" as const });
    const quiz: QuizUnit = {
      kind: "quiz", id: "s1-checkpoint", stageId: "stage-1", order: 2,
      boardSize: 5, title: base.title, objective: base.objective, story: base.story,
      terms: base.terms, demo: base.demo, passingScore: 80,
      questions: [question("q1"), question("q2"), question("q3"), question("q1"), question("q5")],
    };
    expect(issues([base, quiz])).toContain("duplicate exercise ID: q1");
  });

  it("rejects duplicate option IDs even when the expected choice exists", () => {
    const choice = exercise({ expected: { kind: "choice", choiceId: "yes" }, choices: [{ id: "yes", label: "是" }, { id: "yes", label: "仍然是" }] });
    expect(issues([lesson({ exercises: [choice, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })])).toContain("duplicate choice ID: yes");
  });

  it("enforces 5, 7, 9 stage board sizes", () => {
    expect(issues([lesson({ boardSize: 9 })])).toContain("stage-1");
  });

  it("keeps exercise positions on the lesson's stage board", () => {
    const misplaced = exercise({ position: { size: 7, stones: [], toPlay: "black" } });
    const result = issues([lesson({ exercises: [misplaced, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })]);
    expect(result).toContain("position size");
  });

  it("rejects an action kind that cannot be rendered as a task control", () => {
    const invalid = exercise({ expected: { kind: "teleport" } as unknown as Exercise["expected"] });
    expect(issues([lesson({ exercises: [invalid, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })])).toContain("task control");
  });

  it("requires quizzes to have five questions, score 80, and no prefilled answer hints", () => {
    const base = lesson();
    const quiz: QuizUnit = {
      kind: "quiz", id: "s1-checkpoint", stageId: base.stageId, order: base.order,
      boardSize: base.boardSize, title: base.title, objective: base.objective,
      story: base.story, terms: base.terms, demo: base.demo, passingScore: 80,
      questions: [{ ...exercise(), termId: "intersection" }],
    };
    expect(issues([quiz])).toContain("five questions");
    expect(issues([quiz])).toContain("initialHintLevel");
    expect(issues([{ ...quiz, passingScore: 70 as 80 }])).toContain("80");
  });

  it("requires graduation on stage 3 with 9 lines", () => {
    const graduation: GraduationUnit = { kind: "graduation", id: "s3-graduation", stageId: "stage-1", order: 8, boardSize: 5, requiredBoardSize: 9, title: "毕业", objective: "对局", story: "完成对局", terms: [] };
    expect(issues([graduation])).toContain("graduation");
  });

  it("throws one error containing all catalog issues", () => {
    expect(() => assertValidLearningCatalog([lesson({ exercises: [exercise()] })], [])).toThrow(/intersection[\s\S]*three exercises|three exercises[\s\S]*intersection/);
  });

  it("collects path-specific errors from malformed arrays and continues to later units", () => {
    const broken = lesson({
      exercises: malformed<Exercise[]>(null),
      demo: malformed<LessonUnit["demo"]>(null),
    });
    const later = lesson({ id: "s1-liberties-groups", order: 2, boardSize: 7 });
    const errors = validateLearningCatalog([broken, later], [term()]);
    expect(errors.join(" | ")).toContain("s1-intersections-turns/exercises");
    expect(errors.join(" | ")).toContain("s1-intersections-turns/demo");
    expect(errors.join(" | ")).toContain("s1-liberties-groups");
  });

  it("collects malformed position, hint, choice, and glossary animation errors without throwing", () => {
    const broken = exercise({
      position: { size: 5, stones: malformed<Exercise["position"]["stones"]>(42), toPlay: "black" },
      hints: malformed<Exercise["hints"]>(42),
      choices: malformed<Exercise["choices"]>(42),
    });
    const glossary = term({ animation: malformed<GlossaryEntry["animation"]>({ position: exercise().position, frames: null }) });
    const later = exercise({ id: "second", initialHintLevel: 1, expected: { kind: "move", point: { x: 99, y: 99 } } });
    const errors = validateLearningCatalog([lesson({ exercises: [broken, later, exercise({ id: "third", initialHintLevel: 0 })] })], [glossary]);
    const text = errors.join(" | ");
    expect(text).toContain("s1-intersections-turns/place-center");
    expect(text).toContain("stones");
    expect(text).toContain("hints");
    expect(text).toContain("choices");
    expect(text).toContain("intersection/animation/frames");
    expect(text).toContain("s1-intersections-turns/second");
  });

  it("validates lesson and glossary animation frame coordinates and colors", () => {
    const badFrame = { stones: [["black", 99, 99]], toPlay: "purple", caption: "坏帧", move: { kind: "move", point: { x: 99, y: 99 } } };
    const course = lesson({ demo: [malformed<LessonUnit["demo"][number]>(badFrame)] });
    const glossary = term({ animation: { position: exercise().position, frames: [malformed<GlossaryEntry["animation"]["frames"][number]>(badFrame)] } });
    const text = issues([course], [glossary]);
    expect(text).toContain("s1-intersections-turns/demo/0");
    expect(text).toContain("s1-intersections-turns/demo/0/move");
    expect(text).toContain("intersection/animation/frames/0");
    expect(text).toContain("intersection/animation/frames/0/move");
    expect(text).toContain("out of bounds");
    expect(text).toContain("toPlay");
  });

  it("rejects malformed frame stones arrays and keeps checking following frames", () => {
    const bad = malformed<LessonUnit["demo"][number]>({ stones: 42, toPlay: "black", caption: "bad" });
    const later = malformed<LessonUnit["demo"][number]>({ stones: [["white", 99, 99]], toPlay: "black", caption: "later" });
    const text = issues([lesson({ demo: [bad, later] })]);
    expect(text).toContain("s1-intersections-turns/demo/0: stones");
    expect(text).toContain("s1-intersections-turns/demo/1");
  });

  it("rejects invalid colors and tuples in exercise and glossary positions", () => {
    const badPosition = malformed<Exercise["position"]>({ size: 5, stones: [["purple", 1, 1], ["black", 2]], toPlay: "green" });
    const bad = exercise({ position: badPosition });
    const glossary = term({ animation: { position: badPosition, frames: [] } });
    const text = issues([lesson({ exercises: [bad, exercise({ id: "second", initialHintLevel: 1 }), exercise({ id: "third", initialHintLevel: 0 })] })], [glossary]);
    expect(text).toContain("s1-intersections-turns/place-center");
    expect(text).toContain("intersection/animation");
    expect(text).toContain("toPlay");
    expect(text).toContain("stone color");
    expect(text).toContain("stone tuple");
  });

  it("assertion combines malformed catalog messages in one error", () => {
    const broken = lesson({ exercises: malformed<Exercise[]>(null), demo: malformed<LessonUnit["demo"]>(null) });
    expect(() => assertValidLearningCatalog([broken], [term()])).toThrow(/s1-intersections-turns\/exercises[\s\S]*s1-intersections-turns\/demo|s1-intersections-turns\/demo[\s\S]*s1-intersections-turns\/exercises/);
  });

  it("rejects unknown and missing unit kinds instead of letting them skip unit validation", () => {
    const unknown = malformed<CurriculumUnit>({ ...lesson(), kind: "mystery" });
    const absent = { ...lesson() } as Record<string, unknown>;
    delete absent.kind;
    expect(issues([unknown])).toContain("units/0/kind");
    expect(issues([malformed<CurriculumUnit>(absent)])).toContain("units/0/kind");
    expect(() => assertValidLearningCatalog([unknown], [term()])).toThrow(/units\/0\/kind/);
  });

  it("reports missing stage and board size separately", () => {
    const absent = { ...lesson() } as Record<string, unknown>;
    delete absent.stageId;
    delete absent.boardSize;
    const text = issues([malformed<CurriculumUnit>(absent)]);
    expect(text).toContain("units/0/stageId");
    expect(text).toContain("units/0/boardSize");
  });

  it("rejects unknown stage IDs and unsupported board sizes with field paths", () => {
    const invalid = malformed<CurriculumUnit>({ ...lesson(), stageId: "stage-4", boardSize: 11 });
    const text = issues([invalid]);
    expect(text).toContain("units/0/stageId");
    expect(text).toContain("units/0/boardSize");
  });

  it("rejects missing and non-integer orders, then reports duplicate valid orders", () => {
    const missing = { ...lesson() } as Record<string, unknown>;
    delete missing.order;
    const invalid = malformed<CurriculumUnit>({ ...lesson(), id: "s1-liberties-groups", order: 1.5 });
    const valid = lesson({ id: "s1-atari-capture", order: 1 });
    const duplicate = lesson({ id: "s1-escape-connect", order: 1 });
    const text = issues([malformed<CurriculumUnit>(missing), invalid, valid, duplicate]);
    expect(text).toContain("units/0/order");
    expect(text).toContain("units/1/order");
    expect(text).toContain("units/3/order: duplicate");
  });
});
