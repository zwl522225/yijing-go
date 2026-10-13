import { describe, expect, it } from "vitest";
import { resolveDemoFrame } from "@/lib/learning/demo";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { createPosition } from "@/lib/learning/positions";
import { passTurn, playMove } from "@/lib/go/rules";
import type { DemoFrame, LessonUnit } from "@/lib/learning/types";

const unit = (id: string) => CURRICULUM_BY_ID.get(id as LessonUnit["id"]) as LessonUnit;
describe("demo frame rule state", () => {
  it("shows the legal connecting move and the resulting turn", () => {
    const lesson = unit("s2-connect-cut");
    const result = resolveDemoFrame(lesson.boardSize, lesson.demo[0]);
    expect(result.before.board.flat().filter(stone => stone === "black")).toHaveLength(2);
    expect(result.state.board[2][2]).toBe("black");
    expect(result.state.board.flat().filter(stone => stone === "black")).toHaveLength(3);
    expect(result.state.toPlay).toBe("white");
  });
  it("executes the frame action after its history and preserves actual captures", () => {
    const lesson = unit("s2-snapback");
    const result = resolveDemoFrame(lesson.boardSize, lesson.demo[2]);
    expect(result.before.captures.white).toBe(1);
    expect(result.state.captures).toEqual({black:3,white:1});
    expect(result.state.board[2][0]).toBe("black");
    expect(result.state.board[1][1]).toBeNull();
    expect(result.state.toPlay).toBe("white");
  });
  it("plays a pass from the replayed first pass and reaches the finished state", () => {
    const lesson = unit("s3-pass-dead-stones");
    const frame: DemoFrame = {...lesson.exercises[1].position, caption:"双方连续停手",move:{kind:"pass"}};
    const result = resolveDemoFrame(9,frame);
    expect(result.before.consecutivePasses).toBe(1);
    expect(result.state).toEqual(passTurn(result.before));
    expect(result.state.consecutivePasses).toBe(2);
  });
  it("keeps the before board for a forbidden ko recapture and identifies the attempt", () => {
    const lesson = unit("s1-ko-threat");
    const frame: DemoFrame = {...lesson.demo[1],move:{kind:"move",point:{x:2,y:2}}};
    const result = resolveDemoFrame(5,frame);
    expect(playMove(result.before,{x:2,y:2})).toEqual({ok:false,reason:"ko"});
    expect(result.state).toEqual(result.before);
    expect(result.attemptedPoint).toEqual({x:2,y:2});
    expect(result.rejection).toContain("重复");
    expect(result.rejection).not.toBe("ko");
  });
  it("reports suicide and occupied attempts in Chinese without adding stones", () => {
    const exercise = unit("s1-suicide-exception").exercises[0];
    for(const [point,explanation] of [[{x:2,y:2},"无气"],[{x:2,y:1},"已有棋子"]] as const) {
      const frame:DemoFrame={...exercise.position,caption:"非法尝试",move:{kind:"move",point}};
      const result=resolveDemoFrame(5,frame);
      expect(result.state).toEqual(createPosition(exercise.position));
      expect(result.rejection).toContain(explanation);
    }
  });
  it("indicates a selected group and dead-stone targets while keeping the real board", () => {
    const lesson=unit("s3-pass-dead-stones");
    const exercise=lesson.exercises[2];
    const dead=resolveDemoFrame(9,{...exercise.position,caption:"确认死子目标",move:exercise.expected});
    expect(dead.state).toEqual(createPosition(exercise.position));
    expect(dead.targetPoints).toContainEqual({x:2,y:2});
    expect(dead.actionText).toContain("死子目标");
    const groupFrame:DemoFrame={stones:[["black",1,2],["black",2,2],["black",4,4]],toPlay:"black",caption:"选择同一棋块",move:{kind:"select-group",point:{x:1,y:2}}};
    const group=resolveDemoFrame(5,groupFrame);
    expect(group.targetPoints).toEqual(expect.arrayContaining([{x:1,y:2},{x:2,y:2}]));
    expect(group.targetPoints).toHaveLength(2);
    expect(group.state.moves).toEqual([]);
  });
  it("shows a choice meaning without placing a fictitious move", () => {
    const frame:DemoFrame={stones:[],toPlay:"black",caption:"选择两眼活棋",move:{kind:"choice",choiceId:"alive"}};
    const result=resolveDemoFrame(5,frame,[{id:"alive",label:"两眼活棋"}]);
    expect(result.actionText).toContain("两眼活棋");
    expect(result.state).toEqual(result.before);
    expect(result.targetPoints).toEqual([]);
  });
});
