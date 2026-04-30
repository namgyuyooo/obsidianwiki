import type { AssistantStream } from "../AssistantStream.js";
import type { UnderlyingReadable } from "../utils/stream/UnderlyingReadable.js";
export type TextStreamController = {
    append(textDelta: string): void;
    close(): void;
};
export declare const createTextStream: (readable: UnderlyingReadable<TextStreamController>) => AssistantStream;
export declare const createTextStreamController: () => readonly [AssistantStream, TextStreamController];
//# sourceMappingURL=text.d.ts.map