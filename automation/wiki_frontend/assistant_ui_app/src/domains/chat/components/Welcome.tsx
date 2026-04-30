import { useComposerRuntime } from "@assistant-ui/react";
import { STARTER_PROMPTS } from "../constants";

export function Welcome() {
  const composer = useComposerRuntime();

  const sendStarterPrompt = (prompt: string) => {
    composer.setText(prompt);
    composer.send();
  };

  return (
    <div className="aui-welcome">
      <div className="aui-welcome-copy">
        <span className="aui-kicker">Project-aware LLM chat</span>
        <h1>무엇을 도와드릴까요?</h1>
        <p>프로젝트 문맥, 위키 근거, 첨부 파일, Decision Deck 지시를 같은 대화 안에서 다룹니다.</p>
      </div>
      <div className="aui-suggestions">
        {STARTER_PROMPTS.map((starterPrompt) => (
          <button
            key={starterPrompt.title}
            type="button"
            className="aui-suggestion-card"
            onClick={() => sendStarterPrompt(starterPrompt.prompt)}
          >
            <strong>{starterPrompt.title}</strong>
            <span>{starterPrompt.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
