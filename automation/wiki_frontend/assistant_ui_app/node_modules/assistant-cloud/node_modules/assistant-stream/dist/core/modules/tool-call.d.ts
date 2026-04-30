import type { AssistantStream } from "../AssistantStream.js";
import type { ToolResponseLike } from "../tool/ToolResponse.js";
import type { ReadonlyJSONValue } from "../../utils/json/json-value.js";
import type { UnderlyingReadable } from "../utils/stream/UnderlyingReadable.js";
import { type TextStreamController } from "./text.js";
export type ToolCallStreamController = {
    argsText: TextStreamController;
    setResponse(response: ToolResponseLike<ReadonlyJSONValue>): void;
    close(): void;
};
export declare const createToolCallStream: (readable: UnderlyingReadable<ToolCallStreamController>) => AssistantStream;
export declare const createToolCallStreamController: () => readonly [AssistantStream, ToolCallStreamController];
//# sourceMappingURL=tool-call.d.ts.map