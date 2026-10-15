"use client";

import { useEffect, useState } from "react";
import { dismissOnboarding, readOnboardingDismissed } from "@/lib/learning/onboarding";

export function BeginnerGuide({ firstVisit, quizActive, onContinueLearning, showContinueLearning=false }: {
  firstVisit: boolean;
  quizActive: boolean;
  onContinueLearning(): void;
  showContinueLearning?: boolean;
}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => {
    let active = true;
    let stored = false;
    try { stored = readOnboardingDismissed(localStorage); } catch { /* The storage getter can also be denied. */ }
    queueMicrotask(() => { if (active) setDismissed(stored); });
    return () => { active = false; };
  }, []);
  const open = !quizActive && (manualOpen || (firstVisit && dismissed === false));
  const close = () => {
    setManualOpen(false);
    setDismissed(true);
    try { dismissOnboarding(localStorage); } catch { /* Closing still works in memory. */ }
  };
  return <section className={`beginner-guide${open ? " panel" : ""}`} aria-label="新手操作说明">
    <div className="beginner-guide-actions">
      {!open ? <button type="button" className="dictionary-button" data-action="open-guide" disabled={quizActive} onClick={()=>setManualOpen(true)}>新手操作说明</button> : null}
      {showContinueLearning ? <button type="button" className="dictionary-button" data-action="continue-learning" disabled={quizActive} onClick={onContinueLearning}>继续学堂</button> : null}
    </div>
    {open ? <div className="beginner-guide-content">
      <h2>先认识棋盘，再试着落子</h2>
      <p>棋子放在线的交叉点上。黑棋先走，之后双方轮流下；先学小棋盘，再下一盘 9 路棋。</p>
      <p>普通课可续学；测验重开从第一题开始。</p>
      <button type="button" className="dictionary-button" data-action="dismiss-guide" onClick={close}>知道了，开始落子</button>
    </div> : null}
  </section>;
}
