import { describe, expect, it } from "vitest";

import { createGame, playMove, passTurn } from "@/lib/go/rules";
import { decodeSave, encodeSave, getLegacyCompletedLessons, recordLegacyLessonCompletion } from "@/lib/go/storage";
import { DEFAULT_ASSISTS, DEFAULT_PROGRESS, isGraduated, getRecommendedUnit } from "@/lib/learning/progress";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import type { GameSnapshot, GameState } from "@/lib/go/types";
import { createLearningSession, submitLearningAction } from "@/hooks/use-learning-session";
import { createLessonResume } from "@/lib/learning/session-resume";

function settings(game: GameState) {
  return { game, difficulty: "beginner" as const, volume: 0.35, category: "instrumental" as const };
}

function legacy(game: GameState) {
  return { ...settings(game), lessonIds: ["liberties", "eyes", "scoring"] };
}

function legacyBoard(game: GameState) {
  const stripSnapshot = ({ size: _size, ...snapshot }: GameSnapshot) => snapshot;
  const { size: _size, ...current } = game;
  return { ...legacy(game), game: { ...current, past: game.past.map(stripSnapshot) } };
}

describe("save format", () => {
  it("round trips valid ordinary lesson resume independently of the match", () => {
    const first = createLearningSession("s1-intersections-turns");
    const lessonResume = createLessonResume(submitLearningAction(first, first.exercise!.expected))!;
    const saved = { ...settings(createGame({ size: 9 })), learning: DEFAULT_PROGRESS, lessonResume, lastView: "lesson" as const };
    expect(decodeSave(encodeSave(saved))).toEqual({ ...saved, confirmMoves: false });
    expect(decodeSave(encodeSave({ ...saved, lastView: "play" }))?.lastView).toBe("play");
  });

  it("drops broken resume fields without losing valid match, settings, or progress", () => {
    const first = createLearningSession("s1-intersections-turns");
    const lessonResume = createLessonResume(first)!;
    const saved = { ...settings(createGame({ size: 9 })), learning: DEFAULT_PROGRESS, lessonResume: { ...lessonResume, signature: "old" }, lastView: "lesson" };
    const restored = decodeSave(JSON.stringify({ version: 3, data: saved }))!;
    expect(restored).toEqual({ ...settings(saved.game), learning: DEFAULT_PROGRESS, confirmMoves: false });
    expect(restored).not.toHaveProperty("lessonResume");
    expect(restored).not.toHaveProperty("lastView");
  });

  it("validates resume against sanitized learning and coerces only strict lesson view", () => {
    const first = createLearningSession("s1-intersections-turns");
    const saved = { ...settings(createGame({ size: 7 })), learning: { ...DEFAULT_PROGRESS, assists: "bad" }, lessonResume: createLessonResume(first) };
    for (const lastView of [undefined, null, true, "play", ["lesson"], "unknown"]) {
      const restored = decodeSave(JSON.stringify({ version: 3, data: { ...saved, lastView } }))!;
      expect(restored.lessonResume).toEqual(saved.lessonResume);
      expect(restored.lastView).toBe("play");
      expect(restored.learning).toEqual(DEFAULT_PROGRESS);
    }
    const locked = { ...saved, lessonResume: createLessonResume(createLearningSession("s2-connect-cut")), learning: { ...DEFAULT_PROGRESS, bestQuizScores: { "stage-1": "100" }, completedUnitIds: ["s1-checkpoint"] } };
    expect(decodeSave(JSON.stringify({ version: 3, data: locked }))).not.toHaveProperty("lessonResume");
  });

  it("keeps old saves free of absent resume fields", () => {
    const saved = { ...settings(createGame({ size: 9 })), learning: DEFAULT_PROGRESS };
    const encoded = encodeSave(saved);
    expect(JSON.parse(encoded).data).not.toHaveProperty("lessonResume");
    expect(JSON.parse(encoded).data).not.toHaveProperty("lastView");
    expect(decodeSave(encoded)).not.toHaveProperty("lessonResume");
    expect(decodeSave(encoded)).not.toHaveProperty("lastView");
  });

  it("ignores a saved graduation unit mark without real graduation flags",()=>{
    const learning={...DEFAULT_PROGRESS,completedUnitIds:[...LESSON_UNIT_IDS],bestQuizScores:{"stage-1":80,"stage-2":80}};
    const restored=decodeSave(encodeSave({...settings(createGame({size:9})),learning}))!;
    expect(restored.learning.completedUnitIds).not.toContain("s3-graduation");
    expect(isGraduated(restored.learning)).toBe(false);
    expect(getRecommendedUnit(learning)).toBe("s3-graduation");
  });
  it("sanitizes scoring fields without losing valid course and term state",()=>{
    const game=passTurn(passTurn(createGame({size:9,stones:[["white",1,2]]})));
    const learning={...DEFAULT_PROGRESS,completedUnitIds:["s1-intersections-turns"],termStates:{liberty:"practiced"},graduation:"corrupt"};
    const data={...settings(game),learning,scoring:{phase:"bad",deadStones:["1,2","1,2","8,8","99,99",7,"__proto__"],outcome:{winner:"black"},graduationEligible:"yes"}};
    const restored=decodeSave(JSON.stringify({version:3,data}))!;
    expect(restored.scoring).toEqual({phase:"dead-stones",deadStones:["1,2"],outcome:null,graduationEligible:false});
    expect(restored.learning.completedUnitIds).toEqual(["s1-intersections-turns"]);expect(restored.learning.termStates.liberty).toBe("practiced");
  });
  it("round trips v3 learning without legacy lesson IDs", () => {
    const saved = { ...settings(createGame({ size: 9 })), learning: DEFAULT_PROGRESS };
    const encoded = encodeSave(saved);
    expect(JSON.parse(encoded).version).toBe(3);
    expect(JSON.parse(encoded).data).not.toHaveProperty("lessonIds");
    expect(decodeSave(encoded)).toEqual({...saved,confirmMoves:false});
  });

  it("migrates all six legacy IDs from v2 and preserves the board size", () => {
    const data = { ...legacy(createGame({ size: 9 })), lessonIds: ["liberties", "capture", "suicide", "ko", "eyes", "scoring"] };
    const migrated = decodeSave(JSON.stringify({ version: 2, data }));
    expect(migrated?.game.size).toBe(9);
    expect(migrated?.learning.completedUnitIds).toEqual([
      "s1-liberties-groups", "s1-atari-capture", "s1-suicide-exception",
      "s1-ko-threat", "s2-two-eyes", "s1-pass-ending",
    ]);
    expect(migrated?.learning.assists).toEqual(DEFAULT_ASSISTS);
    expect(getLegacyCompletedLessons(migrated!.learning)).toEqual(data.lessonIds);
  });

  it("adapts a current legacy lesson without replacing other learning fields", () => {
    const progress = { ...DEFAULT_PROGRESS, termStates: { liberty: "mastered" as const } };
    const updated = recordLegacyLessonCompletion(progress, "eyes");
    expect(getLegacyCompletedLessons(updated)).toEqual(["eyes"]);
    expect(updated.termStates).toEqual({ liberty: "mastered" });
  });

  it("migrates a v1 board and its past snapshots to 19 lines", () => {
    const result = playMove(createGame(), { x: 3, y: 3 });
    if (!result.ok) throw new Error("Expected a legal move");
    const migrated = decodeSave(JSON.stringify({ version: 1, data: legacyBoard(result.state) }));
    expect(migrated?.game.size).toBe(19);
    expect(migrated?.game.past[0].size).toBe(19);
    expect(migrated?.learning.completedUnitIds).toEqual([
      "s1-liberties-groups", "s2-two-eyes", "s1-pass-ending",
    ]);
  });

  it("recovers valid v3 fields independently from invalid neighbors", () => {
    const data = {
      ...settings(createGame({ size: 7 })),
      learning: {
        completedUnitIds: ["s1-liberties-groups", "unknown", 7],
        bestQuizScores: { "stage-1": 83, "stage-2": "bad", alien: 100 },
        wrongQuestionIds: ["q1", 3],
        termStates: { liberty: "practiced", ko: "invalid", alien: "mastered" },
        assists: { showLiberties: true, showAtari: "yes", showCoordinates: false },
        graduation: { enteredScoring: true, finalizedScore: "yes" },
      },
    };
    const restored = decodeSave(JSON.stringify({ version: 3, data }));
    expect(restored?.game.size).toBe(7);
    expect(restored?.learning.completedUnitIds).toEqual(["s1-liberties-groups"]);
    expect(restored?.learning.bestQuizScores).toEqual({ "stage-1": 83 });
    expect(restored?.learning.wrongQuestionIds).toEqual(["q1"]);
    expect(restored?.learning.termStates).toEqual({ liberty: "practiced" });
    expect(restored?.learning.assists.showLiberties).toBe(true);
    expect(restored?.learning.assists.showAtari).toBe(DEFAULT_ASSISTS.showAtari);
    expect(restored?.learning.graduation.enteredScoring).toBe(true);
    expect(restored?.learning.graduation.finalizedScore).toBe(false);
  });

  it.each([
    ["completedUnitIds", {}],
    ["bestQuizScores", []],
    ["wrongQuestionIds", null],
    ["termStates", []],
    ["assists", "invalid"],
    ["graduation", false],
  ] as const)("defaults an invalid %s without losing other learning fields", (field, invalid) => {
    const learning = {
      completedUnitIds: ["s1-intersections-turns"],
      bestQuizScores: { "stage-1": 90 },
      wrongQuestionIds: ["q1"],
      termStates: { liberty: "mastered" },
      assists: { ...DEFAULT_PROGRESS.assists, showLiberties: true },
      graduation: { ...DEFAULT_PROGRESS.graduation, enteredScoring: true },
    };
    const data = { ...settings(createGame({ size: 9 })), learning: { ...learning, [field]: invalid } };
    const restored = decodeSave(JSON.stringify({ version: 3, data }));
    expect(restored?.learning).toEqual({ ...learning, [field]: DEFAULT_PROGRESS[field] });
  });

  it.each([1, 2, 3])("restores independent nested learning data from v%i", (version) => {
    const data = version === 1
      ? legacyBoard(createGame())
      : version === 2
        ? legacy(createGame({ size: 9 }))
        : { ...settings(createGame({ size: 9 })), learning: null };
    const raw = JSON.stringify({ version, data });
    const first = decodeSave(raw);
    const second = decodeSave(raw);
    if (!first || !second) throw new Error("Expected a restorable save");
    const untouched = structuredClone(second.learning);
    first.learning.completedUnitIds.push("s1-intersections-turns");
    first.learning.bestQuizScores["stage-1"] = 100;
    first.learning.wrongQuestionIds.push("q1");
    first.learning.termStates.liberty = "mastered";
    first.learning.assists.showLiberties = true;
    first.learning.graduation.enteredScoring = true;
    expect(second.learning).toEqual(untouched);
    expect(DEFAULT_PROGRESS.assists.showLiberties).toBe(false);
    expect(DEFAULT_PROGRESS.graduation.enteredScoring).toBe(false);
  });

  it("rejects a corrupt game even when learning is valid", () => {
    const data = { ...settings(createGame({ size: 9 })), learning: DEFAULT_PROGRESS };
    const shortBoard = structuredClone(data);
    shortBoard.game.board[0].pop();
    expect(decodeSave(JSON.stringify({ version: 3, data: shortBoard }))).toBe(null);
    const invalidMove = structuredClone(data);
    invalidMove.game.moves.push({ x: 9, y: 0 });
    expect(decodeSave(JSON.stringify({ version: 3, data: invalidMove }))).toBe(null);
  });

  it("rejects non-primitive difficulty and incompatible saves", () => {
    const data = { ...settings(createGame()), learning: DEFAULT_PROGRESS };
    expect(decodeSave("not-json")).toBe(null);
    expect(decodeSave(JSON.stringify({ version: 3, data: { ...data, difficulty: ["beginner"] } }))).toBe(null);
    expect(decodeSave(JSON.stringify({ version: 4, data }))).toBe(null);
  });
});
