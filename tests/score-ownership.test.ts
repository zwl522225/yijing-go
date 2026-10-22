import { describe, expect, it } from "vitest";

import { analyzeArea, scoreArea, type AreaAnalysis } from "@/lib/go/scoring";
import { describeAreaPoint, validateAreaAnalysis } from "@/lib/go/score-ownership";
import { createGame, passTurn, playMove } from "@/lib/go/rules";
import { BOARD_SIZES, type Board } from "@/lib/go/types";
import { createPosition } from "@/lib/learning/positions";
import { STAGE_3_SHAPES } from "@/lib/learning/stage-3";

const empty = (size = 5): Board => Array.from({ length: size }, () => Array(size).fill(null));
const copy = (analysis: AreaAnalysis): AreaAnalysis => structuredClone(analysis);

describe("shared area ownership", () => {
  it("maps all 81 points in the real lesson after two passes to its actual regions and score", () => {
    const ended = passTurn(passTurn(createPosition(STAGE_3_SHAPES.scoring)));
    const analysis = analyzeArea(ended.board, new Set());
    expect(ended.consecutivePasses).toBe(2);
    expect(analysis.score).toEqual(scoreArea(ended.board, new Set()));
    expect(analysis.score.black).toEqual({ stones: 9, territory: 27, area: 36, total: 36 });
    expect(analysis.score.white).toEqual({ stones: 9, territory: 27, area: 36, total: 43.5 });
    expect(analysis.score.neutral).toBe(9);
    const kinds = analysis.points.flat().map(({ kind }) => kind);
    for (const [kind, count] of Object.entries({ "black-stone": 9, "white-stone": 9, "black-territory": 27, "white-territory": 27, neutral: 9 })) {
      expect(kinds.filter((value) => value === kind)).toHaveLength(count);
    }
    expect(analysis.regions.map(({ points }) => points.length).sort((a, b) => a - b)).toEqual([9, 27, 27]);
    for (const region of analysis.regions) {
      expect(new Set(region.points.map(({ x, y }) => `${x},${y}`)).size).toBe(region.points.length);
      expect(new Set(region.borders)).toEqual(new Set(region.owner ? [region.owner] : ["black", "white"]));
      for (const { x, y } of region.points) expect(analysis.points[y][x].regionId).toBe(region.id);
    }
    expect(validateAreaAnalysis(analysis, 9)).toBe(true);
    const whitePoint = analysis.regions.find(({ owner }) => owner === "white")!.points[0];
    expect(describeAreaPoint(analysis, whitePoint)).toMatch(/白方空点.*27个.*只接触白方/);
  });

  it("describes a closed corner using its whole actual empty region and one-based coordinates", () => {
    const board = empty();
    board[0][1] = board[1][0] = "black";
    board[4][4] = "white";
    const analysis = analyzeArea(board, new Set());
    expect(analysis.points[0][0].kind).toBe("black-territory");
    expect(describeAreaPoint(analysis, { x: 0, y: 0 })).toMatch(/第1列.*第1行.*黑方空点.*1个.*只接触黑方/);
    expect(describeAreaPoint(analysis, { x: 1, y: 0 })).toMatch(/黑方.*棋子.*不.*独立.*死活/);
    expect(describeAreaPoint(analysis, { x: 4, y: 4 })).toMatch(/白方.*棋子/);
    expect(describeAreaPoint(analysis, { x: 2, y: 2 })).toMatch(/未归属.*黑白双方/);
  });

  it("distinguishes no stone boundary from a two-color boundary without claiming seki", () => {
    const analysis = analyzeArea(empty(), new Set());
    expect(analysis.regions[0]).toMatchObject({ borders: [], owner: null });
    expect(describeAreaPoint(analysis, { x: 0, y: 0 })).toMatch(/未归属.*25个.*没有棋子边界/);
    expect(describeAreaPoint(analysis, { x: 0, y: 0 })).not.toMatch(/公气|双活/);
  });

  it("merges removed points into the real neutral region rather than awarding the opponent", () => {
    const board = empty();
    board[0][1] = board[1][0] = "black";
    board[4][4] = "white";
    const before = analyzeArea(board, new Set());
    const deadStones = new Set(["1,0"]);
    const after = analyzeArea(board, deadStones);
    expect(before.points[0][0].kind).toBe("black-territory");
    expect(after.points[0][0].kind).toBe("neutral");
    expect(after.points[0][1].kind).toBe("neutral");
    expect(after.regions).toHaveLength(1);
    expect(after.removed).toEqual([{ point: { x: 1, y: 0 }, color: "black" }]);
    expect(describeAreaPoint(after, { x: 1, y: 0 })).toMatch(/原黑子.*确认.*移除.*不一定.*对方/);
    expect(validateAreaAnalysis(after, 5, { source: board, deadStones })).toBe(true);
  });

  it("keeps partial group removal and permissive accepted dead-key parsing compatible without duplicates", () => {
    const board = empty();
    board[1][1] = board[1][2] = "white";
    board[4][4] = "black";
    const deadStones = new Set(["01,1", "1,1,9", "1,1", "1.5,1", "99,2", "bad", "2,-1"]);
    const analysis = analyzeArea(board, deadStones);
    expect(analysis.removed).toEqual([{ point: { x: 1, y: 1 }, color: "white" }]);
    expect(analysis.board[1][2]).toBe("white");
    expect(analysis.score.dead).toEqual({ black: 0, white: 1 });
    expect(analysis.score).toEqual(scoreArea(board, deadStones));
    expect(validateAreaAnalysis(analysis, 5, { source: board, deadStones })).toBe(true);
  });

  it.each(BOARD_SIZES)("preserves immutable inputs and complete scoring on size %i", (size) => {
    const board = empty(size);
    board[0][0] = "black";
    board[size - 1][size - 1] = "white";
    board.forEach(Object.freeze);
    Object.freeze(board);
    const deadStones = Object.freeze(new Set(["0,0"]));
    const saved = JSON.stringify(board);
    for (const komi of [0, 7.5]) {
      const analysis = analyzeArea(board, deadStones, komi);
      expect(validateAreaAnalysis(analysis, size, { source: board, deadStones })).toBe(true);
      expect(analysis.score).toEqual(scoreArea(board, deadStones, komi));
      expect(analysis.score).toEqual({
        black: { stones: 0, territory: 0, area: 0, total: 0 },
        white: { stones: 1, territory: size * size - 1, area: size * size, total: size * size + komi },
        dead: { black: 1, white: 0 }, neutral: 0, komi,
        winner: "white", margin: size * size + komi,
      });
      expect(analysis.board).not.toBe(board);
      expect(analysis.board[0]).not.toBe(board[0]);
    }
    expect(JSON.stringify(board)).toBe(saved);
    expect([...deadStones]).toEqual(["0,0"]);
  });

  it("preserves ties and computes only the resulting board after real capture history", () => {
    expect(analyzeArea(empty(), new Set(), 0).score).toMatchObject({ winner: "white", margin: 0 });
    const start = createPosition(STAGE_3_SHAPES.deadStone);
    const captured = playMove(start, { x: 2, y: 3 });
    if (!captured.ok) throw new Error("Expected the real capture");
    const ended = passTurn(passTurn(captured.state));
    const saved = structuredClone(ended);
    const analysis = analyzeArea(ended.board, new Set());
    expect(ended.captures.black).toBe(1);
    expect(analysis.score.black.total).toBe(analyzeArea(start.board, new Set(["2,2"])).score.black.total);
    expect(ended).toEqual(saved);
  });
});

describe("ownership consistency boundary", () => {
  const sample = () => analyzeArea(createGame({ size: 5, stones: [["black", 1, 0], ["black", 0, 1], ["white", 4, 4]] }).board, new Set());

  it.each([
    ["matrix kind", (a: AreaAnalysis) => { a.points[0][0].kind = "white-territory"; }],
    ["matrix region", (a: AreaAnalysis) => { a.points[0][0].regionId = 99; }],
    ["matrix size", (a: AreaAnalysis) => { a.points.pop(); }],
    ["board value", (a: AreaAnalysis) => { (a.board[0] as unknown[])[0] = "bad"; }],
    ["missing member", (a: AreaAnalysis) => { a.regions[0].points.pop(); }],
    ["duplicate member", (a: AreaAnalysis) => { a.regions[0].points.push(a.regions[0].points[0]); }],
    ["out of bounds", (a: AreaAnalysis) => { a.regions[0].points[0] = { x: 5, y: 0 }; }],
    ["fractional point", (a: AreaAnalysis) => { a.regions[0].points[0].x = 0.5; }],
    ["borders", (a: AreaAnalysis) => { a.regions[0].borders = ["white"]; }],
    ["owner", (a: AreaAnalysis) => { a.regions[0].owner = null; }],
    ["duplicate region", (a: AreaAnalysis) => { a.regions.push(a.regions[0]); }],
    ["duplicate border", (a: AreaAnalysis) => { a.regions[0].borders.push(a.regions[0].borders[0]); }],
    ["counts", (a: AreaAnalysis) => { a.score.black.territory++; }],
    ["total", (a: AreaAnalysis) => { a.score.white.total++; }],
    ["winner", (a: AreaAnalysis) => { a.score.winner = a.score.winner === "black" ? "white" : "black"; }],
    ["margin", (a: AreaAnalysis) => { a.score.margin++; }],
    ["removed occupied", (a: AreaAnalysis) => { a.removed.push({ point: { x: 1, y: 0 }, color: "black" }); a.score.dead.black++; }],
    ["removed count", (a: AreaAnalysis) => { a.removed.push({ point: { x: 0, y: 0 }, color: "black" }); }],
    ["removed color", (a: AreaAnalysis) => { a.removed.push({ point: { x: 0, y: 0 }, color: "bad" as "black" }); }],
    ["removed coordinate", (a: AreaAnalysis) => { a.removed.push({ point: { x: -1, y: 0 }, color: "black" }); }],
  ] as const)("rejects corrupt %s facts without repairing them", (_label, mutate) => {
    const analysis = copy(sample());
    mutate(analysis);
    const saved = structuredClone(analysis);
    expect(validateAreaAnalysis(analysis, 5)).toBe(false);
    expect(analysis).toEqual(saved);
  });

  it("rejects disconnected merged regions even when counts and borders still agree", () => {
    const board = empty();
    for (const row of board) row[2] = "black";
    const analysis = analyzeArea(board, new Set());
    const first = analysis.regions[0];
    const second = analysis.regions[1];
    first.points.push(...second.points);
    for (const { x, y } of second.points) analysis.points[y][x].regionId = first.id;
    analysis.regions.pop();
    expect(validateAreaAnalysis(analysis, 5)).toBe(false);
  });

  it("rejects invented, duplicated or incorrectly colored removed stones against source context", () => {
    const board = empty();
    board[1][1] = "white";
    const deadStones = new Set(["01,1"]);
    const analysis = analyzeArea(board, deadStones);
    const wrongColor = copy(analysis);
    wrongColor.removed[0].color = "black";
    wrongColor.score.dead = { black: 1, white: 0 };
    expect(validateAreaAnalysis(wrongColor, 5, { source: board, deadStones })).toBe(false);
    const duplicate = copy(analysis);
    duplicate.removed.push(duplicate.removed[0]);
    duplicate.score.dead.white++;
    expect(validateAreaAnalysis(duplicate, 5)).toBe(false);
    expect(validateAreaAnalysis(analysis, 5, { source: board, deadStones: new Set() })).toBe(false);
    const wrongSource = empty();
    wrongSource[1][1] = "black";
    expect(validateAreaAnalysis(analysis, 5, { source: wrongSource, deadStones })).toBe(false);
  });

  it("can inspect frozen analysis facts without rewriting or repairing them", () => {
    const analysis = sample();
    const freeze = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    };
    freeze(analysis);
    const saved = JSON.stringify(analysis);
    expect(validateAreaAnalysis(analysis, 5)).toBe(true);
    expect(describeAreaPoint(analysis, { x: 0, y: 0 })).toMatch(/黑方空点/);
    expect(JSON.stringify(analysis)).toBe(saved);
  });

  it("returns false for malformed input and null for invalid descriptions", () => {
    for (const value of [null, {}, [], { board: null }, { ...sample(), regions: [null] }]) {
      expect(validateAreaAnalysis(value, 5)).toBe(false);
    }
    expect(validateAreaAnalysis(sample(), 9)).toBe(false);
    expect(validateAreaAnalysis(sample(), 0)).toBe(false);
    for (const point of [{ x: -1, y: 0 }, { x: 5, y: 0 }, { x: NaN, y: 0 }, { x: 1.5, y: 0 }]) {
      expect(describeAreaPoint(sample(), point)).toBeNull();
    }
    const broken = sample();
    broken.score.neutral++;
    expect(describeAreaPoint(broken, { x: 0, y: 0 })).toBeNull();
  });

  it("rejects sparse matrices, source rows and region borders without throwing", () => {
    const missingBoardRow = sample();
    delete missingBoardRow.board[0];
    expect(validateAreaAnalysis(missingBoardRow, 5)).toBe(false);
    const missingPointRow = sample();
    delete missingPointRow.points[0];
    expect(validateAreaAnalysis(missingPointRow, 5)).toBe(false);
    const missingBoardCell = sample();
    delete missingBoardCell.board[0][0];
    expect(validateAreaAnalysis(missingBoardCell, 5)).toBe(false);
    const noBoundary = analyzeArea(empty(), new Set());
    const source = empty();
    delete source[0][0];
    expect(validateAreaAnalysis(noBoundary, 5, { source, deadStones: new Set() })).toBe(false);
    const missingSourceRows = Array<Board[number]>(5);
    expect(validateAreaAnalysis(noBoundary, 5, { source: missingSourceRows, deadStones: new Set() })).toBe(false);
    const missingBorder = sample();
    delete missingBorder.regions[0].borders[0];
    expect(validateAreaAnalysis(missingBorder, 5)).toBe(false);
  });

  it.each([null, 0, {}, undefined])("rejects non-string dead keys in display context: %s", (key) => {
    const source = empty();
    const analysis = analyzeArea(source, new Set());
    const deadStones = new Set([key]) as Set<string>;
    expect(validateAreaAnalysis(analysis, 5, { source, deadStones })).toBe(false);
  });
});
