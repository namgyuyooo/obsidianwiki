import type { ReadonlyJSONValue } from "../../utils.js";
import type { ObjectStreamOperation } from "./types.js";
export declare class ObjectStreamAccumulator {
    private _state;
    constructor(initialValue?: ReadonlyJSONValue);
    get state(): ReadonlyJSONValue;
    append(ops: readonly ObjectStreamOperation[]): void;
    private static apply;
    private static updatePath;
}
//# sourceMappingURL=ObjectStreamAccumulator.d.ts.map