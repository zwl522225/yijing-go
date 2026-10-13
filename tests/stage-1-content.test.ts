import { describe, expect, it } from "vitest";
import { createGame, passTurn, playMove } from "@/lib/go/rules";
import { applyLessonAction } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import { STAGE_1_TERMS } from "@/lib/learning/glossary/stage-1";
import { STAGE_1_KO_AFTER, STAGE_1_UNITS } from "@/lib/learning/stage-1";
import { validateLearningCatalog } from "@/lib/learning/validate";

const unitIds = [
  "s1-intersections-turns",
  "s1-liberties-groups",
  "s1-atari-capture",
  "s1-escape-connect",
  "s1-suicide-exception",
  "s1-ko-threat",
  "s1-pass-ending",
  "s1-checkpoint",
];
const termIds = [
  "intersection",
  "liberty",
  "group",
  "atari",
  "capture",
  "connect",
  "suicide",
  "ko",
  "ko-threat",
  "pass",
  "dead-stones",
  "chinese-rules",
];

describe("five-line rules curriculum", () => {
  it("has the requested ordered lessons and complete checkpoint", () => {
    expect(STAGE_1_UNITS.map((unit) => unit.id)).toEqual(unitIds);
    expect(STAGE_1_UNITS.map((unit) => unit.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(
      STAGE_1_UNITS.every(
        (unit) => unit.boardSize === 5 && unit.stageId === "stage-1",
      ),
    ).toBe(true);
    for (const unit of STAGE_1_UNITS) {
      if (unit.kind === "lesson") {
        expect(unit.exercises).toHaveLength(3);
        expect(
          unit.exercises.map((exercise) => exercise.initialHintLevel),
        ).toEqual([2, 1, 0]);
        expect(unit.demo.length).toBeGreaterThanOrEqual(2);
        expect(
          unit.demo.some((frame) =>
            /不是|不能|错误|误以为/.test(frame.caption),
          ),
        ).toBe(true);
      } else if (unit.kind === "quiz") {
        expect(unit.questions).toHaveLength(5);
        expect(unit.passingScore).toBe(80);
        expect(
          unit.questions.every((question) => question.initialHintLevel === 0),
        ).toBe(true);
        expect(
          new Set(unit.questions.map((question) => question.prompt)).size,
        ).toBe(5);
        expect(
          unit.questions.every(
            (question) => !/答案|正确选项/.test(question.prompt),
          ),
        ).toBe(true);
      } else throw new Error("Stage 1 must end in a quiz");
    }
  });

  it("defines exactly twelve usable terms with working practice and links", () => {
    expect(STAGE_1_TERMS.map((term) => term.id)).toEqual(termIds);
    expect(
      STAGE_1_TERMS.every(
        (term) =>
          term.name &&
          term.aliases.length &&
          term.plain &&
          term.formal &&
          term.misconception &&
          term.animation.frames.length &&
          term.lessonIds.length &&
          term.relatedTermIds.length,
      ),
    ).toBe(true);
    const allExercises = [
      ...STAGE_1_UNITS.flatMap((unit) =>
        unit.kind === "lesson"
          ? unit.exercises
          : unit.kind === "quiz"
            ? unit.questions
            : [],
      ),
      ...STAGE_1_TERMS.map((term) => term.practice),
    ];
    expect(new Set(STAGE_1_UNITS.map((unit) => unit.id)).size).toBe(8);
    expect(new Set(STAGE_1_TERMS.map((term) => term.id)).size).toBe(12);
    expect(new Set(allExercises.map((exercise) => exercise.id)).size).toBe(
      allExercises.length,
    );
    for (const exercise of allExercises) {
      expect(exercise.hints.map((hint) => hint.level)).toEqual([1, 2, 3]);
      expect(exercise.success.length).toBeGreaterThan(5);
      expect(exercise.errors.wrong_answer.length).toBeGreaterThan(5);
      expect(
        applyLessonAction(exercise, exercise.position, exercise.expected)
          .completed,
      ).toBe(true);
    }
    expect(validateLearningCatalog(STAGE_1_UNITS, STAGE_1_TERMS)).toEqual([]);
  });

  it("gives each lesson its required three different operations", () => {
    const expected: Record<string, [string[], string[]]> = {
      "s1-intersections-turns": [
        ["s1-center", "s1-edge", "s1-turn"],
        ["move", "move", "choice"],
      ],
      "s1-liberties-groups": [
        ["s1-group-select", "s1-liberty-count", "s1-fill-liberty"],
        ["select-group", "choice", "move"],
      ],
      "s1-atari-capture": [
        ["s1-atari-recognize", "s1-capture-move", "s1-diagonal-not-liberty"],
        ["choice", "move", "choice"],
      ],
      "s1-escape-connect": [
        ["s1-extend", "s1-connect", "s1-save-connect"],
        ["move", "move", "move"],
      ],
      "s1-suicide-exception": [
        ["s1-suicide-choice", "s1-capture-exception", "s1-suicide-explain"],
        ["choice", "move", "choice"],
      ],
      "s1-ko-threat": [
        ["s1-make-ko", "s1-ko-recapture", "s1-ko-threat-move"],
        ["move", "choice", "move"],
      ],
      "s1-pass-ending": [
        ["s1-pass-action", "s1-second-pass", "s1-scoring-transition"],
        ["pass", "choice", "choice"],
      ],
    };
    for (const unit of STAGE_1_UNITS) {
      if (unit.kind !== "lesson") continue;
      expect(unit.exercises.map((item) => item.id)).toEqual(
        expected[unit.id][0],
      );
      expect(unit.exercises.map((item) => item.expected.kind)).toEqual(
        expected[unit.id][1],
      );
    }
  });

  it("teaches diagonal liberties, capture exception, pass ending, and area score accurately", () => {
    const copy = STAGE_1_TERMS.map(
      (term) => `${term.plain} ${term.formal} ${term.misconception}`,
    ).join(" ");
    expect(copy).toMatch(/斜.*不是.*气|斜.*不算.*气/);
    expect(copy).toMatch(/提子.*禁入点|禁入点.*提子/);
    expect(copy).toMatch(/连续.*两.*停一手.*数子|连续.*两.*停一手.*终局/);
    expect(copy).toMatch(/活子.*空点.*7\.5/);

    const surrounded = createGame({
      size: 5,
      stones: [
        ["white", 1, 2],
        ["white", 2, 1],
        ["white", 3, 2],
        ["white", 2, 3],
      ],
      toPlay: "black",
    });
    expect(playMove(surrounded, { x: 2, y: 2 })).toMatchObject({
      ok: false,
      reason: "suicide",
    });
    const capturePosition = createGame({
      size: 5,
      stones: [
        ["white", 2, 2],
        ["black", 1, 2],
        ["black", 2, 1],
        ["black", 2, 3],
        ["white", 3, 1],
        ["white", 4, 2],
        ["white", 3, 3],
      ],
      toPlay: "black",
    });
    expect(playMove(capturePosition, { x: 3, y: 2 }).ok).toBe(true);
  });

  it("uses real history to show immediate ko recapture is blocked", () => {
    const before = createGame({
      size: 5,
      stones: [
        ["white", 2, 2],
        ["black", 1, 2],
        ["black", 2, 1],
        ["black", 2, 3],
        ["white", 3, 1],
        ["white", 4, 2],
        ["white", 3, 3],
      ],
      toPlay: "black",
    });
    const capture = playMove(before, { x: 3, y: 2 });
    expect(capture.ok).toBe(true);
    if (!capture.ok) return;
    expect(playMove(capture.state, { x: 2, y: 2 })).toMatchObject({
      ok: false,
      reason: "ko",
    });
  });

  it("replays the catalog ko capture so immediate recapture is illegal", () => {
    const lesson = STAGE_1_UNITS.find((unit) => unit.id === "s1-ko-threat")!;
    if (lesson.kind !== "lesson") throw new Error("Expected ko lesson");
    for (const id of ["s1-ko-recapture", "s1-ko-threat-move"]) {
      const exercise = lesson.exercises.find((item) => item.id === id)!;
      const state = createPosition(exercise.position);
      expect(state.moves).toContainEqual({ x: 3, y: 2 });
      expect(playMove(state, { x: 2, y: 2 })).toMatchObject({
        ok: false,
        reason: "ko",
      });
    }
    const glossary = STAGE_1_TERMS.find((term) => term.id === "ko")!;
    const glossaryState = createPosition(glossary.practice.position);
    expect(playMove(glossaryState, { x: 2, y: 2 })).toMatchObject({
      ok: false,
      reason: "ko",
    });
  });

  it("makes the ko threat a noncapturing move that puts a black group in atari", () => {
    const lesson = STAGE_1_UNITS.find((unit) => unit.id === "s1-ko-threat")!;
    if (lesson.kind !== "lesson") throw new Error("Expected ko lesson");
    const threat = lesson.exercises.find(
      (item) => item.id === "s1-ko-threat-move",
    )!;
    const state = createPosition(threat.position);
    const blackGroup = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ];
    const liberties = (board: typeof state.board) =>
      new Set(
        blackGroup.flatMap(({ x, y }) =>
          [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 },
          ]
            .filter(
              ({ x, y }) =>
                x >= 0 && y >= 0 && x < 5 && y < 5 && board[y][x] === null,
            )
            .map(({ x, y }) => `${x},${y}`),
        ),
      ).size;
    expect(blackGroup.every(({ x, y }) => state.board[y][x] === "black")).toBe(
      true,
    );
    expect(liberties(state.board)).toBeGreaterThanOrEqual(2);
    expect(threat.expected.kind).toBe("move");
    if (threat.expected.kind !== "move") return;
    const result = playMove(state, threat.expected.point);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      blackGroup.every(({ x, y }) => result.state.board[y][x] === "black"),
    ).toBe(true);
    expect(liberties(result.state.board)).toBe(1);
    const answer = playMove(result.state, { x: 0, y: 2 });
    expect(answer.ok).toBe(true);
    if (answer.ok) expect(playMove(answer.state, { x: 2, y: 2 }).ok).toBe(true);
    const glossary = STAGE_1_TERMS.find((term) => term.id === "ko-threat")!;
    expect(glossary.practice.expected).toEqual(threat.expected);
    const glossaryState = createPosition(glossary.practice.position);
    expect(glossaryState.board).toEqual(state.board);
    expect(playMove(glossaryState, { x: 2, y: 2 })).toMatchObject({
      ok: false,
      reason: "ko",
    });
  });

  it("animates atari and shows a countable enclosed point in Chinese area scoring", () => {
    const atari = STAGE_1_TERMS.find((term) => term.id === "atari")!;
    expect(atari.animation.frames.length).toBeGreaterThanOrEqual(2);
    const before = createGame({
      size: 5,
      stones: atari.animation.frames[0].stones,
      toPlay: atari.animation.frames[0].toPlay,
    });
    const action = atari.animation.frames[0].move;
    expect(action?.kind).toBe("move");
    if (action?.kind !== "move") return;
    const after = playMove(before, action.point);
    expect(after.ok).toBe(true);
    if (after.ok)
      expect(after.state.board).toEqual(
        createGame({ size: 5, stones: atari.animation.frames[1].stones }).board,
      );

    const chinese = STAGE_1_TERMS.find((term) => term.id === "chinese-rules")!;
    expect(chinese.animation.frames.length).toBeGreaterThanOrEqual(2);
    const final = chinese.animation.frames.at(-1)!;
    const board = createGame({ size: 5, stones: final.stones }).board;
    const chineseBefore = chinese.animation.frames[0];
    expect(chineseBefore.move?.kind).toBe("move");
    if (chineseBefore.move?.kind !== "move") return;
    const chineseMove = playMove(
      createGame({
        size: 5,
        stones: chineseBefore.stones,
        toPlay: chineseBefore.toPlay,
      }),
      chineseBefore.move.point,
    );
    expect(chineseMove.ok).toBe(true);
    if (chineseMove.ok) expect(chineseMove.state.board).toEqual(board);
    expect(board[1][1]).toBeNull();
    expect(
      [
        [0, 1],
        [2, 1],
        [1, 0],
        [1, 2],
      ].every(([x, y]) => board[y][x] === "black"),
    ).toBe(true);
    const captions = chinese.animation.frames
      .map((item) => item.caption)
      .join(" ");
    expect(captions).toMatch(/4颗活子/);
    expect(captions).toMatch(/活子5颗/);
    expect(captions).toMatch(/白棋1颗活子.*7\.5/);
    expect(final.stones.filter((stone) => stone[0] === "black")).toHaveLength(
      5,
    );
    expect(final.stones.filter((stone) => stone[0] === "white")).toHaveLength(
      1,
    );
    expect(chinese.animation.frames[0].stones).not.toEqual(final.stones);
  });

  it("requires two consecutive passes before scoring", () => {
    const first = passTurn(createGame({ size: 5 }));
    expect(first.consecutivePasses).toBe(1);
    expect(playMove(first, { x: 2, y: 2 }).ok).toBe(true);
    const second = passTurn(first);
    expect(second.consecutivePasses).toBe(2);
    expect(playMove(second, { x: 2, y: 2 })).toMatchObject({
      ok: false,
      reason: "finished",
    });
  });

  it("starts catalog pass questions from the pass history named in their prompts", () => {
    const passLesson = STAGE_1_UNITS.find(
      (unit) => unit.id === "s1-pass-ending",
    )!;
    if (passLesson.kind !== "lesson") throw new Error("Expected pass lesson");
    const secondPass = passLesson.exercises.find(
      (item) => item.id === "s1-second-pass",
    )!;
    const secondPassState = createPosition(secondPass.position);
    expect(secondPassState.toPlay).toBe("black");
    expect(secondPassState.consecutivePasses).toBe(1);
    expect(secondPassState.moves.at(-1)).toEqual({ pass: true });
    const finished = passTurn(secondPassState);
    expect(finished.consecutivePasses).toBe(2);
    expect(playMove(finished, { x: 0, y: 0 })).toMatchObject({
      ok: false,
      reason: "finished",
    });

    const passTerm = STAGE_1_TERMS.find((term) => term.id === "pass")!;
    for (const frame of [passLesson.demo[1], passTerm.animation.frames[1]]) {
      const state = createPosition({
        size: 5,
        stones: frame.stones,
        toPlay: frame.toPlay,
        setupMoves: frame.setupMoves,
      });
      expect(state.toPlay).toBe("black");
      expect(state.consecutivePasses).toBe(1);
    }

    const scoring = passLesson.exercises.find(
      (item) => item.id === "s1-scoring-transition",
    )!;
    const checkpoint = STAGE_1_UNITS.find(
      (unit) => unit.id === "s1-checkpoint",
    )!;
    if (checkpoint.kind !== "quiz") throw new Error("Expected checkpoint quiz");
    const quizPass = checkpoint.questions.find(
      (item) => item.id === "s1-q-pass",
    )!;
    for (const exercise of [scoring, quizPass]) {
      const state = createPosition(exercise.position);
      expect(state.consecutivePasses).toBe(2);
      expect(state.moves.slice(-2)).toEqual([{ pass: true }, { pass: true }]);
      expect(playMove(state, { x: 0, y: 0 })).toMatchObject({
        ok: false,
        reason: "finished",
      });
    }
  });

  it("reconstructs after-capture ko demo frames with history that blocks recapture", () => {
    const koLesson = STAGE_1_UNITS.find((unit) => unit.id === "s1-ko-threat")!;
    if (koLesson.kind !== "lesson") throw new Error("Expected ko lesson");
    const koTerm = STAGE_1_TERMS.find((term) => term.id === "ko")!;
    const threatTerm = STAGE_1_TERMS.find((term) => term.id === "ko-threat")!;
    for (const frame of [
      koLesson.demo[1],
      koTerm.animation.frames[1],
      threatTerm.animation.frames[0],
    ]) {
      const state = createPosition({
        size: 5,
        stones: frame.stones,
        toPlay: frame.toPlay,
        setupMoves: frame.setupMoves,
      });
      expect(state.toPlay).toBe("white");
      expect(state.board).toEqual(
        createGame({ size: 5, stones: STAGE_1_KO_AFTER }).board,
      );
      expect(state.moves.at(-1)).toEqual({ x: 3, y: 2 });
      expect(playMove(state, { x: 2, y: 2 })).toMatchObject({
        ok: false,
        reason: "ko",
      });
    }
    for (const frame of [koLesson.demo[2], threatTerm.animation.frames[1]]) {
      const state = createPosition({
        size: 5,
        stones: frame.stones,
        toPlay: frame.toPlay,
        setupMoves: frame.setupMoves,
      });
      expect(state.toPlay).toBe("black");
      expect(state.moves.slice(-2)).toEqual([
        { x: 3, y: 2 },
        { x: 1, y: 1 },
      ]);
      expect(state.board[1][1]).toBe("white");
    }
  });

  it("illustrates a dead stone with a legal board and a sealed last liberty", () => {
    const dead = STAGE_1_TERMS.find((term) => term.id === "dead-stones")!;
    const board = createGame(dead.animation.position);
    expect(board.board[3][2]).toBeNull();
    const capture = playMove(board, { x: 2, y: 3 });
    expect(capture.ok).toBe(true);
    if (capture.ok) expect(capture.state.board[2][2]).toBeNull();
    const whiteToPlay = createGame({
      ...dead.animation.position,
      toPlay: "white",
    });
    expect(playMove(whiteToPlay, { x: 2, y: 3 })).toMatchObject({
      ok: false,
      reason: "suicide",
    });
  });

  it("offers dead-stone marking only after two replayed passes", () => {
    const dead = STAGE_1_TERMS.find((term) => term.id === "dead-stones")!;
    const before = createPosition({ ...dead.practice.position, setupMoves: undefined });
    const onePass = passTurn(before);
    const terminal = passTurn(onePass);
    const practiceState = createPosition(dead.practice.position);
    expect(practiceState.consecutivePasses).toBe(2);
    expect(practiceState.board).toEqual(terminal.board);
    expect(practiceState.board[2][2]).toBe("white");
    const premature = applyLessonAction(dead.practice, onePass, dead.practice.expected);
    expect(premature).toMatchObject({ completed: false, nextState: onePass });
    expect(premature.nextState).toBe(onePass);
    expect(applyLessonAction(dead.practice, practiceState, dead.practice.expected)).toMatchObject({ completed: true, nextState: practiceState });
  });
});
