import { RuntimeProvider } from "./domains/chat/runtime/RuntimeProvider";
import { AssistantShell } from "./domains/chat/components/AssistantShell";
import { Thread } from "./domains/chat/components/Thread";
import { readChatContextFromUrl } from "./domains/chat/constants";

export function App() {
  const chatContext = readChatContextFromUrl();

  return (
    <RuntimeProvider chatContext={chatContext}>
      <AssistantShell chatContext={chatContext}>
        <Thread chatContext={chatContext} />
      </AssistantShell>
    </RuntimeProvider>
  );
}
