export const SESSION_INVALID_EVENT = "terminal-hub:session-invalid";

export type SessionInvalidReason = "http-401" | "ws-auth-failed";

interface SessionInvalidEventDetail {
  reason: SessionInvalidReason;
}

export function dispatchSessionInvalidEvent(
  reason: SessionInvalidReason,
): void {
  window.dispatchEvent(
    new CustomEvent<SessionInvalidEventDetail>(SESSION_INVALID_EVENT, {
      detail: { reason },
    }),
  );
}
