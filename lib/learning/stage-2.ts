import type { Color, Move, StoneSetup } from "@/lib/go/types";
import type { DemoFrame, Exercise, LessonAction, LessonUnit, PositionSpec, QuizQuestion, QuizUnit } from "@/lib/learning/types";

const pos = (stones: StoneSetup[], toPlay: Color = "black", setupMoves?: Move[]): PositionSpec => ({size:7, stones, toPlay, ...(setupMoves ? {setupMoves} : {})});
const move = (x: number, y: number): LessonAction => ({kind:"move",point:{x,y}});
const choice = (choiceId: string): LessonAction => ({kind:"choice",choiceId});
const select = (x: number, y: number): LessonAction => ({kind:"select-group",point:{x,y}});
const continued = (position: PositionSpec, ...moves: Move[]): PositionSpec => ({...position, setupMoves:[...(position.setupMoves ?? []),...moves]});
const frame = (position: PositionSpec, caption: string, action?: LessonAction): DemoFrame => ({stones:position.stones,toPlay:position.toPlay, ...(position.setupMoves ? {setupMoves:position.setupMoves} : {}),caption,...(action ? {move:action} : {})});
type Input = Pick<Exercise,"id"|"prompt"|"position"|"expected"|"choices"|"success"> & {hints:[string,string,string];wrong:string};
const exercise = (input: Input, initialHintLevel: 0|1|2): Exercise => ({
  id:input.id,prompt:input.prompt,position:input.position,expected:input.expected,
  ...(input.choices ? {choices:input.choices} : {}),initialHintLevel,
  hints:input.hints.map((text,index)=>({level:(index+1) as 1|2|3,text})) as Exercise["hints"],
  success:input.success,
  errors:{wrong_answer:input.wrong,occupied:"这里已有棋子，请找空交叉点。",suicide:"此处落子后无气且不能提子，是禁入点。",ko:"这手会重复之前的棋形，请先走别处。",out_of_bounds:"请在七路棋盘内操作。",finished:"棋局已经终局。"},
});
const lesson = (id:LessonUnit["id"],order:number,title:string,objective:string,story:string,terms:LessonUnit["terms"],demo:DemoFrame[],inputs:[Input,Input,Input]):LessonUnit => ({
  kind:"lesson",id,stageId:"stage-2",order,boardSize:7,title,objective,story,terms,demo,
  exercises:inputs.map((input,index)=>exercise(input,(2-index) as 0|1|2)),
});

const connect = pos([["black",1,2],["black",3,2]]);
const cut = pos(connect.stones,"white");
const diagonal = pos([["black",1,1],["black",2,2],["white",0,1]],"black");
const ladder = pos([["white",2,2],["black",1,2],["black",2,1],["black",1,3],["black",1,4],["black",1,5]]);
const ladder1 = continued(ladder,{x:3,y:2});
const ladder2 = continued(ladder1,{x:2,y:3});
const ladder3 = continued(ladder2,{x:3,y:3});
const ladder4 = continued(ladder3,{x:2,y:4});
const ladder5 = continued(ladder4,{x:3,y:4});
const ladderHelper = pos([...ladder.stones,["white",2,5]]);
const ladderHelped = continued(ladderHelper,{x:3,y:2},{x:2,y:3},{x:3,y:3},{x:2,y:4});
const net = pos([["white",3,3],["black",2,3],["black",3,2],["black",4,2],["black",5,3],["black",2,4],["black",3,5]]);
const netAfter = continued(net,{x:4,y:4});
const netRightEscape = continued(netAfter,{x:4,y:3});
const netRightCaptured = continued(netRightEscape,{x:3,y:4});
const snapback = pos([["white",1,1],["white",1,2],["white",0,3],["white",0,4],["black",0,0],["black",1,0],["black",2,1],["black",2,2],["black",1,3]]);
const snapSacrifice = continued(snapback,{x:0,y:2});
const snapCaptured = continued(snapSacrifice,{x:0,y:1});
const snapRecaptured = continued(snapCaptured,{x:0,y:2});
const snapWrongBlack = continued(snapback,{x:0,y:1});
const snapWrongWhite = continued(snapWrongBlack,{x:0,y:2});
const eyeRing:StoneSetup[] = [["black",3,2],["black",2,3],["black",4,3],["black",3,4]];
const trueEye = pos([...eyeRing,["black",2,2],["black",2,4],["black",4,2],["black",4,4]],"white");
const falseEye = pos([...eyeRing,["white",2,2],["white",4,4],["black",2,4],["black",4,2]],"white");
const twoEyeBlack:StoneSetup[] = [1,2,3,4,5].flatMap((x):StoneSetup[]=>[["black",x,1],["black",x,3]]).concat([["black",1,2],["black",3,2],["black",5,2]]);
const twoEyeWhite:StoneSetup[] = [1,2,3,4,5].flatMap((x):StoneSetup[]=>[["white",x,0],["white",x,4]]).concat([1,2,3].flatMap((y):StoneSetup[]=>[["white",0,y],["white",6,y]]));
const twoEyes = pos([...twoEyeBlack,...twoEyeWhite],"white");
const oneSpace = pos([...[1,2,3,4,5].flatMap((x):StoneSetup[]=>[["black",x,1],["black",x,4]]),...[2,3].flatMap((y):StoneSetup[]=>[["black",1,y],["black",5,y]])],"white");
const dead = pos([["white",2,2],["black",1,2],["black",2,1],["black",3,2],["black",1,3],["black",3,3],["black",2,4]]);
// The enclosed black and white groups have only (1,0) and (1,1) as liberties.
// The surrounding white group has two separate eyes, so it cannot be removed
// to create a preparatory escape route for either enclosed group.
const seki = pos([
  ["black",0,0],["black",0,1],["black",0,2],["black",1,2],
  ["black",2,2],["black",3,2],["black",3,1],["black",3,0],
  ["white",2,0],["white",2,1],
  ...[0,1,2,3,4].map((x):StoneSetup=>["white",x,3]),
  ...[0,1,2,3,4].map((x):StoneSetup=>["white",x,4]),
  ...[0,2,4].map((x):StoneSetup=>["white",x,5]),
  ...[0,1,2,3,4].map((x):StoneSetup=>["white",x,6]),
  ["white",4,0],["white",4,1],["white",4,2],
]);

export const STAGE_2_SHAPES = {connect,cut,diagonal,ladder,ladderHelper,net,snapback,trueEye,falseEye,twoEyes,oneSpace,dead,seki} as const;

export const STAGE_2_UNITS:(LessonUnit|QuizUnit)[] = [
  lesson("s2-connect-cut",1,"连接与切断","识别直邻连接，抢占断点。","两子斜着相望仍各自成组；双方都能争中间的断点。",["connect","cut"],[
    frame(connect,"正确：黑棋在（3，3）连接两子。",move(2,2)),
    frame(diagonal,"反例：斜对角接触不是连接；白棋仍可能从旁切断。"),
  ],[
    {id:"s2-connect-move",prompt:"黑棋在两颗同伴之间，落在哪里才能直线连成一组？",position:connect,expected:move(2,2),hints:["连接要上下左右相邻。","找两颗黑子之间的空点。","落在（3，3）。"],success:"中间落子后，三颗黑子沿线相连。",wrong:"斜着靠近不能连接；找两子之间的空交叉点。"},
    {id:"s2-cut-move",prompt:"轮到白棋，抢占两颗黑子之间的断点。",position:cut,expected:move(2,2),hints:["先找黑棋的连接点。","白棋先占中间，黑棋便不能直接接上。","切点是（3，3）。"],success:"白棋占了断点，两颗黑子仍是不同组。",wrong:"白棋要占住真正的连接点，才能切开两组。"},
    {id:"s2-diagonal-choice",prompt:"（2，2）与（3，3）两颗黑子只有斜角接触，算同一组吗？",position:diagonal,expected:choice("separate"),choices:[{id:"connected",label:"已连接成一组"},{id:"separate",label:"仍是两组"}],hints:["棋子只能沿横竖线连接。","斜角不共享边。","因此两颗黑子仍分开。"],success:"斜角不连通，两颗黑子仍是不同组。",wrong:"请只沿横竖方向追踪连接。"},
  ]),
  lesson("s2-ladder",2,"征子","逐手读取连续打吃，并留意征子路上的接应子。","征子要看数手后的方向；前方有白棋接应，追赶可能落空。",["ladder","atari"],[
    frame(ladder,"正确：黑棋先在右侧打吃。",move(3,2)),
    frame(ladder1,"白棋只得向下延。",move(2,3)),
    frame(ladder2,"黑棋继续从右侧打吃。",move(3,3)),
    frame(ladder3,"白棋再次向下延。",move(2,4)),
    frame(ladder4,"黑棋仍沿同一方向追打。",move(3,4)),
    frame(ladder5,"白棋再次被打吃；继续追之前还要看前方棋子。"),
    frame(ladderHelped,"反例：另一条变化里白棋连到（3，6）的接应子，黑棋不能照搬原来的征子。"),
  ],[
    {id:"s2-ladder-atari",prompt:"黑棋先从哪一点打吃（3，3）的白子？",position:ladder,expected:move(3,2),hints:["白子只剩右与下的空点。","先堵右边，逼白棋向下。","下在（4，3）。"],success:"黑棋从右侧打吃，白棋只能沿预定方向逃。",wrong:"此手没有形成眼前的打吃；请先数白子的气。"},
    {id:"s2-ladder-repeat",prompt:"白棋向（3，4）延出后，黑棋怎样继续打吃？",position:ladder2,expected:move(3,3),hints:["看延出后白棋的空邻点。","继续封右侧。","下在（4，4）。"],success:"黑棋再次打吃，征子继续向下。",wrong:"请沿着白棋逃跑的方向继续封气。"},
    {id:"s2-ladder-helper",prompt:"前方（3，6）已有白棋接应；白棋此时怎样向接应子靠拢？",position:continued(ladderHelper,{x:3,y:2},{x:2,y:3},{x:3,y:3}),expected:move(2,4),hints:["先看白棋的最后一口气。","沿（3，5）延下去可连接接应子。","下在（3，5）。"],success:"白棋连到前方同伴，原先的追吃路线不能照搬。",wrong:"向前方接应子延出，才能改变征子的结果。"},
  ]),
  lesson("s2-net",3,"枷吃","用松围限制逃路，区分枷吃与立即打吃。","枷吃先布网，猎物看似有两口气，逃一边就封另一边。",["net","atari"],[
    frame(net,"正确：黑棋在（5，5）布下松围，仍未立即打吃。",move(4,4)),
    frame(netAfter,"白棋误以为右侧有气便能逃，试着在（5，4）延出。",move(4,3)),
    frame(netRightEscape,"反例：白棋虽向右延出，整组却只剩（4，5）一口气；黑棋可收网。",move(3,4)),
    frame(netRightCaptured,"黑棋封住最后一口气，实际提掉了两颗白子。"),
  ],[
    {id:"s2-net-place",prompt:"黑棋下一手枷吃中央白子，留两口气却限制两条逃路。",position:net,expected:move(4,4),hints:["不必贴身打吃。","找能同时照看右、下出口的点。","下在（5，5）。"],success:"黑棋布网后，白棋两个局部出口都可被下一手封住。",wrong:"枷吃靠松围控制逃路，请找右下方的关键点。"},
    {id:"s2-net-close-right",prompt:"白棋从（5，4）右逃后，黑棋从哪里收网提子？",position:continued(netAfter,{x:4,y:3}),expected:move(3,4),hints:["白棋右逃后只剩一口气。","剩余空点在下方。","下在（4，5）。"],success:"黑棋封住最后一口气，提掉逃出的白棋。",wrong:"数白棋这组的气，再封最后一口。"},
    {id:"s2-net-close-down",prompt:"白棋从（4，5）下逃后，黑棋从哪里收网提子？",position:continued(netAfter,{x:3,y:4}),expected:move(4,3),hints:["白棋下逃后只剩一口气。","剩余空点在右方。","下在（5，4）。"],success:"黑棋从另一侧收网，也提掉了白棋。",wrong:"白棋已经在下方，找它唯一剩余的右侧空点。"},
  ]),
  lesson("s2-snapback",4,"倒扑","先弃一子，再从原处提回更多棋子。","故意让一颗黑子被提，看清白棋补上后全组只剩原处一口气。",["snapback","capture"],[
    frame(snapback,"正确：黑棋先投入（1，3），准备弃一子。",move(0,2)),
    frame(snapSacrifice,"白棋在（1，2）提掉那颗黑子。",move(0,1)),
    frame(snapCaptured,"黑棋回到（1，3），一次提掉三颗白子。",move(0,2)),
    frame(snapRecaptured,"正确结果：黑棋先失一子，再从原点反提三颗白子。"),
    frame(snapback,"反例：若黑棋先在（1，2）直接收气，就错过了弃子次序。",move(0,1)),
    frame(snapWrongBlack,"白棋可在（1，3）延出，连到（1，4）的白子。",move(0,2)),
    frame(snapWrongWhite,"白棋已连出并仍有气；（1，3）也被占住，黑棋无法在这里反提三子。"),
  ],[
    {id:"s2-snapback-sacrifice",prompt:"黑棋先在哪里弃一子，准备倒扑？",position:snapback,expected:move(0,2),hints:["找白棋两子旁边的边线空点。","先让黑子只剩一口气。","下在（1，3）。"],success:"这颗黑子是有意投入的弃子，白棋提后可反提。",wrong:"倒扑第一手是主动投入一子，不是马上提白棋。"},
    {id:"s2-snapback-capture",prompt:"黑棋已弃在（1，3）；白棋怎样提掉这颗黑子？",position:snapSacrifice,expected:move(0,1),hints:["找黑子最后一口气。","在它上方的边线点。","下在（1，2）。"],success:"白棋提掉一颗黑子，但白棋全组只剩原处一口气。",wrong:"请占黑子唯一剩下的上方空点。"},
    {id:"s2-snapback-recapture",prompt:"白棋刚提一子；黑棋从哪里反提三颗白子？",position:snapCaptured,expected:move(0,2),hints:["查看白棋整组的最后一口气。","正是刚才被提走的黑子位置。","回到（1，3）。"],success:"黑棋反提三颗白子；倒扑靠完整两手计算。",wrong:"看白棋三子共同的最后一口气。"},
  ]),
  lesson("s2-real-false-eyes",5,"真眼与假眼","比较外形相似的空点和对角破绽。","空点上下左右围着同色棋还不够；对角也会影响眼的可靠性。",["eye","true-eye","false-eye"],[
    frame(trueEye,"正确：四面和关键对角都由黑棋控制，中间是真眼。"),
    frame(falseEye,"反例：形状相似，但两个白棋对角破坏连接，是假眼。"),
  ],[
    {id:"s2-true-eye-choice",prompt:"观察（4，4），四邻和对角受黑棋保护，这是哪种眼？",position:trueEye,expected:choice("true"),choices:[{id:"true",label:"真眼"},{id:"false",label:"假眼"}],hints:["先看四个直邻。","再检查对角有没有敌子破坏。","周围黑棋能稳定守住空点。"],success:"这是受保护的真眼，白棋不能随意占入。",wrong:"请结合直邻与对角判断眼是否牢靠。"},
    {id:"s2-false-eye-choice",prompt:"同样的（4，4）空点，两个对角已有白棋，这是哪种眼？",position:falseEye,expected:choice("false"),choices:[{id:"true",label:"真眼"},{id:"false",label:"假眼"}],hints:["外形相似未必是真眼。","注意（3，3）和（5，5）的白棋。","对角破绽使黑棋不能把它当成稳定眼。"],success:"你识别了对角破绽；这是假眼示意，不能当作稳定眼。",wrong:"四邻围空只是第一步，请检查对角敌子。"},
    {id:"s2-eye-select",prompt:"点选围着（4，4）这个真眼的黑棋一子。",position:trueEye,expected:select(3,2),hints:["眼属于周围围住它的棋。","找（4，4）正上方的黑子。","点（4，3）。"],success:"你选中了保护真眼的黑棋。",wrong:"请点选真眼直邻的黑棋一子。"},
  ]),
  lesson("s2-two-eyes",6,"两眼活棋","确认两个独立的眼，并警惕一块大空尚未分成两眼。","两个分开的安全空点能让一组棋稳定存活；一块大空还需读变化。",["alive","true-eye","eye"],[
    frame(twoEyes,"正确：黑棋一组有（3，3）和（5，3）两个独立真眼。"),
    frame(oneSpace,"反例：一个连通的大空区，不自动等于两个独立眼。"),
  ],[
    {id:"s2-two-eyes-select",prompt:"点选拥有两个独立眼的黑棋一子。",position:twoEyes,expected:select(3,2),hints:["看两个分开的空点。","两眼都被同一组黑棋围住。","点（4，3）的黑子。"],success:"这组黑棋有两个独立眼，可以稳定存活。",wrong:"请选择围住两处独立眼的黑棋。"},
    {id:"s2-one-space-choice",prompt:"黑棋内部只有一块连通的大空，能只凭外形就断定是两眼吗？",position:oneSpace,expected:choice("not-yet"),choices:[{id:"alive",label:"已经确定有两眼"},{id:"not-yet",label:"还要读能否分成两眼"}],hints:["大空点数多不等于眼数多。","要检查能否分隔成两个独立眼。","目前不能只凭外形判活。"],success:"一块大空不能自动算两眼；要继续判断分眼可能。",wrong:"请数独立的眼，而非只数内部空点。"},
    {id:"s2-two-eyes-choice",prompt:"白棋从任意一个眼点落子都无气且不能提黑棋；这组黑棋的状态是？",position:twoEyes,expected:choice("alive"),choices:[{id:"alive",label:"两眼活棋"},{id:"dead",label:"死棋"}],hints:["白棋无法同时占两个眼。","单占一个眼是禁入点。","两个独立真眼支持活棋。"],success:"两个独立真眼使这组黑棋稳定存活。",wrong:"这组黑棋保有两处独立眼，请检查白棋能否占入。"},
  ]),
  lesson("s2-dead-seki",7,"死棋与双活","区分可被提净的死棋与共用气的双活。","双活双方都有不宜先填的公气；终局不能把双活棋误标成死子。",["dead","seki","alive"],[
    frame(dead,"正确：黑棋下在（3，4）可提掉被围白子。",move(2,3)),
    frame(seki,"反例：角上黑白两组共用（2，1）与（2，2）两口气，先填一口会被对方提掉。"),
  ],[
    {id:"s2-dead-capture",prompt:"黑棋占哪一口气能提掉中央白子？",position:dead,expected:move(2,3),hints:["白子只剩一口气。","看它正下方。","下在（3，4）。"],success:"黑棋提掉了已无逃路的白子。",wrong:"请占住中央白子唯一的空邻点。"},
    {id:"s2-seki-choice",prompt:"角上两组共用两口气，谁先填一口就会被对方提掉；应怎样判断？",position:seki,expected:choice("seki"),choices:[{id:"dead",label:"黑棋是死棋"},{id:"seki",label:"双方双活"}],hints:["双方都依赖两口公气。","先填一口后，对手可填另一口提子。","双方都不先填，形成双活。"],success:"这是双活；双方暂不填公气，不能把黑棋标死。",wrong:"请试读双方谁先填公气会怎样。"},
    {id:"s2-seki-select",prompt:"点选角上双活的黑棋一子；这组棋不能标为死子。",position:seki,expected:select(0,0),hints:["找左上角的黑棋组。","它与右侧白棋共用两口公气。","点（1，1）。"],success:"你选中了双活黑棋；终局时不要误标死子。",wrong:"请选择左上角依靠公气双活的黑棋。"},
  ]),
  {kind:"quiz",id:"s2-checkpoint",stageId:"stage-2",order:8,boardSize:7,title:"七路战术小考",objective:"独立处理连接、征子、枷吃、倒扑与死活。",story:"五题答对四题过关，尝试先完整读棋。",terms:["cut","ladder","net","snapback","seki"],demo:[],passingScore:80,
    questions:([
      {id:"s2-q-cut",termId:"cut",prompt:"白棋抢先切断两颗黑子，应落在哪里？",position:cut,expected:move(2,2),hints:["找连接点。","白棋先占可切断。","中点（3，3）。"],success:"你抢占了连接点。",wrong:"找两颗黑子之间的空点。"},
      {id:"s2-q-ladder",termId:"ladder",prompt:"白棋沿征子向下延出后，黑棋继续从哪边打吃？",position:ladder2,expected:move(3,3),hints:["读白棋两口气。","沿追击方向封右侧。","下（4，4）。"],success:"征子追击方向正确。",wrong:"继续数气，找能打吃的一手。"},
      {id:"s2-q-net",termId:"net",prompt:"黑棋怎样布网限制白棋两条逃路？",position:net,expected:move(4,4),hints:["不用紧贴白棋。","照看右下两个出口。","下（5，5）。"],success:"你布成了枷吃。",wrong:"找松围的关键点。"},
      {id:"s2-q-snapback",termId:"snapback",prompt:"白棋刚提掉弃子，黑棋如何反提三子？",position:snapCaptured,expected:move(0,2),hints:["找白棋最后一口气。","回到弃子原处。","下（1，3）。"],success:"你完成了倒扑反提。",wrong:"看三颗白子共有的最后一口气。"},
      {id:"s2-q-seki",termId:"seki",prompt:"双方共用两口气，先填的一方反被提；选择正确状态。",position:seki,expected:choice("seki"),choices:[{id:"dead",label:"黑棋是死棋"},{id:"seki",label:"双方双活"}],hints:["读先填一口的后果。","另一方可填最后一口。","两组双活。"],success:"你正确识别双活。",wrong:"不要把共用气的双活棋误判为死棋。"},
    ] satisfies (Input & {termId:QuizQuestion["termId"]})[]).map(({termId,...input})=>({...exercise(input,0),termId})),
  },
];
