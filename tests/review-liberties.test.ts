import { describe, expect, it } from "vitest";
import { inspectReviewGroup } from "@/lib/go/review-liberties";
import { createGame, passTurn, playMove } from "@/lib/go/rules";
import { BOARD_SIZES } from "@/lib/go/types";
import type { Board, BoardSize, Point } from "@/lib/go/types";

const points = (...entries: Point[]) => entries;

function inspected(board: Board, point: Point, size: BoardSize = 5) {
  return inspectReviewGroup({ board, size }, point);
}

describe("read-only review liberty facts", () => {
  it("reports the actual connected group and unique liberties in stable order", () => {
    const state = createGame({ size: 5, stones: [
      ["black", 1, 1], ["black", 2, 1], ["black", 1, 2], ["white", 3, 1],
    ] });
    const result = inspectReviewGroup(state, { x: 2, y: 1 });
    expect(result).toMatchObject({ kind: "group", point: { x: 2, y: 1 }, color: "black" });
    if (result.kind !== "group") throw new Error("Expected group facts");
    expect(result.stones).toEqual(points({ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }));
    expect(result.liberties).toEqual(points(
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 },
      { x: 0, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 3 },
    ));
    expect(result.description).toContain("6口气");
    expect(result.description).toContain("同一空点");
    expect(result.description).toContain("斜角不直接连接");
  });

  it("counts corner liberties and does not connect diagonal stones", () => {
    const state = createGame({ size: 5, stones: [["black", 0, 0], ["black", 1, 1]] });
    const corner = inspectReviewGroup(state, { x: 0, y: 0 });
    const diagonal = inspectReviewGroup(state, { x: 1, y: 1 });
    expect(corner.kind === "group" && corner.liberties).toEqual(points({ x: 1, y: 0 }, { x: 0, y: 1 }));
    expect(diagonal.kind === "group" && diagonal.stones).toEqual([{ x: 1, y: 1 }]);
  });

  it("counts a shared empty point once in one group and reports it for both colors", () => {
    const state = createGame({ size: 5, stones: [
      ["black", 1, 1], ["black", 2, 1], ["black", 1, 2], ["white", 3, 2],
    ] });
    const black = inspectReviewGroup(state, { x: 2, y: 1 });
    const white = inspectReviewGroup(state, { x: 3, y: 2 });
    expect(black.kind).toBe("group");
    expect(white.kind).toBe("group");
    if (black.kind === "group") {
      expect(black.color).toBe("black");
      expect(black.liberties.filter(point => point.x === 2 && point.y === 2)).toHaveLength(1);
    }
    if (white.kind === "group") {
      expect(white.color).toBe("white");
      expect(white.liberties).toContainEqual({ x: 2, y: 2 });
    }
  });

  it("explains an empty point without presenting it as a zero-liberty group", () => {
    const empty = inspectReviewGroup(createGame({ size: 5 }), { x: 2, y: 2 });
    expect(empty).toMatchObject({ kind: "empty", point: { x: 2, y: 2 }, description: expect.stringContaining("这是空点，请点一颗棋子") });
  });

  it("labels one liberty as atari and avoids claiming capture is guaranteed", () => {
    const result = inspected(createGame({ size: 5, stones: [["black", 0, 0], ["white", 1, 0]] }).board, { x: 0, y: 0 });
    expect(result.kind).toBe("group");
    if (result.kind === "group") {
      expect(result.liberties).toEqual([{ x: 0, y: 1 }]);
      expect(result.description).toContain("仅剩一口气（打吃）");
      expect(result.description).toContain("尚未被提净");
      expect(result.description).toContain("不保证下一手可以提子");
    }
  });

  it("returns unavailable for a group with no liberties instead of inventing a zero-liberty fact", () => {
    const result = inspected(createGame({ size: 5, stones: [
      ["black", 0, 0], ["white", 1, 0], ["white", 0, 1],
    ] }).board, { x: 0, y: 0 });
    expect(result).toEqual({ kind: "unavailable", description: "查气暂不可用" });
  });

  it("rejects unsupported sizes, malformed boards and invalid coordinates", () => {
    const good = createGame({ size: 5 });
    const sparse = good.board.map(row => [...row]);
    delete sparse[2][2];
    const badColor = good.board.map(row => [...row]);
    badColor[2][2] = "gold" as unknown as null;
    const cases: [unknown, unknown][] = [
      [{ size: 6, board: good.board }, { x: 0, y: 0 }],
      [{ size: 5, board: good.board.slice(0, 4) }, { x: 0, y: 0 }],
      [{ size: 5, board: sparse }, { x: 0, y: 0 }],
      [{ size: 5, board: [["gold"]] }, { x: 0, y: 0 }],
      [{ size: 5, board: badColor }, { x: 2, y: 2 }],
      [good, { x: 0.5, y: 0 }],
      [good, { x: -1, y: 0 }],
      [good, { x: 5, y: 0 }],
      [good, null],
      [null, { x: 0, y: 0 }],
    ];
    for (const [state, point] of cases) {
      expect(inspectReviewGroup(state as never, point as never)).toEqual({ kind: "unavailable", description: "查气暂不可用" });
    }
  });

  it.each(BOARD_SIZES)("accepts a complete %i-line board", size => {
    const result = inspectReviewGroup(createGame({ size }), { x: size - 1, y: size - 1 });
    expect(result.kind).toBe("empty");
  });

  it("does not mutate frozen inputs and copies the selected point and returned group points", () => {
    const state = createGame({ size: 5, stones: [["black", 1, 1], ["black", 2, 1]] });
    const board = Object.freeze(state.board.map(row => Object.freeze([...row]))) as unknown as Board;
    const point = Object.freeze({ x: 1, y: 1 });
    const before = structuredClone(board);
    const result = inspectReviewGroup({ board, size: 5 }, point);
    expect(board).toEqual(before);
    expect(result.kind).toBe("group");
    if (result.kind === "group") {
      expect(result.point).not.toBe(point);
      result.point.x = 4;
      result.stones[0].x = 4;
      result.liberties[0].x = 4;
      expect(point).toEqual({ x: 1, y: 1 });
      expect(result.point).toEqual({ x: 4, y: 1 });
    }
  });

  it("keeps a group result point independent from later caller changes", () => {
    const groupPoint = { x: 1, y: 1 };
    const group = inspectReviewGroup(createGame({ size: 5, stones: [["black", 1, 1]] }), groupPoint);
    groupPoint.x = 4;
    expect(group.kind === "group" && group.point).toEqual({ x: 1, y: 1 });
  });

  it("keeps an empty result point independent from later caller changes", () => {
    const emptyPoint = { x: 2, y: 2 };
    const empty = inspectReviewGroup(createGame({ size: 5 }), emptyPoint);
    emptyPoint.x = 4;
    expect(empty.kind === "empty" && empty.point).toEqual({ x: 2, y: 2 });
  });

  it("reports the joined group and unique liberties after a real connecting move", () => {
    const opening = createGame({ size: 5, stones: [["black", 1, 1], ["black", 2, 2]] });
    const connected = playMove(opening, { x: 2, y: 1 });
    expect(connected.ok).toBe(true);
    if (!connected.ok) throw new Error("Expected legal connecting move");

    const result = inspectReviewGroup(connected.state, { x: 2, y: 1 });
    expect(result.kind).toBe("group");
    if (result.kind === "group") {
      expect(result.stones).toEqual(points({ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }));
      expect(result.liberties).toEqual(points(
        { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 3, y: 1 },
        { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 },
      ));
      expect(result.liberties.filter(point => point.x === 1 && point.y === 2)).toHaveLength(1);
    }
  });

  it("reflects liberties after real play and pass transitions, and does not make a ko legality claim", () => {
    const opening = createGame({ size: 5, stones: [["black", 0, 0], ["white", 1, 0], ["white", 0, 2]], toPlay: "white" });
    const before = inspectReviewGroup(opening, { x: 0, y: 0 });
    expect(before.kind === "group" && before.liberties).toEqual([{ x: 0, y: 1 }]);
    const passed = passTurn(opening);
    const afterPass = inspectReviewGroup(passed, { x: 0, y: 0 });
    expect(afterPass.kind === "group" && afterPass.liberties).toEqual([{ x: 0, y: 1 }]);

    const captured = playMove(opening, { x: 0, y: 1 });
    expect(captured.ok).toBe(true);
    if (!captured.ok) throw new Error("Expected legal capture");
    expect(inspectReviewGroup(captured.state, { x: 0, y: 0 }).kind).toBe("empty");
    const survivor = inspectReviewGroup(captured.state, { x: 0, y: 1 });
    expect(survivor.kind).toBe("group");
    if (survivor.kind === "group") {
      expect(survivor.color).toBe("white");
      expect(survivor.stones).toEqual(points({ x: 0, y: 1 }, { x: 0, y: 2 }));
      expect(survivor.liberties).toEqual(points(
        { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 3 },
      ));
    }

    const koSetup = createGame({ size: 5, stones: [
      ["white", 2, 1], ["white", 1, 2], ["white", 3, 2], ["white", 2, 3],
      ["black", 1, 1], ["black", 2, 0], ["black", 3, 1],
    ] });
    const koCapture = playMove(koSetup, { x: 2, y: 2 });
    expect(koCapture.ok).toBe(true);
    if (!koCapture.ok) throw new Error("Expected legal ko capture");
    const koFact = inspectReviewGroup(koCapture.state, { x: 2, y: 2 });
    expect(koFact.kind).toBe("group");
    if (koFact.kind === "group") {
      expect(koFact.liberties).toEqual([{ x: 2, y: 1 }]);
      expect(koFact.description).not.toContain("合法");
    }
    expect(playMove(koCapture.state, { x: 2, y: 1 })).toMatchObject({ ok: false, reason: "ko" });
  });
});
