import { describe, expect, it } from "vitest";
import { analyzeGroups, groupAt } from "@/lib/go/analysis";
import { createGame } from "@/lib/go/rules";

describe("connected group analysis", () => {
  it("counts shared liberties once for the entire connected group", () => {
    const {board} = createGame({size:5,stones:[["black",1,1],["black",2,1],["black",1,2],["white",3,1]]});
    const group = groupAt(board,5,{x:2,y:1})!;
    expect(group.stones).toEqual([{x:1,y:1},{x:2,y:1},{x:1,y:2}]);
    expect(group.liberties).toEqual([{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:0,y:2},{x:2,y:2},{x:1,y:3}]);
    expect(analyzeGroups(board,5)).toHaveLength(2);
  });
  it("counts corner and edge liberties without diagonal connections", () => {
    const {board} = createGame({size:5,stones:[["black",0,0],["black",1,1],["white",4,2]]});
    expect(groupAt(board,5,{x:0,y:0})!.liberties).toHaveLength(2);
    expect(groupAt(board,5,{x:4,y:2})!.liberties).toHaveLength(3);
    expect(analyzeGroups(board,5)).toHaveLength(3);
  });
  it("finds atari and returns null for empty, invalid and out-of-board points", () => {
    const {board} = createGame({size:5,stones:[["black",0,0],["white",1,0]]});
    expect(groupAt(board,5,{x:0,y:0})!.liberties).toEqual([{x:0,y:1}]);
    for(const point of [{x:2,y:2},{x:-1,y:0},{x:5,y:0},{x:0.5,y:0}]) expect(groupAt(board,5,point)).toBeNull();
    expect(analyzeGroups(createGame({size:5}).board,5)).toEqual([]);
  });
});
