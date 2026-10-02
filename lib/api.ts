export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && typeof window !== "undefined") {
    // Session expired mid-use. Send them to the door rather than failing quietly.
    // 2026-10-02: carrying the page they were on (?next=), so signing back in
    // returns them there (components/login-form.tsx) instead of to Today. Never
    // from the door itself — there is nowhere to send them.
    const { pathname, search } = window.location;
    if (pathname !== "/login") window.location.href = `/login?next=${encodeURIComponent(pathname + search)}`;
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export const apiGet = <T>(url: string) => request<T>(url, { method: "GET" });

export const apiPost = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", body: JSON.stringify(body) });

export const apiPatch = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "PATCH", body: JSON.stringify(body) });

export const apiDelete = <T>(url: string, body?: unknown) =>
  request<T>(url, {
    method: "DELETE",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
