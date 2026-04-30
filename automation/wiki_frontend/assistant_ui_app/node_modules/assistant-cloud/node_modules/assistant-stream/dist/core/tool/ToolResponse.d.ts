import type { ReadonlyJSONValue } from "../../utils/json/json-value.js";
declare const TOOL_RESPONSE_SYMBOL: unique symbol;
export type ToolResponseLike<TResult> = {
    result: TResult;
    artifact?: ReadonlyJSONValue | undefined;
    isError?: boolean | undefined;
    messages?: ReadonlyJSONValue | undefined;
};
export declare class ToolResponse<TResult> {
    get [TOOL_RESPONSE_SYMBOL](): boolean;
    readonly artifact?: ReadonlyJSONValue;
    readonly result: TResult;
    readonly isError: boolean;
    readonly messages?: ReadonlyJSONValue;
    constructor(options: ToolResponseLike<TResult>);
    static [Symbol.hasInstance](obj: unknown): obj is ToolResponse<ReadonlyJSONValue>;
    static toResponse(result: any | ToolResponse<any>): ToolResponse<any>;
}
export {};
//# sourceMappingURL=ToolResponse.d.ts.map