import type { LearningAssists } from "@/lib/learning/progress";

const SETTINGS: [keyof LearningAssists,string][] = [
  ["showLiberties","显示气数"],["showAtari","标记打吃"],["showCoordinates","显示坐标"],
  ["explainMoves","播放落子解释"],["autoOpenTerms","自动打开术语"],
];
export function LearningAssistPanel({assists,isQuiz=false,onChange}: {
  assists:LearningAssists; isQuiz?:boolean; onChange(key:keyof LearningAssists,value:boolean):void;
}) {
  return <details className="panel learning-assists"><summary>学习辅助</summary>
    {isQuiz ? <p>测验期间暂停辅助，保留你的设置。</p> : <p>独立开关，随时调整。落子解释同时显示文字。</p>}
    <div className="assist-options">{SETTINGS.map(([key,label])=><label key={key}>
      <input type="checkbox" data-assist={key} checked={assists[key]} disabled={isQuiz} onChange={event=>onChange(key,event.target.checked)}/>{label}
    </label>)}</div>
  </details>;
}
