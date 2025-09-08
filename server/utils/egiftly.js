const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

// Environment
const BASE_URL = process.env.EGIFTLY_BASE_URL || "";
const CLIENT_ID = process.env.EGIFTLY_CLIENT_ID || "";
const USERNAME = process.env.EGIFTLY_USERNAME || "";
const PASSWORD = process.env.EGIFTLY_PASSWORD || "";
const ORDER_CREATE_PATH = process.env.EGIFTLY_ORDER_CREATE_PATH || "/api/order/create"; // per docs
const LOGIN_PATH = process.env.EGIFTLY_LOGIN_PATH || "/api/login"; // adjust to real login path if different
const TIMEOUT = Number(process.env.EGIFTLY_TIMEOUT_MS || 15000);
const DEBUG = String(process.env.EGIFTLY_DEBUG || "").trim() === "1";

let tokenCache = {
  token: null,
  expiresAt: 0,
};

function buildClient(authToken) {
  const instance = axios.create({
    baseURL: BASE_URL,
    timeout: TIMEOUT,
    headers: {
      "egiftly-client-id": CLIENT_ID,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (authToken) instance.defaults.headers["Authorization"] = `Bearer ${authToken}`;
  return instance;
}

async function login(force = false) {
  const now = Date.now();
  if (!force && tokenCache.token && tokenCache.expiresAt > now + 5000) {
    return tokenCache.token;
  }
  // NOTE: Adjust body fields per EGIFTLY docs if different
  const client = buildClient();
  // Many providers expect 'email' not 'username'
  const resp = await client.post(LOGIN_PATH, { email: USERNAME, password: PASSWORD });
  // Expecting: token in one of common shapes
  const token = resp.data?.data?.token || resp.data?.token || resp.data?.data?.access_token || resp.data?.access_token || resp.data?.data?.authToken;
  const expiresIn = Number(resp.data?.data?.expires_in || resp.data?.expires_in || 3600);
  if (!token) {
    const snapshot = (() => {
      try { return JSON.stringify(resp.data); } catch { return String(resp.data); }
    })();
    throw new Error(`EGIFTLY login failed: token missing. Response=${snapshot}`);
  }
  tokenCache = {
    token,
    expiresAt: now + expiresIn * 1000,
  };
  return token;
}

async function withAuth(handler) {
  try {
    const tok = await login();
    return await handler(buildClient(tok));
  } catch (e) {
    // retry once if 401
    if (e.response && e.response.status === 401) {
      const tok = await login(true);
      return await handler(buildClient(tok));
    }
    throw e;
  }
}

async function createOrder({ brandId, denominationId, uniqueDenominationId, quantity = 1, reference, recipient }) {
  return withAuth(async (client) => {
    // Validate mapping between denominationId and uniqueDenominationId if both provided
    if (denominationId != null && uniqueDenominationId != null) {
      try {
        const did = Number(denominationId);
        const { data: denomResp } = await client.get(`/api/denominations/${did}`);
        const apiUniqueId = denomResp?.data?.uniqueDenominationId ?? denomResp?.data?.demominationUniqueRecordId;
        if (Number(uniqueDenominationId) !== Number(apiUniqueId)) {
          const msg = `uniqueDenominationId (${uniqueDenominationId}) does not belong to denominationId (${denominationId}). Expected ${apiUniqueId}.`;
          if (DEBUG) { try { console.warn("[EGIFTLY WARN]", msg); } catch {} }
          throw new Error(msg);
        }
      } catch (ve) {
        if (DEBUG) {
          try { console.error("[EGIFTLY DEBUG] validation error", ve?.response?.status, JSON.stringify(ve?.response?.data || ve.message)); } catch {}
        }
        throw ve;
      }
    }
    // Per docs: POST /api/order/create expects
    // { "uniqueOrderId": string, "denominationId": number, "uniqueDenominationId": number?, "quantity": number }
    const payload = {
      uniqueOrderId: String(reference || Date.now()),
      denominationId: denominationId != null ? Number(denominationId) : undefined,
      quantity: Number(quantity || 1),
    };
    if (uniqueDenominationId != null) payload.uniqueDenominationId = Number(uniqueDenominationId);
    if (DEBUG) {
      try { console.log("[EGIFTLY DEBUG] createOrder payload=", JSON.stringify(payload)); } catch {}
    }
    try {
      const { data } = await client.post(ORDER_CREATE_PATH, payload);
      if (DEBUG) {
        try { console.log("[EGIFTLY DEBUG] createOrder resp=", JSON.stringify(data)); } catch {}
      }
      return data; // Expect data to include order id and codes list
    } catch (err) {
      if (DEBUG) {
        const status = err?.response?.status;
        const body = err?.response?.data || err?.message;
        try { console.log("[EGIFTLY DEBUG] createOrder error status=", status, " data=", JSON.stringify(body)); } catch {}
      }
      throw err;
    }
  });
}

module.exports = {
  login,
  createOrder,
};
