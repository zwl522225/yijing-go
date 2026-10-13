"use client";

import { ControlPanel } from "@/components/game/control-panel";
import { GoBoard } from "@/components/game/go-board";
import { InkScene } from "@/components/game/ink-scene";
import { MusicPlayer } from "@/components/game/music-player";
import { ResultDialog } from "@/components/game/result-dialog";
import { LearningRoadmap } from "@/components/learning/learning-roadmap";
import { LessonPanel } from "@/components/learning/lesson-panel";
import { LearningAssistPanel } from "@/components/learning/learning-assist-panel";
import { PracticeDialog } from "@/components/learning/practice-picker";
import { ReviewPanel } from "@/components/game/review-panel";
import { GlossaryDialog } from "@/components/learning/glossary-dialog";
import { getRecommendedUnit, isGraduated } from "@/lib/learning/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useGoGame } from "@/hooks/use-go-game";
import { useSoundscape } from "@/hooks/use-soundscape";
import { useWebMcp } from "@/hooks/use-webmcp";

export function GameApp() {
  const soundscape = useSoundscape();
  const game = useGoGame({
    volume: soundscape.volume,
    category: soundscape.category,
    restore(volume, category) {
      soundscape.setVolume(volume);
      soundscape.setCategory(category);
    },
  });
  useWebMcp(game, soundscape);

  const isLesson = game.mode === "lesson";
  const boardTitle = game.reviewing ? "逐手复盘 · 第 "+game.reviewIndex+" 手" : isLesson
    ? game.learningSession.unit.title
    : game.mode === "scoring"
      ? game.scorePhase === "dead-stones" ? "终局 · 确认死子" : game.scorePhase === "score-review" ? "终局 · 核对计分" : "终局 · 已确认"
      : `弈境对局 · 第 ${game.matchState.moves.length + 1} 手`;
  const boardPrompt = game.reviewing ? "只读查看，可用方向键浏览棋盘；退出复盘后返回原局面" : isLesson
    ? game.learningSession.session.completed ? "本课已完成，选择推荐课程继续学习" : game.learningSession.session.exercise?.prompt ?? game.learningSession.unit.objective
    : game.mode === "scoring"
      ? game.scorePhase === "dead-stones" ? "在终局窗口点选棋块，然后确认死子" : game.scorePhase === "score-review" ? "在终局窗口核对分数，再确认最终计分" : "本局已结束，可以返回学堂继续学习"
      : game.aiThinking
        ? "观棋不语，静候电脑落子"
        : "你执黑棋，点击交叉点落子";

  return (
    <main className="game-page">
      <InkScene />
      <header className="site-header">
        <a className="brand" href="#game" aria-label="弈境新手围棋首页">
          <span className="brand-mark">弈</span>
          <span><strong>弈境</strong><small>新手围棋</small></span>
        </a>
        <p>棋如江湖，先看清每一口气。</p>
        <div className="header-stats" aria-label="当前对局信息">
          <span>{game.reviewing ? `回看第 ${game.reviewIndex} 手` : `第 ${game.state.moves.length + 1} 手`}</span><span>{game.state.size} × {game.state.size}</span>
          <button type="button" className="dictionary-button" data-action="open-practice" disabled={game.glossaryBlocked} onClick={game.openPractice}>专项练习</button>
          <button type="button" className="dictionary-button" disabled={game.glossaryBlocked} onClick={game.openDictionary}>{game.glossaryBlocked ? "完成测验后查词" : "术语词典"}</button>
        </div>
      </header>

      <section className={`game-shell${isLesson ? " academy-layout" : ""}`} id="game">
        <GoBoard
          key={`${game.state.size}-${isLesson ? game.learningSession.session.unitId : "match"}`}
          state={game.state}
          assists={game.learningProgress.assists}
          isQuiz={game.glossaryBlocked}
          mode={game.mode}
          title={boardTitle}
          eyebrow={isLesson ? "新手学堂 · 动手练习" : "人机对局 · 中国规则"}
          prompt={boardPrompt}
          hints={isLesson ? game.learningSession.visibleHints.flatMap(hint => hint.points ?? []) : []}
          deadStones={isLesson || game.reviewing ? new Set() : game.deadStones}
          readOnly={game.reviewing}
          previewPoint={game.previewPoint}
          selectedPoints={isLesson && game.learningSession.selectedDeadStone ? [game.learningSession.selectedDeadStone] : []}
          aiThinking={!isLesson && game.aiThinking}
          onPlay={(point) => { void game.selectPoint(point); }}
          onToggleDead={game.toggleDeadStone}
        />

        <aside className="game-sidebar" aria-label="棋局控制">
          <section className="panel move-confirm-panel" aria-label="落子操作设置">
            <label><input type="checkbox" data-setting="confirm-moves" checked={game.confirmMoves} onChange={event=>game.setConfirmMoves(event.target.checked)}/> 确认落子</label>
            <p>先选落点，再确认；取消后可重新选择。</p>
            {game.previewPoint ? <div className="move-confirm-controls" role="status"><span>待落在（{game.previewPoint.x+1}，{game.previewPoint.y+1}）</span><button type="button" data-action="confirm-move" onClick={()=>{void game.confirmMove();}}>确认落子</button><button type="button" data-action="cancel-move" onClick={game.cancelMove}>取消</button></div> : null}
          </section>
          {!isLesson && !game.reviewing && game.matchState.past.length ? <button type="button" className="dictionary-button review-entry" data-action="start-review" disabled={game.aiThinking} onClick={game.startReview}>逐手复盘</button> : null}
          {game.reviewing ? <ReviewPanel index={game.reviewIndex} total={game.reviewTotal} moments={game.reviewMoments} progress={game.learningProgress} onSeek={game.seekReview} onExit={game.endReview} onStartLesson={id=>{game.startUnit(id);}} onOpenTerm={game.openTerm}/> : null}
          <LearningAssistPanel assists={game.learningProgress.assists} isQuiz={game.glossaryBlocked} onChange={game.setLearningAssist}/>
          {game.moveExplanation ? <p className="panel move-explanation" role="status" aria-live="polite">{game.moveExplanation}</p> : null}
          <Tabs
            value={isLesson ? "lesson" : "play"}
            onValueChange={(value) => {
              if (value === "lesson") game.startUnit(getRecommendedUnit(game.learningProgress) ?? game.learningSession.unit.id);
              else game.startPlay();
            }}
            className="mode-tabs"
          >
            <TabsList className="mode-tabs-list" aria-label="游戏模式">
              <TabsTrigger value="play">人机对局</TabsTrigger>
              <TabsTrigger value="lesson">新手学堂</TabsTrigger>
            </TabsList>
            <TabsContent value="lesson">
              <LessonPanel learning={game.learningSession} graduated={isGraduated(game.learningProgress)} onOpenTerm={game.openTerm} onStartGraduation={() => game.startNewGame(9)} />
              <LearningRoadmap progress={game.learningProgress} currentUnitId={game.learningSession.unit.id} onSelectUnit={game.startUnit} />
            </TabsContent>
            <TabsContent value="play">
              {!game.reviewing ? <ControlPanel game={game} /> : null}
            </TabsContent>
          </Tabs>

          <MusicPlayer soundscape={soundscape} />
        </aside>
      </section>

      <footer className="site-footer"><span className="seal">弈境</span><p>静心落子，慢慢变强。</p></footer>

      <ResultDialog
        open={game.mode === "scoring" && !game.reviewing}
        state={game.matchState}
        deadStones={game.deadStones}
        outcome={game.outcome}
        phase={game.scorePhase}
        graduated={isGraduated(game.learningProgress)}
        onConfirmDead={game.confirmDeadStones}
        onConfirmScore={game.confirmFinalScore}
        onReturnAcademy={() => game.startUnit(getRecommendedUnit(game.learningProgress) ?? "s3-graduation")}
        onToggleDead={game.toggleDeadStone}
        onNewGame={game.newGame}
        onReview={game.startReview}
      />
      <PracticeDialog open={game.practiceOpen} progress={game.learningProgress} onClose={game.closePractice}/>
      <Toaster position="top-center" />
      <GlossaryDialog open={game.glossaryOpen} termId={game.glossaryTermId} progress={game.learningProgress}
        onClose={game.closeGlossary} onOpenTerm={game.openTerm} onDictionary={game.openDictionary} onPractice={game.recordTermPractice}
        onStartLesson={id=>{game.startUnit(id);}}/>
    </main>
  );
}
