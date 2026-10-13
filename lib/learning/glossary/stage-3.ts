import type { GlossaryEntry, LessonUnitId, PositionSpec } from "@/lib/learning/types";
import { STAGE_3_SHAPES, STAGE_3_UNITS } from "@/lib/learning/stage-3";
import type { DemoFrame } from "@/lib/learning/types";

const frame = (position: PositionSpec, caption: string, move?: DemoFrame["move"]): DemoFrame => ({
  stones: position.stones, toPlay: position.toPlay,
  ...(position.setupMoves ? { setupMoves: position.setupMoves } : {}), caption,
  ...(move ? { move } : {}),
});
const lessonExercise = (lessonId: LessonUnitId, index: number, id: string) => {
  const lesson = STAGE_3_UNITS.find((unit) => unit.id === lessonId);
  if (!lesson || lesson.kind !== "lesson") throw new Error(`Missing glossary lesson ${lessonId}`);
  return { ...lesson.exercises[index], id, initialHintLevel: 0 as const };
};
type Entry = Omit<GlossaryEntry, "practice" | "animation"> & {
  lessonId: LessonUnitId;
  practiceIndex: number;
  animation: GlossaryEntry["animation"];
};
const entry = (input: Entry): GlossaryEntry => ({
  id: input.id, name: input.name, aliases: input.aliases, plain: input.plain,
  formal: input.formal, misconception: input.misconception,
  animation: input.animation, lessonIds: input.lessonIds,
  relatedTermIds: input.relatedTermIds,
  practice: lessonExercise(input.lessonId, input.practiceIndex, `g3-${input.id}-practice`),
});
const animation = (position: PositionSpec, frames: DemoFrame[]): GlossaryEntry["animation"] => ({ position, frames });

export const STAGE_3_TERMS: GlossaryEntry[] = [
  entry({ id: "territory", name: "地", aliases: ["空地"],
    plain: "终局时，被自己活棋围住的空交叉点可以成为自己的地。",
    formal: "移除双方确认的死子后，只与一方棋子相邻的连通空点区域，计入该方围住的空点。",
    misconception: "一圈棋子附近所有看起来像自己的空点都算地；有缺口或与双方接触的空点不能这样算。",
    animation: animation(STAGE_3_SHAPES.boundaryGap, [
      frame(STAGE_3_SHAPES.boundaryGap, "缺口使（5，5）连到外侧，尚不是黑地。", { kind: "move", point: { x: 4, y: 5 } }),
      frame(STAGE_3_SHAPES.boundaryClosed, "补后（5，5）成为黑棋围住的一点。"),
    ]), lessonId: "s3-territory-boundary", practiceIndex: 1,
    lessonIds: ["s3-corner-side-center", "s3-territory-boundary", "s3-chinese-area-komi"], relatedTermIds: ["enclosure", "scoring"],
  }),
  entry({ id: "enclosure", name: "围地", aliases: ["围空"],
    plain: "让自己的棋与棋盘边组成完整边界，把空点围在里面。",
    formal: "通过落子控制空点区域的边界，使其在终局清除死子后只邻接己方活棋。",
    misconception: "摆出弯曲的棋形就已经围住地；边界的缺口仍会让空区与外侧相通。",
    animation: animation(STAGE_3_SHAPES.boundaryGap, [
      frame(STAGE_3_SHAPES.boundaryGap, "黑棋边界缺少（5，6）。", { kind: "move", point: { x: 4, y: 5 } }),
      frame(STAGE_3_SHAPES.boundaryClosed, "黑棋补上缺口，围住（5，5）。"),
    ]), lessonId: "s3-territory-boundary", practiceIndex: 0,
    lessonIds: ["s3-corner-side-center", "s3-territory-boundary"], relatedTermIds: ["territory", "scoring"],
  }),
  entry({ id: "invasion", name: "侵入", aliases: ["打入"],
    plain: "进入对手松散的大框里，争取在里面获得活动空间。",
    formal: "在对方尚未实封的势力范围内部落子，试图分割、安定或争取局部空点；可行性取决于双方棋力与逃路。",
    misconception: "只要对方框大，越深入越好；靠厚墙又缺接应时，侵入可能反而让己方变弱。",
    animation: animation(STAGE_3_SHAPES.looseFramework, [
      frame(STAGE_3_SHAPES.looseFramework, "白框松散，黑棋从（7，5）进入。", { kind: "move", point: { x: 6, y: 4 } }),
      frame(STAGE_3_SHAPES.invasionPlaced, "白棋从（8，5）压迫。", { kind: "move", point: { x: 7, y: 4 } }),
      frame(STAGE_3_SHAPES.invasionPressed, "黑棋向（6，5）延出，保留朝同伴靠拢的路线。", { kind: "move", point: { x: 5, y: 4 } }),
      frame(STAGE_3_SHAPES.invasionExtended, "侵入仍未完全安定，须继续读。"),
    ]), lessonId: "s3-invasion-reduction", practiceIndex: 0,
    lessonIds: ["s3-invasion-reduction"], relatedTermIds: ["reduction", "weak-group"],
  }),
  entry({ id: "reduction", name: "浅消", aliases: ["消空"],
    plain: "从对方大框外侧压低它可能围出的空，不急着钻到深处。",
    formal: "在对方模样外围落子，削减其潜在围地规模，并尽量保留己方棋的联络与退路。",
    misconception: "浅消和侵入只是两个名字；浅消着眼外侧压低，侵入走进框内，风险与目的不同。",
    animation: animation(STAGE_3_SHAPES.strongFramework, [
      frame(STAGE_3_SHAPES.strongFramework, "白棋左侧厚墙向右张开模样，黑棋从右侧（7，5）浅消。", { kind: "move", point: { x: 6, y: 4 } }),
      frame(STAGE_3_SHAPES.reductionPlaced, "黑棋压低白框外沿，并与（8，5）的同伴直邻相连。"),
    ]), lessonId: "s3-invasion-reduction", practiceIndex: 1,
    lessonIds: ["s3-invasion-reduction"], relatedTermIds: ["invasion", "weak-group"],
  }),
  entry({ id: "weak-group", name: "弱棋", aliases: ["薄棋"],
    plain: "气少或缺乏眼与接应、容易受到攻击的一组棋。",
    formal: "在当前局面中生存或联络尚无保障、对手可通过打吃等手段持续施压的棋块；其强弱须结合全局判断。",
    misconception: "棋子少就一定是弱棋；这颗黑子弱，是因为它眼前只剩一口气。",
    animation: animation(STAGE_3_SHAPES.weakGroup, [
      frame(STAGE_3_SHAPES.weakGroup, "中央黑子仅剩（5，6）一口气。", { kind: "move", point: { x: 4, y: 5 } }),
      frame(STAGE_3_SHAPES.weakEscaped, "出头后棋块增加气，但仍需看后续。"),
    ]), lessonId: "s3-weak-groups", practiceIndex: 0,
    lessonIds: ["s3-weak-groups", "s3-invasion-reduction"], relatedTermIds: ["liberty", "invasion"],
  }),
  entry({ id: "sente", name: "先手", aliases: ["先手权"],
    plain: "一手形成重要威胁，对方若想保住局部利益，通常需要先回应。",
    formal: "在具体攻防中，落子形成足够大的后续威胁，使对方选择局部应手，而己方有机会继续掌握下一处落点。",
    misconception: "对方每次实际应了就是绝对先手；威胁是否值得应，要随局面和棋值判断。",
    animation: animation(STAGE_3_SHAPES.endgameBoundary, [
      frame(STAGE_3_SHAPES.endgameBoundary, "边界上黑棋下（5，6）增加一目并打吃白子。", { kind: "move", point: { x: 4, y: 5 } }),
      frame(STAGE_3_SHAPES.senteThreat, "白棋若要保子，须下（6，5）连回白墙。", { kind: "move", point: { x: 5, y: 4 } }),
      frame(STAGE_3_SHAPES.senteAnswer, "白棋应手后，黑棋仍保有刚占的一目。"),
    ]), lessonId: "s3-sente-gote-endgame", practiceIndex: 0,
    lessonIds: ["s3-sente-gote-endgame"], relatedTermIds: ["gote", "endgame"],
  }),
  entry({ id: "gote", name: "后手", aliases: ["失先"],
    plain: "这一手没有迫使对方在局部应，自己可能要等对方先转向别处。",
    formal: "在局部交换或收官中，对方能够脱先选择别处较大之处，己方因当前行动而失去先行选择下一处的机会。",
    misconception: "一手没有提子就一定后手；要看它有没有让对方必须处理的后续威胁。",
    animation: animation(STAGE_3_SHAPES.endgameBoundary, [
      frame(STAGE_3_SHAPES.endgameBoundary, "黑棋在上边线（5，1）占一目，没有打吃（5，5）的白子。", { kind: "move", point: { x: 4, y: 0 } }),
      frame(STAGE_3_SHAPES.goteAfterBlack, "白棋可下（6，5）自行连回，不需回应上边落点。", { kind: "move", point: { x: 5, y: 4 } }),
      frame(STAGE_3_SHAPES.goteElsewhere, "白棋连回厚墙；两处各占一目，但应手压力不同。"),
    ]), lessonId: "s3-sente-gote-endgame", practiceIndex: 2,
    lessonIds: ["s3-sente-gote-endgame"], relatedTermIds: ["sente", "endgame"],
  }),
  entry({ id: "endgame", name: "收官", aliases: ["官子"],
    plain: "双方大块基本安定后，继续争取棋盘上剩余空点和边界。",
    formal: "对局后期围绕剩余边界与局部得失的落子过程；比较各处价值时也要考虑先手与后手。",
    misconception: "收官只是填满所有空点；公空、双方停手和死子确认都要按规则处理。",
    animation: animation(STAGE_3_SHAPES.endgameBoundary, [
      frame(STAGE_3_SHAPES.endgameBoundary, "两侧边界成形，黑棋比较（5，6）和（5，1）两处一目。", { kind: "move", point: { x: 4, y: 5 } }),
      frame(STAGE_3_SHAPES.senteThreat, "黑棋占（5，6）同时打吃白子，白棋若保子就要应。"),
    ]), lessonId: "s3-sente-gote-endgame", practiceIndex: 0,
    lessonIds: ["s3-sente-gote-endgame", "s3-pass-dead-stones"], relatedTermIds: ["sente", "gote"],
  }),
  entry({ id: "komi", name: "贴目", aliases: ["贴子"],
    plain: "因黑棋先下，计分时给白棋加上固定的 7.5 目。",
    formal: "本课程的中国规则计分给白方加 7.5 目贴目；白方总分等于活子数加围住空点数再加贴目。",
    misconception: "贴目是给黑棋，或每次提子都再加贴目；本课程贴目只在终局给白棋加一次。",
    animation: animation(STAGE_3_SHAPES.scoring, [
      frame(STAGE_3_SHAPES.scoring, "黑白各有三十六目面积。"),
      frame(STAGE_3_SHAPES.scoring, "白棋加 7.5 目贴目，总分 43.5，胜黑棋。"),
    ]), lessonId: "s3-chinese-area-komi", practiceIndex: 1,
    lessonIds: ["s3-chinese-area-komi", "s3-graduation"], relatedTermIds: ["scoring", "chinese-rules"],
  }),
  entry({ id: "scoring", name: "数目", aliases: ["计分", "数子"],
    plain: "确认死子后，分别数活子和围住的空点，再给白棋加贴目。",
    formal: "中国规则面积计分：先移除确认的死子，双方分别以棋盘上的活子数加其围住空点数为面积；白棋另加 7.5 目贴目，比较总分。",
    misconception: "把提掉的棋子数量再加一次；中国规则的面积计分不把提子数量单独加分。",
    animation: animation(STAGE_3_SHAPES.scoring, [
      frame(STAGE_3_SHAPES.scoring, "黑白各九颗活子、二十七个围住空点，面积各三十六。"),
      frame(STAGE_3_SHAPES.scoring, "中间九个公空不计；白棋加贴目后为 43.5。"),
    ]), lessonId: "s3-chinese-area-komi", practiceIndex: 2,
    lessonIds: ["s3-chinese-area-komi", "s3-graduation"], relatedTermIds: ["territory", "komi"],
  }),
];
