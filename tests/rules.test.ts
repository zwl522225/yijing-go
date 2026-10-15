import { describe, expect, it } from "vitest";

import {
  createGame,
  hashBoard,
  legalMoves,
  passTurn,
  playMove,
  undoRound,
} from "@/lib/go/rules";

describe("playMove", () => {
  it.each([5, 7, 9, 13, 19] as const)(
    "creates and plays on a %i-line board",
    (size) => {
      const game = createGame({ size });
      expect(game.size).toBe(size);
      expect(game.board).toHaveLength(size);
      expect(game.board.every((row) => row.length === size)).toBe(true);
      const result = playMove(game, { x: size - 1, y: size - 1 });
      expect(result.ok).toBe(true);
    },
  );

  it("rejects a point outside the current board", () => {
    expect(playMove(createGame({ size: 5 }), { x: 5, y: 4 })).toMatchObject({
      ok: false,
      reason: "out_of_bounds",
    });
  });

  it("rejects setup stones outside the current board", () => {
    expect(() => createGame({ size: 5, stones: [["black", 5, 0]] })).toThrow(
      RangeError,
    );
    expect(() => createGame({ size: 5, stones: [["black", -1, 0]] })).toThrow(
      RangeError,
    );
  });

  it("keeps board size through moves, passes, and undo", () => {
    const first = playMove(createGame({ size: 5 }), { x: 0, y: 0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.size).toBe(5);
    expect(first.state.past[0].size).toBe(5);
    const passed = passTurn(first.state);
    expect(passed.size).toBe(5);
    expect(passed.past[1].size).toBe(5);
    expect(undoRound(passed).size).toBe(5);
  });

  it("lists legal points within the current board", () => {
    const moves = legalMoves(createGame({ size: 5 }));
    expect(moves).toHaveLength(25);
    expect(moves.every(({ x, y }) => x < 5 && y < 5)).toBe(true);
  });

  it("alternates turns and rejects occupied points", () => {
    const first = playMove(createGame(), { x: 3, y: 3 });

    expect(first.ok && first.state.toPlay).toBe("white");
    expect(
      playMove(first.ok ? first.state : createGame(), { x: 3, y: 3 }),
    ).toMatchObject({ ok: false, reason: "occupied" });
  });

  it("captures a group with no liberties", () => {
    const game = createGame({
      stones: [
        ["black", 1, 0],
        ["black", 0, 1],
        ["black", 2, 1],
        ["white", 1, 1],
      ],
      toPlay: "black",
    });

    const result = playMove(game, { x: 1, y: 2 });

    expect(result.ok && result.state.board[1][1]).toBe(null);
    expect(result.ok && result.state.captures.black).toBe(1);
  });

  it("rejects a move that has no liberties and captures nothing", () => {
    const game = createGame({
      stones: [
        ["white", 1, 0],
        ["white", 0, 1],
        ["white", 2, 1],
        ["white", 1, 2],
      ],
      toPlay: "black",
    });

    expect(playMove(game, { x: 1, y: 1 })).toMatchObject({
      ok: false,
      reason: "suicide",
    });
  });

  it("allows a surrounded move when it captures neighboring stones", () => {
    const game = createGame({
      stones: [
        ["white", 1, 0],
        ["white", 0, 1],
        ["white", 2, 1],
        ["white", 1, 2],
        ["black", 0, 0],
        ["black", 2, 0],
        ["black", 0, 2],
        ["black", 2, 2],
        ["black", 3, 1],
        ["black", 1, 3],
      ],
      toPlay: "black",
    });

    const result = playMove(game, { x: 1, y: 1 });

    expect(result.ok).toBe(true);
    expect(result.ok && result.state.captures.black).toBe(4);
  });

  it("rejects an immediate simple-ko recapture", () => {
    const beforeCapture = createGame({
      stones: [
        ["white", 2, 1],
        ["white", 1, 2],
        ["white", 3, 2],
        ["white", 2, 3],
        ["black", 1, 1],
        ["black", 2, 0],
        ["black", 3, 1],
      ],
      toPlay: "black",
    });
    const capture = playMove(beforeCapture, { x: 2, y: 2 });

    expect(capture.ok).toBe(true);
    expect(
      capture.ok && playMove(capture.state, { x: 2, y: 1 }),
    ).toMatchObject({ ok: false, reason: "ko" });
  });

  it("rejects a move that recreates any earlier board position", () => {
    const previous = createGame({
      size: 5,
      stones: [["black", 0, 0]],
      toPlay: "white",
    });
    const current = createGame({ size: 5 });
    current.history.push(hashBoard(previous.board));
    current.history.push(
      hashBoard(createGame({ size: 5, stones: [["white", 4, 4]] }).board),
    );
    current.history.push(hashBoard(current.board));

    expect(current.history).toHaveLength(4);
    expect(current.history.slice(0, -2)).toContain(hashBoard(previous.board));
    expect(current.history.at(-1)).toBe(hashBoard(current.board));

    expect(playMove(current, { x: 0, y: 0 })).toMatchObject({
      ok: false,
      reason: "ko",
    });
  });

  it("allows a pass even though the board position is unchanged", () => {
    const passed = passTurn(createGame({ size: 5 }));
    expect(passed.consecutivePasses).toBe(1);
    expect(passed.history).toHaveLength(2);
  });

  it("ends after two passes and restores a player/AI round", () => {
    const once = passTurn(createGame());
    const twice = passTurn(once);
    expect(twice.consecutivePasses).toBe(2);
    expect(playMove(twice, { x: 3, y: 3 })).toMatchObject({
      ok: false,
      reason: "finished",
    });

    const black = playMove(createGame(), { x: 3, y: 3 });
    const white = black.ok ? playMove(black.state, { x: 15, y: 15 }) : black;
    expect(white.ok && undoRound(white.state).moves).toEqual([]);
  });

  it("lists only legal empty points", () => {
    const game = createGame({ stones: [["black", 3, 3]], toPlay: "white" });
    const moves = legalMoves(game);

    expect(moves).not.toContainEqual({ x: 3, y: 3 });
    expect(moves).toContainEqual({ x: 4, y: 4 });
  });

  it("undoes only the pending human move while preserving the preceding completed round", () => {
    const first = playMove(createGame({ size: 9 }), { x: 2, y: 2 });
    if (!first.ok) throw new Error("First black move must be legal");
    const reply = playMove(first.state, { x: 6, y: 6 });
    if (!reply.ok) throw new Error("White reply must be legal");
    const pending = playMove(reply.state, { x: 3, y: 2 });
    if (!pending.ok) throw new Error("Pending black move must be legal");

    expect(undoRound(pending.state)).toEqual(reply.state);
    expect(undoRound(pending.state).toPlay).toBe("black");
    expect(undoRound(undoRound(pending.state))).toEqual(createGame({ size: 9 }));
  });

  it("restores captured stones and the real history when undoing a pending capture", () => {
    const initial = createGame({ size: 5, stones: [
      ["white", 1, 1], ["black", 0, 1], ["black", 1, 0], ["black", 2, 1],
    ] });
    const first = playMove(initial, { x: 4, y: 4 });
    if (!first.ok) throw new Error("First black move must be legal");
    const reply = passTurn(first.state);
    const captured = playMove(reply, { x: 1, y: 2 });
    if (!captured.ok) throw new Error("Capture must be legal");
    expect(captured.state.captures.black).toBe(1);

    const restored = undoRound(captured.state);
    expect(restored).toEqual(reply);
    expect(restored.board[1][1]).toBe("white");
    expect(restored.captures.black).toBe(0);
    expect(playMove(restored, { x: 1, y: 2 })).toEqual(captured);
  });
});
