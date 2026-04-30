import type { AttachmentAdapter, CompleteAttachment, PendingAttachment } from "@assistant-ui/react";
import { ACCEPTED_ATTACHMENT_TYPES, CHAT_API_ENDPOINTS } from "../constants";

type UploadResponse = {
  error?: string;
  attachments?: Array<{
    id?: string;
    analysis?: string;
    analysisPath?: string;
    route?: string;
    path?: string;
  }>;
};

type AttachmentMetadata = {
  analysis?: string;
  analysisPath?: string;
  route?: string;
  savedPath?: string;
};

export class WikiAttachmentAdapter implements AttachmentAdapter {
  accept = ACCEPTED_ATTACHMENT_TYPES;

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    const form = new FormData();
    form.append("file", file);
    form.append("note", "assistant-ui upload");

    const response = await fetch(CHAT_API_ENDPOINTS.files, { method: "POST", body: form });
    const payload = (await response.json()) as UploadResponse;

    if (!response.ok || payload.error) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const uploaded = payload.attachments?.[0] || {};
    return {
      id: uploaded.id || crypto.randomUUID(),
      type: file.type.startsWith("image/") ? "image" : "document",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
      metadata: {
        analysis: uploaded.analysis || "",
        analysisPath: uploaded.analysisPath || "",
        route: uploaded.route || "",
        savedPath: uploaded.path || "",
      } satisfies AttachmentMetadata,
    } as PendingAttachment;
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const metadata = ((attachment as unknown as { metadata?: AttachmentMetadata }).metadata || {});
    const summary = [
      `[첨부 파일] ${attachment.name}`,
      metadata.route ? `route: ${metadata.route}` : "",
      metadata.savedPath ? `saved_path: ${metadata.savedPath}` : "",
      metadata.analysisPath ? `analysis_md: ${metadata.analysisPath}` : "",
      metadata.analysis || "파일 분석 결과 없음",
    ].filter(Boolean).join("\n");

    return {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: attachment.contentType,
      content: [{ type: "text", text: summary }],
      status: { type: "complete" },
    } as CompleteAttachment;
  }

  async remove(): Promise<void> {}
}
