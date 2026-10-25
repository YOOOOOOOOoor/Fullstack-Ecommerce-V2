export const paymentRemainingFromDeadline = (expiresAt, serverOffsetMs = 0, nowMs = Date.now()) => {
  const deadline = new Date(expiresAt).getTime();
  const offset = Number(serverOffsetMs);
  if (!Number.isFinite(deadline) || !Number.isFinite(offset) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, deadline - (nowMs + offset));
};

export const paymentServerOffset = (serverNow, clientNow = Date.now()) => {
  const serverTime = new Date(serverNow).getTime();
  if (!Number.isFinite(serverTime) || !Number.isFinite(clientNow)) return 0;
  return serverTime - clientNow;
};
