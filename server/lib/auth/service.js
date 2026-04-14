import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { recordAppPathMutations } from "../customware/git_history.js";
import { normalizeEntityId } from "../customware/layout.js";
import {
  SINGLE_USER_APP_USERNAME,
  isSingleUserApp
} from "../utils/runtime_params.js";
import { createEmptyUserIndex } from "./user_index.js";
import { loadAuthKeys } from "./keys_manage.js";
import {
  createPasswordVerifier,
  decodeBase64Url,
  encodeBase64Url,
  migratePasswordVerifierRecord,
  openPasswordVerifierRecord,
  verifyLoginProof,
  verifyPassword
} from "./passwords.js";
import { setUserPassword } from "./user_manage.js";
import {
  readUserLogins,
  readUserPasswordVerifier,
  writeUserLogins,
  writeUserPasswordVerifier
} from "./user_files.js";
import { LOGIN_CHALLENGE_AREA } from "../../runtime/state_areas.js";

const SESSION_COOKIE_NAME = "space_session";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,200}$/u;
const REMOTE_ADDRESS_MAX_LENGTH = 256;
const SESSION_SIGNATURE_PREFIX = "space-session-record-v1";
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,200}$/u;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_VERIFIER_PREFIX = "space-session-token-v1";
const USER_AGENT_MAX_LENGTH = 512;

function createStatusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createAnonymousUser(overrides = {}) {
  return {
    isAuthenticated: false,
    session: null,
    sessionToken: "",
    shouldClearSessionCookie: false,
    source: "anonymous",
    username: "",
    ...overrides
  };
}

function createSingleUser(overrides = {}) {
  return {
    isAuthenticated: true,
    session: null,
    sessionToken: "",
    shouldClearSessionCookie: false,
    source: "single-user-app",
    username: SINGLE_USER_APP_USERNAME,
    ...overrides
  };
}

function serializeCookie(name, value, attributes = {}) {
  const segments = [`${name}=${encodeURIComponent(String(value || ""))}`];

  Object.entries(attributes).forEach(([key, rawValue]) => {
    if (rawValue === false || rawValue === undefined || rawValue === null) {
      return;
    }

    if (rawValue === true) {
      segments.push(key);
      return;
    }

    segments.push(`${key}=${rawValue}`);
  });

  return segments.join("; ");
}

function createSessionCookieHeader(sessionToken) {
  return serializeCookie(SESSION_COOKIE_NAME, sessionToken, {
    HttpOnly: true,
    "Max-Age": Math.floor(SESSION_TTL_MS / 1000),
    Path: "/",
    SameSite: "Strict"
  });
}

function createClearedSessionCookieHeader() {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    HttpOnly: true,
    "Max-Age": 0,
    Path: "/",
    SameSite: "Strict"
  });
}

function normalizeNonce(value) {
  const nonce = String(value || "").trim();
  return NONCE_PATTERN.test(nonce) ? nonce : "";
}

function normalizeSessionToken(value) {
  const sessionToken = String(value || "").trim();
  return SESSION_TOKEN_PATTERN.test(sessionToken) ? sessionToken : "";
}

function createChallengeToken() {
  return randomBytes(24).toString("base64url");
}

function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function createStateBackedLoginChallengeStore(stateSystem) {
  return {
    async consumeLoginChallenge(challengeToken) {
      const normalizedChallengeToken = String(challengeToken || "").trim();

      if (!normalizedChallengeToken) {
        return null;
      }

      const entry = await stateSystem.takeEntry(LOGIN_CHALLENGE_AREA, normalizedChallengeToken);
      const challenge =
        entry?.value && typeof entry.value === "object" && !Array.isArray(entry.value)
          ? entry.value
          : null;

      return challenge ? { ...challenge } : null;
    },
    async storeLoginChallenge(challenge) {
      const normalizedChallengeToken = String(challenge?.challengeToken || "").trim();

      if (!normalizedChallengeToken) {
        throw new Error("Challenge token is required.");
      }

      await stateSystem.setEntry(
        LOGIN_CHALLENGE_AREA,
        normalizedChallengeToken,
        {
          ...challenge,
          challengeToken: normalizedChallengeToken
        },
        {
          expiresInMs: CHALLENGE_TTL_MS,
          replicate: false
        }
      );
    }
  };
}

function normalizeHeaderValue(value, maxLength) {
  return String(value || "").slice(0, maxLength);
}

function getRemoteAddress(req) {
  const forwardedFor = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const remoteAddress = forwardedFor || String(req?.socket?.remoteAddress || "");
  return normalizeHeaderValue(remoteAddress, REMOTE_ADDRESS_MAX_LENGTH);
}

function getUserAgentFromHeaders(headers) {
  return normalizeHeaderValue(headers?.["user-agent"], USER_AGENT_MAX_LENGTH);
}

function resolveRequestInfo(options = {}) {
  const requestInfo =
    options.requestInfo && typeof options.requestInfo === "object" && !Array.isArray(options.requestInfo)
      ? options.requestInfo
      : null;

  if (requestInfo) {
    return {
      remoteAddress: normalizeHeaderValue(requestInfo.remoteAddress, REMOTE_ADDRESS_MAX_LENGTH),
      userAgent: normalizeHeaderValue(requestInfo.userAgent, USER_AGENT_MAX_LENGTH)
    };
  }

  return {
    remoteAddress: getRemoteAddress(options.req),
    userAgent: getUserAgentFromHeaders(options.req?.headers)
  };
}

function getSessionHmacKey(authKeys) {
  const key = authKeys?.sessionHmacKey;

  if (!Buffer.isBuffer(key) || key.length === 0) {
    throw new Error("Session HMAC key is unavailable.");
  }

  return key;
}

function createSessionVerifier(sessionToken, authKeys) {
  return encodeBase64Url(
    createHmac("sha256", getSessionHmacKey(authKeys))
      .update(`${SESSION_VERIFIER_PREFIX}:${sessionToken}`)
      .digest()
  );
}

function buildSessionSignaturePayload(fields = {}) {
  return JSON.stringify({
    createdAt: String(fields.createdAt || ""),
    expiresAt: String(fields.expiresAt || ""),
    prefix: SESSION_SIGNATURE_PREFIX,
    remoteAddress: String(fields.remoteAddress || ""),
    sessionVerifier: String(fields.sessionVerifier || ""),
    userAgent: String(fields.userAgent || ""),
    username: String(fields.username || "")
  });
}

function createSessionSignature(fields, authKeys) {
  return encodeBase64Url(
    createHmac("sha256", getSessionHmacKey(authKeys))
      .update(buildSessionSignaturePayload(fields))
      .digest()
  );
}

function isSafeEqualBase64Url(left, right) {
  const leftBuffer = decodeBase64Url(left);
  const rightBuffer = decodeBase64Url(right);

  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length === 0) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeIsoDate(value) {
  const normalized = String(value || "").trim();
  const parsedAtMs = Date.parse(normalized);

  return Number.isFinite(parsedAtMs) ? new Date(parsedAtMs).toISOString() : "";
}

function normalizeStoredSessionRecord(options = {}) {
  const session =
    options.session && typeof options.session === "object" && !Array.isArray(options.session)
      ? options.session
      : null;
  const sessionVerifier = String(options.sessionVerifier || "").trim();
  const username = normalizeEntityId(options.username);

  if (!session || !sessionVerifier || !username) {
    return null;
  }

  const createdAt = normalizeIsoDate(session.createdAt);
  const expiresAt = normalizeIsoDate(session.expiresAt);
  const remoteAddress = normalizeHeaderValue(session.remoteAddress, REMOTE_ADDRESS_MAX_LENGTH);
  const signature = String(session.signature || "").trim();
  const userAgent = normalizeHeaderValue(session.userAgent, USER_AGENT_MAX_LENGTH);

  if (!createdAt || !expiresAt || !signature) {
    return null;
  }

  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return null;
  }

  const expectedSignature = createSessionSignature(
    {
      createdAt,
      expiresAt,
      remoteAddress,
      sessionVerifier,
      userAgent,
      username
    },
    options.authKeys
  );

  if (!isSafeEqualBase64Url(expectedSignature, signature)) {
    return null;
  }

  return {
    createdAt,
    expiresAt,
    loginsPath: String(session.loginsPath || ""),
    remoteAddress,
    sessionVerifier,
    signature,
    userAgent,
    username
  };
}

function createPersistedSessionRecord({ req, requestInfo, sessionVerifier, username }, authKeys) {
  const resolvedRequestInfo = resolveRequestInfo({
    req,
    requestInfo
  });
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const remoteAddress = resolvedRequestInfo.remoteAddress;
  const userAgent = resolvedRequestInfo.userAgent;

  return {
    createdAt,
    expiresAt,
    remoteAddress,
    signature: createSessionSignature(
      {
        createdAt,
        expiresAt,
        remoteAddress,
        sessionVerifier,
        userAgent,
        username
      },
      authKeys
    ),
    userAgent
  };
}

function sanitizeStoredLogins(logins, username, authKeys) {
  const sanitizedLogins = {};

  Object.entries(logins || {}).forEach(([sessionVerifier, session]) => {
    const normalizedVerifier = String(sessionVerifier || "").trim();

    if (!normalizedVerifier) {
      return;
    }

    const normalizedSession = normalizeStoredSessionRecord({
      authKeys,
      session,
      sessionVerifier: normalizedVerifier,
      skipUserAgentCheck: true,
      username
    });

    if (!normalizedSession) {
      return;
    }

    sanitizedLogins[normalizedVerifier] = {
      createdAt: normalizedSession.createdAt,
      expiresAt: normalizedSession.expiresAt,
      remoteAddress: normalizedSession.remoteAddress,
      signature: normalizedSession.signature,
      userAgent: normalizedSession.userAgent
    };
  });

  return sanitizedLogins;
}

export function createAuthService(options = {}) {
  const authKeys = loadAuthKeys(options.projectRoot);
  const stateSystem =
    options.stateSystem &&
    typeof options.stateSystem === "object" &&
    !Array.isArray(options.stateSystem) &&
    typeof options.stateSystem.setEntry === "function" &&
    typeof options.stateSystem.takeEntry === "function"
      ? options.stateSystem
      : null;

  if (!stateSystem) {
    throw new Error("createAuthService() requires a shared state system.");
  }

  const challengeStore = createStateBackedLoginChallengeStore(stateSystem);
  const enableInitialization = options.enableInitialization !== false;
  const projectRoot = String(options.projectRoot || "");
  const runtimeParams = options.runtimeParams || null;
  const watchdog = options.watchdog || null;
  let initialized = false;

  function getUserIndex() {
    if (!watchdog || typeof watchdog.getIndex !== "function") {
      return createEmptyUserIndex();
    }

    return watchdog.getIndex("user_index") || createEmptyUserIndex();
  }

  function readCurrentPasswordVerifier(username) {
    return openPasswordVerifierRecord(
      readUserPasswordVerifier(projectRoot, username, runtimeParams),
      authKeys
    );
  }

  function resolveUserFromCookies(cookies = {}, headers = {}) {
    if (isSingleUserApp(runtimeParams)) {
      return createSingleUser();
    }

    const rawSessionToken = String(cookies[SESSION_COOKIE_NAME] || "").trim();

    if (!rawSessionToken) {
      return createAnonymousUser();
    }

    const sessionToken = normalizeSessionToken(rawSessionToken);

    if (!sessionToken) {
      return createAnonymousUser({
        sessionToken: rawSessionToken,
        shouldClearSessionCookie: true,
        source: "invalid-session-cookie-format"
      });
    }

    const userIndex = getUserIndex();
    const sessionVerifier = createSessionVerifier(sessionToken, authKeys);
    const session = userIndex.getSession(sessionVerifier);

    if (!session) {
      return createAnonymousUser({
        sessionToken,
        shouldClearSessionCookie: true,
        source: "invalid-session-cookie"
      });
    }

    const username = normalizeEntityId(session.username);
    const userRecord = userIndex.getUser(username);

    if (!username || !userRecord) {
      return createAnonymousUser({
        sessionToken,
        shouldClearSessionCookie: true,
        source: "stale-session-cookie"
      });
    }

    const normalizedSession = normalizeStoredSessionRecord({
      authKeys,
      session,
      sessionVerifier,
      username
    });

    if (!normalizedSession) {
      return createAnonymousUser({
        sessionToken,
        shouldClearSessionCookie: true,
        source: "rejected-session-cookie"
      });
    }

    return {
      isAuthenticated: true,
      session: normalizedSession,
      sessionToken,
      shouldClearSessionCookie: false,
      source: "session-cookie",
      username
    };
  }

  async function createLoginChallenge({ req, requestInfo, username, clientNonce }) {
    if (isSingleUserApp(runtimeParams)) {
      throw new Error("Password login is disabled in single-user mode.");
    }

    const resolvedRequestInfo = resolveRequestInfo({
      req,
      requestInfo
    });

    const normalizedUsername = normalizeEntityId(username);
    const normalizedClientNonce = normalizeNonce(clientNonce);
    const userIndex = getUserIndex();
    const userRecord = userIndex.getUser(normalizedUsername);
    const verifier =
      normalizedUsername && normalizedClientNonce && userRecord?.hasPassword
        ? readCurrentPasswordVerifier(normalizedUsername)
        : null;

    if (!normalizedUsername || !normalizedClientNonce || !verifier) {
      throw new Error("Invalid username or password.");
    }

    const serverNonce = createChallengeToken();
    const createdAtMs = Date.now();
    const challengeToken = createChallengeToken();

    await challengeStore.storeLoginChallenge({
      challengeToken,
      clientNonce: normalizedClientNonce,
      createdAtMs,
      serverNonce,
      userAgent: resolvedRequestInfo.userAgent,
      username: normalizedUsername
    });

    return {
      challengeToken,
      iterations: Number(verifier.iterations),
      passwordScheme: verifier.scheme,
      salt: verifier.salt,
      serverNonce
    };
  }

  async function completeLogin({ challengeToken, clientProof, req, requestInfo }) {
    if (isSingleUserApp(runtimeParams)) {
      throw new Error("Password login is disabled in single-user mode.");
    }

    const resolvedRequestInfo = resolveRequestInfo({
      req,
      requestInfo
    });

    const normalizedChallengeToken = String(challengeToken || "").trim();
    const challenge = await challengeStore.consumeLoginChallenge(normalizedChallengeToken);

    if (!challenge) {
      throw new Error("Login challenge expired. Try again.");
    }

    const verifier = getUserIndex().getUser(challenge.username)?.hasPassword
      ? readCurrentPasswordVerifier(challenge.username)
      : null;

    if (!verifier) {
      throw new Error("Invalid username or password.");
    }

    if (challenge.userAgent !== resolvedRequestInfo.userAgent) {
      throw new Error("Login challenge no longer matches this browser.");
    }

    const loginResult = verifyLoginProof({
      challengeToken: normalizedChallengeToken,
      clientNonce: challenge.clientNonce,
      clientProof,
      serverNonce: challenge.serverNonce,
      username: challenge.username,
      verifier
    });

    if (!loginResult.ok) {
      throw new Error("Invalid username or password.");
    }

    const sessionToken = createSessionToken();
    const sessionVerifier = createSessionVerifier(sessionToken, authKeys);
    const logins = sanitizeStoredLogins(
      readUserLogins(projectRoot, challenge.username, runtimeParams),
      challenge.username,
      authKeys
    );

    logins[sessionVerifier] = createPersistedSessionRecord(
      {
        requestInfo: resolvedRequestInfo,
        sessionVerifier,
        username: challenge.username
      },
      authKeys
    );

    writeUserLogins(projectRoot, challenge.username, logins, runtimeParams);
    recordAppPathMutations(
      {
        projectRoot,
        runtimeParams
      },
      [`/app/L2/${challenge.username}/meta/logins.json`]
    );

    return {
      serverSignature: loginResult.serverSignature,
      sessionToken,
      username: challenge.username
    };
  }

  async function revokeSession(sessionToken, username = "") {
    if (isSingleUserApp(runtimeParams)) {
      return false;
    }

    const normalizedSessionToken = normalizeSessionToken(sessionToken);
    const normalizedUsername = normalizeEntityId(username);

    if (!normalizedSessionToken || !normalizedUsername) {
      return false;
    }

    const sessionVerifier = createSessionVerifier(normalizedSessionToken, authKeys);
    const logins = sanitizeStoredLogins(
      readUserLogins(projectRoot, normalizedUsername, runtimeParams),
      normalizedUsername,
      authKeys
    );

    if (!Object.prototype.hasOwnProperty.call(logins, sessionVerifier)) {
      return false;
    }

    delete logins[sessionVerifier];
    writeUserLogins(projectRoot, normalizedUsername, logins, runtimeParams);
    recordAppPathMutations(
      {
        projectRoot,
        runtimeParams
      },
      [`/app/L2/${normalizedUsername}/meta/logins.json`]
    );

    return true;
  }

  function changePassword({ currentPassword, newPassword, requestUser }) {
    if (isSingleUserApp(runtimeParams)) {
      throw createStatusError("Password login is disabled in single-user mode.", 403);
    }

    const authenticatedUser = getAuthenticatedUser(requestUser);
    const normalizedUsername = normalizeEntityId(authenticatedUser.username);
    const verifier = normalizedUsername ? readCurrentPasswordVerifier(normalizedUsername) : null;

    if (!verifier || !verifyPassword(currentPassword, verifier)) {
      throw createStatusError("Current password is incorrect.", 401);
    }

    setUserPassword(projectRoot, normalizedUsername, newPassword, {
      runtimeParams
    });

    return {
      username: normalizedUsername
    };
  }

  function generatePasswordVerifier(password) {
    return createPasswordVerifier(password, authKeys);
  }

  async function initialize() {
    if (initialized) {
      return;
    }

    initialized = true;

    if (!enableInitialization) {
      return;
    }

    const userIndex = getUserIndex();
    const usernames = Object.keys(userIndex.users || {});
    let changed = false;
    const changedProjectPaths = new Set();

    usernames.forEach((username) => {
      const normalizedUsername = normalizeEntityId(username);

      if (!normalizedUsername) {
        return;
      }

      const passwordRecord = readUserPasswordVerifier(projectRoot, normalizedUsername, runtimeParams);
      const currentLogins = readUserLogins(projectRoot, normalizedUsername, runtimeParams);
      const migratedPasswordRecord = migratePasswordVerifierRecord(passwordRecord, authKeys);
      const sanitizedLogins = sanitizeStoredLogins(
        currentLogins,
        normalizedUsername,
        authKeys
      );

      if (
        migratedPasswordRecord &&
        JSON.stringify(passwordRecord || {}) !== JSON.stringify(migratedPasswordRecord)
      ) {
        writeUserPasswordVerifier(projectRoot, normalizedUsername, migratedPasswordRecord, runtimeParams);
        recordAppPathMutations(
          {
            projectRoot,
            runtimeParams
          },
          [`/app/L2/${normalizedUsername}/meta/password.json`]
        );
        changedProjectPaths.add(`/app/L2/${normalizedUsername}/meta/password.json`);
        changed = true;
      }

      if (
        JSON.stringify(currentLogins || {}) !== JSON.stringify(sanitizedLogins)
      ) {
        writeUserLogins(projectRoot, normalizedUsername, sanitizedLogins, runtimeParams);
        recordAppPathMutations(
          {
            projectRoot,
            runtimeParams
          },
          [`/app/L2/${normalizedUsername}/meta/logins.json`]
        );
        changedProjectPaths.add(`/app/L2/${normalizedUsername}/meta/logins.json`);
        changed = true;
      }
    });

    if (
      changed &&
      watchdog &&
      typeof watchdog.applyProjectPathChanges === "function" &&
      changedProjectPaths.size > 0
    ) {
      await watchdog.applyProjectPathChanges([...changedProjectPaths]);
    }
  }

  function getAuthenticatedUser(requestUser) {
    if (requestUser && requestUser.isAuthenticated) {
      return requestUser;
    }

    throw new Error("Authentication required.");
  }

  return {
    changePassword,
    completeLogin,
    createClearedSessionCookieHeader,
    createLoginChallenge,
    createSessionCookieHeader,
    generatePasswordVerifier,
    getAuthenticatedUser,
    getUserIndex,
    initialize,
    revokeSession,
    resolveUserFromCookies
  };
}

export {
  CHALLENGE_TTL_MS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createClearedSessionCookieHeader,
  createSessionCookieHeader
};
