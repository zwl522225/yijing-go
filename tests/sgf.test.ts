import { describe, expect, it } from "vitest";

import { createGame, hashBoard, passTurn, playMove, undoRound } from "@/lib/go/rules";
import { scoreArea } from "@/lib/go/scoring";
import { createSgf, serializeSgf, type SgfEnding } from "@/lib/go/sgf";
import type { GameState } from "@/lib/go/types";

const ongoing = { kind: "ongoing" } as const;
const resigned = { kind: "resigned", resigned: "black" } as const;
const scored = { kind: "scored", deadStones: [] } as const;

function move(game: GameState, x: number, y: number): GameState {
  const result = playMove(game, { x, y });
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

function content(game: GameState, ending: SgfEnding = ongoing) {
  const result = createSgf(game, ending);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.content;
}

function freeze(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
}

describe("createSgf", () => {
  it.each([9, 13, 19] as const)("exports FF4 UTF-8 %i-line games with column then row coordinates", (size) => {
    const game = move(createGame({ size }), 2, 3);
    const result = createSgf(game, ongoing);
    expect(result).toMatchObject({ ok: true, size, moves: 1 });
    const sgf = content(game);
    expect(sgf).toContain(`SZ[${size}]`);
    expect(sgf).toContain("FF[4]GM[1]CA[UTF-8]AP[YijingGo:0.1.0]");
    expect(sgf).toContain("KM[7.5]RU[Chinese]PB[玩家]PW[电脑]");
    expect(sgf).toMatch(/;B\[cd\]\)$/);
    expect(sgf).not.toMatch(/(?:RE|DT|HA|GN|PC|US)\[/);
  });

  it("exports actual initial setup and White to play without a fictitious handicap", () => {
    const root = createGame({ size: 9, stones: [["black", 2, 3], ["white", 8, 0]], toPlay: "white" });
    const sgf = content(move(root, 4, 5));
    expect(sgf).toContain("AB[cd]AW[ia]PL[W]");
    expect(sgf).toMatch(/;W\[ef\]\)$/);
    expect(sgf).not.toContain("HA[");
  });

  it("records captures only as their original moves and explicit pass nodes", () => {
    const root = createGame({ size: 9, stones: [["black", 1, 0], ["black", 0, 1], ["black", 2, 1], ["white", 1, 1]] });
    const game = passTurn(move(root, 1, 2));
    expect(game.captures.black).toBe(1);
    expect(content(game)).toMatch(/;B\[bc\];W\[\]\)$/);
    expect(content(game)).not.toContain("AE[");
  });

  it("exports only retained history after undo and subsequent play", () => {
    let game = move(createGame({ size: 9 }), 0, 0);
    game = move(game, 1, 0);
    game = move(game, 2, 0);
    game = move(game, 3, 0);
    game = move(undoRound(game), 4, 0);
    expect(content(game)).toMatch(/;B\[aa\];W\[ba\];B\[ea\]\)$/);
    expect(createSgf(game, ongoing)).toMatchObject({ ok: true, moves: 3 });
  });

  it("omits results even after two passes until scoring is confirmed", () => {
    const game = passTurn(passTurn(createGame({ size: 9 })));
    expect(content(game)).toMatch(/;B\[\];W\[\]\)$/);
    expect(content(game)).not.toContain("RE[");
  });

  it.each(["black", "white"] as const)("recomputes a confirmed %s area result", (winner) => {
    const game = passTurn(passTurn(createGame({ size: 9, stones: [[winner, 0, 0]] })));
    const score = scoreArea(game.board, new Set());
    expect(score.winner).toBe(winner);
    expect(content(game, scored)).toContain(`RE[${winner === "black" ? "B" : "W"}+${score.margin}]`);
  });

  it("deduplicates and orders dead marks on the final node while retaining the original board", () => {
    const root = createGame({ size: 9, stones: [["black", 0, 0], ["white", 3, 2], ["white", 2, 1]] });
    const game = passTurn(passTurn(root));
    const sgf = content(game, { kind: "scored", deadStones: ["3,2", "2,1", "3,2"] });
    expect(sgf).toContain("RE[B+73.5]");
    expect(sgf).toMatch(/;W\[\]MA\[cb\]\[dc\]C\[[^\]]*死子[^\]]*\]\)$/);
    expect(sgf).toContain("AW[cb][dc]");
    expect(sgf).not.toContain("AE[");
    expect(game.board[2][3]).toBe("white");
  });

  it("permits known black resignation at zero moves and rejects empty ongoing export", () => {
    const game = createGame({ size: 9 });
    expect(createSgf(game, ongoing)).toMatchObject({ ok: false, error: expect.any(String) });
    expect(createSgf(game, resigned)).toMatchObject({ ok: true, moves: 0 });
    expect(content(game, resigned)).toContain("RE[W+R]");
  });

  it("rejects scoring before two passes", () => {
    expect(createSgf(move(createGame({ size: 9 }), 0, 0), scored).ok).toBe(false);
  });

  it.each([null, undefined, {}, { kind: "finished" }, { kind: "resigned", resigned: "white" }, { kind: "scored" }, { kind: "scored", deadStones: {} }])("rejects malformed runtime ending %j", (ending) => {
    expect(createSgf(passTurn(passTurn(createGame({ size: 9 }))), ending as SgfEnding).ok).toBe(false);
  });

  it.each([["0,0"], ["-1,0"], ["9,0"], ["0.5,0"], ["00,0"], ["0,0]RE[B+R"], [1], [null]].map((deadStones) => ({ deadStones })))("rejects invalid or unoccupied dead points $deadStones", ({ deadStones }) => {
    const game = passTurn(passTurn(createGame({ size: 9 })));
    expect(createSgf(game, { kind: "scored", deadStones } as unknown as SgfEnding).ok).toBe(false);
  });

  it.each([5, 7] as const)("rejects teaching-only board size %i", (size) => {
    expect(createSgf(move(createGame({ size }), 0, 0), ongoing).ok).toBe(false);
  });

  const corruptions: [string, (game: GameState) => void][] = [
    ["missing root", (g) => { g.past.shift(); }],
    ["missing middle frame", (g) => { g.past.splice(1, 1); }],
    ["empty history", (g) => { g.history = []; }],
    ["wrong hash", (g) => { g.history[1] = "bad"; }],
    ["middle board", (g) => { g.past[1].board[8][8] = "white"; }],
    ["middle turn", (g) => { g.past[1].toPlay = "black"; }],
    ["middle captures", (g) => { g.past[1].captures.black = 1; }],
    ["middle history", (g) => { g.past[1].history[0] = "bad"; }],
    ["middle actions", (g) => { g.past[1].moves[0] = { x: 7, y: 7 }; }],
    ["middle passes", (g) => { g.past[1].consecutivePasses = 1; }],
    ["middle size", (g) => { g.past[1].size = 13; }],
    ["root actions", (g) => { g.past[0].moves = [{ pass: true }]; }],
    ["root captures", (g) => { g.past[0].captures.white = 1; }],
    ["root passes", (g) => { g.past[0].consecutivePasses = 1; }],
    ["root hash", (g) => { g.past[0].history = ["bad"]; }],
    ["invalid color", (g) => { (g.board as unknown[][])[0][0] = "red"; }],
    ["invalid turn", (g) => { (g as unknown as { toPlay: string }).toPlay = "red"; }],
    ["invalid point", (g) => { g.moves[2] = { x: -1, y: 0 }; }],
    ["fractional point", (g) => { g.moves[2] = { x: 2.5, y: 0 }; }],
    ["mixed action", (g) => { g.moves[2] = { x: 2, y: 0, pass: true }; }],
    ["false pass", (g) => { g.moves[2] = { pass: false } as unknown as { pass: true }; }],
    ["wrong captures", (g) => { g.captures.black = 1; }],
    ["wrong board", (g) => { g.board[0][2] = null; }],
    ["non-array board", (g) => { g.board = {} as GameState["board"]; }],
    ["missing row", (g) => { delete g.board[0]; }],
    ["sparse move", (g) => { delete g.moves[1]; }],
    ["sparse past", (g) => { delete g.past[1]; }],
    ["fractional captures", (g) => { g.captures.black = 0.5; }],
  ];

  it.each(corruptions)("rejects corrupt %s instead of partially exporting", (_, corrupt) => {
    const game = structuredClone(move(move(move(createGame({ size: 9 }), 0, 0), 1, 0), 2, 0));
    corrupt(game);
    expect(createSgf(game, ongoing)).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("rejects invented actions after two passes even with matching hash and board", () => {
    const game = passTurn(passTurn(createGame({ size: 9 })));
    game.past.push(structuredClone({ ...game, past: undefined }));
    game.moves = [...game.moves, { pass: true }];
    game.history = [...game.history, hashBoard(game.board)];
    game.toPlay = "white";
    game.consecutivePasses = 3;
    expect(createSgf(game, ongoing).ok).toBe(false);
  });

  it.each([null, {}, { past: null }, []])("rejects invalid game structures %j", (game) => {
    expect(createSgf(game as unknown as GameState, ongoing).ok).toBe(false);
  });

  it("leaves recursively frozen game and ending inputs unchanged", () => {
    const game = passTurn(passTurn(move(createGame({ size: 9 }), 2, 3)));
    const ending: SgfEnding = { kind: "scored", deadStones: ["2,3"] };
    const before = JSON.stringify({ game, ending });
    freeze(game);
    freeze(ending);
    expect(createSgf(game, ending).ok).toBe(true);
    expect(JSON.stringify({ game, ending })).toBe(before);
  });
});

describe("serializeSgf", () => {
  it("escapes SGF delimiters and backslashes and normalizes text newlines", () => {
    expect(serializeSgf([[["C", ["中文[方括号]\\路径\r\n换行\r末尾"]]]])).toEqual({
      ok: true,
      content: "(;C[中文[方括号\\]\\\\路径\n换行\n末尾])",
    });
  });

  it("enforces the 1 MiB limit using encoded UTF-8 bytes without truncating", () => {
    const prefix = "(;C[";
    const suffix = "])";
    const atLimit = "a".repeat(1024 * 1024 - prefix.length - suffix.length);
    const result = serializeSgf([[["C", [atLimit]]]]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.length).toBe(1024 * 1024);
      expect(result.content === prefix + atLimit + suffix).toBe(true);
    }
    expect(serializeSgf([[["C", [atLimit + "a"]]]])).toMatchObject({ ok: false, error: expect.any(String) });
    expect(serializeSgf([[["C", ["中".repeat(400_000)]]]])).toMatchObject({ ok: false, error: expect.any(String) });
    expect(serializeSgf([[["C", ["]".repeat(600_000)]]]])).toMatchObject({ ok: false, error: expect.any(String) });
  });
});
