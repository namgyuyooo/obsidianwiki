function isStandardSchema(schema) {
    return (typeof schema === "object" &&
        schema !== null &&
        "~standard" in schema &&
        typeof schema["~standard"] === "object");
}
function hasToJSONSchemaMethod(schema) {
    return (typeof schema === "object" &&
        schema !== null &&
        "toJSONSchema" in schema &&
        typeof schema.toJSONSchema === "function");
}
function hasToJSONMethod(schema) {
    return (typeof schema === "object" &&
        schema !== null &&
        "toJSON" in schema &&
        typeof schema.toJSON === "function");
}
/**
 * Converts a schema to JSONSchema7.
 * Supports:
 * - StandardSchemaV1 with ~standard.toJSONSchema (e.g., Zod v4)
 * - StandardSchemaV1 with ~standard.jsonSchema.input() (e.g., Zod v4)
 * - Objects with toJSONSchema() method (e.g., Zod v4)
 * - Objects with toJSON() method
 * - Plain JSONSchema7 objects (must have a "type" property)
 */
export function toJSONSchema(schema) {
    // StandardSchemaV1 with ~standard.toJSONSchema (e.g., Zod v4)
    if (isStandardSchema(schema)) {
        const toJSONSchemaMethod = schema["~standard"].toJSONSchema;
        if (typeof toJSONSchemaMethod === "function") {
            return toJSONSchemaMethod();
        }
        // StandardSchemaV1 with ~standard.jsonSchema.input()
        const jsonSchema = schema["~standard"].jsonSchema;
        if (typeof jsonSchema === "object" &&
            jsonSchema !== null &&
            typeof jsonSchema.input === "function") {
            return jsonSchema.input();
        }
    }
    // toJSONSchema method on the schema itself
    if (hasToJSONSchemaMethod(schema)) {
        return schema.toJSONSchema();
    }
    // toJSON method on the schema
    if (hasToJSONMethod(schema)) {
        return schema.toJSON();
    }
    // If it's a Standard Schema that we couldn't convert, throw a helpful error
    if (isStandardSchema(schema)) {
        throw new Error("Could not convert schema to JSON Schema. " +
            "The schema implements Standard Schema but does not support JSON Schema conversion. " +
            "If you are using Zod, please upgrade to Zod v4 (npm install zod@latest). " +
            "Alternatively, pass a plain JSON Schema object instead.");
    }
    // Already a plain JSONSchema7
    return schema;
}
/**
 * Returns a copy of the JSON Schema with `required` removed recursively,
 * making every property optional. Array item schemas are left unchanged.
 */
export function toPartialJSONSchema(schema) {
    const { required: _, ...result } = schema;
    if (result.properties) {
        result.properties = Object.fromEntries(Object.entries(result.properties).map(([key, prop]) => {
            if (typeof prop === "object" && prop !== null && !Array.isArray(prop)) {
                const p = prop;
                return [key, p.properties != null ? toPartialJSONSchema(p) : prop];
            }
            return [key, prop];
        }));
    }
    return result;
}
function defaultToolFilter(_name, tool) {
    return !tool.disabled && tool.type !== "backend";
}
/**
 * Converts a record of tools to a record of tool definitions with JSON Schema parameters.
 * By default, filters out disabled tools and backend tools.
 */
export function toToolsJSONSchema(tools, options = {}) {
    if (!tools)
        return {};
    const filter = options.filter ?? defaultToolFilter;
    return Object.fromEntries(Object.entries(tools)
        .filter(([name, tool]) => filter(name, tool) && tool.parameters)
        .map(([name, tool]) => [
        name,
        {
            ...(tool.description && { description: tool.description }),
            parameters: toJSONSchema(tool.parameters),
        },
    ]));
}
//# sourceMappingURL=schema-utils.js.map