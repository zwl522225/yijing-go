import type { Move } from "@/lib/go/types";
import { STAGE_2_SHAPES, STAGE_2_UNITS } from "@/lib/learning/stage-2";
import type { DemoFrame, Exercise, GlossaryEntry, LessonAction, PositionSpec } from "@/lib/learning/types";

const move = (x:number,y:number):LessonAction => ({kind:"move",point:{x,y}});
const continued = (position:PositionSpec,...moves:Move[]):PositionSpec => ({...position,setupMoves:[...(position.setupMoves??[]),...moves]});
const frame = (position:PositionSpec,caption:string,action?:LessonAction):DemoFrame => ({stones:position.stones,toPlay:position.toPlay,...(position.setupMoves?{setupMoves:position.setupMoves}:{}),caption,...(action?{move:action}:{})});
const practice = (lessonId:string,exerciseId:string,termId:string):Exercise => {
  const unit = STAGE_2_UNITS.find((item)=>item.id===lessonId);
  if (!unit || unit.kind!=="lesson") throw new Error(`Missing glossary lesson ${lessonId}`);
  const item = unit.exercises.find((candidate)=>candidate.id===exerciseId);
  if (!item) throw new Error(`Missing glossary exercise ${exerciseId}`);
  return {...item,id:`s2-term-${termId}`};
};
type Entry = Omit<GlossaryEntry,"practice"> & {lessonExercise:[string,string]};
const entry = ({lessonExercise,...input}:Entry):GlossaryEntry => ({...input,practice:practice(lessonExercise[0],lessonExercise[1],input.id)});
const L = (id:string):DemoFrame[] => {
  const unit=STAGE_2_UNITS.find((item)=>item.id===id);
  if (!unit || unit.kind!=="lesson") throw new Error(`Missing glossary animation ${id}`);
  return unit.demo;
};

const cutAfter=continued(STAGE_2_SHAPES.cut,{x:2,y:2});
const trueBefore:PositionSpec={...STAGE_2_SHAPES.trueEye,stones:STAGE_2_SHAPES.trueEye.stones.filter((stone)=>!(stone[0]==="black"&&stone[1]===4&&stone[2]===4)),toPlay:"black"};
const trueAfter=continued(trueBefore,{x:4,y:4});
const falseBefore:PositionSpec={...STAGE_2_SHAPES.falseEye,stones:STAGE_2_SHAPES.falseEye.stones.filter((stone)=>!(stone[0]==="white"&&stone[1]===4&&stone[2]===4)),toPlay:"white"};
const falseAfter=continued(falseBefore,{x:4,y:4});
const aliveBefore:PositionSpec={...STAGE_2_SHAPES.twoEyes,stones:STAGE_2_SHAPES.twoEyes.stones.filter((stone)=>!(stone[0]==="black"&&stone[1]===3&&stone[2]===2)),toPlay:"black"};
const aliveAfter=continued(aliveBefore,{x:3,y:2});
const deadAfter=continued(STAGE_2_SHAPES.dead,{x:2,y:3});
const sekiFirst=continued(STAGE_2_SHAPES.seki,{x:1,y:0});
const sekiReply=continued(sekiFirst,{x:1,y:1});

export const STAGE_2_TERMS:GlossaryEntry[] = [
  entry({id:"cut",name:"切断",aliases:["断","断点"],plain:"抢占两块棋之间的连接点，让对方无法沿直线接成一组。",formal:"在敌方分离棋组的联络点落子，使两组仍不沿横竖相邻而连通。",misconception:"误以为斜角相碰已经连接，就会漏看中间的切断点。",lessonIds:["s2-connect-cut"],relatedTermIds:["connect","group"],animation:{position:STAGE_2_SHAPES.cut,frames:[frame(STAGE_2_SHAPES.cut,"白棋可先占中间断点。",move(2,2)),frame(cutAfter,"白棋落下后，两颗黑子仍是不同组。")]},lessonExercise:["s2-connect-cut","s2-cut-move"]}),
  entry({id:"ladder",name:"征子",aliases:["征","征吃"],plain:"一方连续打吃，另一方连续逃，棋子沿一条方向被追赶。",formal:"攻击方交替封住被追棋组的一口气，使其每次延出后仍面临下一轮打吃；征子路上有接应子可改变结果。",misconception:"只看到第一手打吃就认定能提子，忽略前方同色接应棋。",lessonIds:["s2-ladder"],relatedTermIds:["atari","liberty"],animation:{position:STAGE_2_SHAPES.ladder,frames:L("s2-ladder")},lessonExercise:["s2-ladder","s2-ladder-repeat"]}),
  entry({id:"net",name:"枷吃",aliases:["枷","网吃"],plain:"像撒网一样松松围住，让对方从任一出口逃都被下一手封住。",formal:"攻击方不必立即打吃，而以远一线的着点限制目标棋组各条局部逃路，形成后续可提的网。",misconception:"误以为只有马上叫吃才算攻击；枷吃落下时猎物仍可能有两口气。",lessonIds:["s2-net"],relatedTermIds:["atari","capture"],animation:{position:STAGE_2_SHAPES.net,frames:L("s2-net")},lessonExercise:["s2-net","s2-net-place"]}),
  entry({id:"snapback",name:"倒扑",aliases:["打手返し","弃一提多"],plain:"先故意送掉一子，让对方提；再回到原处提走对方更多棋子。",formal:"以单子投入迫使对方在提子后形成一口气的多子棋组，随即在弃子原点反提该组。",misconception:"只计较先被提的一子，漏看下一手能反提三子。",lessonIds:["s2-snapback"],relatedTermIds:["capture","liberty"],animation:{position:STAGE_2_SHAPES.snapback,frames:L("s2-snapback")},lessonExercise:["s2-snapback","s2-snapback-recapture"]}),
  entry({id:"eye",name:"眼",aliases:["眼位","眼空"],plain:"一组棋围住、可用来维持气的内部空点；要看它是否可靠。",formal:"被同色棋组环绕的局部空点或空域，需结合对角与外部联络判定真眼或假眼。",misconception:"只看上下左右都被同色棋围住，就把每个空点都算作真眼。",lessonIds:["s2-real-false-eyes","s2-two-eyes"],relatedTermIds:["true-eye","false-eye"],animation:{position:falseBefore,frames:[frame(falseBefore,"一个空点看着像眼，但还要查对角。",move(4,4)),frame(falseAfter,"白棋占了第二个对角，破绽更明显；这是教学中的假眼形。")]},lessonExercise:["s2-real-false-eyes","s2-eye-select"]}),
  entry({id:"true-eye",name:"真眼",aliases:["实眼","牢靠的眼"],plain:"周围棋子能稳定保护的眼，对手不能直接占入来消灭它。",formal:"由连通且可靠的己方棋形保护的眼位，对手在不先破坏外围的情况下占入会自无气。",misconception:"以为只要直邻围满即可；还须排查对角敌子与外部断点。",lessonIds:["s2-real-false-eyes","s2-two-eyes"],relatedTermIds:["eye","false-eye","alive"],animation:{position:trueBefore,frames:[frame(trueBefore,"黑棋可补强最后一个对角。",move(4,4)),frame(trueAfter,"四个对角也受黑棋控制，（4，4）是真眼示意。")]},lessonExercise:["s2-real-false-eyes","s2-true-eye-choice"]}),
  entry({id:"false-eye",name:"假眼",aliases:["虚眼","破眼"],plain:"外形像眼，但对角或连接有破绽，不能稳定当作一只眼。",formal:"表面被己方棋子包围而缺乏可靠连接的眼形，敌方可借对角破绽逐步破坏。",misconception:"误把两颗白棋对角夹着的空点当成永久安全的真眼。",lessonIds:["s2-real-false-eyes"],relatedTermIds:["eye","true-eye","cut"],animation:{position:falseBefore,frames:[frame(falseBefore,"一个敌方对角已出现，先别急着数眼。",move(4,4)),frame(falseAfter,"第二个敌方对角出现，这个形状不能按稳定真眼计算。")]},lessonExercise:["s2-real-false-eyes","s2-false-eye-choice"]}),
  entry({id:"alive",name:"活棋",aliases:["活子","两眼活棋"],plain:"这组棋能稳定留在盘上；两个独立真眼是最容易认出的活形。",formal:"在双方正确应对下不会被强制提净的棋组；两处独立真眼构成无条件活棋的典型条件。",misconception:"把一个连通的大空当成两个独立眼，过早宣告整组已活。",lessonIds:["s2-two-eyes"],relatedTermIds:["true-eye","dead","seki"],animation:{position:aliveBefore,frames:[frame(aliveBefore,"内部三点连通，还没有分成两个独立眼。",move(3,2)),frame(aliveAfter,"黑棋补在中间，形成两个分开的眼点。")]},lessonExercise:["s2-two-eyes","s2-two-eyes-select"]}),
  entry({id:"dead",name:"死棋",aliases:["死子","无法存活的棋"],plain:"即使轮到自己走也无法摆脱被提的命运，终局确认后要移除。",formal:"在对方正确应对下不能建立活形且可被提净的棋组；不得把共用气双活误判为死棋。",misconception:"看见棋子没有两个眼就一概标死，会误删依靠公气的双活棋。",lessonIds:["s2-dead-seki"],relatedTermIds:["alive","seki","dead-stones"],animation:{position:STAGE_2_SHAPES.dead,frames:[frame(STAGE_2_SHAPES.dead,"白子只剩下方最后一口气。",move(2,3)),frame(deadAfter,"黑棋占气后，白子被实际提净。")]},lessonExercise:["s2-dead-seki","s2-dead-capture"]}),
  entry({id:"seki",name:"双活",aliases:["共活","公气双活"],plain:"黑白两组共用关键空点，谁先填就让对方提掉自己；双方都暂时活着。",formal:"相邻异色棋组依靠共享气相互制约，任一方先占一口公气会遭对方占余气提子，因而共存。",misconception:"见两组都没有两眼就把其中一组标成死棋；双活棋不能这样处理。",lessonIds:["s2-dead-seki"],relatedTermIds:["alive","dead","liberty"],animation:{position:STAGE_2_SHAPES.seki,frames:[frame(STAGE_2_SHAPES.seki,"两组共用（2，1）与（2，2）；黑先填一口会出事。",move(1,0)),frame(sekiFirst,"黑棋填（2，1）后，白棋可填另一口。",move(1,1)),frame(sekiReply,"白棋提掉角上黑组，说明原来应保留公气。")]},lessonExercise:["s2-dead-seki","s2-seki-choice"]}),
];
