"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { chooseMove, type Difficulty } from "@/lib/go/ai";
import aiWorkerUrl from "../lib/go/ai.worker.ts?worker&url";
import type { SoundscapeCategory } from "@/lib/audio/soundscapes";
import { createGame, passTurn, playMove, undoRound } from "@/lib/go/rules";
import { groupAt } from "@/lib/go/analysis";
import { getCoachRound } from "@/lib/go/coach";
import { isPointOnBoard } from "@/lib/learning/positions";
import { describeMove } from "@/lib/go/explain";
import { decodeSave, encodeSave, SAVE_KEY } from "@/lib/go/storage";
import type { BoardSize, GameState, Move, MoveError, MoveResult, Point } from "@/lib/go/types";
import type { AiWorkerRequest, AiWorkerResponse } from "@/lib/go/ai.worker";
import { advanceTermStatus, createDefaultProgress, getRecommendedUnit, isUnitUnlocked, recordGraduationEvent } from "@/lib/learning/progress";
import { createLessonResume, restoreLessonResume, type LessonResume } from "@/lib/learning/session-resume";
import type { ScorePhase } from "@/lib/go/storage";
import type { LearningAssists, LearningProgress } from "@/lib/learning/progress";
import { useLearningSession } from "@/hooks/use-learning-session";
import type { LessonUnitId, TermId, TermStatus } from "@/lib/learning/types";
import { GLOSSARY_BY_ID } from "@/lib/learning/glossary";
import { analyzeReview, type ReviewAnalysis } from "@/lib/go/review";
import type { LearningSession } from "@/hooks/use-learning-session";
import { CURRICULUM_BY_ID } from "@/lib/learning/curriculum";
import { createLearningBackup, parseLearningBackup } from "@/lib/learning/backup";
import { createLearningSession } from "@/lib/learning/session";
import type { SaveData } from "@/lib/go/storage";

export type GameMode = "play" | "lesson" | "scoring";

function learningBackupBlockedReason(hydrated: boolean, reviewing: boolean, previewing: boolean, mode: GameMode, quizActive: boolean, computerTurn: boolean): string | null {
  if (!hydrated) return "正在读取学习记录，请稍候。";
  if (reviewing) return "请先退出逐手复盘。";
  if (previewing) return "请先确认或取消待落子。";
  if (mode === "scoring") return "请完成终局确认并返回新手学堂。";
  if (mode === "lesson" && quizActive) return "请先完成当前测验。";
  if (mode === "play" && computerTurn) return "请等待电脑回合结束。";
  return null;
}

type AudioPreferences = {
  volume: number;
  category: SoundscapeCategory;
  restore(volume: number, category: SoundscapeCategory): void;
};

const AI_DELAYS: Record<Difficulty, number> = {
  beginner: 260,
  intermediate: 720,
  challenge: 1_550,
};

const moveErrorText: Record<MoveError, string> = {
  out_of_bounds: "落子位置超出了棋盘。",
  occupied: "这里已经有棋子了。",
  suicide: "这手棋落下后没有气，也没有提子。",
  ko: "这一手会让棋盘回到之前出现过的局面，请先在别处落子。",
  finished: "本局已经结束，请开始新局。",
};

async function workerMove(
  state: GameState,
  difficulty: Difficulty,
  workerRef: React.MutableRefObject<Worker | null>,
): Promise<Move> {
  if (typeof Worker === "undefined") return chooseMove(state, "beginner");

  return new Promise((resolve) => {
    const worker = new Worker(aiWorkerUrl, {
      type: "module",
    });
    workerRef.current = worker;
    const id = Date.now();
    let settled = false;

    const finish = (move: Move) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      resolve(move);
    };

    const timeout = setTimeout(
      () => finish(chooseMove(state, "beginner")),
      AI_DELAYS[difficulty],
    );

    worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
      if (event.data.id === id) finish(event.data.move);
    };
    worker.onerror = () => finish(chooseMove(state, "beginner"));
    const request: AiWorkerRequest = { id, state, difficulty };
    worker.postMessage(request);
  });
}

export function useGoGame(audio: AudioPreferences) {
  const [hydrated, setHydrated] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const lessonResumeRef = useRef<LessonResume | null>(null);
  const audioRef = useRef(audio);
  useEffect(() => { audioRef.current = audio; }, [audio]);
  const [firstVisit, setFirstVisit] = useState(false);
  const [confirmMoves, setConfirmMovesState] = useState(false);
  const confirmMovesRef = useRef(false);
  type Preview = {point:Point;state:GameState;session:LearningSession|null;generation:number;mode:GameMode};
  const [preview, setPreview] = useState<Preview|null>(null);
  const previewRef = useRef<Preview|null>(null);
  const clearPreview = useCallback(() => {previewRef.current=null;setPreview(null);},[]);
  type Review = {source:GameState;index:number;analysis:ReviewAnalysis};
  const [review, setReview] = useState<Review|null>(null);
  const reviewRef = useRef<Review|null>(null);
  const clearReview = useCallback(() => {reviewRef.current=null;setReview(null);},[]);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [mode, setModeState] = useState<GameMode>("lesson");
  const [moveExplanation,setMoveExplanation] = useState("");
  const speechActiveRef = useRef(false);
  const cancelExplanationSpeech = useCallback(() => {
    if(!speechActiveRef.current) return;
    speechActiveRef.current=false;
    try { if(typeof window !== "undefined") window.speechSynthesis?.cancel(); } catch { /* Text remains available. */ }
  },[]);
  const modeRef=useRef(mode);
  const setMode=useCallback((next:GameMode)=>{
    if(modeRef.current!==next) {clearPreview();clearReview();setPracticeOpen(false);setMoveExplanation("");cancelExplanationSpeech();}
    modeRef.current=next;setModeState(next);
  },[cancelExplanationSpeech,clearPreview,clearReview]);
  const [matchState, setMatchStateState] = useState<GameState>(() => createGame());
  const matchStateRef = useRef(matchState);
  const setMatchState = useCallback((value: GameState | ((current: GameState) => GameState)) => {
    const next = typeof value === "function" ? value(matchStateRef.current) : value;
    clearPreview();
    matchStateRef.current = next;
    setMatchStateState(next);
  }, [clearPreview]);
  const [difficulty, setDifficultyState] = useState<Difficulty>("beginner");
  const difficultyRef = useRef<Difficulty>("beginner");
  const [aiThinking, setAiThinking] = useState(false);
  const [learningProgress, setLearningProgress] = useState<LearningProgress>(createDefaultProgress);
  const learningProgressRef = useRef(learningProgress);
  const replaceLearningProgress = useCallback((next: LearningProgress) => {
    learningProgressRef.current = next;
    setLearningProgress(next);
  }, []);
  const recordExplanation = useCallback((text:string,isQuiz=false) => {
    if(isQuiz || !learningProgressRef.current.assists.explainMoves) return;
    setMoveExplanation(text);
    if(typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
    try {
      const utterance=new SpeechSynthesisUtterance(text);
      utterance.lang="zh-CN";
      window.speechSynthesis.speak(utterance);
      speechActiveRef.current=true;
    } catch { /* Unsupported or denied speech must never block a move. */ }
  },[]);
  const learningSession = useLearningSession({progress: learningProgress, onProgressChange: replaceLearningProgress, getProgress: () => learningProgressRef.current,
    isActive: () => modeRef.current === "lesson",
    onSessionChange(next) {
      if (CURRICULUM_BY_ID.get(next.unitId)?.kind !== "lesson") return;
      if (!next.completed) lessonResumeRef.current = createLessonResume(next);
      else if (lessonResumeRef.current?.unitId === next.unitId) lessonResumeRef.current = null;
    },
    onReset() {clearPreview();setPracticeOpen(false);setMoveExplanation("");cancelExplanationSpeech();},
    onAction(before,action,result) {
      const quiz=CURRICULUM_BY_ID.get(before.unitId)?.kind === "quiz";
      const text=result.completed && action.kind === "move"
        ? describeMove(before.state,action.point,{ok:true,state:result.nextState})
        : result.completed && action.kind === "pass"
          ? `${before.state.toPlay === "black" ? "黑棋" : "白棋"}停一手。${result.nextState.consecutivePasses >= 2 ? "双方已连续停手，进入终局确认。" : "交出回合，棋子仍留在棋盘上。"}`
          : result.message;
      recordExplanation(text,quiz);
    },
  });
  const [glossary, setGlossary] = useState<{open:boolean;termId:TermId|null}>({open:false,termId:null});
  const autoOpenedUnits = useRef(new Set<LessonUnitId>());
  const [deadStones, setDeadStonesState] = useState<Set<string>>(() => new Set());
  const deadStonesRef = useRef(deadStones);
  const setDeadStones = useCallback((value: Set<string> | ((current:Set<string>)=>Set<string>)) => {
    const next = typeof value === "function" ? value(deadStonesRef.current) : value;
    deadStonesRef.current = next;
    setDeadStonesState(next);
  }, []);
  const [outcome, setOutcomeState] = useState<string | null>(null);
  const outcomeRef = useRef(outcome);
  const setOutcome = useCallback((next: string | null) => {
    outcomeRef.current = next;
    setOutcomeState(next);
  }, []);
  const [scorePhase, setScorePhaseState] = useState<ScorePhase>("dead-stones");
  const scorePhaseRef = useRef<ScorePhase>("dead-stones");
  const graduationEligibleRef = useRef(false);
  const setScorePhase = useCallback((phase: ScorePhase) => {
    scorePhaseRef.current = phase;
    setScorePhaseState(phase);
  }, []);
  const awardGraduationEvent = useCallback((event: keyof LearningProgress["graduation"]) => {
    const current = learningProgressRef.current;
    if (!graduationEligibleRef.current || matchStateRef.current.size !== 9 ||
      matchStateRef.current.consecutivePasses < 2 || !isUnitUnlocked("s3-graduation", current)) return;
    replaceLearningProgress(recordGraduationEvent(current, event));
  }, [replaceLearningProgress]);
  const hydratedRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  // A callback belongs to the match/lesson context in which it was rendered.
  const actionGeneration = generationRef.current;

  // Every write, including immediate setting changes, uses the same live snapshot.
  const snapshot = (): SaveData => {
    const current = learningSession.getSession();
    const lessonResume = lessonResumeRef.current;
    const lastView = modeRef.current === "lesson" && !current.completed &&
      CURRICULUM_BY_ID.get(current.unitId)?.kind === "lesson" && lessonResume?.unitId === current.unitId ? "lesson" : "play";
    return {
        game:matchStateRef.current,learning:learningProgressRef.current,difficulty:difficultyRef.current,
        volume:audioRef.current.volume,category:audioRef.current.category,confirmMoves:confirmMovesRef.current,
        ...(lessonResume ? {lessonResume} : {}),lastView,
        scoring:{phase:scorePhaseRef.current,deadStones:[...deadStonesRef.current],outcome:outcomeRef.current,
          graduationEligible:graduationEligibleRef.current},
      };
  };
  const persist = () => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(SAVE_KEY, encodeSave(snapshot()));
    } catch { queueMicrotask(() => setStorageUnavailable(true)); }
  };

  type RestoreCandidate = { ticket: object; raw: string; progress: LearningProgress; session: LearningSession;
    bookmark: LessonResume | null; mode: GameMode; generation: number };
  const restoreCandidateRef = useRef<RestoreCandidate | null>(null);
  const cancelLearningRestore = () => { restoreCandidateRef.current = null; };
  const getBackupBlockedReason = () => learningBackupBlockedReason(hydratedRef.current,!!reviewRef.current,!!previewRef.current,
    modeRef.current,learningSession.isQuizActive(),busyRef.current || matchStateRef.current.toPlay !== "black");
  const exportLearningBackup = (): {ok:true;text:string}|{ok:false;error:string} => {
    const error = getBackupBlockedReason();
    if (error) return {ok:false,error};
    try { return {ok:true,text:createLearningBackup(learningProgressRef.current,lessonResumeRef.current)}; }
    catch { return {ok:false,error:"无法生成学习备份，请稍后重试。"}; }
  };
  const previewLearningBackup = (raw: string) => {
    cancelLearningRestore();
    const error = getBackupBlockedReason();
    if (error) return {ok:false as const,error};
    const parsed = parseLearningBackup(raw);
    if (!parsed.ok) return parsed;
    const ticket = Object.freeze({});
    restoreCandidateRef.current = {ticket,raw:createLearningBackup({...parsed.data.learning,assists:learningProgressRef.current.assists},parsed.data.lessonResume,new Date(parsed.data.exportedAt)),
      progress:learningProgressRef.current,session:learningSession.getSession(),bookmark:lessonResumeRef.current,mode:modeRef.current,generation:generationRef.current};
    return {ok:true as const,ticket,summary:parsed.summary,warnings:parsed.warnings};
  };
  const confirmLearningRestore = (ticket: object): {ok:true}|{ok:false;error:string} => {
    const candidate = restoreCandidateRef.current;
    cancelLearningRestore();
    const blocked = getBackupBlockedReason();
    if (blocked) return {ok:false,error:blocked};
    if (!candidate || ticket !== candidate.ticket || candidate.progress !== learningProgressRef.current ||
      candidate.session !== learningSession.getSession() || candidate.bookmark !== lessonResumeRef.current ||
      learningSession.session !== learningSession.getSession() ||
      candidate.mode !== modeRef.current || candidate.generation !== generationRef.current || actionGeneration !== generationRef.current) {
      return {ok:false,error:"学习状态已变化，请重新选择文件并预览。"};
    }
    const parsed = parseLearningBackup(candidate.raw);
    if (!parsed.ok) return parsed;
    const progress: LearningProgress = {...parsed.data.learning,assists:{...learningProgressRef.current.assists}};
    const resumed = restoreLessonResume(parsed.data.lessonResume,progress);
    const target = resumed ?? createLearningSession(getRecommendedUnit(progress) ?? "s3-graduation");
    if (!isUnitUnlocked(target.unitId,progress)) return {ok:false,error:"续学课程不可用，请重新预览。"};
    const bookmark = createLessonResume(target);
    const save: SaveData = {...snapshot(),learning:progress,lessonResume:bookmark ?? undefined,
      lastView:bookmark ? "lesson" : "play"};
    try { localStorage.setItem(SAVE_KEY,encodeSave(save)); }
    catch { setStorageUnavailable(true); return {ok:false,error:"当前浏览器无法保存，学习记录未替换。"}; }
    // Everything below is synchronous and all inputs were validated before writing.
    replaceLearningProgress(progress);
    autoOpenedUnits.current.add(target.unitId);
    if (bookmark) learningSession.restoreSession(target);
    else learningSession.startUnit(target.unitId);
    lessonResumeRef.current = bookmark;
    generationRef.current += 1;
    workerRef.current?.terminate();workerRef.current=null;busyRef.current=false;setAiThinking(false);
    clearPreview();clearReview();setPracticeOpen(false);setGlossary({open:false,termId:null});
    setMoveExplanation("");cancelExplanationSpeech();setMode("lesson");
    return {ok:true};
  };

  const state = review ? review.index === review.source.past.length ? review.source :
    {...review.source.past[review.index],past:review.source.past.slice(0,review.index)} :
    mode === "lesson" ? learningSession.state : matchState;
  const glossaryBlocked = mode === "lesson" && learningSession.unit.kind === "quiz" && !learningSession.session.completed;
  const recordTermStatus = (id:TermId,status:TermStatus) => {
    if(!GLOSSARY_BY_ID.has(id) || (modeRef.current === "lesson" && learningSession.isQuizActive())) return;
    const current=learningProgressRef.current;
    const next=advanceTermStatus(current.termStates[id],status);
    if(next!==current.termStates[id]) replaceLearningProgress({...current,termStates:{...current.termStates,[id]:next}});
  };
  const openTerm = (id:TermId) => {
    if((modeRef.current === "lesson" && learningSession.isQuizActive()) || !GLOSSARY_BY_ID.has(id)) return false;
    recordTermStatus(id,"seen");
    setGlossary({open:true,termId:id});
    return true;
  };
  const openDictionary = () => {
    if(modeRef.current === "lesson" && learningSession.isQuizActive()) return false;
    setGlossary({open:true,termId:null});
    return true;
  };
  const openPractice = () => {
    if(actionGeneration !== generationRef.current || (modeRef.current === "lesson" && learningSession.isQuizActive())) return false;
    clearPreview();setGlossary({open:false,termId:null});setPracticeOpen(true);return true;
  };
  const closePractice = () => setPracticeOpen(false);
  const closeGlossary = () => setGlossary({open:false,termId:null});
  const setLearningAssist = (key:keyof LearningAssists,value:boolean) => {
    if(modeRef.current === "lesson" && learningSession.isQuizActive()) return;
    const current=learningProgressRef.current;
    const next={...current,assists:{...current.assists,[key]:value}};
    replaceLearningProgress(next);
    if(key === "explainMoves") {setMoveExplanation("");cancelExplanationSpeech();}
    persist();
  };
  useEffect(() => () => cancelExplanationSpeech(), [mode,learningSession.unit.id,glossaryBlocked,learningProgress.assists.explainMoves,cancelExplanationSpeech]);
  useEffect(() => {
    const unit=learningSession.unit;
    if(!hydratedRef.current || learningSession.restored || mode!=="lesson" || unit.kind==="quiz" || !learningProgress.assists.autoOpenTerms || autoOpenedUnits.current.has(unit.id)) return;
    autoOpenedUnits.current.add(unit.id);
    const term=unit.terms.find(id=>!learningProgressRef.current.termStates[id]);
    if(term) openTerm(term);
    // The per-unit set prevents progress changes or closing from reopening a term.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode,learningSession.unit.id,learningProgress.assists.autoOpenTerms]);

  useEffect(() => {
    let raw: string | null = null;
    let readFailed = false;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { readFailed = true; }
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (readFailed) setStorageUnavailable(true);
      const saved = raw ? decodeSave(raw) : null;
      setFirstVisit(!saved);
      if (raw) {
        if (saved) {
          confirmMovesRef.current=saved.confirmMoves === true;
          setConfirmMovesState(confirmMovesRef.current);
          setMatchState(saved.game);
          setMode(saved.game.consecutivePasses >= 2 ? "scoring" : "play");
          replaceLearningProgress(saved.learning);
          setDeadStones(new Set(saved.scoring?.deadStones ?? []));
          setOutcome(saved.scoring?.outcome ?? null);
          setScorePhase(saved.scoring?.phase ?? "dead-stones");
          if (saved.scoring?.outcome) setMode("scoring");
          // Match qualification survives learning replacement; awarding still checks current unlocks.
          graduationEligibleRef.current = saved.scoring?.graduationEligible === true &&
            saved.game.size === 9 && saved.game.consecutivePasses >= 2 && !saved.scoring?.outcome;
          difficultyRef.current=saved.difficulty;
          setDifficultyState(saved.difficulty);
          audio.restore(saved.volume, saved.category);
          const resumed = restoreLessonResume(saved.lessonResume, saved.learning);
          lessonResumeRef.current = resumed ? createLessonResume(resumed) : null;
          if (saved.lastView === "lesson" && resumed) {
            // Suppress all automatic term actions from restoration, including later renders.
            autoOpenedUnits.current.add(resumed.unitId);
            learningSession.restoreSession(resumed);
            setMode("lesson");
          }
        } else {
          try { localStorage.removeItem(SAVE_KEY); } catch { /* A bad save cannot block a fresh lesson. */ }
          toast.info("旧棋局无法恢复，已为你新开一局");
        }
      }
      if (!saved) lessonResumeRef.current = createLessonResume(learningSession.getSession());
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => { active = false; };
    // The restore callbacks are stable; hydration must only run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persist();
    // persist reads synchronous refs; these dependencies describe persistent state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, audio.category, audio.volume, difficulty, learningProgress, matchState, scorePhase, deadStones, outcome, confirmMoves, learningSession.session, mode]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const finishAiTurn = useCallback(
    async (afterPlayer: GameState, generation: number, playerPassed = false) => {
      setAiThinking(true);
      let nextState = afterPlayer;
      try {
        let move: Move;
        try {
          move = playerPassed
            ? ({ pass: true } as const)
            : await workerMove(afterPlayer, difficulty, workerRef);
        } catch {
          move = chooseMove(afterPlayer, "beginner");
        }
        if (generationRef.current !== generation) return;
        let explanation: string;
        if ("pass" in move) {
          nextState = passTurn(afterPlayer);
          explanation=`白棋停一手。${nextState.consecutivePasses >= 2 ? "双方已连续停手，进入终局确认。" : "交出回合。"}`;
        }
        else {
          const result = playMove(afterPlayer, move);
          nextState = result.ok ? result.state : passTurn(afterPlayer);
          explanation=describeMove(afterPlayer,move,result)+(result.ok ? "" : "白棋停一手。");
        }
        if(modeRef.current === "play") recordExplanation(explanation);
        setMatchState(nextState);
        if (nextState.consecutivePasses >= 2) {
          setDeadStones(new Set());
          setOutcome(null);
          setScorePhase("dead-stones");
          graduationEligibleRef.current = nextState.size === 9 && isUnitUnlocked("s3-graduation", learningProgressRef.current);
          awardGraduationEvent("completedNineLineGame");
          awardGraduationEvent("enteredScoring");
          setMode("scoring");
        }
      } finally {
        if (generationRef.current === generation) {
          setAiThinking(false);
          busyRef.current = false;
        }
      }
    },
    [difficulty, setMode, recordExplanation, setMatchState, setDeadStones, setScorePhase, setOutcome, awardGraduationEvent],
  );

  const play = useCallback(
    async (point: Point): Promise<MoveResult> => {
      if (reviewRef.current || actionGeneration !== generationRef.current || mode !== modeRef.current) {
        return { ok: false, reason: "finished" };
      }
      clearPreview();
      if (mode === "lesson") {
        const kind = learningSession.session.exercise?.expected.kind;
        if (kind === "mark-dead") {
          learningSession.selectDeadStone(point);
          return {ok: false, reason: "finished"};
        }
        const feedback = kind === "select-group" ? learningSession.submitGroup(point) : learningSession.submitMove(point);
        return feedback?.completed ? {ok:true, state:feedback.nextState} : {ok:false, reason:"finished"};
      }

      const currentMatch = matchStateRef.current;
      if (modeRef.current !== "play" || busyRef.current || currentMatch.toPlay !== "black") {
        return { ok: false, reason: "finished" };
      }

      const result = playMove(currentMatch, point);
      if (!result.ok) {
        recordExplanation(describeMove(currentMatch,point,result));
        toast.warning(moveErrorText[result.reason]);
        return result;
      }

      busyRef.current = true;
      const generation = actionGeneration;
      setMatchState(result.state);
      recordExplanation(describeMove(currentMatch,point,result));
      void finishAiTurn(result.state, generation);
      return result;
    },
    [actionGeneration, learningSession, finishAiTurn, mode, recordExplanation, setMatchState,clearPreview],
  );

  const pass = useCallback(() => {
    if (reviewRef.current || actionGeneration !== generationRef.current || mode !== modeRef.current) return;
    clearPreview();
    if (mode === "lesson") {
      learningSession.submitPass();
      return;
    }
    const currentMatch = matchStateRef.current;
    if (modeRef.current !== "play" || busyRef.current || currentMatch.toPlay !== "black" || currentMatch.consecutivePasses >= 2) return;
    const passed = passTurn(currentMatch);
    recordExplanation("黑棋停一手，交出回合。");
    busyRef.current = true;
    setMatchState(passed);
    void finishAiTurn(passed, actionGeneration, true);
  }, [actionGeneration, learningSession, finishAiTurn, mode,recordExplanation,setMatchState,clearPreview]);

  const undo = useCallback(() => {
    if (actionGeneration !== generationRef.current || reviewRef.current || modeRef.current !== "play") return;
    clearPreview();
    setMoveExplanation("");
    cancelExplanationSpeech();
    generationRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
    setAiThinking(false);
    setMode("play");
    setOutcome(null);
    setMatchState((current) => undoRound(current));
  }, [actionGeneration,setMode,cancelExplanationSpeech,setMatchState,setOutcome,clearPreview]);

  const resetMatch = useCallback((size: BoardSize) => {
    if (actionGeneration !== generationRef.current) return;
    clearPreview();clearReview();setPracticeOpen(false);
    setMoveExplanation("");
    cancelExplanationSpeech();
    generationRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
    setAiThinking(false);
    setMatchState(createGame({ size }));
    setDeadStones(new Set());
    setOutcome(null);
    setScorePhase("dead-stones");
    graduationEligibleRef.current = false;
    setMode("play");
  }, [actionGeneration,setMode,cancelExplanationSpeech,setMatchState,setDeadStones,setScorePhase,setOutcome,clearPreview,clearReview]);

  const newGame = useCallback(() => {
    resetMatch(matchStateRef.current.size);
  }, [resetMatch]);

  const startNewGame = useCallback((size: BoardSize) => {
    resetMatch(size);
  }, [resetMatch]);

  const resign = useCallback(() => {
    if (actionGeneration !== generationRef.current || reviewRef.current || modeRef.current !== "play") return;
    clearPreview();
    generationRef.current += 1;
    workerRef.current?.terminate();
    busyRef.current = false;
    setAiThinking(false);
    setOutcome("你已认输，白方获胜");
    graduationEligibleRef.current = false;
    setScorePhase("final");
    setMode("scoring");
  }, [actionGeneration,setMode,setScorePhase,setOutcome,clearPreview]);

  const startUnit = useCallback((id: LessonUnitId) => {
    if (actionGeneration !== generationRef.current) return false;
    const resumed = lessonResumeRef.current?.unitId === id ? restoreLessonResume(lessonResumeRef.current, learningProgressRef.current) : null;
    if (!(resumed ? learningSession.restoreSession(resumed) : learningSession.startUnit(id))) return false;
    if (resumed) autoOpenedUnits.current.add(id);
    clearPreview();clearReview();setPracticeOpen(false);
    setMoveExplanation("");
    cancelExplanationSpeech();
    setGlossary({open:false,termId:null});
    generationRef.current += 1;
    workerRef.current?.terminate();
    busyRef.current = false;
    setAiThinking(false);
    setMode("lesson");
    return true;
  }, [actionGeneration,learningSession, setMode,cancelExplanationSpeech,clearPreview,clearReview]);

  const continueLearning = () => {
    const resumed = restoreLessonResume(lessonResumeRef.current,learningProgressRef.current);
    return startUnit(resumed?.unitId ?? getRecommendedUnit(learningProgressRef.current) ?? "s3-graduation");
  };

  const startPlay = useCallback(() => {
    if (actionGeneration !== generationRef.current) return;
    clearPreview();clearReview();setPracticeOpen(false);
    const currentMatch = matchStateRef.current;
    setMoveExplanation("");
    cancelExplanationSpeech();
    if (currentMatch.consecutivePasses >= 2 || outcomeRef.current) {
      setMode("scoring");
      return;
    }
    setMode("play");
    if (currentMatch.toPlay === "white" && currentMatch.consecutivePasses < 2 && !busyRef.current) {
      busyRef.current = true;
      void finishAiTurn(currentMatch, actionGeneration);
    }
  }, [actionGeneration,finishAiTurn, setMode,cancelExplanationSpeech,clearPreview,clearReview]);

  useEffect(() => {
    // Restored saves can contain the human move made just before an AI reply.
    if (!reviewRef.current && mode === "play" && matchState.toPlay === "white" && matchState.consecutivePasses < 2 && !busyRef.current) {
      busyRef.current = true;
      void finishAiTurn(matchState, generationRef.current);
    }
  }, [finishAiTurn, matchState, mode]);

  const setDifficulty = useCallback((value: Difficulty) => {
    difficultyRef.current=value;
    setDifficultyState(value);
  }, []);

  const toggleDeadStone = useCallback((point: Point) => {
    if (reviewRef.current || modeRef.current !== "scoring" || scorePhaseRef.current !== "dead-stones" || matchStateRef.current.consecutivePasses < 2) return;
    const currentMatch = matchStateRef.current;
    const group = groupAt(currentMatch.board,currentMatch.size,point)?.stones;
    if(!group) return;
    setDeadStones((current) => {
      const updated = new Set(current);
      const shouldMark = group.some(({ x, y }) => !updated.has(`${x},${y}`));
      for (const stone of group) {
        const key = `${stone.x},${stone.y}`;
        if (shouldMark) updated.add(key);
        else updated.delete(key);
      }
      return updated;
    });
  }, [setDeadStones]);

  const confirmDeadStones = useCallback(() => {
    if (actionGeneration !== generationRef.current || reviewRef.current || modeRef.current !== "scoring" || scorePhaseRef.current !== "dead-stones" || matchStateRef.current.consecutivePasses < 2) return false;
    setScorePhase("score-review");
    awardGraduationEvent("confirmedDeadStones");
    return true;
  }, [actionGeneration,setScorePhase,awardGraduationEvent]);
  const confirmFinalScore = useCallback(() => {
    if (actionGeneration !== generationRef.current || reviewRef.current || modeRef.current !== "scoring" || scorePhaseRef.current !== "score-review" || matchStateRef.current.consecutivePasses < 2) return false;
    setScorePhase("final");
    awardGraduationEvent("finalizedScore");
    return true;
  }, [actionGeneration,setScorePhase,awardGraduationEvent]);

  const setConfirmMoves = (value:boolean) => {
    confirmMovesRef.current=value;setConfirmMovesState(value);clearPreview();
    persist();
  };
  const selectPoint = async (point:Point):Promise<MoveResult> => {
    if(reviewRef.current || actionGeneration !== generationRef.current || mode !== modeRef.current || busyRef.current) return {ok:false,reason:"finished"};
    const lesson=mode === "lesson" ? learningSession.getSession() : null;
    if(lesson && lesson !== learningSession.session) return {ok:false,reason:"finished"};
    if(!confirmMovesRef.current || (lesson && lesson.exercise?.expected.kind !== "move")) return play(point);
    const current=lesson?.state ?? matchStateRef.current;
    if(mode === "scoring" || lesson?.completed || (!lesson && current.toPlay !== "black")) return {ok:false,reason:"finished"};
    const result=playMove(current,point);
    if(!result.ok) {
      clearPreview();
      if(lesson && !learningSession.isQuizActive()) {
        learningSession.reportRejectedMove(point);
        setMoveExplanation("");cancelExplanationSpeech();
      }
      else toast.warning(lesson ? "本次还不正确，请再检查任务。" : moveErrorText[result.reason]);
      return result;
    }
    const candidate:Preview={point:{...point},state:current,session:lesson,generation:actionGeneration,mode};
    previewRef.current=candidate;setPreview(candidate);return result;
  };
  const confirmMove = async ():Promise<MoveResult> => {
    const candidate=preview;
    if(!candidate || previewRef.current !== candidate || !confirmMovesRef.current || reviewRef.current || busyRef.current ||
      candidate.generation !== generationRef.current || candidate.mode !== modeRef.current ||
      (candidate.session ? learningSession.getSession() !== candidate.session : matchStateRef.current !== candidate.state)) return {ok:false,reason:"finished"};
    clearPreview();return play(candidate.point);
  };
  const startReview = () => {
    if(actionGeneration !== generationRef.current || modeRef.current === "lesson" || busyRef.current || reviewRef.current || !matchStateRef.current.past.length) return false;
    clearPreview();setPracticeOpen(false);generationRef.current+=1;
    setMoveExplanation("");cancelExplanationSpeech();
    const source=matchStateRef.current;
    const next={source,index:source.past.length,analysis:analyzeReview(source)};reviewRef.current=next;setReview(next);return true;
  };
  const seekReview = (index:number) => {
    if(actionGeneration !== generationRef.current || !reviewRef.current || !Number.isFinite(index)) return;
    const next={...reviewRef.current,index:Math.max(0,Math.min(reviewRef.current.source.past.length,Math.trunc(index)))};
    reviewRef.current=next;setReview(next);
  };
  const endReview = () => {if(actionGeneration !== generationRef.current || !reviewRef.current) return;generationRef.current+=1;clearReview();};
  const previewValid=preview && preview.mode===mode &&
    (preview.session ? preview.session === learningSession.session : preview.state === matchState);
  const failurePoint = learningSession.feedback?.failure?.point;
  const attemptedPoint = mode === "lesson" && !glossaryBlocked && !learningSession.feedback?.completed &&
    learningSession.session.feedbackExerciseId === learningSession.session.exercise?.id && failurePoint &&
    isPointOnBoard(failurePoint, learningSession.state.size) ? failurePoint : null;
  return {
    backupBlockedReason:learningBackupBlockedReason(hydrated,!!review,!!preview,mode,glossaryBlocked,aiThinking || matchState.toPlay !== "black"),
    exportLearningBackup,previewLearningBackup,confirmLearningRestore,cancelLearningRestore,
    firstVisit, attemptedPoint, storageUnavailable,
    coachRound: mode === "play" && !review && learningProgress.assists.explainMoves ? getCoachRound(matchState) : [],
    confirmMoves,setConfirmMoves,previewPoint:previewValid ? preview.point : null,selectPoint,confirmMove,cancelMove:clearPreview,
    reviewing:!!review,reviewIndex:review?.index ?? 0,reviewTotal:review?.source.past.length ?? matchState.past.length,
    reviewStep:review?.analysis.steps[review.index] ?? null,
    reviewMoments:review?.analysis.moments ?? [],startReview,seekReview,endReview,
    practiceOpen:practiceOpen && !glossaryBlocked,openPractice,closePractice,
    mode,
    state,
    matchState,
    difficulty,
    aiThinking,
    learningProgress,
    learningSession,
    moveExplanation: learningProgress.assists.explainMoves && !glossaryBlocked ? moveExplanation : "",
    glossaryOpen: glossary.open && !glossaryBlocked,
    glossaryTermId: glossary.termId,
    glossaryBlocked,
    openTerm,
    openDictionary,
    closeGlossary,
    recordTermPractice: (id:TermId) => recordTermStatus(id,"practiced"),
    setLearningAssist,
    deadStones,
    outcome,
    scorePhase,
    confirmDeadStones,
    confirmFinalScore,
    play,
    pass,
    undo,
    resign,
    newGame,
    startNewGame,
    startUnit,
    continueLearning,
    startPlay,
    setDifficulty,
    toggleDeadStone,
  };
}

export type GoGameController = ReturnType<typeof useGoGame>;
