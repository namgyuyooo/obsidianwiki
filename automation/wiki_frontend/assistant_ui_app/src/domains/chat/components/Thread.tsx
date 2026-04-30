import { ThreadPrimitive, useThread } from "@assistant-ui/react";
import type { ChatContext } from "../constants";
import { Composer } from "./Composer";
import { MessageView } from "./Messages";
import { Welcome } from "./Welcome";

type ThreadProps = {
  chatContext: ChatContext;
};

export function Thread({ chatContext }: ThreadProps) {
  const isEmpty = useThread((state: any) => state.isEmpty);

  return (
    <ThreadPrimitive.Root className="aui-thread-root">
      <header className="aui-topbar">
        <div>
          <span className="aui-kicker">assistant-ui thread</span>
          <strong>{chatContext.projectId}</strong>
        </div>
        <div className="aui-topbar-actions" aria-label="thread status">
          <span className="aui-status-dot" />
          <span className="aui-topbar-meta">{chatContext.workspace} workspace</span>
        </div>
      </header>
      <ThreadPrimitive.Viewport className="aui-viewport" autoScroll="smooth">
        <div className="aui-viewport-inner">
          {isEmpty ? <Welcome /> : null}
          <div className="aui-message-stack">
            <ThreadPrimitive.Messages>
              {() => <MessageView />}
            </ThreadPrimitive.Messages>
          </div>
        </div>
        <div className="aui-footer">
          <Composer />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
