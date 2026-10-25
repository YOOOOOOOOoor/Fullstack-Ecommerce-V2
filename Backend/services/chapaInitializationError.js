const safeErrorCode = (code) => /^[A-Za-z0-9_-]{1,40}$/.test(String(code || "")) ? String(code) : null;

// Avoid logging Axios config/headers, provider response bodies, or raw error messages.
export const chapaInitializationErrorDetails = (error) => {
  if (error?.response) {
    const status = Number(error.response.status);
    return { category: "provider_response", status: Number.isInteger(status) ? status : null };
  }
  if (error?.isAxiosError) {
    return { category: "provider_transport", code: safeErrorCode(error.code) || "unknown" };
  }
  return { category: "application", code: safeErrorCode(error?.code) || "internal_error" };
};
