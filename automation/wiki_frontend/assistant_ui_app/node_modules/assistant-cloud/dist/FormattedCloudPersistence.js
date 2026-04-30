/**
 * Wraps a CloudMessagePersistence instance with format-aware encode/decode.
 *
 * This centralizes the pattern used by both:
 * - useCloudChat (standalone AI SDK hook)
 * - AssistantCloudThreadHistoryAdapter.withFormat() (assistant-ui runtime)
 *
 * The persistence parameter is typed structurally (not by class) so callers
 * don't need to import CloudMessagePersistence directly.
 */
export const createFormattedPersistence = (persistence, adapter) => ({
    append: async (threadId, item) => {
        const messageId = adapter.getId(item.message);
        const encoded = adapter.encode(item);
        return persistence.append(threadId, messageId, item.parentId, adapter.format, encoded);
    },
    update: persistence.update
        ? async (threadId, item, messageId) => {
            const encoded = adapter.encode(item);
            return persistence.update(threadId, messageId, adapter.format, encoded);
        }
        : undefined,
    load: async (threadId) => {
        const messages = await persistence.load(threadId, adapter.format);
        return {
            messages: messages
                .filter((m) => m.format === adapter.format)
                .map((m) => adapter.decode({
                id: m.id,
                parent_id: m.parent_id,
                format: m.format,
                content: m.content,
            }))
                .reverse(),
        };
    },
    isPersisted: (messageId) => persistence.isPersisted(messageId),
});
//# sourceMappingURL=FormattedCloudPersistence.js.map