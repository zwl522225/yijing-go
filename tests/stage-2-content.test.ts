import { describe, expect, it } from "vitest";
import { createPosition } from "@/lib/learning/positions";
import { applyLessonAction } from "@/lib/learning/evaluate";
import { validateLearningCatalog } from "@/lib/learning/validate";
import { STAGE_1_UNITS } from "@/lib/learning/stage-1";
import { STAGE_1_TERMS } from "@/lib/learning/glossary/stage-1";
import { STAGE_2_UNITS, STAGE_2_SHAPES } from "@/lib/learning/stage-2";
import { STAGE_2_TERMS } from "@/lib/learning/glossary/stage-2";
import { hashBoard, passTurn, playMove } from "@/lib/go/rules";

const ids = ["s2-connect-cut", "s2-ladder", "s2-net", "s2-snapback", "s2-real-false-eyes", "s2-two-eyes", "s2-dead-seki", "s2-checkpoint"];
const termIds = ["cut", "ladder", "net", "snapback", "eye", "true-eye", "false-eye", "alive", "dead", "seki"];
const lesson = (id: string) => {
  const unit = STAGE_2_UNITS.find((item) => item.id === id);
  if (!unit || unit.kind !== "lesson") throw new Error(`Missing lesson ${id}`);
  return unit;
};
const exercise = (lessonId: string, exerciseId: string) => {
  const item = lesson(lessonId).exercises.find((candidate) => candidate.id === exerciseId);
  if (!item) throw new Error(`Missing exercise ${exerciseId}`);
  return item;
};
const play = (state: ReturnType<typeof createPosition>, x: number, y: number) => {
  const result = playMove(state, { x, y });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
};
const liberties = (state: ReturnType<typeof createPosition>, x:number, y:number):number => {
  const color=state.board[y][x];
  if (!color) throw new Error("Expected group stone");
  const seen=new Set<string>();
  const open=new Set<string>();
  const stack=[{x,y}];
  while(stack.length){
    const point=stack.pop()!;
    const key=`${point.x},${point.y}`;
    if(seen.has(key)) continue;
    seen.add(key);
    for(const next of [{x:point.x-1,y:point.y},{x:point.x+1,y:point.y},{x:point.x,y:point.y-1},{x:point.x,y:point.y+1}]){
      if(next.x<0||next.y<0||next.x>=state.size||next.y>=state.size) continue;
      const value=state.board[next.y][next.x];
      if(value===null) open.add(`${next.x},${next.y}`);
      else if(value===color) stack.push(next);
    }
  }
  return open.size;
};

describe("stage 2 catalog", () => {
  it("has ordered seven-line lessons, distinct practice, and a five-question checkpoint", () => {
    expect(STAGE_2_UNITS.map((unit) => unit.id)).toEqual(ids);
    expect(STAGE_2_UNITS.map((unit) => unit.order)).toEqual([1,2,3,4,5,6,7,8]);
    for (const unit of STAGE_2_UNITS) {
      expect(unit.stageId).toBe("stage-2");
      expect(unit.boardSize).toBe(7);
      if (unit.kind === "lesson") {
        expect(unit.demo.length).toBeGreaterThanOrEqual(2);
        expect(unit.demo.some((frame) => /错误|误以为|不是|不能|反例/.test(frame.caption))).toBe(true);
        expect(unit.exercises).toHaveLength(3);
        expect(unit.exercises.map((item) => item.initialHintLevel)).toEqual([2,1,0]);
        expect(new Set(unit.exercises.map((item) => JSON.stringify([item.position, item.expected]))).size).toBe(3);
        expect(unit.exercises.some((item) => item.expected.kind === "move" || item.expected.kind === "select-group")).toBe(true);
      } else if (unit.kind === "quiz") {
        expect(unit.questions).toHaveLength(5);
        expect(unit.passingScore).toBe(80);
        expect(unit.questions.every((item) => item.initialHintLevel === 0)).toBe(true);
        expect(new Set(unit.questions.map((item) => JSON.stringify([item.position, item.expected]))).size).toBe(5);
      }
    }
  });

  it("has ten complete glossary terms and validates with stage one", () => {
    expect(STAGE_2_TERMS.map((term) => term.id)).toEqual(termIds);
    expect(STAGE_2_TERMS.map((term) => term.name)).toEqual(["切断","征子","枷吃","倒扑","眼","真眼","假眼","活棋","死棋","双活"]);
    for (const term of STAGE_2_TERMS) {
      expect(term.aliases.length).toBeGreaterThan(0);
      expect(term.plain.length).toBeGreaterThan(8);
      expect(term.formal.length).toBeGreaterThan(8);
      expect(term.misconception.length).toBeGreaterThan(8);
      expect(term.lessonIds.length).toBeGreaterThan(0);
      expect(term.relatedTermIds.length).toBeGreaterThan(0);
      expect(term.animation.frames.length).toBeGreaterThanOrEqual(2);
    }
    const units = [...STAGE_1_UNITS, ...STAGE_2_UNITS];
    const terms = [...STAGE_1_TERMS, ...STAGE_2_TERMS];
    expect(new Set(units.map((unit) => unit.id)).size).toBe(units.length);
    expect(new Set(terms.map((term) => term.id)).size).toBe(terms.length);
    const all = [...units.flatMap((unit) => unit.kind === "lesson" ? unit.exercises : unit.kind === "quiz" ? unit.questions : []), ...terms.map((term) => term.practice)];
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    for (const item of all) {
      expect(item.hints.map((hint) => hint.level)).toEqual([1,2,3]);
      expect(applyLessonAction(item, item.position, item.expected).completed, item.id).toBe(true);
    }
    expect(validateLearningCatalog(units, terms)).toEqual([]);
  });

  it("replays every glossary animation move into the next displayed frame", () => {
    for(const term of STAGE_2_TERMS){
      const frames=term.animation.frames;
      const first=createPosition({size:7,stones:frames[0].stones,toPlay:frames[0].toPlay,setupMoves:frames[0].setupMoves});
      expect(first.board,term.id).toEqual(createPosition(term.animation.position).board);
      for(let index=0;index<frames.length-1;index++){
        const action=frames[index].move;
        if(action?.kind!=="move") continue;
        const before=createPosition({size:7,stones:frames[index].stones,toPlay:frames[index].toPlay,setupMoves:frames[index].setupMoves});
        const after=play(before,action.point.x,action.point.y);
        const displayed=createPosition({size:7,stones:frames[index+1].stones,toPlay:frames[index+1].toPlay,setupMoves:frames[index+1].setupMoves});
        expect(after.board,`${term.id}/${index}`).toEqual(displayed.board);
      }
    }
  });

  it("connects orthogonally, cuts between groups, and rejects diagonal contact as connection", () => {
    const connect = exercise("s2-connect-cut", "s2-connect-move");
    const after = applyLessonAction(connect, connect.position, connect.expected).nextState;
    expect(after.board[2][2]).toBe("black");
    const cut = exercise("s2-connect-cut", "s2-cut-move");
    const afterCut = applyLessonAction(cut, cut.position, cut.expected).nextState;
    expect(afterCut.board[2][2]).toBe("white");
    expect(exercise("s2-connect-cut", "s2-diagonal-choice").expected).toEqual({kind:"choice",choiceId:"separate"});
  });

  it("replays alternating ladder ataris and shows the helper changes the chase", () => {
    const chase = lesson("s2-ladder").demo;
    expect(chase.length).toBeGreaterThanOrEqual(5);
    const moves = chase.slice(0,4).map((frame) => frame.move);
    expect(moves.every((move) => move?.kind === "move")).toBe(true);
    let state = createPosition({size:7,stones:chase[0].stones,toPlay:chase[0].toPlay});
    for (const [index, action] of moves.entries()) {
      if (action?.kind !== "move") throw new Error("Expected ladder move");
      state = play(state, action.point.x, action.point.y);
      expect(state.board).toEqual(createPosition({size:7,stones:chase[index+1].stones,toPlay:chase[index+1].toPlay,setupMoves:chase[index+1].setupMoves}).board);
      if(index%2===0) expect(liberties(state,2,2)).toBe(1);
    }
    const helper = createPosition(exercise("s2-ladder", "s2-ladder-helper").position);
    expect(helper.board[5][2]).toBe("white");
    const helped = play(helper, 2, 4);
    expect(helped.board[4][2]).toBe("white");
    const pursuit = play(helped, 3, 4);
    expect(liberties(pursuit,2,2)).toBeGreaterThan(1);
    expect(playMove(pursuit,{x:2,y:6}).ok).toBe(true);
  });

  it("nets without immediate atari but captures either local escape", () => {
    const state = createPosition(STAGE_2_SHAPES.net);
    const after = play(state, 4, 4);
    expect(after.board[3][3]).toBe("white");
    expect(after.captures.black).toBe(0);
    expect(play(play(after,4,3),3,4).board[3][3]).toBeNull();
    expect(play(play(after,3,4),4,3).board[3][3]).toBeNull();
  });

  it("shows a real failed net escape after the successful loose net", () => {
    const demo=lesson("s2-net").demo;
    expect(demo.length).toBeGreaterThanOrEqual(4);
    const displayed=(index:number)=>createPosition({size:7,stones:demo[index].stones,toPlay:demo[index].toPlay,setupMoves:demo[index].setupMoves});
    const netBoard=displayed(1);
    const escapeBoard=displayed(2);
    const capturedBoard=displayed(3);
    expect(hashBoard(netBoard.board)).not.toBe(hashBoard(escapeBoard.board));
    expect(demo[1].move).toEqual({kind:"move",point:{x:4,y:3}});
    expect(play(netBoard,4,3).board).toEqual(escapeBoard.board);
    expect(demo[2].move).toEqual({kind:"move",point:{x:3,y:4}});
    expect(play(escapeBoard,3,4).board).toEqual(capturedBoard.board);
    expect(capturedBoard.captures.black).toBe(2);
    expect(capturedBoard.board[3][3]).toBeNull();
    expect(demo[2].caption).toMatch(/反例|错误/);
  });

  it("replays sacrifice, capture, and three-stone snapback through move history", () => {
    const state = createPosition(STAGE_2_SHAPES.snapback);
    const sacrifice = play(state,0,2);
    expect(sacrifice.captures.black).toBe(0);
    const capture = play(sacrifice,0,1);
    expect(capture.board[2][0]).toBeNull();
    expect(capture.captures.white).toBe(1);
    const recapture = play(capture,0,2);
    expect(recapture.captures.black).toBe(3);
    expect(recapture.board[1][0]).toBeNull();
    const displayed = createPosition(exercise("s2-snapback", "s2-snapback-recapture").position);
    expect(displayed.board).toEqual(capture.board);
    expect(displayed.moves.slice(-2)).toEqual([{x:0,y:2},{x:0,y:1}]);
  });

  it("shows a distinct wrong snapback order in which white escapes", () => {
    const demo=lesson("s2-snapback").demo;
    expect(demo.length).toBeGreaterThanOrEqual(7);
    const displayed=(index:number)=>createPosition({size:7,stones:demo[index].stones,toPlay:demo[index].toPlay,setupMoves:demo[index].setupMoves});
    const correct=displayed(3);
    const wrongStart=displayed(4);
    const wrongBlack=displayed(5);
    const wrongWhite=displayed(6);
    expect(hashBoard(correct.board)).not.toBe(hashBoard(wrongWhite.board));
    expect(wrongStart.board).toEqual(createPosition(STAGE_2_SHAPES.snapback).board);
    expect(demo[4].move).toEqual({kind:"move",point:{x:0,y:1}});
    expect(play(wrongStart,0,1).board).toEqual(wrongBlack.board);
    expect(demo[5].move).toEqual({kind:"move",point:{x:0,y:2}});
    expect(play(wrongBlack,0,2).board).toEqual(wrongWhite.board);
    expect(wrongWhite.board[2][0]).toBe("white");
    expect(wrongWhite.board[2][1]).toBe("white");
    expect(liberties(wrongWhite,1,1)).toBeGreaterThan(1);
    expect(wrongWhite.captures.black).toBe(0);
    expect(demo[4].caption).toMatch(/反例|错误/);
  });

  it("contrasts eyes and two eyes with rule-checked occupied liberties", () => {
    expect(STAGE_2_SHAPES.trueEye.stones.some((stone) => stone[0] === "white" && stone[1] === 2 && stone[2] === 2)).toBe(false);
    expect(STAGE_2_SHAPES.falseEye.stones.some((stone) => stone[0] === "white" && stone[1] === 2 && stone[2] === 2)).toBe(true);
    const alive = createPosition({...STAGE_2_SHAPES.twoEyes,toPlay:"white"});
    expect(playMove(alive,{x:2,y:2})).toMatchObject({ok:false,reason:"suicide"});
    expect(playMove(alive,{x:4,y:2})).toMatchObject({ok:false,reason:"suicide"});
  });

  it("distinguishes a capturable dead group from mutual life", () => {
    const dead = createPosition(STAGE_2_SHAPES.dead);
    expect(play(dead,2,3).board[2][2]).toBeNull();
    expect(playMove(createPosition({...STAGE_2_SHAPES.dead,toPlay:"white"}),{x:2,y:3})).toMatchObject({ok:false,reason:"suicide"});
    const seki = createPosition(STAGE_2_SHAPES.seki);
    expect(seki.board[0][0]).toBe("black");
    expect(seki.board[0][2]).toBe("white");
    const blackFills = play(seki,1,0);
    expect(play(blackFills,1,1).board[0][0]).toBeNull();
    const whiteStarts = createPosition({...STAGE_2_SHAPES.seki,toPlay:"white"});
    const whiteFills = play(whiteStarts,1,0);
    expect(play(whiteFills,1,1).board[0][2]).toBeNull();
    expect(lesson("s2-dead-seki").exercises.find((item) => item.id === "s2-seki-select")?.expected).toEqual({kind:"select-group",point:{x:0,y:0}});
  });

  it("keeps both groups at two shared liberties, backed by a living outside wall", () => {
    const state=createPosition(STAGE_2_SHAPES.seki);
    expect(liberties(state,0,0)).toBe(2);
    expect(liberties(state,2,0)).toBe(2);
    expect(playMove(state,{x:1,y:2})).toMatchObject({ok:false,reason:"occupied"});
    const blackOutside=createPosition({...STAGE_2_SHAPES.seki,toPlay:"black"});
    for(const eye of [{x:1,y:5},{x:3,y:5}]){
      expect(playMove(blackOutside,eye)).toMatchObject({ok:false,reason:"suicide"});
    }
  });

  it("punishes either side for filling either shared liberty, even after one preparatory move", () => {
    const shared=[{x:1,y:0},{x:1,y:1}];
    for(const color of ["black","white"] as const){
      const initial=createPosition({...STAGE_2_SHAPES.seki,toPlay:color});
      const preparations=[null,...Array.from({length:49},(_,index)=>({x:index%7,y:Math.floor(index/7)}))
        .filter((point)=>!shared.some((liberty)=>liberty.x===point.x&&liberty.y===point.y))
        .filter((point)=>playMove(initial,point).ok)];
      for(const preparation of preparations){
        const prepared=preparation===null?initial:play(initial,preparation.x,preparation.y);
        const turn=preparation===null?prepared:passTurn(prepared);
        for(const first of shared){
          const last=shared.find((point)=>point.y!==first.y)!;
          const filled=play(turn,first.x,first.y);
          const answer=play(filled,last.x,last.y);
          const target=color==="black"?{x:0,y:0}:{x:2,y:0};
          expect(answer.board[target.y][target.x],`${color} prepared ${JSON.stringify(preparation)} then filled ${JSON.stringify(first)}`).toBeNull();
        }
      }
    }
  });
});
