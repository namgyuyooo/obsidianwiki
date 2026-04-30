import { AttachmentPrimitive, ComposerPrimitive, useThread } from "@assistant-ui/react";

function ComposerAttachments() {
  return (
    <div className="aui-composer-attachments">
      <ComposerPrimitive.Attachments>
        {() => (
          <AttachmentPrimitive.Root className="aui-attachment-chip">
            <AttachmentPrimitive.Name />
            <AttachmentPrimitive.Remove asChild>
              <button type="button" className="aui-attachment-remove" aria-label="첨부 제거">x</button>
            </AttachmentPrimitive.Remove>
          </AttachmentPrimitive.Root>
        )}
      </ComposerPrimitive.Attachments>
    </div>
  );
}

export function Composer() {
  const isRunning = useThread((state: any) => state.isRunning);

  return (
    <ComposerPrimitive.Root className="aui-composer-root" submitMode="enter">
      <div className="aui-composer-shell">
        <div className="aui-composer-tools" aria-label="composer skill tags">
          <button type="button" className="aui-mini-tool">+ File</button>
          <button type="button" className="aui-mini-tool">@Skill</button>
          <button type="button" className="aui-mini-tool">#Wiki</button>
        </div>
        <ComposerAttachments />
        <ComposerPrimitive.Input
          rows={1}
          placeholder="Decision Deck, 위키 근거, 첨부 파일에 대해 지시하세요."
          className="aui-composer-input"
        />
        <div className="aui-composer-footer">
          <div className="aui-composer-left">
            <ComposerPrimitive.AddAttachment asChild>
              <button type="button" className="aui-icon-button secondary" aria-label="첨부 추가">
                +
              </button>
            </ComposerPrimitive.AddAttachment>
            <span className="aui-composer-hint">Enter 전송 · Shift+Enter 줄바꿈</span>
          </div>
          {!isRunning ? (
            <ComposerPrimitive.Send asChild>
              <button type="button" className="aui-icon-button primary" aria-label="전송">
                ↑
              </button>
            </ComposerPrimitive.Send>
          ) : (
            <ComposerPrimitive.Cancel asChild>
              <button type="button" className="aui-icon-button stop" aria-label="중지">
                ■
              </button>
            </ComposerPrimitive.Cancel>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
