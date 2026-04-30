export class TimingTracker {
    _streamStartTime;
    _firstTokenTime;
    _totalChunks = 0;
    _toolCallIds = new Set();
    constructor() {
        this._streamStartTime = Date.now();
    }
    recordChunk() {
        this._totalChunks++;
    }
    recordFirstToken() {
        if (this._firstTokenTime === undefined) {
            this._firstTokenTime = Date.now();
        }
    }
    recordToolCallStart(toolCallId) {
        this._toolCallIds.add(toolCallId);
    }
    getTiming(outputTokens, totalText) {
        const now = Date.now();
        const totalStreamTime = now - this._streamStartTime;
        const tokenCount = outputTokens && outputTokens > 0
            ? outputTokens
            : totalText
                ? Math.ceil(totalText.length / 4)
                : undefined;
        const tokensPerSecond = tokenCount && totalStreamTime > 0
            ? (tokenCount / totalStreamTime) * 1000
            : undefined;
        return {
            streamStartTime: this._streamStartTime,
            ...(this._firstTokenTime !== undefined
                ? { firstTokenTime: this._firstTokenTime - this._streamStartTime }
                : undefined),
            totalStreamTime,
            ...(tokenCount !== undefined ? { tokenCount } : undefined),
            ...(tokensPerSecond !== undefined ? { tokensPerSecond } : undefined),
            totalChunks: this._totalChunks,
            toolCallCount: this._toolCallIds.size,
        };
    }
}
//# sourceMappingURL=TimingTracker.js.map