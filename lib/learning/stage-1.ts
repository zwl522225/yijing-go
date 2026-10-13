import type { Color, Move, StoneSetup } from "@/lib/go/types";
import type {
  DemoFrame,
  Exercise,
  LessonAction,
  LessonUnit,
  PositionSpec,
  QuizQuestion,
  QuizUnit,
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
type ExerciseInput = Omit<Exercise, "initialHintLevel" | "hints" | "errors"> & {
  hints: [string, string, string];
  wrong: string;
  illegal?: Partial<Exercise["errors"]>;
};
const exercise = (
  input: ExerciseInput,
  initialHintLevel: 0 | 1 | 2,
): Exercise => ({
  id: input.id,
  prompt: input.prompt,
  position: input.position,
  expected: input.expected,
  ...(input.choices ? { choices: input.choices } : {}),
  initialHintLevel,
  hints: input.hints.map((text, index) => ({
    level: (index + 1) as 1 | 2 | 3,
    text,
  })) as Exercise["hints"],
  success: input.success,
  errors: {
    wrong_answer: input.wrong,
    occupied: "这里已有棋子；请在空交叉点落子。",
    suicide: "落下后己方没有气，且没有提掉对方棋子，属于禁入点。",
    ko: "这手会立刻重复刚才的棋形；先去别处下劫材。",
    out_of_bounds: "请在五路棋盘的交叉点内操作。",
    finished: "双方已经连续停一手，棋局进入数子。",
    ...input.illegal,
  },
});
const lesson = (
  id: LessonUnit["id"],
  order: number,
  title: string,
  objective: string,
  story: string,
  terms: LessonUnit["terms"],
  demo: DemoFrame[],
  inputs: [ExerciseInput, ExerciseInput, ExerciseInput],
): LessonUnit => ({
  kind: "lesson",
  id,
  stageId: "stage-1",
  order,
  boardSize: 5,
  title,
  objective,
  story,
  terms,
  demo,
  exercises: inputs.map((input, index) =>
    exercise(input, (2 - index) as 0 | 1 | 2),
  ),
});

const atariStones: StoneSetup[] = [
  ["white", 2, 2],
  ["black", 1, 2],
  ["black", 2, 1],
  ["black", 2, 3],
];
export const STAGE_1_KO_STONES: StoneSetup[] = [
  ...atariStones,
  ["white", 3, 1],
  ["white", 4, 2],
  ["white", 3, 3],
  ["black", 0, 0],
  ["black", 0, 1],
  ["white", 1, 0],
];
const koStones = STAGE_1_KO_STONES;
export const STAGE_1_KO_CAPTURE: Move = { x: 3, y: 2 };
export const STAGE_1_KO_AFTER: StoneSetup[] = koStones
  .filter(
    (stone) => !(stone[0] === "white" && stone[1] === 2 && stone[2] === 2),
  )
  .concat([["black", 3, 2]]);
const suicideStones: StoneSetup[] = [
  ["white", 1, 2],
  ["white", 2, 1],
  ["white", 3, 2],
  ["white", 2, 3],
];

export const STAGE_1_UNITS: (LessonUnit | QuizUnit)[] = [
  lesson(
    "s1-intersections-turns",
    1,
    "在交叉点轮流落子",
    "找到交叉点，并认清轮到谁。",
    "墨点落在线的交会处；黑棋先行，之后双方轮流。",
    ["intersection"],
    [
      frame([], "black", "正确：空棋盘由黑棋先在交叉点落子。", move(2, 2)),
      frame(
        [["black", 2, 2]],
        "white",
        "错误：棋子不放在方格里；黑棋落下后轮到白棋。",
      ),
    ],
    [
      {
        id: "s1-center",
        prompt: "黑棋先行，请点棋盘正中央的交叉点。",
        position: position(),
        expected: move(2, 2),
        hints: ["找横竖线相交处。", "中央是第三行第三列。", "点坐标（3，3）。"],
        success: "黑棋落在中央交叉点，接下来轮到白棋。",
        wrong: "这不是正中央交叉点；从四边各数两格。",
      },
      {
        id: "s1-edge",
        prompt: "轮到白棋，请在左边缘中点交叉点落子。",
        position: position([["black", 2, 2]], "white"),
        expected: move(0, 2),
        hints: [
          "边线上的交点也能落子。",
          "沿左边线找中间一行。",
          "点坐标（1，3）。",
        ],
        success: "白棋可以落在边缘的交叉点。",
        wrong: "请沿左边线找中点，别落在格子内部。",
      },
      {
        id: "s1-turn",
        prompt: "黑、白、黑各下一手后，轮到谁？",
        position: position(
          [
            ["black", 2, 2],
            ["white", 0, 2],
            ["black", 1, 1],
          ],
          "white",
        ),
        expected: choice("white"),
        choices: [
          { id: "black", label: "黑棋" },
          { id: "white", label: "白棋" },
        ],
        hints: ["双方一人一手。", "最后一手是黑棋。", "想想黑棋之后该谁走。"],
        success: "对，黑棋刚落子，现在轮到白棋。",
        wrong: "黑棋刚走过，不能再连续走一手。",
      },
    ],
  ),
  lesson(
    "s1-liberties-groups",
    2,
    "气与相连的棋块",
    "数清上下左右的气，并把直连同色棋子当作一块。",
    "棋子呼吸靠气；同色棋子沿棋线相接就共享气。",
    ["liberty", "group"],
    [
      frame(
        [
          ["black", 1, 1],
          ["black", 1, 2],
        ],
        "white",
        "正确：上下直连的两颗黑子是一块，共享周围空交叉点。",
      ),
      frame(
        [
          ["black", 1, 1],
          ["black", 2, 2],
        ],
        "white",
        "错误：斜着相邻不是直连，斜角空点也不算气。",
      ),
    ],
    [
      {
        id: "s1-group-select",
        prompt: "点选左上两颗直连黑子所在的棋块。",
        position: position(
          [
            ["black", 1, 1],
            ["black", 1, 2],
          ],
          "white",
        ),
        expected: { kind: "select-group", point: { x: 1, y: 1 } },
        hints: [
          "沿横线或竖线看相邻同色棋子。",
          "两颗黑子上下相接。",
          "点任一颗相连黑子。",
        ],
        success: "这两颗黑子直连，是共享气的一块棋。",
        wrong: "请点那两颗上下相接的黑子；斜接不合并棋块。",
      },
      {
        id: "s1-liberty-count",
        prompt: "黑子（2，2）上方被白子占住后，还剩几口气？",
        position: position(
          [
            ["black", 1, 1],
            ["white", 1, 0],
          ],
          "black",
        ),
        expected: choice("three"),
        choices: [
          { id: "two", label: "两口" },
          { id: "three", label: "三口" },
          { id: "four", label: "四口" },
        ],
        hints: [
          "只数上下左右的空交叉点。",
          "上方已经被白子占了。",
          "再检查左、右、下。",
        ],
        success: "左、右、下方各有一口气，共三口。",
        wrong: "只数相邻空交叉点，已被占住的上方不是气。",
      },
      {
        id: "s1-fill-liberty",
        prompt: "在白子（3，3）的上方落黑子，填掉它的一口气。",
        position: position([["white", 2, 2]], "black"),
        expected: move(2, 1),
        hints: [
          "气是白子上下左右的空点。",
          "题目要找上方。",
          "白子上方是（3，2）。",
        ],
        success: "你填掉了白子上方的一口气。",
        wrong: "这一手没有填到指定的上方那口气。",
      },
    ],
  ),
  lesson(
    "s1-atari-capture",
    3,
    "打吃与提子",
    "认出只剩一口气的棋块，并占最后一口气提子。",
    "一口气时要警觉；占完最后一口气，就把无气的对方棋子拿走。",
    ["atari", "capture", "liberty"],
    [
      frame(
        atariStones,
        "black",
        "正确：中央白子只剩右侧一口气，正被打吃。",
        move(3, 2),
      ),
      frame(
        [
          ["black", 2, 2],
          ["white", 3, 3],
        ],
        "black",
        "错误：斜角（4，4）不是黑子的气，也不能用斜接提子。",
      ),
    ],
    [
      {
        id: "s1-atari-recognize",
        prompt: "白子（3，3）只剩右侧一口气，这叫什么？",
        position: position(atariStones),
        expected: choice("atari"),
        choices: [
          { id: "atari", label: "打吃" },
          { id: "capture", label: "已经提子" },
          { id: "safe", label: "还有很多气" },
        ],
        hints: [
          "数中央白子的空邻点。",
          "只剩一口气时要警告。",
          "提子要等最后一口气被占。",
        ],
        success: "只剩一口气叫打吃，此时白子还在棋盘上。",
        wrong: "白子还没被拿走；一口气的状态叫打吃。",
      },
      {
        id: "s1-capture-move",
        prompt: "黑棋占住白子最后一口气，把它提走。",
        position: position(atariStones),
        expected: move(3, 2),
        hints: [
          "看白子上下左右哪边还空着。",
          "最后一口气在右侧。",
          "落在（4，3）。",
        ],
        success: "白子失去最后一口气，被黑棋提走。",
        wrong: "要占最后一口气才能提子；斜着落子不能提。",
      },
      {
        id: "s1-diagonal-not-liberty",
        prompt: "黑子（3，3）的斜角（4，4）空点算它的气吗？",
        position: position([
          ["black", 2, 2],
          ["white", 1, 2],
          ["white", 2, 1],
          ["white", 2, 3],
        ]),
        expected: choice("no"),
        choices: [
          { id: "yes", label: "算一口气" },
          { id: "no", label: "不算，只有右侧一口气" },
        ],
        hints: ["气沿棋盘直线找。", "只看上下左右。", "斜角不与棋子共边。"],
        success: "斜角不是气；这颗黑子只剩右侧一口气。",
        wrong: "斜角空点不算气，请只数上下左右。",
      },
    ],
  ),
  lesson(
    "s1-escape-connect",
    4,
    "逃出打吃并连接",
    "用延长或连接来救被打吃的棋。",
    "别只盯着提子；给自己的棋块增加气，也能守住它。",
    ["atari", "connect", "group"],
    [
      frame(
        [
          ["black", 2, 2],
          ["white", 1, 2],
          ["white", 2, 1],
          ["white", 2, 3],
        ],
        "black",
        "正确：黑子只剩右侧一口气，向右延长可逃出打吃。",
        move(3, 2),
      ),
      frame(
        [
          ["black", 1, 2],
          ["black", 3, 2],
        ],
        "black",
        "错误：斜着靠近不是连接；要在（3，3）直连两边黑子。",
      ),
    ],
    [
      {
        id: "s1-extend",
        prompt: "黑子被打吃了，向右延长一手增加气。",
        position: position([
          ["black", 2, 2],
          ["white", 1, 2],
          ["white", 2, 1],
          ["white", 2, 3],
        ]),
        expected: move(3, 2),
        hints: ["黑子只剩一口气。", "找它右边的空交叉点。", "在（4，3）延长。"],
        success: "延长后黑棋有了新气，暂时脱离打吃。",
        wrong: "要沿剩下的右侧那口气延长，别留着被提。",
      },
      {
        id: "s1-connect",
        prompt: "把左右两颗黑子接成一个棋块。",
        position: position([
          ["black", 1, 2],
          ["black", 3, 2],
        ]),
        expected: move(2, 2),
        hints: [
          "连接要求上下左右相邻。",
          "两颗黑子中间有一个空交叉点。",
          "落在（3，3）。",
        ],
        success: "两边黑子通过中点直连成一个棋块，共享气。",
        wrong: "请填两颗黑子中间的交叉点，斜接不算连接。",
      },
      {
        id: "s1-save-connect",
        prompt: "黑子（3，3）只剩下方一口气；连接下方黑子救它。",
        position: position([
          ["black", 2, 2],
          ["black", 2, 4],
          ["white", 1, 2],
          ["white", 3, 2],
          ["white", 2, 1],
        ]),
        expected: move(2, 3),
        hints: [
          "先找被打吃黑子的最后一口气。",
          "下方隔着一格有友军。",
          "在（3，4）连接。",
        ],
        success: "你用最后一口气连上友军，整个棋块共享更多气。",
        wrong: "要在两颗黑子之间的（3，4）连接，才能立刻救棋。",
      },
    ],
  ),
  lesson(
    "s1-suicide-exception",
    5,
    "禁入点与提子例外",
    "辨别真正无气的禁入点，以及落子后提掉对手的合法一手。",
    "先看落子能否提子；提掉对方后有气，就可以下。",
    ["suicide", "capture"],
    [
      frame(
        suicideStones,
        "black",
        "错误：黑棋下在中央没有气，也提不掉白子，属于禁入点。",
      ),
      frame(
        koStones,
        "black",
        "正确：黑棋下（4，3）虽先碰到白子，却提掉中央白子，落子后有气。",
        move(3, 2),
      ),
    ],
    [
      {
        id: "s1-suicide-choice",
        prompt: "四周都是白子且提不掉任何白子，黑棋能下中央吗？",
        position: position(suicideStones),
        expected: choice("illegal"),
        choices: [
          { id: "legal", label: "能，先放上去再说" },
          { id: "illegal", label: "不能，这是真正无气的禁入点" },
        ],
        hints: [
          "下完要检查己方有没有气。",
          "四周白子仍有别的气。",
          "既没气也没提子。",
        ],
        success: "对，中央是无气且不提子的禁入点。",
        wrong: "这手不能提掉白子，黑棋落下后仍无气。",
      },
      {
        id: "s1-capture-exception",
        prompt: "黑棋落在（4，3）提掉中央白子，试走这手。",
        position: position(koStones),
        expected: move(3, 2),
        hints: [
          "先检查相邻白子是否只剩一口气。",
          "中央白子最后一口气在右侧。",
          "在（4，3）提子。",
        ],
        success: "合法！先提掉白子后，黑棋获得了（3，3）这口气。",
        wrong: "请占中央白子的最后一口气，才能触发提子例外。",
      },
      {
        id: "s1-suicide-explain",
        prompt: "为什么刚才那手看似无气却合法？",
        position: position(koStones),
        expected: choice("capture-first"),
        choices: [
          { id: "capture-first", label: "先提掉无气白子，再看己方有没有气" },
          { id: "ignore-liberties", label: "禁入点规则可以随意忽略" },
        ],
        hints: [
          "规则先处理对方无气棋块。",
          "提子会空出交叉点。",
          "再检查落子棋块的气。",
        ],
        success: "先提子再检查己方气；提子留下的空点使这手合法。",
        wrong: "不能忽略禁入点；只有提子后己方有气才合法。",
      },
    ],
  ),
  lesson(
    "s1-ko-threat",
    6,
    "劫与劫材",
    "理解立刻提回会重复棋形，并学会先去别处走。",
    "劫争里不能马上提回；先找别处值得回应的一手。",
    ["ko", "ko-threat", "capture"],
    [
      frame(
        koStones,
        "black",
        "正确：黑棋在（4，3）提掉一颗白子，形成劫。",
        move(3, 2),
      ),
      frame(
        koStones,
        "black",
        "错误：白棋立刻在（3，3）提回会重复刚才棋形；这一帧要结合上一步历史判断。",
        undefined,
        [STAGE_1_KO_CAPTURE],
      ),
      frame(
        koStones,
        "black",
        "正确：白棋下（2，2）把左上黑棋打吃；黑棋需要考虑救棋。",
        undefined,
        [STAGE_1_KO_CAPTURE, { x: 1, y: 1 }],
      ),
    ],
    [
      {
        id: "s1-make-ko",
        prompt: "黑棋在（4，3）提掉中央白子，形成劫。",
        position: position(koStones),
        expected: move(3, 2),
        hints: [
          "中央白子只剩右侧一口气。",
          "占那口气可提掉它。",
          "落在（4，3）。",
        ],
        success: "黑棋提了一子，留下白棋想提回的劫形。",
        wrong: "形成劫的提子点是（4，3）。",
      },
      {
        id: "s1-ko-recapture",
        prompt: "接着上一步，白棋能立刻在（3，3）提回吗？",
        position: position(koStones, "black", [STAGE_1_KO_CAPTURE]),
        expected: choice("must-wait"),
        choices: [
          { id: "recapture", label: "能立刻提回" },
          { id: "must-wait", label: "不能，先在别处下一手" },
        ],
        hints: [
          "想想提回后的棋形。",
          "它会回到刚才的棋形。",
          "规则禁止立即重复。",
        ],
        success: "立刻提回会重复前一棋形，白棋必须先走别处。",
        wrong: "这一步紧接着黑棋提子；立即提回会造成棋形重复。",
      },
      {
        id: "s1-ko-threat-move",
        prompt: "白棋暂时不能提回；在（2，2）下劫材，把左上黑棋打吃。",
        position: position(koStones, "black", [STAGE_1_KO_CAPTURE]),
        expected: move(1, 1),
        hints: [
          "劫材要在劫以外威胁对方。",
          "左上两颗黑子现在有两口气。",
          "占（2，2），让它们只剩一口气。",
        ],
        success: "白棋在（2，2）打吃左上黑棋；黑棋须考虑回应这手劫材。",
        wrong: "要下（2，2）威胁左上黑棋，随便走一手不算有力劫材。",
      },
    ],
  ),
  lesson(
    "s1-pass-ending",
    7,
    "停一手与终局",
    "会停一手，并知道连续两次停一手后进入数子。",
    "没有想下的地方可以停一手；双方连续停一手才开始数子。",
    ["pass", "dead-stones", "chinese-rules"],
    [
      frame(
        [["black", 2, 2]],
        "white",
        "正确：白棋停一手后轮到黑棋，棋局还没结束。",
        { kind: "pass" },
      ),
      frame(
        [["black", 2, 2]],
        "white",
        "错误：只停一手不能马上数子；黑棋也停一手才进入终局。",
        undefined,
        [{ pass: true }],
      ),
    ],
    [
      {
        id: "s1-pass-action",
        prompt: "白棋没有合适落点，请使用“停一手”。",
        position: position([["black", 2, 2]], "white"),
        expected: { kind: "pass" },
        hints: ["不落子也能交出回合。", "找到停一手按钮。", "选择停一手。"],
        success: "白棋停一手，轮到黑棋；此时对局仍在继续。",
        wrong: "这里要使用停一手操作，而不是在棋盘落子。",
      },
      {
        id: "s1-second-pass",
        prompt: "白棋刚停一手，黑棋也停一手后会怎样？",
        position: position([["black", 2, 2]], "white", [{ pass: true }]),
        expected: choice("score"),
        choices: [
          { id: "continue", label: "必须继续落子" },
          { id: "score", label: "连续两次停一手，进入数子" },
        ],
        hints: [
          "看的是连续停一手次数。",
          "白棋刚停过一次。",
          "黑棋也停，达到两次。",
        ],
        success: "双方连续停一手，棋局结束并进入数子。",
        wrong: "白棋已停过，黑棋再停便连续两次，要进入数子。",
      },
      {
        id: "s1-scoring-transition",
        prompt: "开始数子前，应先确认哪件事？",
        position: position(
          [
            ["black", 2, 2],
            ["white", 4, 4],
          ],
          "black",
          [{ pass: true }, { pass: true }],
        ),
        expected: choice("dead"),
        choices: [
          { id: "dead", label: "确认死子，再按中国规则数子" },
          { id: "only-captures", label: "只数提过的棋子" },
        ],
        hints: [
          "终局后先处理无望存活的棋。",
          "死子不作为活子计分。",
          "再数活子和围住的空点。",
        ],
        success: "先确认死子，再数活子和围住的空点，并给白棋加贴目。",
        wrong: "中国规则不只数提子；先确认死子，再数棋盘上的面积。",
      },
    ],
  ),
  {
    kind: "quiz",
    id: "s1-checkpoint",
    stageId: "stage-1",
    order: 8,
    boardSize: 5,
    title: "五路规则小考",
    objective: "独立判断落子、气、提子、禁入点和终局。",
    story: "不预先亮出答案；完成五题，答对四题即可过关。",
    terms: ["intersection", "liberty", "capture", "suicide", "pass"],
    demo: [],
    passingScore: 80,
    questions: (
      [
        {
          id: "s1-q-intersection",
          termId: "intersection",
          prompt: "空棋盘黑棋先行，请在正中央交叉点落子。",
          position: position(),
          expected: move(2, 2),
          hints: ["认清交叉点。", "找棋盘中央。", "横竖中央线相交。"],
          success: "中央交叉点落子正确。",
          wrong: "请重新寻找正中央的交叉点。",
        },
        {
          id: "s1-q-liberty",
          termId: "liberty",
          prompt: "黑子（2，2）右方被白子占住，还剩几口气？",
          position: position([
            ["black", 1, 1],
            ["white", 2, 1],
          ]),
          expected: choice("three"),
          choices: [
            { id: "two", label: "两口" },
            { id: "three", label: "三口" },
            { id: "four", label: "四口" },
          ],
          hints: ["只数直邻空点。", "白子占的点不能数。", "检查其余三个方向。"],
          success: "你准确数出了这颗黑子的气。",
          wrong: "请只检查上下左右相邻的空点。",
        },
        {
          id: "s1-q-capture",
          termId: "capture",
          prompt: "轮到黑棋，请提掉只剩一口气的中央白子。",
          position: position(atariStones),
          expected: move(3, 2),
          hints: ["先找白子的空邻点。", "提子需要占最后一口气。", "注意右边。"],
          success: "你占住最后一口气并提掉白子。",
          wrong: "这手没有占住白子的最后一口气。",
        },
        {
          id: "s1-q-suicide",
          termId: "suicide",
          prompt: "若落在中央后没有气，也提不掉白子，这手怎样？",
          position: position(suicideStones),
          expected: choice("illegal"),
          choices: [
            { id: "legal", label: "合法" },
            { id: "illegal", label: "禁入点，不能下" },
          ],
          hints: ["落子后要检查气。", "还要看有没有提子。", "两项都检查。"],
          success: "你识别出了真正的禁入点。",
          wrong: "这手没有气，也没有提子，请再判断。",
        },
        {
          id: "s1-q-pass",
          termId: "pass",
          prompt: "双方连续停一手后，该进入什么步骤？",
          position: position([["black", 2, 2]], "black", [
            { pass: true },
            { pass: true },
          ]),
          expected: choice("scoring"),
          choices: [
            { id: "scoring", label: "确认死子并数子" },
            { id: "keep-playing", label: "黑棋继续连下两手" },
          ],
          hints: ["留意连续停手次数。", "双方都交出了回合。", "想想终局流程。"],
          success: "连续两次停一手后进入终局数子。",
          wrong: "双方已连续停一手，请想想终局步骤。",
        },
      ] satisfies (ExerciseInput & { termId: QuizQuestion["termId"] })[]
    ).map(({ termId, ...input }) => ({ ...exercise(input, 0), termId })),
  },
];
