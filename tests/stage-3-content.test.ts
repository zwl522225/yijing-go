import { describe, expect, it } from "vitest";
import { scoreArea } from "@/lib/go/scoring";
import { passTurn, playMove } from "@/lib/go/rules";
import { applyLessonAction } from "@/lib/learning/evaluate";
import { createPosition } from "@/lib/learning/positions";
import { STAGE_3_SHAPES, STAGE_3_UNITS } from "@/lib/learning/stage-3";
import { STAGE_3_TERMS } from "@/lib/learning/glossary/stage-3";
import { CURRICULUM, CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { GLOSSARY, GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { validateLearningCatalog } from "@/lib/learning/validate";

const unitIds = [
  "s3-corner-side-center", "s3-territory-boundary", "s3-weak-groups",
  "s3-invasion-reduction", "s3-sente-gote-endgame", "s3-pass-dead-stones",
  "s3-chinese-area-komi", "s3-graduation",
];
const termIds = ["territory", "enclosure", "invasion", "reduction", "weak-group", "sente", "gote", "endgame", "komi", "scoring"];
const termNames = ["地", "围地", "侵入", "浅消", "弱棋", "先手", "后手", "收官", "贴目", "数目"];
const lesson = (id: string) => {
  const unit = STAGE_3_UNITS.find((item) => item.id === id);
  if (!unit || unit.kind !== "lesson") throw new Error(`Missing lesson ${id}`);
  return unit;
};

describe("stage 3 content and aggregate catalogs", () => {
  it("has seven ordered nine-line lessons with three completable exercises and a graduation unit", () => {
    expect(STAGE_3_UNITS.map(({ id }) => id)).toEqual(unitIds);
    expect(STAGE_3_UNITS.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const unit of STAGE_3_UNITS) {
      expect(unit.stageId).toBe("stage-3");
      expect(unit.boardSize).toBe(9);
      if (unit.kind === "lesson") {
        expect(unit.demo.length).toBeGreaterThanOrEqual(2);
        expect(unit.demo.some((frame) => /反例|错误|误以为|不能/.test(frame.caption))).toBe(true);
        expect(unit.exercises).toHaveLength(3);
        expect(unit.exercises.map((item) => item.initialHintLevel)).toEqual([2, 1, 0]);
        expect(new Set(unit.exercises.map(({ position, expected }) => JSON.stringify([position, expected]))).size).toBe(3);
        for (const exercise of unit.exercises) {
          expect(applyLessonAction(exercise, exercise.position, exercise.expected).completed, exercise.id).toBe(true);
        }
      } else {
        expect(unit.kind).toBe("graduation");
        expect(unit.requiredBoardSize).toBe(9);
        expect(`${unit.objective} ${unit.story}`).toMatch(/确认死子|死子确认/);
        expect(`${unit.objective} ${unit.story}`).toMatch(/计分/);
        expect(`${unit.objective} ${unit.story}`).toMatch(/胜负不影响|不要求获胜/);
      }
    }
  });

  it("has ten complete linked glossary entries with playable practice", () => {
    expect(STAGE_3_TERMS.map(({ id }) => id)).toEqual(termIds);
    expect(STAGE_3_TERMS.map(({ name }) => name)).toEqual(termNames);
    for (const term of STAGE_3_TERMS) {
      expect(term.aliases.length).toBeGreaterThan(0);
      expect(term.plain.length).toBeGreaterThan(8);
      expect(term.formal.length).toBeGreaterThan(8);
      expect(term.misconception.length).toBeGreaterThan(8);
      expect(term.animation.frames.length).toBeGreaterThanOrEqual(2);
      expect(term.lessonIds.length).toBeGreaterThan(0);
      expect(term.relatedTermIds.length).toBeGreaterThan(0);
      expect(applyLessonAction(term.practice, term.practice.position, term.practice.expected).completed, term.id).toBe(true);
    }
  });

  it("uses the one-point forcing comparison for endgame glossary practice", () => {
    const endgame = STAGE_3_TERMS.find((term) => term.id === "endgame")!;
    const comparison = lesson("s3-sente-gote-endgame").exercises[0];
    expect(endgame.practice.position).toEqual(comparison.position);
    expect(endgame.practice.expected).toEqual(comparison.expected);
    expect(endgame.practice.prompt).toMatch(/两处.*一目.*打吃/);
  });

  it("replays each glossary animation move into its displayed next frame", () => {
    for (const term of STAGE_3_TERMS) {
      const frames = term.animation.frames;
      const displayed = (index: number) => createPosition({ size: 9, ...frames[index] });
      expect(displayed(0).board, term.id).toEqual(createPosition(term.animation.position).board);
      for (let index = 0; index < frames.length - 1; index++) {
        const action = frames[index].move;
        if (action?.kind !== "move") continue;
        const result = playMove(displayed(index), action.point);
        expect(result.ok, `${term.id}/${index}`).toBe(true);
        if (!result.ok) throw new Error(result.reason);
        expect(displayed(index + 1).board, `${term.id}/${index}`).toEqual(result.state.board);
      }
    }
  });

  it("exports frozen ordered catalogs, exact lookup maps, and valid cross references", () => {
    expect(Object.isFrozen(CURRICULUM)).toBe(true);
    expect(Object.isFrozen(GLOSSARY)).toBe(true);
    expect(CURRICULUM).toHaveLength(24);
    expect(GLOSSARY).toHaveLength(32);
    expect(CURRICULUM.slice(16).map(({ id }) => id)).toEqual(unitIds);
    expect(GLOSSARY.slice(22).map(({ id }) => id)).toEqual(termIds);
    expect(CURRICULUM_BY_ID.size).toBe(24);
    expect(GLOSSARY_BY_ID.size).toBe(32);
    for (const unit of CURRICULUM) expect(CURRICULUM_BY_ID.get(unit.id)).toBe(unit);
    for (const term of GLOSSARY) expect(GLOSSARY_BY_ID.get(term.id)).toBe(term);
    expect(validateLearningCatalog(CURRICULUM, GLOSSARY)).toEqual([]);
  });

  it("compares closed corner and side enclosures of equal stone count using area scoring", () => {
    const corner = scoreArea(createPosition(STAGE_3_SHAPES.corner).board, new Set());
    const side = scoreArea(createPosition(STAGE_3_SHAPES.side).board, new Set());
    expect(STAGE_3_SHAPES.corner.stones.filter(([color]) => color === "black")).toHaveLength(5);
    expect(STAGE_3_SHAPES.side.stones.filter(([color]) => color === "black")).toHaveLength(5);
    expect(corner.black.territory).toBe(4);
    expect(side.black.territory).toBe(1);
  });

  it("shows a real gap leaves a region unowned until Black closes it", () => {
    const gap = createPosition(STAGE_3_SHAPES.boundaryGap);
    expect(scoreArea(gap.board, new Set()).black.territory).toBe(0);
    const closed = playMove(gap, { x: 4, y: 5 });
    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error(closed.reason);
    expect(scoreArea(closed.state.board, new Set()).black.territory).toBe(1);
  });

  it("replays two passes before dead-stone selection and then scores the removed stone", () => {
    const start = createPosition(STAGE_3_SHAPES.deadStone);
    expect(start.consecutivePasses).toBe(0);
    const afterBlack = passTurn(start);
    expect(afterBlack.consecutivePasses).toBe(1);
    const ended = passTurn(afterBlack);
    expect(ended.consecutivePasses).toBe(2);
    const passLesson = lesson("s3-pass-dead-stones");
    expect(passLesson.exercises.map(({ expected }) => expected.kind)).toEqual(["pass", "pass", "mark-dead"]);
    expect(createPosition(passLesson.exercises[1].position).consecutivePasses).toBe(1);
    expect(createPosition(passLesson.exercises[2].position).consecutivePasses).toBe(2);
    expect(ended.board[2][2]).toBe("white");
    const scored = scoreArea(ended.board, new Set(["2,2"]));
    expect(scored.dead.white).toBe(1);
    expect(scored.black.territory).toBeGreaterThan(scoreArea(ended.board, new Set()).black.territory);
  });

  it("gote counterexample replays Black's remote move and White's independent reply", () => {
    const demo = lesson("s3-sente-gote-endgame").demo;
    const blackMove = demo.findIndex((frame) => frame.caption.includes("反例"));
    expect(blackMove).toBeGreaterThanOrEqual(0);
    const initial = createPosition({ size: 9, ...demo[blackMove] });
    const afterBlack = playMove(initial, { x: 4, y: 0 });
    expect(afterBlack.ok).toBe(true);
    if (!afterBlack.ok) throw new Error(afterBlack.reason);
    expect(createPosition({ size: 9, ...demo[blackMove + 1] }).board).toEqual(afterBlack.state.board);
    expect(demo[blackMove + 1].move).toEqual({ kind: "move", point: { x: 5, y: 4 } });
    const afterWhite = playMove(afterBlack.state, { x: 5, y: 4 });
    expect(afterWhite.ok).toBe(true);
    if (!afterWhite.ok) throw new Error(afterWhite.reason);
    expect(createPosition({ size: 9, ...demo[blackMove + 2] }).board).toEqual(afterWhite.state.board);
  });

  it("capture counts no extra points beyond the resulting stones and territory", () => {
    const start = createPosition(STAGE_3_SHAPES.deadStone);
    const captured = playMove(start, { x: 2, y: 3 });
    expect(captured.ok).toBe(true);
    if (!captured.ok) throw new Error(captured.reason);
    expect(captured.state.captures.black).toBe(1);
    const withCapture = scoreArea(captured.state.board, new Set());
    const afterDeadConfirmation = scoreArea(start.board, new Set(["2,2"]));
    expect(withCapture.black.area).toBe(afterDeadConfirmation.black.area);
    expect(withCapture.black.total).toBe(afterDeadConfirmation.black.total);
  });

  it("invades a loose framework with an escape route and reduces from outside a strong wall", () => {
    const invasion = lesson("s3-invasion-reduction");
    expect(invasion.exercises.map(({ expected }) => expected)).toEqual([
      { kind: "move", point: { x: 6, y: 4 } },
      { kind: "move", point: { x: 6, y: 4 } },
      { kind: "move", point: { x: 7, y: 3 } },
    ]);
    const loose = createPosition(STAGE_3_SHAPES.looseFramework);
    expect(loose.board[7][7]).toBe("white");
    const entered = playMove(loose, { x: 6, y: 4 });
    expect(entered.ok).toBe(true);
    if (!entered.ok) throw new Error(entered.reason);
    const pressed = playMove(entered.state, { x: 7, y: 4 });
    expect(pressed.ok).toBe(true);
    if (!pressed.ok) throw new Error(pressed.reason);
    const escaped = playMove(pressed.state, { x: 5, y: 4 });
    expect(escaped.ok).toBe(true);
    if (!escaped.ok) throw new Error(escaped.reason);
    expect(escaped.state.board[4][5]).toBe("black");
    expect(escaped.state.board[4][6]).toBe("black");

    const strong = createPosition(STAGE_3_SHAPES.strongFramework);
    for (let y = 1; y <= 7; y++) expect(strong.board[y][2]).toBe("white");
    expect(strong.board[1][5]).toBe("white");
    expect(strong.board[7][5]).toBe("white");
    expect(strong.board[1][6]).toBe("white");
    expect(strong.board[7][6]).toBe("white");
    expect(strong.board[4][7]).toBe("black");
    expect(strong.board[4][6]).toBeNull();
    expect(strong.board[4][3]).toBeNull();
    const reduced = playMove(strong, { x: 6, y: 4 });
    expect(reduced.ok).toBe(true);
    if (!reduced.ok) throw new Error(reduced.reason);
    expect(reduced.state.board[4][7]).toBe("black");
    expect(reduced.state.board[4][6]).toBe("black");
    const deep = playMove(strong, { x: 3, y: 4 });
    expect(deep.ok).toBe(true);
    if (!deep.ok) throw new Error(deep.reason);
    expect(deep.state.board[4][2]).toBe("white");
    expect(deep.state.board[4][3]).toBe("black");
    expect(deep.state.board[4][7]).toBe("black");
    const weak = createPosition(STAGE_3_SHAPES.weakNearFramework);
    const supported = playMove(weak, { x: 7, y: 3 });
    expect(supported.ok).toBe(true);
    if (!supported.ok) throw new Error(supported.reason);
    expect(supported.state.board[3][6]).toBe("black");
    expect(supported.state.board[3][7]).toBe("black");
    expect(supported.state.board[4][7]).toBe("black");
  });

  it("uses the only open shared connection after White occupies the other point", () => {
    const first = playMove(createPosition(STAGE_3_SHAPES.strongFramework), { x: 6, y: 3 });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.reason);
    const cut = playMove(first.state, { x: 6, y: 4 });
    expect(cut.ok).toBe(true);
    if (!cut.ok) throw new Error(cut.reason);
    const weak = createPosition(STAGE_3_SHAPES.weakNearFramework);
    expect(weak.board).toEqual(cut.state.board);
    expect(weak.board[3][6]).toBe("black");
    expect(weak.board[4][7]).toBe("black");
    expect(weak.board[4][6]).toBe("white");
    expect(playMove(weak, { x: 6, y: 4 })).toMatchObject({ ok: false, reason: "occupied" });
    const connected = playMove(weak, { x: 7, y: 3 });
    expect(connected.ok).toBe(true);
    if (!connected.ok) throw new Error(connected.reason);
    expect(connected.state.board[3][7]).toBe("black");
    expect(connected.state.board[4][6]).toBe("white");
  });

  it("compares one-point boundary plays and replays a forcing reply on a late-game position", () => {
    const unit = lesson("s3-sente-gote-endgame");
    expect(unit.exercises.map(({ expected }) => expected)).toEqual([
      { kind: "move", point: { x: 4, y: 5 } },
      { kind: "move", point: { x: 5, y: 4 } },
      { kind: "move", point: { x: 4, y: 0 } },
    ]);
    const start = createPosition(STAGE_3_SHAPES.endgameBoundary);
    const score = scoreArea(start.board, new Set());
    const forcing = playMove(start, { x: 4, y: 5 });
    const quiet = playMove(start, { x: 4, y: 0 });
    expect(forcing.ok).toBe(true);
    expect(quiet.ok).toBe(true);
    if (!forcing.ok || !quiet.ok) throw new Error("Expected legal boundary moves");
    expect(scoreArea(forcing.state.board, new Set()).black.area - score.black.area).toBe(1);
    expect(scoreArea(quiet.state.board, new Set()).black.area - score.black.area).toBe(1);
    expect(forcing.state.board[4][4]).toBe("white");
    const ignored = playMove(passTurn(forcing.state), { x: 5, y: 4 });
    expect(ignored.ok).toBe(true);
    if (!ignored.ok) throw new Error(ignored.reason);
    expect(ignored.state.board[4][4]).toBeNull();
    const answer = playMove(forcing.state, { x: 5, y: 4 });
    expect(answer.ok).toBe(true);
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.state.board[4][4]).toBe("white");
    const independent = playMove(quiet.state, { x: 5, y: 4 });
    expect(independent.ok).toBe(true);
  });

  it("marks dead stones before confirmation and scoring", () => {
    const demo = lesson("s3-pass-dead-stones").demo;
    const mark = demo.find((frame) => frame.move?.kind === "mark-dead");
    expect(mark?.caption).toMatch(/标记死子/);
    expect(mark?.caption).not.toMatch(/确认后/);
    const markIndex = demo.indexOf(mark!);
    expect(demo[markIndex + 1].caption).toMatch(/确认.*计分/);
    expect(lesson("s3-pass-dead-stones").exercises[2].success).toMatch(/标记.*确认.*计分/);
  });

  it("scores stones plus territory with 7.5 komi and never separately adds captures", () => {
    const state = createPosition(STAGE_3_SHAPES.scoring);
    const score = scoreArea(state.board, new Set());
    expect(score.black).toMatchObject({ stones: 9, territory: 27, area: 36, total: 36 });
    expect(score.white).toMatchObject({ stones: 9, territory: 27, area: 36, total: 43.5 });
    expect(score.neutral).toBe(9);
    expect(score.komi).toBe(7.5);
    expect(score.winner).toBe("white");
    expect(`${lesson("s3-chinese-area-komi").objective} ${lesson("s3-chinese-area-komi").story}`).toMatch(/提子.*不单独加分/);
  });
});
