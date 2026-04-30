import {
  ActionBarPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  useMessage,
} from "@assistant-ui/react";

export function MessageView() {
  const role = useMessage((state: any) => state.role);
  return role === "user" ? <UserMessage /> : <AssistantMessage />;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="aui-message user">
      <div className="aui-message-label">USER</div>
      <div className="aui-bubble user">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-message assistant">
      <div className="aui-message-label">ASSISTANT</div>
      <div className="aui-bubble assistant">
        <MessagePrimitive.Parts />
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="aui-error">
            <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
      </div>
      <ActionBarPrimitive.Root hideWhenRunning className="aui-actionbar">
        <ActionBarPrimitive.Copy asChild>
          <button type="button" className="aui-action-pill">복사</button>
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload asChild>
          <button type="button" className="aui-action-pill">재생성</button>
        </ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}
