import { afterEach, describe, expect, it, vi } from "vitest";
import * as scoring from "@/lib/go/scoring";
import * as positions from "@/lib/learning/positions";
import { hashBoard } from "@/lib/go/rules";
import type { GameState } from "@/lib/go/types";
import { createDefaultProgress } from "@/lib/learning/progress";
import { STAGE_3_SHAPES } from "@/lib/learning/stage-3";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { AREA_PRACTICE_SCENARIOS, canStartAreaPractice } from "@/lib/learning/area-practice";
import { createAreaPracticeSession } from "@/lib/learning/area-practice-session";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
afterEach(() => vi.restoreAllMocks());

describe("area practice teaching fixtures", () => {
  it("reuses the approved scoring fixture and explicitly states the agreed alive condition", () => {
    expect(AREA_PRACTICE_SCENARIOS.map(s => s.id)).toEqual(["balanced", "shifted"]);
    expect(AREA_PRACTICE_SCENARIOS[0].initial).toBe(STAGE_3_SHAPES.scoring);
    for (const scenario of AREA_PRACTICE_SCENARIOS) {
      expect(scenario.allStonesAlive).toBe(true);
      expect(scenario.description).toContain("教学摆子");
      expect(scenario.description).toContain("无待确认死子");
      expect(scenario).not.toHaveProperty("deadStones");
    }
  });
  it.each([
    ["balanced", 5, 27, 9, 43.5, "white", 7.5],
    ["shifted", 6, 18, 18, 34.5, "black", 1.5],
  ] as const)("replays %s through two real passes and checks every point and score", (id, whiteX, whiteTerritory, neutral, whiteTotal, winner, margin) => {
    const scenario = AREA_PRACTICE_SCENARIOS.find(s => s.id === id)!;
    const before = structuredClone(scenario);
    freeze(scenario);
    const session = createAreaPracticeSession(id, `attempt-${id}`)!;
    expect(session).not.toBeNull();
    const { game, analysis } = session;
    expect(game.size).toBe(9);
    expect(game.moves).toEqual([{pass:true}, {pass:true}]);
    expect(game.past.map(g => g.consecutivePasses)).toEqual([0, 1]);
    expect(game.past.map(g => g.toPlay)).toEqual(["black", "white"]);
    expect(game.consecutivePasses).toBe(2);
    expect(game.history).toEqual(Array(3).fill(hashBoard(game.board)));
    expect(game.captures).toEqual({black:0,white:0});
    expect(analysis.removed).toEqual([]);
    expect(analysis.score).toEqual({black:{stones:9,territory:27,area:36,total:36},white:{stones:9,territory:whiteTerritory,area:9+whiteTerritory,total:whiteTotal},neutral,komi:7.5,dead:{black:0,white:0},winner,margin});
    expect(analysis.score.black.area + analysis.score.white.area + analysis.score.neutral).toBe(81);
    for (let y=0; y<9; y++) for (let x=0; x<9; x++) {
      const expected = x === 3 ? "black-stone" : x === whiteX ? "white-stone" : x < 3 ? "black-territory" : x > whiteX ? "white-territory" : "neutral";
      expect(analysis.points[y][x].kind).toBe(expected);
      expect(game.board[y][x]).toBe(x === 3 ? "black" : x === whiteX ? "white" : null);
    }
    expect(analysis.board).toEqual(game.board);
    expect(analysis.board).not.toBe(game.board);
    expect(analysis.board[0]).not.toBe(game.board[0]);
    expect(session.scenario).not.toBe(scenario);
    const second = createAreaPracticeSession(id, "independent")!;
    session.game.board[0][0] = "white";
    session.analysis.points[0][0].kind = "neutral";
    expect(second.game.board[0][0]).toBeNull();
    expect(second.analysis.points[0][0].kind).toBe("black-territory");
    expect(scenario).toEqual(before);
  });
});

describe("unavailable data and facts", () => {
  it.each(["", "unknown", null, {}, 4])("rejects invalid scenario id %j", id => expect(createAreaPracticeSession(id as string, "test")).toBeNull());
  it.each(["", "   ", null, 4])("rejects invalid session id %j", id => expect(createAreaPracticeSession("balanced", id as string)).toBeNull());
  it("rejects malformed setup before replay", () => {
    const original = AREA_PRACTICE_SCENARIOS[0];
    try {
      AREA_PRACTICE_SCENARIOS[0] = {...original,initial:{...original.initial,stones:[["black",3,0],["white",3,0]]}};
      expect(createAreaPracticeSession("balanced", "bad")).toBeNull();
    } finally { AREA_PRACTICE_SCENARIOS[0] = original; }
  });
  it("catches replay failures", () => {
    vi.spyOn(positions, "createPosition").mockImplementation(() => { throw new Error("unavailable"); });
    expect(createAreaPracticeSession("balanced", "bad")).toBeNull();
  });
  it.each([
    (game:GameState) => { game.history=["bad","bad","bad"]; },
    (game:GameState) => { game.past[0].board=structuredClone(game.past[0].board); game.past[0].board[0][0]="white"; },
    (game:GameState) => { game.past[1].board=structuredClone(game.past[1].board); game.past[1].board[0][3]=null; },
    (game:GameState) => { game.past[0].toPlay="white"; },
    (game:GameState) => { game.past[1].toPlay="black"; },
    (game:GameState) => { game.past[0].size=7; },
    (game:GameState) => { game.past[1].captures={black:1,white:0}; },
    (game:GameState) => { game.past[0].moves=[{pass:true}]; },
    (game:GameState) => { game.past[1].moves=[{x:0,y:0}]; },
    (game:GameState) => { game.past[0].history=[]; },
    (game:GameState) => { game.past[1].history[0]="bad"; },
  ])("fails closed for inconsistent two-pass replay history %#", corrupt => {
    const actual=positions.createPosition;
    vi.spyOn(positions,"createPosition").mockImplementation(spec=>{
      const game=actual(spec);
      corrupt(game);
      return game;
    });
    expect(createAreaPracticeSession("balanced","bad-history") === null).toBe(true);
  });
  it.each([
    (a: scoring.AreaAnalysis) => { a.score.white.total = NaN; },
    (a: scoring.AreaAnalysis) => { a.score.black.stones++; },
    (a: scoring.AreaAnalysis) => { a.score.neutral++; },
    (a: scoring.AreaAnalysis) => { a.points[0][0].kind = "white-territory"; },
    (a: scoring.AreaAnalysis) => { a.points.pop(); },
    (a: scoring.AreaAnalysis) => { a.board[0][3] = null; },
    (a: scoring.AreaAnalysis) => { a.removed.push({point:{x:3,y:0},color:"black"}); },
    (a: scoring.AreaAnalysis) => { a.score.dead.black = 1; },
    (a: scoring.AreaAnalysis) => { a.score.winner = "black"; },
    (a: scoring.AreaAnalysis) => { a.score.margin = Infinity; },
    (a: scoring.AreaAnalysis) => { a.score.white.area++; },
    (a: scoring.AreaAnalysis) => { a.regions[0].points.pop(); },
    (a: scoring.AreaAnalysis) => { a.points[0][0].regionId = 999; },
  ])("fails closed for inconsistent scorer facts %#", corrupt => {
    const actual = scoring.analyzeArea;
    vi.spyOn(scoring, "analyzeArea").mockImplementation((...args) => { const result=actual(...args); corrupt(result); return result; });
    expect(createAreaPracticeSession("balanced", "bad")).toBeNull();
  });
});

it("requires both course completion and the existing unlock prerequisites", () => {
  const p=createDefaultProgress();
  expect(canStartAreaPractice(freeze(p))).toBe(false);
  expect(canStartAreaPractice({...p,completedUnitIds:["s3-chinese-area-komi"]})).toBe(false);
  const ready={...p,completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":80,"stage-2":80}};
  expect(canStartAreaPractice(freeze(ready))).toBe(true);
  expect(canStartAreaPractice({...ready,bestQuizScores:{"stage-1":79,"stage-2":80}})).toBe(false);
  expect(canStartAreaPractice({...ready,completedUnitIds:ready.completedUnitIds.filter(id=>id!=="s3-pass-dead-stones")})).toBe(false);
  expect(canStartAreaPractice({...ready,completedUnitIds:ready.completedUnitIds.filter(id=>id!=="s3-chinese-area-komi")})).toBe(false);
});
