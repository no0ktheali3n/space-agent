import { isSingleUserApp } from "../lib/utils/runtime_params.js";
import { runTrackedMutation } from "../runtime/request_mutations.js";

const FAILED_PASSWORD_CHANGE_MIN_DURATION_MS = 1000;

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForMinimumDuration(startedAtMs, minimumDurationMs) {
  const elapsedMs = Date.now() - startedAtMs;

  if (elapsedMs < minimumDurationMs) {
    await wait(minimumDurationMs - elapsedMs);
  }
}

export async function post(context) {
  if (isSingleUserApp(context.runtimeParams)) {
    throw createHttpError("Password login is disabled in single-user mode.", 403);
  }

  const payload = readPayload(context);

  if (typeof payload.currentPassword !== "string") {
    throw createHttpError("Current password must be provided as a string.", 400);
  }

  if (typeof payload.newPassword !== "string") {
    throw createHttpError("New password must be provided as a string.", 400);
  }

  const startedAtMs = Date.now();

  try {
    const result = await runTrackedMutation(context, async () =>
      context.auth.changePassword({
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
        requestUser: context.user
      })
    );

    return {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": context.auth.createClearedSessionCookieHeader()
      },
      body: {
        passwordChanged: true,
        signedOut: true,
        username: result.username
      }
    };
  } catch (error) {
    await waitForMinimumDuration(startedAtMs, FAILED_PASSWORD_CHANGE_MIN_DURATION_MS);
    throw createHttpError(error.message || "Password change failed.", Number(error.statusCode) || 500);
  }
}
