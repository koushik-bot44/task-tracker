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

/** Whether the camera / paper-clip should show at all. */
export function useUploadsEnabled() {
  return useQuery({
    queryKey: ["uploads-enabled"],
    queryFn: () => apiGet<{ enabled: boolean }>("/api/uploads"),
    staleTime: 10 * 60_000,
  });
}

export async function uploadFile(file: File): Promise<{ url: string; name: string; type: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't attach that file.");
  }
  return (await res.json()) as { url: string; name: string; type: string };
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
    mutationFn: (input: { body: string; attachmentUrl?: string | null; attachmentName?: string | null; attachmentType?: string | null }) =>
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
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentName: input.attachmentName ?? null,
          attachmentType: input.attachmentType ?? null,
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
