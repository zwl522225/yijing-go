import { describe, expect, it } from "vitest";
import { createGame, passTurn, playMove, undoRound } from "@/lib/go/rules";
import type { GameState, Point } from "@/lib/go/types";
import { applyLessonAction } from "@/lib/learning/evaluate";
import type { Exercise } from "@/lib/learning/types";
import { TERM_IDS } from "@/lib/learning/types";
import { getCoachTurn, getCoachRound } from "@/lib/go/coach";
import { ONBOARDING_KEY, readOnboardingDismissed, dismissOnboarding } from "@/lib/learning/onboarding";
import { createFeedbackReport, formatFeedbackReport } from "@/lib/learning/feedback-report";
import { SAVE_KEY } from "@/lib/go/storage";
import { groupAt } from "@/lib/go/analysis";

const exercise: Exercise = {
  id: "beginner-center", prompt: "在中央落子", position: { size: 5, stones: [], toPlay: "black" },
  expected: { kind: "move", point: { x: 2, y: 2 } }, initialHintLevel: 0,
  hints: [{ level: 1, text: "看任务" }, { level: 2, text: "找中央" }, { level: 3, text: "中央" }],
  success: "成功", errors: { wrong_answer: "再试一次", occupied: "已有棋子", suicide: "禁入点", ko: "重复棋形" },
};

function accepted(state: GameState, point: Point): GameState {
  const result = playMove(state, point);
  if (!result.ok) throw new Error(`Fixture move rejected: ${result.reason}`);
  return result.state;
}

function koCapture() {
  return accepted(createGame({ size: 5, stones: [
    ["white", 2, 1], ["white", 1, 2], ["white", 3, 2], ["white", 2, 3],
    ["black", 1, 1], ["black", 2, 0], ["black", 3, 1],
  ] }), { x: 2, y: 2 });
}

describe("beginner exercise failure contracts", () => {
  it("identifies an engine rejection without changing legacy feedback or the board", () => {
    const state = accepted(createGame({ size: 5 }), { x: 1, y: 1 });
    const point = { x: 1, y: 1 };
    const result = applyLessonAction(exercise, state, { kind: "move", point });
    expect(result).toMatchObject({ completed: false, retryable: true, message: "已有棋子",
      failure: { kind: "rule", reason: "occupied", point, nextStep: expect.stringContaining("空交叉点") } });
    expect(result.nextState).toBe(state);
  });
  it("marks a legal wrong-goal attempt without accepting its captures", () => {
    const state = createGame({ size: 5, stones: [["white", 0, 0], ["black", 1, 0]] });
    const point = { x: 0, y: 1 };
    expect(playMove(state, point)).toMatchObject({ ok: true, state: { captures: { black: 1 } } });
    const result = applyLessonAction(exercise, state, { kind: "move", point });
    expect(result).toMatchObject({ message: "再试一次", failure: { kind: "goal", reason: "wrong_answer", point,
      nextStep: expect.stringContaining("任务") } });
    expect(result.nextState).toBe(state);
    expect(state.captures.black).toBe(0);
  });
  it("distinguishes the wrong action type, including an otherwise legal move", () => {
    const state = createGame({ size: 5 });
    for (const action of [{ kind: "pass" }, { kind: "choice", choiceId: "yes" }] as const) {
      expect(applyLessonAction(exercise, state, action)).toMatchObject({ message: "再试一次",
        failure: { kind: "action", reason: "wrong_action", nextStep: expect.stringContaining("落子") } });
    }
    expect(applyLessonAction({ ...exercise, expected: { kind: "pass" } }, state,
      { kind: "move", point: { x: 1, y: 1 } })).toMatchObject({ failure: { kind: "action", reason: "wrong_action" } });
  });
  it("reports suicide, board bounds, finished state and a replayed ko from engine reasons", () => {
    const suicide = createGame({ size: 5, stones: [["white", 0, 1], ["white", 1, 0], ["white", 2, 1], ["white", 1, 2]] });
    const cases = [
      { state: suicide, point: { x: 1, y: 1 }, reason: "suicide" },
      { state: createGame({ size: 5 }), point: { x: 5, y: 0 }, reason: "out_of_bounds" },
      { state: passTurn(passTurn(createGame({ size: 5 }))), point: { x: 2, y: 2 }, reason: "finished" },
      { state: koCapture(), point: { x: 2, y: 1 }, reason: "ko" },
    ];
    for (const { state, point, reason } of cases) {
      expect(playMove(state, point)).toEqual({ ok: false, reason });
      const result = applyLessonAction(exercise, state, { kind: "move", point });
      expect(result).toMatchObject({ failure: { kind: "rule", reason, point, nextStep: expect.any(String) } });
      expect(result.nextState).toBe(state);
    }
  });
  it("preserves successful result shape and state changes", () => {
    const state = createGame({ size: 5 });
    const result = applyLessonAction(exercise, state, exercise.expected);
    expect(result.completed).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.message).toBe("成功");
    expect(result).not.toHaveProperty("failure");
    expect(result.nextState.board[2][2]).toBe("black");
    expect(state.board[2][2]).toBeNull();
  });
});

describe("actual beginner coaching", () => {
  it.each(["black", "white"] as const)("describes real %s captures and actual actor", (actor) => {
    const opponent = actor === "black" ? "white" : "black";
    const before = createGame({ size: 5, toPlay: actor, stones: [[opponent, 2, 2], [actor, 1, 2], [actor, 2, 1], [actor, 2, 3]] });
    const original = structuredClone(before);
    const point = { x: 3, y: 2 }, result = playMove(before, point);
    const turn = getCoachTurn(before, point, result);
    expect(turn).toMatchObject({ actor, moveNumber: 1, kind: "capture", summary: expect.stringContaining("1") });
    expect(turn?.summary).toContain(actor === "black" ? "黑棋（你）" : "白棋（电脑）");
    expect(turn?.summary).toContain("（4，3）");
    expect(turn?.terms).toContain("capture");
    expect(before).toEqual(original);
    expect(before.captures[actor]).toBe(0);
  });
  it("describes the actual placement's liberties without inventing strength or intent", () => {
    const before = createGame({ size: 5 });
    const point = { x: 2, y: 2 };
    const turn = getCoachTurn(before, point, playMove(before, point));
    expect(turn).toMatchObject({ kind: "placement", summary: expect.stringContaining("4 口气") });
    expect(turn?.question).toBeTruthy();
    expect(turn?.summary).not.toMatch(/最佳|胜率|意图/);
    expect(turn?.terms.every(term => TERM_IDS.includes(term))).toBe(true);
  });
  it("identifies newly atari opponent and own groups from actual liberty changes", () => {
    const opponent = createGame({ size: 5, stones: [["white", 2, 2], ["black", 1, 2], ["black", 2, 1]] });
    const attack = { x: 2, y: 3 };
    expect(getCoachTurn(opponent, attack, playMove(opponent, attack))).toMatchObject({ kind: "atari", summary: expect.stringContaining("对方 1 块") });
    const own = createGame({ size: 5, toPlay: "white", stones: [["black", 1, 0]] });
    const risky = { x: 0, y: 0 };
    expect(getCoachTurn(own, risky, playMove(own, risky))).toMatchObject({ actor: "white", kind: "atari", summary: expect.stringContaining("己方 1 块") });
  });
  it("does not call an unrelated already atari group a new attack", () => {
    const before = createGame({ size: 5, stones: [["white", 0, 0], ["black", 1, 0]] });
    const point = { x: 4, y: 4 };
    expect(getCoachTurn(before, point, playMove(before, point))?.kind).toBe("placement");
  });
  it.each(["black", "white"] as const)("does not invent new %s atari when extending an existing atari group", (actor) => {
    let before = createGame({ size: 5, toPlay: actor });
    before = accepted(before, { x: 0, y: 0 });
    before = accepted(before, { x: 1, y: 0 });
    before = passTurn(before);
    before = accepted(before, { x: 1, y: 1 });
    const point = { x: 0, y: 1 }, result = playMove(before, point);
    expect(groupAt(before.board, before.size, { x: 0, y: 0 })?.liberties).toHaveLength(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("extension should be legal");
    expect(groupAt(result.state.board, result.state.size, point)?.liberties).toHaveLength(1);
    const turn = getCoachTurn(before, point, result);
    expect(turn).toMatchObject({ actor, kind: "placement", moveNumber: 5, summary: expect.stringContaining("1 口气") });
    expect(turn?.summary).not.toContain("新近");
  });
  it.each(["black", "white"] as const)("retains new %s atari when an existing group goes from two liberties to one", (actor) => {
    let before = accepted(createGame({ size: 5, toPlay: actor }), { x: 0, y: 0 });
    before = accepted(before, { x: 1, y: 1 });
    before = passTurn(before);
    before = accepted(before, { x: 0, y: 2 });
    const point = { x: 0, y: 1 }, result = playMove(before, point);
    expect(groupAt(before.board, before.size, { x: 0, y: 0 })?.liberties).toHaveLength(2);
    if (!result.ok) throw new Error("two-to-one liberty transition should be legal");
    expect(groupAt(result.state.board, result.state.size, point)?.liberties).toHaveLength(1);
    expect(getCoachTurn(before, point, result)).toMatchObject({ actor, kind: "atari", summary: expect.stringContaining("己方 1 块棋新近") });
  });
  it.each(["black", "white"] as const)("retains a wholly new %s group placed with one liberty", (actor) => {
    const opponent = actor === "black" ? "white" : "black";
    const before = accepted(createGame({ size: 5, toPlay: opponent }), { x: 1, y: 0 });
    const point = { x: 0, y: 0 }, result = playMove(before, point);
    expect(groupAt(before.board, before.size, point)).toBeNull();
    if (!result.ok) throw new Error("new group should be legal");
    expect(groupAt(result.state.board, result.state.size, point)?.liberties).toHaveLength(1);
    expect(getCoachTurn(before, point, result)).toMatchObject({ actor, kind: "atari", summary: expect.stringContaining("己方 1 块棋新近") });
  });
  it("reports accepted passes and actual two-pass end, excluding no-op finished pass", () => {
    const before = createGame({ size: 5 });
    const once = passTurn(before), ended = passTurn(once);
    expect(getCoachTurn(before, { pass: true }, { ok: true, state: once })).toMatchObject({ actor: "black", moveNumber: 1, kind: "pass" });
    expect(getCoachTurn(once, { pass: true }, { ok: true, state: ended })).toMatchObject({ actor: "white", moveNumber: 2, kind: "end" });
    expect(getCoachRound(ended).map(turn => turn.kind)).toEqual(["pass", "end"]);
    expect(getCoachTurn(ended, { pass: true }, { ok: true, state: passTurn(ended) })).toBeNull();
  });
  it("does not produce an accepted comment for occupied or replayed ko rejections", () => {
    const before = koCapture();
    const point = { x: 2, y: 1 };
    const rejected = playMove(before, point);
    expect(rejected).toEqual({ ok: false, reason: "ko" });
    expect(getCoachTurn(before, point, rejected)).toBeNull();
    const occupied = { x: 2, y: 2 };
    expect(getCoachTurn(before, occupied, playMove(before, occupied))).toBeNull();
    expect(getCoachRound(before)).toMatchObject([{ actor: "black", kind: "capture", moveNumber: 1 }]);
  });
  it("keeps the newest black and its actual successor, excluding the old white during thinking", () => {
    const first = accepted(createGame({ size: 5 }), { x: 1, y: 1 });
    const replied = accepted(first, { x: 3, y: 3 });
    const pending = accepted(replied, { x: 2, y: 1 });
    expect(getCoachRound(replied).map(turn => [turn.actor, turn.moveNumber])).toEqual([["black", 1], ["white", 2]]);
    expect(getCoachRound(pending).map(turn => [turn.actor, turn.moveNumber])).toEqual([["black", 3]]);
    const nextReply = accepted(pending, { x: 3, y: 2 });
    const original = structuredClone(nextReply);
    expect(getCoachRound(nextReply).map(turn => [turn.actor, turn.moveNumber])).toEqual([["black", 3], ["white", 4]]);
    expect(nextReply).toEqual(original);
    expect(getCoachRound(undoRound(nextReply)).map(turn => turn.moveNumber)).toEqual([1, 2]);
    expect(getCoachRound(createGame({ size: 5 }))).toEqual([]);
  });
  it("supports an initial real white-only history without inventing a human turn", () => {
    const state = accepted(createGame({ size: 5, toPlay: "white" }), { x: 1, y: 1 });
    expect(getCoachRound(state)).toMatchObject([{ actor: "white", moveNumber: 1 }]);
  });
});

describe("isolated defensive onboarding storage", () => {
  it("only accepts the exact version 1 dismissed record", () => {
    for (const value of [null, "bad", "null", "true", "[]", "{}", '{"version":2,"dismissed":true}',
      '{"version":1,"dismissed":false}', '{"version":1,"dismissed":"true"}', '{"version":1,"dismissed":true,"score":9}']) {
      expect(readOnboardingDismissed({ getItem: () => value, setItem: () => {} })).toBe(false);
    }
    expect(readOnboardingDismissed({ getItem: () => '{"version":1,"dismissed":true}', setItem: () => {} })).toBe(true);
  });
  it("uses its independent key without touching an existing game save", () => {
    const values = new Map([[SAVE_KEY, "existing game and grades"]]);
    const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(ONBOARDING_KEY).toBe("yijing-go-onboarding-v1");
    expect(readOnboardingDismissed(store)).toBe(false);
    expect(dismissOnboarding(store)).toBe(true);
    expect(values.get(ONBOARDING_KEY)).toBe('{"version":1,"dismissed":true}');
    expect(readOnboardingDismissed(store)).toBe(true);
    expect(values.get(SAVE_KEY)).toBe("existing game and grades");
    expect(values.size).toBe(2);
  });
  it("contains both read and write storage exceptions", () => {
    const store = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(readOnboardingDismissed(store)).toBe(false);
    expect(dismissOnboarding(store)).toBe(false);
  });
});

describe("manual feedback report boundaries", () => {
  it("copies only allowed context and does not mutate or retain private extras", () => {
    const context = { mode: "lesson" as const, boardSize: 5 as const, lessonTitle: "交叉点", actionKind: "move" as const,
      account: "private-user", game: { board: [["black"]] }, token: "secret-token", scores: [99] };
    const original = structuredClone(context);
    const report = createFeedbackReport(context, "operation", "  找不到操作  ");
    expect(report).toEqual({ version: 1, category: "operation", description: "找不到操作",
      context: { mode: "lesson", boardSize: 5, lessonTitle: "交叉点", actionKind: "move" } });
    expect(context).toEqual(original);
    expect(report.context).not.toBe(context);
    const text = formatFeedbackReport(report);
    expect(text).toContain("找不到操作");
    expect(text).toContain("交叉点");
    expect(text).not.toMatch(/private-user|secret-token|scores|account|token|board:/);
  });
  it("limits trimmed text to 600 Unicode code points without splitting emoji", () => {
    const report = createFeedbackReport({ mode: "play", boardSize: 9 }, "other", `  ${"😀".repeat(601)}  `);
    expect(Array.from(report.description)).toHaveLength(600);
    expect(report.description).toBe("😀".repeat(600));
  });
  it("redacts quiz lesson and action context while preserving the user's manual text", () => {
    const context = { mode: "quiz" as const, boardSize: 5 as const, lessonTitle: "question answer", actionKind: "choice" as const };
    const report = createFeedbackReport(context, "rule", "用户自己填写的描述");
    expect(report.context).toEqual({ mode: "quiz", boardSize: 5 });
    const text = formatFeedbackReport(report);
    expect(text).toContain("阶段测验作答中");
    expect(text).toContain("用户自己填写的描述");
    expect(text).not.toMatch(/question answer|choice/);
    expect(context.lessonTitle).toBe("question answer");
  });
});
