import type { Color, Move, StoneSetup } from "@/lib/go/types";
import { STAGE_1_KO_CAPTURE, STAGE_1_KO_STONES } from "@/lib/learning/stage-1";
import type {
  DemoFrame,
  Exercise,
  GlossaryEntry,
  LessonAction,
  LessonUnitId,
  PositionSpec,
  TermId,
} from "@/lib/learning/types";

const position = (
  stones: StoneSetup[] = [],
  toPlay: Color = "black",
  setupMoves?: Move[],
): PositionSpec => ({
  size: 5,
  stones,
  toPlay,
  ...(setupMoves ? { setupMoves } : {}),
});
const move = (x: number, y: number): LessonAction => ({
  kind: "move",
  point: { x, y },
});
const choice = (choiceId: string): LessonAction => ({
  kind: "choice",
  choiceId,
});
type PracticeInput = Pick<
  Exercise,
  "id" | "prompt" | "position" | "expected" | "choices" | "success"
> & { hints: [string, string, string]; wrong: string };
const practice = (input: PracticeInput): Exercise => ({
  id: input.id,
  prompt: input.prompt,
  position: input.position,
  expected: input.expected,
  ...(input.choices ? { choices: input.choices } : {}),
  initialHintLevel: 0,
  hints: input.hints.map((text, index) => ({
    level: (index + 1) as 1 | 2 | 3,
    text,
  })) as Exercise["hints"],
  success: input.success,
  errors: {
    wrong_answer: input.wrong,
    occupied: "此处已有棋子，请找空交叉点。",
    suicide: "落子后没有气，也没有提子，属于禁入点。",
    ko: "立即提回会重复棋形，请先走别处。",
    out_of_bounds: "请在五路棋盘内操作。",
    finished: "双方已连续停一手，请进入数子。",
  },
});
type TermInput = {
  id: TermId;
  name: string;
  aliases: string[];
  plain: string;
  formal: string;
  misconception: string;
  lessonIds: LessonUnitId[];
  relatedTermIds: TermId[];
  animationPosition: PositionSpec;
  frames: DemoFrame[];
  practice: PracticeInput;
};
const term = (input: TermInput): GlossaryEntry => ({
  id: input.id,
  name: input.name,
  aliases: input.aliases,
  plain: input.plain,
  formal: input.formal,
  misconception: input.misconception,
  lessonIds: input.lessonIds,
  relatedTermIds: input.relatedTermIds,
  animation: { position: input.animationPosition, frames: input.frames },
  practice: practice(input.practice),
});
const frame = (
  stones: StoneSetup[],
  toPlay: Color,
  caption: string,
  action?: LessonAction,
  setupMoves?: Move[],
): DemoFrame => ({
  stones,
  toPlay,
  caption,
  ...(action ? { move: action } : {}),
  ...(setupMoves ? { setupMoves } : {}),
});
const atari: StoneSetup[] = [
  ["white", 2, 2],
  ["black", 1, 2],
  ["black", 2, 1],
  ["black", 2, 3],
];
const ko = STAGE_1_KO_STONES;
const surrounded: StoneSetup[] = [
  ["white", 1, 2],
  ["white", 2, 1],
  ["white", 3, 2],
  ["white", 2, 3],
];
const deadStoneRing: StoneSetup[] = [
  ["white", 2, 2],
  ["black", 1, 1],
  ["black", 2, 1],
  ["black", 3, 1],
  ["black", 1, 2],
  ["black", 3, 2],
  ["black", 1, 3],
  ["black", 3, 3],
  ["black", 1, 4],
  ["black", 2, 4],
  ["black", 3, 4],
];
const areaBefore: StoneSetup[] = [
  ["black", 0, 1],
  ["black", 1, 0],
  ["black", 2, 1],
  ["black", 1, 2],
  ["white", 4, 4],
];
const areaAfter: StoneSetup[] = [...areaBefore, ["black", 0, 0]];

export const STAGE_1_TERMS: GlossaryEntry[] = [
  term({
    id: "intersection",
    name: "交叉点",
    aliases: ["落子点", "线的交点"],
    plain: "棋子要放在横线与竖线相交的点上；边缘的交点也能下。",
    formal:
      "棋盘上两条棋线的交会位置；合法落子须选择未占用且符合规则的交叉点。",
    misconception: "不要把棋子放在方格中央。",
    lessonIds: ["s1-intersections-turns"],
    relatedTermIds: ["liberty", "pass"],
    animationPosition: position(),
    frames: [
      frame([], "black", "空棋盘，黑棋先找中央交叉点。", move(2, 2)),
      frame([["black", 2, 2]], "white", "黑子稳稳落在线的交点，不在方格内。"),
    ],
    practice: {
      id: "term-intersection",
      prompt: "黑棋先行，请落在中央交叉点。",
      position: position(),
      expected: move(2, 2),
      hints: ["看线，不看格子。", "找横竖中线。", "点（3，3）。"],
      success: "棋子落在中央交叉点。",
      wrong: "请在横竖中线相交处落子。",
    },
  }),
  term({
    id: "liberty",
    name: "气",
    aliases: ["自由点", "呼吸点"],
    plain: "棋子上下左右紧挨着的空交叉点，就是它的气。",
    formal:
      "与同色棋块中的任一棋子正交相邻、且未被占据的交叉点；同一空点只数一次。",
    misconception: "斜角的空点不是气；被棋子占住的点也不算气。",
    lessonIds: ["s1-liberties-groups", "s1-atari-capture"],
    relatedTermIds: ["group", "atari"],
    animationPosition: position([["black", 2, 2]]),
    frames: [
      frame([["black", 2, 2]], "white", "中央黑子有上下左右四口气。"),
      frame(
        [
          ["black", 2, 2],
          ["white", 2, 1],
        ],
        "black",
        "白子占了上方，黑子只剩三口气；斜角不算。",
      ),
    ],
    practice: {
      id: "term-liberty",
      prompt: "中央黑子上方被占，还剩几口气？",
      position: position([
        ["black", 2, 2],
        ["white", 2, 1],
      ]),
      expected: choice("three"),
      choices: [
        { id: "two", label: "两口" },
        { id: "three", label: "三口" },
        { id: "four", label: "四口" },
      ],
      hints: ["只看直邻空点。", "上方已被占。", "数左、右、下。"],
      success: "左、右、下共三口气。",
      wrong: "不要把斜角或被占的上方算作气。",
    },
  }),
  term({
    id: "group",
    name: "棋块",
    aliases: ["相连棋子", "一块棋"],
    plain: "沿横竖线紧挨着的同色棋子，连成一块并共享气。",
    formal: "由正交相邻关系连通的最大同色棋子集合；整块棋共同拥有其相邻空点。",
    misconception: "两颗斜着靠近的同色棋子不是一块棋。",
    lessonIds: ["s1-liberties-groups", "s1-escape-connect"],
    relatedTermIds: ["liberty", "connect"],
    animationPosition: position([
      ["black", 1, 1],
      ["black", 1, 2],
    ]),
    frames: [
      frame([["black", 1, 1]], "black", "先有一颗黑子。"),
      frame(
        [
          ["black", 1, 1],
          ["black", 1, 2],
        ],
        "white",
        "下方直连后，两颗黑子成为一块。",
      ),
    ],
    practice: {
      id: "term-group",
      prompt: "点选这两颗直连黑子的棋块。",
      position: position(
        [
          ["black", 1, 1],
          ["black", 1, 2],
        ],
        "white",
      ),
      expected: { kind: "select-group", point: { x: 1, y: 1 } },
      hints: ["找同色棋子。", "它们上下相邻。", "点其中任一黑子。"],
      success: "你选中了共享气的黑棋块。",
      wrong: "请点上下相连的黑子。",
    },
  }),
  term({
    id: "atari",
    name: "打吃",
    aliases: ["叫吃", "只剩一气"],
    plain: "一块棋只剩一口气时，就被打吃了；下一手若不救，可能被提。",
    formal: "棋块的气数恰为一的状态。",
    misconception: "打吃还没有把棋子拿走；提子发生在最后一口气被占后。",
    lessonIds: ["s1-atari-capture", "s1-escape-connect"],
    relatedTermIds: ["liberty", "capture"],
    animationPosition: position(
      atari.filter(
        (stone) => !(stone[0] === "black" && stone[1] === 2 && stone[2] === 3),
      ),
    ),
    frames: [
      frame(
        atari.filter(
          (stone) =>
            !(stone[0] === "black" && stone[1] === 2 && stone[2] === 3),
        ),
        "black",
        "白子还有下方和右侧两口气；黑棋准备填下一口。",
        move(2, 3),
      ),
      frame(atari, "white", "黑棋填掉下方后，白子只剩右侧一口气，正被打吃。"),
    ],
    practice: {
      id: "term-atari",
      prompt: "中央白子只剩右侧一口气，现在是什么状态？",
      position: position(atari),
      expected: choice("atari"),
      choices: [
        { id: "atari", label: "被打吃" },
        { id: "captured", label: "已经被提走" },
      ],
      hints: ["先数白子的气。", "还有一口气。", "还没从棋盘移走。"],
      success: "白子只剩一口气，正在被打吃。",
      wrong: "白子还在盘上，只剩一口气。",
    },
  }),
  term({
    id: "capture",
    name: "提子",
    aliases: ["吃子", "提走棋子"],
    plain: "占住对手棋块最后一口气，就把那块无气棋子从棋盘拿走。",
    formal: "落子后，对方正交相邻且气数为零的棋块同时移除。",
    misconception: "斜着堵住对手不算占气；要把最后一个相邻空点填上。",
    lessonIds: ["s1-atari-capture", "s1-suicide-exception"],
    relatedTermIds: ["atari", "suicide"],
    animationPosition: position(atari),
    frames: [
      frame(atari, "black", "中央白子只剩右侧一口气。", move(3, 2)),
      frame(
        [
          ["black", 1, 2],
          ["black", 2, 1],
          ["black", 2, 3],
          ["black", 3, 2],
        ],
        "white",
        "最后一口气被占，白子从棋盘拿走。",
      ),
    ],
    practice: {
      id: "term-capture",
      prompt: "请提走中央被打吃的白子。",
      position: position(atari),
      expected: move(3, 2),
      hints: ["白子只剩一口气。", "看右侧空点。", "下（4，3）。"],
      success: "你占住最后一口气，提走了白子。",
      wrong: "请占白子最后一口气，斜着落子不能提。",
    },
  }),
  term({
    id: "connect",
    name: "连接",
    aliases: ["连棋", "粘"],
    plain: "在两块同色棋之间落一手，让它们沿横竖线接成一块。",
    formal: "通过正交相邻的同色棋子路径，使原本分开的同色棋块连通。",
    misconception: "仅在斜角相碰不算连接；中间空点未填时仍可能被切开。",
    lessonIds: ["s1-escape-connect"],
    relatedTermIds: ["group", "liberty"],
    animationPosition: position([
      ["black", 1, 2],
      ["black", 3, 2],
    ]),
    frames: [
      frame(
        [
          ["black", 1, 2],
          ["black", 3, 2],
        ],
        "black",
        "两颗黑子之间隔着空点。",
        move(2, 2),
      ),
      frame(
        [
          ["black", 1, 2],
          ["black", 2, 2],
          ["black", 3, 2],
        ],
        "white",
        "填中间点后，三颗黑子是一块。",
      ),
    ],
    practice: {
      id: "term-connect",
      prompt: "在中间落一手，连接左右两颗黑子。",
      position: position([
        ["black", 1, 2],
        ["black", 3, 2],
      ]),
      expected: move(2, 2),
      hints: ["看两颗黑子之间。", "需沿同一条横线直连。", "点（3，3）。"],
      success: "两边黑子被连成一块。",
      wrong: "请填两颗黑子中间的空交叉点。",
    },
  }),
  term({
    id: "suicide",
    name: "禁入点",
    aliases: ["自杀禁手", "无气禁入"],
    plain:
      "若一手落下后己方无气，而且没有提子，这就是禁入点；若能先提子并获得气，这手合法。",
    formal: "落子并先移除被提的对方棋块后，若落子棋块仍无气，则该手禁止。",
    misconception:
      "不是所有看起来四周被围的点都不能下；提子例外要先处理提子，再检查己方气。",
    lessonIds: ["s1-suicide-exception"],
    relatedTermIds: ["capture", "liberty"],
    animationPosition: position(surrounded),
    frames: [
      frame(surrounded, "black", "黑棋若下中央，无气又不提子，是禁入点。"),
      frame(
        atari,
        "black",
        "对照：占白子最后一口气能提子，落子合法。",
        move(3, 2),
      ),
    ],
    practice: {
      id: "term-suicide",
      prompt: "黑棋下中央既无气又提不掉白子，能下吗？",
      position: position(surrounded),
      expected: choice("no"),
      choices: [
        { id: "yes", label: "能下" },
        { id: "no", label: "不能，这是禁入点" },
      ],
      hints: ["先看能否提子。", "四周白子仍有别的气。", "黑棋落下也没有气。"],
      success: "这是无气且不提子的禁入点。",
      wrong: "这手提不掉白子，己方也无气。",
    },
  }),
  term({
    id: "ko",
    name: "劫",
    aliases: ["劫争", "打劫"],
    plain: "提掉一子后，对方若马上提回会让棋形重复，这种局面叫劫。",
    formal: "依棋形重复禁令，落子后会恢复历史上已有棋盘局面的立即回提不合法。",
    misconception: "看到空点就能立刻提回是错的；劫要记住刚才的棋形。",
    lessonIds: ["s1-ko-threat"],
    relatedTermIds: ["ko-threat", "capture"],
    animationPosition: position(ko),
    frames: [
      frame(ko, "black", "黑棋准备提掉中央白子。", move(3, 2)),
      frame(
        ko,
        "black",
        "黑棋提子后的完整棋形；白棋立即提回会重复上一棋形，规则禁止。",
        undefined,
        [STAGE_1_KO_CAPTURE],
      ),
    ],
    practice: {
      id: "term-ko",
      prompt: "紧接着黑棋提子，白棋能立即提回吗？",
      position: position(ko, "black", [STAGE_1_KO_CAPTURE]),
      expected: choice("wait"),
      choices: [
        { id: "now", label: "马上提回" },
        { id: "wait", label: "先去别处下一手" },
      ],
      hints: ["回提后的棋形会怎样？", "它会恢复上一棋形。", "立即重复被禁止。"],
      success: "不能立即回提；先到别处下劫材。",
      wrong: "立刻回提会重复刚才棋形。",
    },
  }),
  term({
    id: "ko-threat",
    name: "劫材",
    aliases: ["劫争威胁", "别处一手"],
    plain:
      "不能立刻提回劫时，先到别处下一手，最好让对手不得不回应，这手叫劫材。",
    formal: "劫争中为打断立即回提而在别处落下、对对方构成需回应威胁的一手。",
    misconception: "随便在别处落子虽然隔了一手，却未必是真正有威胁的好劫材。",
    lessonIds: ["s1-ko-threat"],
    relatedTermIds: ["ko", "capture"],
    animationPosition: position(ko, "black", [STAGE_1_KO_CAPTURE]),
    frames: [
      frame(
        ko,
        "black",
        "左上两颗黑子有两口气；白棋准备在（2，2）下劫材。",
        move(1, 1),
        [STAGE_1_KO_CAPTURE],
      ),
      frame(
        ko,
        "black",
        "白棋在（2，2）把左上黑子打吃，黑棋须考虑回应。",
        undefined,
        [STAGE_1_KO_CAPTURE, { x: 1, y: 1 }],
      ),
    ],
    practice: {
      id: "term-ko-threat",
      prompt: "白棋暂不能回提；请在（2，2）打吃左上黑棋，形成劫材。",
      position: position(ko, "black", [STAGE_1_KO_CAPTURE]),
      expected: move(1, 1),
      hints: [
        "先离开劫点，并找一个威胁。",
        "左上黑棋有两口气。",
        "占（2，2）后它们只剩一口气。",
      ],
      success: "你把左上黑棋打吃，这手劫材让黑棋须考虑回应。",
      wrong: "劫材需要威胁；请在（2，2）打吃左上黑棋。",
    },
  }),
  term({
    id: "pass",
    name: "停一手",
    aliases: ["虚着", "pass"],
    plain: "不想落子时可以停一手。双方连续两次停一手，才进入终局数子。",
    formal: "主动放弃本回合落子并把行棋权交给对方；连续两次停一手触发终局。",
    misconception: "一方只停一手不会立刻结束，另一方仍可落子。",
    lessonIds: ["s1-pass-ending"],
    relatedTermIds: ["dead-stones", "chinese-rules"],
    animationPosition: position([["black", 2, 2]], "white"),
    frames: [
      frame([["black", 2, 2]], "white", "白棋选择停一手。", { kind: "pass" }),
      frame(
        [["black", 2, 2]],
        "white",
        "轮到黑棋；还没连续停两次。",
        undefined,
        [{ pass: true }],
      ),
    ],
    practice: {
      id: "term-pass",
      prompt: "白棋不想落子，请点停一手。",
      position: position([["black", 2, 2]], "white"),
      expected: { kind: "pass" },
      hints: ["可以交出回合。", "不用点棋盘。", "使用停一手操作。"],
      success: "白棋停一手，黑棋仍可继续行棋。",
      wrong: "请用停一手操作交出回合。",
    },
  }),
  term({
    id: "dead-stones",
    name: "死子",
    aliases: ["无望存活的棋", "终局死子"],
    plain: "终局时确认已经无法活下来的棋子，数子前把它们作为死子处理。",
    formal:
      "对局结束后双方确认无法避免被提、不能存活的棋块；计分时从棋盘移除。",
    misconception: "不能看见被围就随意判死；有争议要继续下清楚再确认。",
    lessonIds: ["s1-pass-ending"],
    relatedTermIds: ["pass", "chinese-rules"],
    animationPosition: position(deadStoneRing),
    frames: [
      frame(
        deadStoneRing,
        "black",
        "中央白子只剩封闭的一口气，黑棋可占最后一气提子。",
        move(2, 3),
      ),
      frame(
        deadStoneRing
          .filter((stone) => stone[0] === "black")
          .concat([["black", 2, 3]]),
        "white",
        "若双方确认白子无法存活，终局数子时不把死子算活子。",
      ),
    ],
    practice: {
      id: "term-dead-stones",
      prompt: "双方连续停手后，请点选中央白子标记为死子，供双方确认。",
      position: position(deadStoneRing, "black", [{ pass: true }, { pass: true }]),
      expected: { kind: "mark-dead", point: { x: 2, y: 2 } },
      hints: [
        "寻找题目指定的白子。",
        "它在正中央，只剩封闭的一口气。",
        "点（3，3）标记。",
      ],
      success: "已标记中央白子，等待双方确认后计分。",
      wrong: "本题要标记中央白子；别把周围黑子标为死子。",
    },
  }),
  term({
    id: "chinese-rules",
    name: "中国规则",
    aliases: ["数子规则", "面积计分"],
    plain:
      "中国规则数活子和己方围住的空点，白棋另加7.5目贴目；比较双方总面积决定胜负。",
    formal:
      "终局确认死子后，双方各计棋盘上存活棋子与其围住的空交叉点之和；白方得分再加7.5目。",
    misconception: "不能只数提掉的棋子；空点和棋盘上的活子都要计入。",
    lessonIds: ["s1-pass-ending"],
    relatedTermIds: ["dead-stones", "pass"],
    animationPosition: position(areaBefore),
    frames: [
      frame(
        areaBefore,
        "black",
        "示意：黑棋4颗活子围住（2，2）空点；白棋1颗活子，数子时另加7.5目贴目。",
        move(0, 0),
      ),
      frame(
        areaAfter,
        "white",
        "黑棋再落一子，示意黑活子5颗，围住的（2，2）空点仍归黑；白活子1颗，再加7.5目。",
      ),
    ],
    practice: {
      id: "term-chinese-rules",
      prompt: "中国规则终局数子时，哪种说法正确？",
      position: position(areaAfter),
      expected: choice("area"),
      choices: [
        { id: "captures", label: "只数曾经提掉的棋子" },
        { id: "area", label: "数活子与围住的空点，白棋加7.5目" },
      ],
      hints: ["这是面积计分。", "棋盘上的活子也算。", "别忘了白棋贴目。"],
      success: "中国规则按面积数子，白棋再加7.5目。",
      wrong: "中国规则要数活子和围住的空点，还要加白棋贴目。",
    },
  }),
];
