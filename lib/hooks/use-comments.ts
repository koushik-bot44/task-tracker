"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useMe } from "@/lib/hooks/use-users";
import type { CommentDTO, CommentTarget } from "@/lib/types";

export const commentsKey = (targetType: CommentTarget, targetId: string) => ["comments", targetType, targetId] as const;

export function useComments(targetType: CommentTarget, targetId: string | null, enabled = true) {
  return useQuery({
    queryKey: commentsKey(targetType, targetId ?? "none"),
    queryFn: () => apiGet<CommentDTO[]>(`/api/comments?targetType=${targetType}&targetId=${targetId}`),
    enabled: enabled && Boolean(targetId),
  });
}

/** How big an attachment may be here. The camera and paper-clip are always offered (2026-09-10). */
export function useUploadsEnabled() {
  return useQuery({
    queryKey: ["uploads-enabled"],
    queryFn: () => apiGet<{ enabled: boolean; maxBytes: number }>("/api/uploads"),
    staleTime: 10 * 60_000,
  });
}

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

export async function uploadFile(file: File, maxBytes?: number): Promise<{ url: string; name: string; type: string }> {
  // Said before sending, rather than after a long upload is turned away.
  if (maxBytes && file.size > maxBytes) throw new Error(`That file is over ${megabytes(maxBytes)} MB — the most that can be attached here.`);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    // The hosting platform turns an oversized request away before the app sees it, without a message.
    if (res.status === 413) throw new Error(body?.error ?? "That file is too big to attach here.");
    throw new Error(body?.error ?? "Couldn't attach that file.");
  }
  return (await res.json()) as { url: string; name: string; type: string };
}

/** A file that is up, ready to go with a note. */
export type UploadedFile = { url: string; name: string; type: string; size: number };

/**
 * One file up, saying how far it has got (0–1) — XMLHttpRequest, because fetch
 * can't report upload progress. Refused before sending when it is over the limit.
 */
export function uploadFileWithProgress(file: File, maxBytes: number | undefined, onProgress: (fraction: number) => void): Promise<UploadedFile> {
  if (maxBytes && file.size > maxBytes) {
    return Promise.reject(new Error(`That file is over ${megabytes(maxBytes)} MB — the most that can be attached here.`));
  }
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const reply = (): { url?: string; name?: string; type?: string; error?: string } | null => {
        try {
          return JSON.parse(xhr.responseText) as { url?: string; name?: string; type?: string; error?: string };
        } catch {
          return null;
        }
      };
      const body = reply();
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) {
        onProgress(1);
        resolve({ url: body.url, name: body.name ?? file.name, type: body.type ?? file.type, size: file.size });
      } else if (xhr.status === 413) {
        reject(new Error(body?.error ?? "That file is too big to attach here."));
      } else {
        reject(new Error(body?.error ?? "Couldn't attach that file."));
      }
    };
    xhr.onerror = () => reject(new Error("Couldn't reach Orbit to attach that file. Check the connection and try again."));
    xhr.send(form);
  });
}

export function useCommentMutations(targetType: CommentTarget, targetId: string) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const key = commentsKey(targetType, targetId);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["milestones"] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const addComment = useMutation({
    mutationFn: (input: { body: string; attachments?: UploadedFile[] }) =>
      apiPost<CommentDTO>("/api/comments", { targetType, targetId, ...input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CommentDTO[]>(key) ?? [];
      if (me) {
        const optimistic: CommentDTO = {
          id: `pending-${Date.now()}`,
          targetType,
          targetId,
          body: input.body,
          attachmentUrl: input.attachments?.[0]?.url ?? null,
          attachmentName: input.attachments?.[0]?.name ?? null,
          attachmentType: input.attachments?.[0]?.type ?? null,
          attachments: (input.attachments ?? []).map((f, i) => ({ id: `pending-${i}`, url: f.url, name: f.name, type: f.type, size: f.size })),
          createdAt: new Date().toISOString(),
          author: { id: me.id, name: me.name, role: me.role },
        };
        qc.setQueryData<CommentDTO[]>(key, [...previous, optimistic]);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: refresh,
  });

  const removeComment = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/comments/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CommentDTO[]>(key) ?? [];
      qc.setQueryData<CommentDTO[]>(key, previous.filter((n) => n.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: refresh,
  });

  return { addComment, removeComment };
}
