"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createFeedbackReport, formatFeedbackReport, type FeedbackCategory, type FeedbackContext } from "@/lib/learning/feedback-report";

type FeedbackDialogProps = {
  context: FeedbackContext;
  opener: HTMLButtonElement;
  onClose(): void;
};

// Mounted once for each opening, so descriptions and delivery statuses always start fresh.
export function FeedbackDialog({ context, opener, onClose }: FeedbackDialogProps) {
  const [category, setCategory] = useState<FeedbackCategory>("operation");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const report = createFeedbackReport(context, category, description);
  const text = formatFeedbackReport(report);
  const manualCopy = "无法自动完成，请选中下方反馈文本手动复制。";

  async function copyReport() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setStatus("反馈文本已复制。你可以自行粘贴到反馈页面。");
    } catch {
      setStatus(manualCopy);
    }
  }

  function downloadReport() {
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    let triggered = false;
    try {
      if (typeof Blob !== "function" || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") throw new Error("Download unavailable");
      anchor = document.createElement("a");
      if (!("download" in anchor)) throw new Error("Download unavailable");
      url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }));
      anchor.href = url;
      anchor.download = "yijing-feedback.json";
      document.body.appendChild(anchor);
      anchor.click();
      triggered = true;
      setStatus("已下载反馈文件。你可以自行附到反馈页面。");
    } catch {
      setStatus(manualCopy);
    } finally {
      anchor?.remove();
      if (url !== undefined) {
        const objectUrl = url;
        // Let the browser start the file download before releasing the temporary URL.
        if (triggered) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        else URL.revokeObjectURL(objectUrl);
      }
    }
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="feedback-dialog" showCloseButton={false}
      onCloseAutoFocus={event => { event.preventDefault(); opener.focus({ preventScroll: true }); }}>
      <button type="button" className="feedback-close-icon" aria-label="关闭反馈" onClick={onClose}>×</button>
      <DialogHeader>
        <DialogTitle>遇到困难？反馈一下</DialogTitle>
        <DialogDescription>写下你遇到的问题，复制文本或下载文件后自行提交。不要填写个人信息。</DialogDescription>
      </DialogHeader>
      <label className="feedback-field" htmlFor="feedback-category">困难类型
        <select id="feedback-category" name="feedback-category" value={category} onChange={event => setCategory(event.target.value as FeedbackCategory)}>
          <option value="operation">找不到操作</option><option value="rule">不理解规则</option>
          <option value="interface">落子/界面异常</option><option value="other">其他</option>
        </select>
      </label>
      <label className="feedback-field" htmlFor="feedback-description">问题说明
        <textarea id="feedback-description" data-feedback-description rows={4} value={description}
          aria-describedby="feedback-count" onChange={event => setDescription(Array.from(event.target.value).slice(0, 600).join(""))} />
      </label>
      <p id="feedback-count" className="feedback-count">{Array.from(description).length} / 600 字 · 不要填写个人信息</p>
      <label className="feedback-field" htmlFor="feedback-report">可选中复制的反馈文本
        <textarea id="feedback-report" data-feedback-report rows={7} readOnly value={text} />
      </label>
      <p className="feedback-status" role="status" aria-live="polite">{status}</p>
      <a className="feedback-external" href="https://github.com/zwl522225/yijing-go/issues/new/choose" target="_blank" rel="noopener noreferrer">打开 GitHub 反馈页面</a>
      <DialogFooter>
        <Button variant="outline" data-action="copy-feedback" onClick={copyReport}>复制反馈</Button>
        <Button variant="outline" data-action="download-feedback" onClick={downloadReport}>下载反馈文件</Button>
        <Button data-action="close-feedback" onClick={onClose}>关闭反馈</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
