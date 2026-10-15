import { describe, expect, it } from "vitest";
import { getPracticeTopics, getWrongQuestionPractice } from "@/lib/learning/practice";
import { createDefaultProgress } from "@/lib/learning/progress";
import { CURRICULUM } from "@/lib/learning/curriculum";
import { LESSON_UNIT_IDS } from "@/lib/learning/types";
import { createGame, passTurn, playMove } from "@/lib/go/rules";
import { getReviewFrames, getReviewMoments } from "@/lib/go/review";
import { getCoachTurn } from "@/lib/go/coach";

describe("independent practice catalog", () => {
  it("offers only currently unlocked curriculum exercises", () => {
    const progress = createDefaultProgress();
    const before = structuredClone(progress);
    const topics = getPracticeTopics(progress);
    expect(topics.flatMap(topic => topic.items).map(item => item.unitId)).toEqual(
      expect.arrayContaining(["s1-intersections-turns"]));
    expect(new Set(topics.flatMap(topic => topic.items).map(item => item.unitId))).toEqual(new Set(["s1-intersections-turns"]));
    expect(progress).toEqual(before);
  });
  it("allows only unique known unlocked quiz mistakes", () => {
    const progress = createDefaultProgress();
    progress.completedUnitIds = [...LESSON_UNIT_IDS.slice(0,7)];
    const quizzes = CURRICULUM.filter(unit => unit.kind === "quiz");
    const first = quizzes[0].questions[0].id;
    progress.wrongQuestionIds = [first, first, "unknown", quizzes[1].questions[0].id];
    expect(getWrongQuestionPractice(progress).map(item => item.exercise.id)).toEqual([first]);
    expect(getPracticeTopics(progress).flatMap(topic => topic.items).every(item => item.exercise.position.size === 5)).toBe(true);
  });
});

describe("read only replay and educational moments", () => {
  it("includes the initial board and both pass frames without changing the source", () => {
    const match = passTurn(passTurn(createGame({size:5})));
    const before = structuredClone(match);
    const frames = getReviewFrames(match);
    expect(frames.map(frame => frame.moves.length)).toEqual([0,1,2]);
    expect(frames.map(frame => frame.consecutivePasses)).toEqual([0,1,2]);
    expect(getReviewMoments(match).map(moment => moment.frame)).toEqual([1,2]);
    expect(match).toEqual(before);
  });
  it("explains actual captures with truthful color and links", () => {
    let match = createGame({size:5,stones:[["white",1,1],["black",0,1],["black",1,0],["black",2,1]],toPlay:"black"});
    const result = playMove(match,{x:1,y:2});
    if(!result.ok) throw new Error("capture setup must be legal");
    match = passTurn(result.state);
    const moments = getReviewMoments(match);
    expect(moments).toHaveLength(2);
    expect(moments[0]).toMatchObject({frame:1,color:"black",kind:"capture",termId:"capture",unitId:"s1-atari-capture"});
    expect(moments[0].consequence).toContain("1");
    expect(moments[0].choice).toContain("（2，3）");
    expect(moments[0].direction.length).toBeGreaterThan(0);
  });
  it("distinguishes new enemy atari from a capture by analyzing the actual resulting board",()=>{
    const match=createGame({size:5,stones:[["white",1,1],["black",0,1],["black",1,0]]});
    const move=playMove(match,{x:2,y:1});if(!move.ok)throw new Error("legal atari setup");
    const moments=getReviewMoments(move.state);
    expect(moments).toHaveLength(1);expect(moments[0]).toMatchObject({kind:"atari",color:"black",frame:1,termId:"atari"});
    expect(moments[0].consequence).toBe(getCoachTurn(match,{x:2,y:1},move)?.summary);expect(move.state.captures.black).toBe(0);
  });
  it("selects at most three meaningful actual moments and fewer for short games", () => {
    expect(getReviewMoments(createGame({size:5}))).toEqual([]);
    let match = createGame({size:5});
    for(const point of [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}]) {
      const result = playMove(match,point); if(!result.ok) throw new Error("legal sequence"); match = result.state;
    }
    const moments = getReviewMoments(passTurn(passTurn(match)));
    expect(moments.length).toBeLessThanOrEqual(3);
    expect(moments.some(moment => moment.kind === "end")).toBe(true);
    expect(new Set(moments.map(moment => moment.frame)).size).toBe(moments.length);
  });
});
