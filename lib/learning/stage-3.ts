import type { Color, Move, StoneSetup } from "@/lib/go/types";
import type { DemoFrame, Exercise, GraduationUnit, LessonAction, LessonUnit, PositionSpec } from "@/lib/learning/types";

const position = (stones: StoneSetup[], toPlay: Color = "black", setupMoves?: Move[]): PositionSpec => ({
  size: 9, stones, toPlay, ...(setupMoves ? { setupMoves } : {}),
});
const continued = (spec: PositionSpec, ...moves: Move[]): PositionSpec => ({
  ...spec, setupMoves: [...(spec.setupMoves ?? []), ...moves],
});
const move = (x: number, y: number): LessonAction => ({ kind: "move", point: { x, y } });
const choice = (choiceId: string): LessonAction => ({ kind: "choice", choiceId });
const markDead = (x: number, y: number): LessonAction => ({ kind: "mark-dead", point: { x, y } });
const pass: LessonAction = { kind: "pass" };
const frame = (spec: PositionSpec, caption: string, action?: LessonAction): DemoFrame => ({
  stones: spec.stones, toPlay: spec.toPlay, ...(spec.setupMoves ? { setupMoves: spec.setupMoves } : {}),
  caption, ...(action ? { move: action } : {}),
});
type Input = Pick<Exercise, "id" | "prompt" | "position" | "expected" | "choices" | "success"> & {
  hints: [string, string, string]; wrong: string;
};
const exercise = (input: Input, initialHintLevel: 0 | 1 | 2): Exercise => ({
  id: input.id, prompt: input.prompt, position: input.position, expected: input.expected,
  ...(input.choices ? { choices: input.choices } : {}), initialHintLevel,
  hints: input.hints.map((text, index) => ({ level: (index + 1) as 1 | 2 | 3, text })) as Exercise["hints"],
  success: input.success,
  errors: {
    wrong_answer: input.wrong,
    occupied: "这里已有棋子，请选空交叉点。",
    suicide: "这里下棋会让己方无气，且不能提子。",
    ko: "这手会重复历史棋形，请先下别处。",
    out_of_bounds: "请在九路棋盘内操作。",
    finished: "双方已连续停手，棋局进入死子确认。",
  },
});
const lesson = (
  id: LessonUnit["id"], order: number, title: string, objective: string, story: string,
  terms: LessonUnit["terms"], demo: DemoFrame[], inputs: [Input, Input, Input],
): LessonUnit => ({
  kind: "lesson", id, stageId: "stage-3", order, boardSize: 9, title, objective, story,
  terms, demo, exercises: inputs.map((input, index) => exercise(input, (2 - index) as 0 | 1 | 2)),
});

// Both boundary examples use five black stones. The distant white stone keeps
// the unbounded empty region neutral for the actual area scorer.
const corner = position([
  ["black", 2, 0], ["black", 2, 1], ["black", 2, 2], ["black", 0, 2], ["black", 1, 2],
  ["white", 8, 8],
]);
const side = position([
  ["black", 1, 0], ["black", 3, 0], ["black", 1, 1], ["black", 2, 1], ["black", 3, 1],
  ["white", 8, 8],
]);
const center = position([
  ["black", 3, 4], ["black", 4, 3], ["black", 5, 4], ["black", 4, 5],
  ["white", 8, 8],
]);
const boundaryGap = position([["black", 4, 3], ["black", 3, 4], ["black", 5, 4], ["white", 8, 8]]);
const boundaryClosed = continued(boundaryGap, { x: 4, y: 5 });
const weakGroup = position([["black", 4, 4], ["white", 3, 4], ["white", 4, 3], ["white", 5, 4]]);
const weakEscaped = continued(weakGroup, { x: 4, y: 5 });
const weakIgnored = continued(weakGroup, { x: 0, y: 0 }, { x: 4, y: 5 });
const looseFramework = position([["white", 6, 1], ["white", 8, 3], ["white", 7, 7], ["black", 2, 2], ["black", 3, 5]]);
const invasionPlaced = continued(looseFramework, { x: 6, y: 4 });
const invasionPressed = continued(invasionPlaced, { x: 7, y: 4 });
const invasionExtended = continued(invasionPressed, { x: 5, y: 4 });
const strongFramework = position([
  ...[1, 2, 3, 4, 5, 6, 7].map((y): StoneSetup => ["white", 2, y]),
  ...[1, 2, 3, 7].map((y): StoneSetup => ["white", 5, y]),
  ["white", 6, 1], ["white", 6, 7],
  ["black", 7, 4],
]);
const reductionPlaced = continued(strongFramework, { x: 6, y: 4 });
const deepInvasion = continued(strongFramework, { x: 3, y: 4 });
const weakNearFramework = continued(strongFramework, { x: 6, y: 3 }, { x: 6, y: 4 });
const weakConnected = continued(weakNearFramework, { x: 7, y: 3 });
const endgameBoundary = position([
  ...Array.from({ length: 9 }, (_, y): StoneSetup[] => [["black", 3, y], ["white", 6, y]]).flat(),
  ...[0, 1, 2, 3, 5, 6, 7, 8].map((y): StoneSetup => ["white", 5, y]),
  ["white", 4, 4], ["black", 4, 3],
]);
const senteThreat = continued(endgameBoundary, { x: 4, y: 5 });
const senteAnswer = continued(senteThreat, { x: 5, y: 4 });
const goteAfterBlack = continued(endgameBoundary, { x: 4, y: 0 });
const goteElsewhere = continued(goteAfterBlack, { x: 5, y: 4 });
const deadStone = position([
  ["white", 2, 2], ["black", 1, 2], ["black", 2, 1], ["black", 3, 2],
  ["black", 1, 3], ["black", 3, 3], ["black", 2, 4],
]);
const afterBlackPass = continued(deadStone, { pass: true });
const ended = continued(afterBlackPass, { pass: true });
const scoringStones: StoneSetup[] = Array.from({ length: 9 }, (_, y): StoneSetup[] => [
  ["black", 3, y], ["white", 5, y],
]).flat();
const scoring = position(scoringStones, "black", [{ pass: true }, { pass: true }]);

export const STAGE_3_SHAPES = {
  corner, side, center, boundaryGap, boundaryClosed, weakGroup, weakEscaped, weakIgnored,
  looseFramework, invasionPlaced, invasionPressed, invasionExtended,
  strongFramework, reductionPlaced, deepInvasion, weakNearFramework, weakConnected,
  endgameBoundary, senteThreat, senteAnswer,
  goteAfterBlack, goteElsewhere, deadStone, afterBlackPass, ended, scoring,
} as const;

export const STAGE_3_UNITS: (LessonUnit | GraduationUnit)[] = [
  lesson("s3-corner-side-center", 1, "角、边与中央", "比较同样五颗棋围出的确定空点，理解棋盘边界的帮助。",
    "同样五颗黑子，封闭角可围住四个空点，封闭边只围住一个；中央还需更多边界。具体落子仍要看对手。",
    ["enclosure", "territory"], [
      frame(corner, "正确：五颗黑子借两条棋盘边封住角上四个空点。"),
      frame(side, "反例：同样五颗黑子在边上只封住一个空点，不能把外侧空点也算作地。"),
      frame(center, "中央的四颗黑子虽围着一点，不能据此外推整片中央都归黑棋。"),
    ], [
      { id: "s3-corner-count", prompt: "两块棋都用五颗黑子封边：角上四空点与边上一空点，哪块确定空点更多？", position: corner,
        expected: choice("corner"), choices: [{ id: "corner", label: "角上四点" }, { id: "side", label: "边上一点" }],
        hints: ["棋盘边也能构成边界。", "只数完全隔开的空点。", "角上有四点。"], success: "角借两条边，五子围住四个确定空点。", wrong: "请数边界内的空点，不要把开放区域算进去。" },
      { id: "s3-side-count", prompt: "边上这五颗黑子封住多少个空点？", position: side,
        expected: choice("one"), choices: [{ id: "one", label: "一个" }, { id: "four", label: "四个" }],
        hints: ["看（3，1）是否与外侧连通。", "它只被黑子和棋盘边围住。", "这里只封住一个点。"], success: "边上只有（3，1）这一个被封闭的空点。", wrong: "外侧空点还与白棋一侧相通。" },
      { id: "s3-center-boundary", prompt: "中央四颗黑子只围住（5，5）。能把四周整片空点直接算作黑地吗？", position: center,
        expected: choice("only-center"), choices: [{ id: "only-center", label: "只能确认封住的（5，5）" }, { id: "all", label: "四周都算黑地" }],
        hints: ["看哪些空点真被隔开。", "外侧大片区域仍连着白棋。", "只能确认中央一空点。"], success: "围地要看完整边界，不能把开放区域也算进去。", wrong: "中央以外的空点没有被完整封住。" },
    ]),
  lesson("s3-territory-boundary", 2, "围地与边界", "识别边界缺口，并通过一手封住确定空点。",
    "（5，5）旁边只差下方一颗黑子；缺口打开时，空区连到白棋一侧，不能算黑地。",
    ["territory", "enclosure"], [
      frame(boundaryGap, "正确：黑棋下在（5，6）补上边界缺口。", move(4, 5)),
      frame(boundaryClosed, "补后（5，5）只与黑棋相邻，成为黑棋围住的一点。"),
      frame(boundaryGap, "反例：缺口还开着时，（5，5）与外侧相通，不能先算作黑地。"),
    ], [
      { id: "s3-close-gap", prompt: "黑棋要封住（5，5）的空点，应补哪里？", position: boundaryGap,
        expected: move(4, 5), hints: ["找围墙唯一的缺口。", "缺口在目标点下方。", "下在（5，6）。"],
        success: "边界闭合，（5，5）成为黑地。", wrong: "这一手没有补住通向外侧的缺口。" },
      { id: "s3-open-region", prompt: "缺口未补时，（5，5）是否已经是确定的黑地？", position: boundaryGap,
        expected: choice("open"), choices: [{ id: "open", label: "不是，仍与外侧相通" }, { id: "closed", label: "是，已被围住" }],
        hints: ["从（5，5）沿空点向下走。", "可以从（5，6）走向外侧。", "边界尚未闭合。"],
        success: "开放空区不能提前当成黑地。", wrong: "先检查（5，6）是否仍是缺口。" },
      { id: "s3-closed-region", prompt: "黑棋补上（5，6）后，封住了哪一个空点？", position: boundaryClosed,
        expected: choice("one"), choices: [{ id: "one", label: "（5，5）一目" }, { id: "outside", label: "外侧所有空点" }],
        hints: ["只数被黑子围住的区域。", "白棋仍与外侧大片空区相邻。", "只有（5，5）。"],
        success: "完整边界围住了（5，5）这一个空点。", wrong: "外侧仍是黑白共有边界，不能全算。" },
    ]),
  lesson("s3-weak-groups", 3, "弱棋先出头", "先处理只剩一口气的棋，避免贪图无关小地。",
    "中央黑子只剩（5，6）一口气；在别处围一点，白棋就能从这口气提掉它。",
    ["weak-group", "liberty"], [
      frame(weakGroup, "正确：黑棋沿（5，6）出头，给整组增加气。", move(4, 5)),
      frame(weakEscaped, "出头后黑棋暂时脱离直接打吃；仍需留意后续攻防。"),
      frame(weakGroup, "反例：黑棋先在（1，1）贪一手，白棋即可占（5，6）提子。", move(0, 0)),
      frame(continued(weakGroup, { x: 0, y: 0 }), "白棋从（5，6）提掉黑子。", move(4, 5)),
      frame(weakIgnored, "黑棋在角上的一手没有救回中央弱棋。"),
    ], [
      { id: "s3-weak-escape", prompt: "中央黑子被打吃，黑棋从哪里出头？", position: weakGroup,
        expected: move(4, 5), hints: ["数中央黑子的气。", "唯一空邻点在下方。", "下在（5，6）。"],
        success: "黑棋出头后增加了气，避免立即被提。", wrong: "先救只剩一口气的中央黑子。" },
      { id: "s3-weak-capture", prompt: "黑棋脱先走角后，白棋从哪里提掉中央黑子？", position: continued(weakGroup, { x: 0, y: 0 }),
        expected: move(4, 5), hints: ["中央黑子仍只剩一口气。", "占它正下方的气。", "白棋下在（5，6）。"],
        success: "白棋占尽最后一口气，提掉黑子。", wrong: "请先数中央黑子仅剩的空邻点。" },
      { id: "s3-weak-priority", prompt: "同一局面，先救被打吃的中央黑棋，还是先在角上占一个空点？", position: weakGroup,
        expected: choice("escape"), choices: [{ id: "escape", label: "先沿（5，6）出头" }, { id: "corner", label: "先下（1，1）" }],
        hints: ["被打吃的棋下一手可能被提。", "角上的一手不能保护中央。", "先出头。"],
        success: "先处理眼前的提子威胁，再评估别处。", wrong: "白棋下一手就能提中央黑子。" },
    ]),
  lesson("s3-invasion-reduction", 4, "侵入与浅消", "根据对方外势和己方退路，在棋盘上选择侵入或浅消的落点。",
    "白棋大框稀疏时，黑棋可进入框内并向左延出；白棋左侧厚墙与上下外沿构成较强模样时，黑棋从右侧浅消并接住己方棋，避免在墙边孤立。两种判断都要看后续应手。",
    ["invasion", "reduction", "weak-group"], [
      frame(looseFramework, "正确：白框松散，黑棋从（7，5）侵入。", move(6, 4)),
      frame(invasionPlaced, "白棋从（8，5）压迫侵入子。", move(7, 4)),
      frame(invasionPressed, "黑棋向（6，5）延出，保留朝左侧同伴靠拢的路线。", move(5, 4)),
      frame(invasionExtended, "这只是可行的局部退路，还须继续读白棋应手。"),
      frame(strongFramework, "白棋左侧厚墙向右张开模样；黑棋从右侧（7，5）浅消，接住（8，5）的棋。", move(6, 4)),
      frame(reductionPlaced, "黑棋与右侧同伴直邻相连，压低白框外沿并保留退路。"),
      frame(strongFramework, "反例：黑棋若在（4，5）贴近白墙深侵，与右侧（8，5）的接应相隔甚远。", move(3, 4)),
      frame(deepInvasion, "深侵子合法，但靠近厚墙而孤立；不能把它当作已安定。"),
      frame(weakNearFramework, "白棋抢占（7，5）后，黑棋从（8，4）连接（7，4）和（8，5）。", move(7, 3)),
      frame(weakConnected, "黑棋从白框外侧连成一组，避开已被白棋占住的浅消点；还需继续读。"),
    ], [
      { id: "s3-loose-invade", prompt: "白棋右侧大框松散，黑棋要进框内且保留向左延出的路线，先下哪里？", position: looseFramework,
        expected: move(6, 4), hints: ["观察白棋（7，2）与（9，4）之间的空处。", "从框内中部下，下一手可向左延出。", "下在（7，5）。"],
        success: "黑棋进入白框；若白棋从右压，仍可向左延出。", wrong: "找进入稀疏白框、还能向左延出的点。" },
      { id: "s3-strong-reduce", prompt: "白棋左侧厚墙向右张开模样，黑棋在右侧哪一点浅消，并直邻连接（8，5）？", position: strongFramework,
        expected: move(6, 4), hints: ["白墙在（3，2）至（3，8），潜在白空向右延伸。", "从白框外沿靠近已有黑棋。", "下在（7，5）。"],
        success: "黑棋从白框外沿压低模样，直邻连接右侧同伴。", wrong: "请在白棋模样右侧保留向外的连接。" },
      { id: "s3-weak-reduce", prompt: "白棋已占（7，5），隔开（7，4）与（8，5）两颗黑子；黑棋下哪里能沿外侧直接连成一组？", position: weakNearFramework,
        expected: move(7, 3), hints: ["（7，5）已被白棋占住。", "找两颗黑子共同相邻的另一处空点。", "下在（8，4）。"],
        success: "黑棋从（8，4）接住右侧同伴，增加这组的气；仍要继续读后续。", wrong: "（7，5）已有白子；请从外侧寻找另一处直连接点。" },
    ]),
  lesson("s3-sente-gote-endgame", 5, "先手、后手与收官", "比较两处各增加一目面积的收官落点，读出哪一手造成必须处理的威胁。",
    "两侧边界已经成形，中央白子还差一步连回白墙。黑棋下（5，6）和（5，1）都会让当前黑方面积增加一目；前者打吃白子，后者只是占一个公空。",
    ["sente", "gote", "endgame"], [
      frame(endgameBoundary, "正确：边界收官时，黑棋下（5，6）占一目并打吃白子。", move(4, 5)),
      frame(senteThreat, "白棋若想保住（5，5），应下（6，5）连回白墙。", move(5, 4)),
      frame(senteAnswer, "白棋应后，黑棋这手仍占一目；威胁得到了回应。"),
      frame(endgameBoundary, "反例：黑棋先下（5，1）也占一目，但没有打吃白子。", move(4, 0)),
      frame(goteAfterBlack, "白棋可趁机下（6，5）自行连回。", move(5, 4)),
      frame(goteElsewhere, "黑棋上边线的一目没有迫使白棋应在（5，1）附近。"),
    ], [
      { id: "s3-sente-atari", prompt: "边界上有两处可各占一目；黑棋走哪一点还能打吃（5，5）的白子？", position: endgameBoundary,
        expected: move(4, 5), hints: ["白子尚有下、右两口气。", "封下方后只剩连向右方的气。", "下在（5，6）。"],
        success: "黑棋占一目并打吃；白棋若保子必须应。", wrong: "比较（5，6）与（5，1）对白子气的影响。" },
      { id: "s3-sente-answer", prompt: "黑棋（5，6）打吃后，白棋若要保存（5，5），从哪里连回白墙？", position: senteThreat,
        expected: move(5, 4), hints: ["白子只剩右侧一口气。", "白墙在右侧。", "走（6，5）连接。"],
        success: "白棋连回厚墙，避免下一手被提。", wrong: "请占白子最后一口气并连向右侧同伴。" },
      { id: "s3-gote-choice", prompt: "黑棋想先占一目，却不打吃（5，5）的白子，应选择哪一处边界点？", position: endgameBoundary,
        expected: move(4, 0), hints: ["避开会打吃白子的下方点。", "沿上边线还有一个公空。", "下在（5，1）。"],
        success: "这手增加一目，但白棋无需回应其局部威胁，可自行连回。", wrong: "（5，6）会打吃；题目要找未形成直接威胁的一目。" },
    ]),
  lesson("s3-pass-dead-stones", 6, "停一手与死子确认", "真实经历双方连续停手，并在终局任务卡标记已被围住的死子。",
    "白子只剩（3，4）一口气，而该点被黑棋包围，白棋无法安全延出；双方停手后，先标记死子，双方确认，再移除并计分。",
    ["pass", "dead-stones"], [
      frame(deadStone, "正确：黑棋使用任务卡的“停一手”按钮。", pass),
      frame(afterBlackPass, "白棋也停一手；连续两次停手后进入死子确认。", pass),
      frame(ended, "进入死子确认阶段后，先用“标记死子”点选（3，3）的白子；双方再确认。", markDead(2, 2)),
      frame(ended, "标记完成后等待双方确认；确认后才移除死子并计分。"),
      frame(deadStone, "反例：只停一手还未终局，不能跳过对方回合直接计分。"),
    ], [
      { id: "s3-first-pass", prompt: "黑棋认为可结束对局时，使用任务卡哪个操作？", position: deadStone,
        expected: pass, hints: ["无需在棋盘落子。", "任务卡有停手操作。", "点“停一手”。"],
        success: "黑棋停一手，轮到白棋；此时还未终局。", wrong: "请使用任务卡的停一手按钮。" },
      { id: "s3-second-pass", prompt: "黑棋刚停一手，白棋也同意结束，应使用什么操作？", position: afterBlackPass,
        expected: pass, hints: ["现在轮到白棋。", "连续第二次停手会进入终局。", "再点“停一手”。"],
        success: "双方连续停手，进入死子确认。", wrong: "白棋也要明确停一手，才进入终局。" },
      { id: "s3-mark-dead", prompt: "双方已连续停手，使用任务卡“标记死子”点选哪颗白子？", position: ended,
        expected: markDead(2, 2), hints: ["找被黑棋围住的白子。", "它位于左上附近。", "点选（3，3）。"],
        success: "已标记死子；双方确认后移除它再计分。", wrong: "请点选被围住的（3，3）白子。" },
    ]),
  lesson("s3-chinese-area-komi", 7, "中国规则数目与贴目", "按活子加围住空点计算面积，给白棋加 7.5 目贴目，再判断胜负。",
    "此终局黑白各有九颗活子、二十七个围住的空点，面积各三十六；白棋加 7.5 目后为 43.5。提子数量不单独加分。",
    ["scoring", "komi", "territory", "chinese-rules"], [
      frame(scoring, "正确：黑棋九子加二十七个围住空点，得到三十六目面积。"),
      frame(scoring, "白棋也有三十六目面积，再加 7.5 目贴目，得到 43.5。"),
      frame(scoring, "反例：中间九个双方都接触的空点是公空；提子数量也不另外加分。"),
    ], [
      { id: "s3-black-area", prompt: "黑棋有九颗活子和二十七个围住的空点，面积是多少？", position: scoring,
        expected: choice("36"), choices: [{ id: "36", label: "36" }, { id: "27", label: "27" }, { id: "45", label: "45" }],
        hints: ["中国规则数活子加围住的空点。", "计算 9 + 27。", "黑棋面积 36。"],
        success: "黑棋面积是 9 + 27 = 36。", wrong: "只加活子与围住的空点；中间公空不计。" },
      { id: "s3-white-total", prompt: "白棋面积也是 36，加上 7.5 目贴目后总分多少？", position: scoring,
        expected: choice("43.5"), choices: [{ id: "43.5", label: "43.5" }, { id: "36", label: "36" }, { id: "51", label: "51" }],
        hints: ["贴目加给白棋。", "计算 36 + 7.5。", "白棋总分 43.5。"],
        success: "白棋总分是 43.5。", wrong: "别忘了白棋的 7.5 目贴目。" },
      { id: "s3-score-winner", prompt: "黑棋 36，白棋 43.5；中间公空不计、提子不单独加分。谁获胜？", position: scoring,
        expected: choice("white"), choices: [{ id: "white", label: "白棋胜 7.5 目" }, { id: "black", label: "黑棋胜" }],
        hints: ["比较双方最终总分。", "白棋贴目后高于黑棋。", "白棋以 43.5 对 36 获胜。"],
        success: "白棋胜 7.5 目；提子不再单独加分。", wrong: "请比较含贴目的最终总分。" },
    ]),
  {
    kind: "graduation", id: "s3-graduation", stageId: "stage-3", order: 8, boardSize: 9,
    requiredBoardSize: 9, title: "九路毕业对局", objective: "完成一盘九路对局，进入终局、确认死子并完成中国规则计分。",
    story: "下完一盘人机对局后，双方连续停手，完成死子确认和计分，再回看关键时刻。胜负不影响毕业。",
    terms: ["pass", "dead-stones", "scoring", "komi"],
  },
];
