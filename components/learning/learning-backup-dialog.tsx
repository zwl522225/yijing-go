"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GoGameController } from "@/hooks/use-go-game";
import { MAX_LEARNING_BACKUP_BYTES } from "@/lib/learning/backup";

type BackupController = Pick<GoGameController, "backupBlockedReason" | "exportLearningBackup" | "previewLearningBackup" | "confirmLearningRestore" | "cancelLearningRestore">;
type Preview = Extract<ReturnType<BackupController["previewLearningBackup"]>,{ok:true}>;
type LearningBackupDialogProps = { game: BackupController; opener: HTMLButtonElement; onClose(): void };

// A new mount per opening makes file choices, statuses and preview tickets temporary.
export function LearningBackupDialog({ game, opener, onClose }: LearningBackupDialogProps) {
  const [preview,setPreview] = useState<Preview | null>(null);
  const [status,setStatus] = useState("");
  const [reading,setReading] = useState(false);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const cancelRef = useRef(game.cancelLearningRestore);
  useEffect(() => { cancelRef.current=game.cancelLearningRestore; },[game.cancelLearningRestore]);
  useEffect(() => {
    mountedRef.current=true;
    return () => { mountedRef.current=false;requestRef.current+=1;cancelRef.current(); };
  },[]);
  function close() {
    mountedRef.current=false;requestRef.current+=1;game.cancelLearningRestore();
    setPreview(null);setStatus("");setReading(false);onClose();
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const request = ++requestRef.current;
    game.cancelLearningRestore();setPreview(null);setStatus("");setReading(false);
    const file = event.target.files?.[0];
    event.target.value="";
    if (!file) return;
    if (file.size > MAX_LEARNING_BACKUP_BYTES) {setStatus("学习备份大小不能超过 1 MiB。");return;}
    setReading(true);
    try {
      const raw = await file.text();
      if (!mountedRef.current || request !== requestRef.current) return;
      const result = game.previewLearningBackup(raw);
      if (result.ok) setPreview(result);
      else setStatus(result.error);
    } catch {
      if (mountedRef.current && request === requestRef.current) setStatus("无法读取备份文件，请重新选择。");
    } finally {
      if (mountedRef.current && request === requestRef.current) setReading(false);
    }
  }
  function download() {
    const result = game.exportLearningBackup();
    if (!result.ok) {setStatus(result.error);return;}
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    let triggered=false;
    try {
      if (typeof Blob !== "function" || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") throw Error("Download unavailable");
      anchor=document.createElement("a");
      if (!("download" in anchor)) throw Error("Download unavailable");
      const date=new Date();
      const localDate=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      url=URL.createObjectURL(new Blob([result.text],{type:"application/json;charset=utf-8"}));
      anchor.href=url;anchor.download=`yijing-learning-backup-${localDate}.json`;
      document.body.appendChild(anchor);anchor.click();triggered=true;
      setStatus("已发起下载，请检查浏览器下载列表");
    } catch {setStatus("无法发起下载，请稍后重试或使用支持文件下载的浏览器。");}
    finally {
      anchor?.remove();
      if (url !== undefined) {
        const objectUrl=url;
        if(triggered) setTimeout(()=>URL.revokeObjectURL(objectUrl),0);
        else URL.revokeObjectURL(objectUrl);
      }
    }
  }
  function confirm() {
    if (!mountedRef.current || !preview) return;
    const result=game.confirmLearningRestore(preview.ticket);
    setPreview(null);
    if (result.ok) close();
    else setStatus(result.error);
  }
  return <Dialog open onOpenChange={open=>{if(!open)close();}}>
    <DialogContent className="learning-backup-dialog" showCloseButton={false} onCloseAutoFocus={event=>{
      event.preventDefault();
      const target=opener.isConnected && !opener.disabled ? opener : document.querySelector<HTMLButtonElement>('.mode-tabs button[aria-pressed="true"]');
      target?.focus({preventScroll:true});
    }}>
      <DialogHeader>
        <DialogTitle>备份学习进度</DialogTitle>
        <DialogDescription>下载学习记录，换浏览器或设备时自行传送文件。备份包含课程、测验、术语和普通课续学位置，不包含完整棋局。</DialogDescription>
      </DialogHeader>
      <Button variant="outline" data-action="download-learning-backup" disabled={!!game.backupBlockedReason} onClick={download}>下载学习备份</Button>
      <label className="backup-file-field">选择备份文件
        <input type="file" accept=".json,application/json" data-learning-backup-file disabled={!!game.backupBlockedReason} onChange={chooseFile}/>
      </label>
      {reading ? <p role="status">正在读取备份文件…</p> : null}
      {preview ? <section className="backup-preview" data-learning-backup-preview aria-label="学习备份预览">
        <p>备份日期：{new Date(preview.summary.exportedAt).toLocaleString("zh-CN")}</p>
        <p>已完成课程：{preview.summary.completedCount} · 已记录术语：{preview.summary.termCount}</p>
        <p>测验最佳成绩：{Object.entries(preview.summary.quizScores).map(([stage,score])=>`${stage === "stage-1" ? "第一阶段" : "第二阶段"} ${score} 分`).join("；") || "暂无"}</p>
        <p>{preview.summary.resume ? `续学：${preview.summary.resume.title} · 第 ${preview.summary.resume.exerciseIndex+1} / ${preview.summary.resume.exerciseCount} 题` : "没有有效续学位置，恢复后进入推荐课程。"}</p>
        {preview.warnings.map((warning,index)=><p className="backup-warning" key={index}>{warning}</p>)}
        <p>确认后替换当前学习记录，不合并成绩；当前棋局和操作设置保留。</p>
        <Button variant="outline" data-action="backup-current-learning" disabled={!!game.backupBlockedReason} onClick={download}>先备份当前记录</Button>
        <Button data-action="confirm-learning-restore" disabled={!!game.backupBlockedReason} onClick={confirm}>确认替换学习记录</Button>
      </section> : null}
      {game.backupBlockedReason ? <p role="status">{game.backupBlockedReason}</p> : null}
      <p className="feedback-status" role="status" aria-live="polite">{status}</p>
      <DialogFooter><Button variant="outline" data-action="cancel-learning-restore" onClick={close}>取消</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
