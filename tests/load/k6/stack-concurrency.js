import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const scenario = JSON.parse(open(__ENV.SCENARIO_FILE || "/work/config/scenario.json"));
const usersFile = JSON.parse(open(__ENV.USERS_FILE || "/work/data/users.json"));
const seedData = JSON.parse(open(__ENV.SEED_FILE || "/work/data/seed-data.json"));

const mode = (__ENV.LOAD_MODE || "quick").toLowerCase();
const modeConfig = scenario[mode] || scenario.quick;
const target = scenario.target || {};
const timing = scenario.timing || {};
const weights = scenario.weights || {};
const hotspotCfg = scenario.hotspot || {};

const BASE_URL = __ENV.BASE_URL || target.baseUrl || "http://backend:8000";
const REFRESH_COOKIE_NAME = target.refreshCookieName || "refresh_token";
const READ_WEIGHT = Number(weights.reads || 55);
const THINK_MIN = Number(timing.thinkTimeMinSeconds || 0.2);
const THINK_MAX = Number(timing.thinkTimeMaxSeconds || 1.2);
const REFRESH_EVERY = Number(timing.refreshEveryIterations || 20);
const STALE_EVERY = Number(hotspotCfg.staleEtagEvery || 4);

const managerUsers = usersFile.managerUsers || [];
const userUsers = usersFile.userUsers || [];
const weekKeys = (seedData.weekKeys || []).slice(0, 12);
const ids = seedData.ids || {};

const seedProjectIds = ids.projectIds || [];
const seedPersonIds = ids.personIds || [];
const seedAssignmentIds = ids.assignmentIds || [];
const hotAssignmentIds = ids.hotAssignmentIds || seedAssignmentIds;
const departmentIds = ids.departmentIds || [];
const roleIds = ids.roleIds || [];

const status409 = new Counter("status_409");
const status412 = new Counter("status_412");
const status429 = new Counter("status_429");
const status5xx = new Counter("status_5xx");
const authFailures = new Counter("auth_failures");
const expectedConflicts = new Counter("expected_conflicts");

const httpErrors = new Rate("http_errors");
const readLatency = new Trend("read_latency_ms", true);
const writeLatency = new Trend("write_latency_ms", true);

const sessionState = {
  manager: {},
  user: {},
};

function randomInt(minIncl, maxIncl) {
  return Math.floor(Math.random() * (maxIncl - minIncl + 1)) + minIncl;
}

function randomChoice(items) {
  if (!items || items.length === 0) return null;
  return items[randomInt(0, items.length - 1)];
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(response) {
  try {
    return response.json();
  } catch (e) {
    return null;
  }
}

function getCookieValue(response, key) {
  if (!response || !response.cookies || !response.cookies[key] || response.cookies[key].length === 0) {
    return null;
  }
  return response.cookies[key][0].value || null;
}

function weightedPick(weightMap) {
  const entries = Object.entries(weightMap || {});
  let total = 0;
  for (const [, weight] of entries) total += Number(weight || 0);
  if (total <= 0 || entries.length === 0) return null;
  let n = Math.random() * total;
  for (const [key, weight] of entries) {
    n -= Number(weight || 0);
    if (n <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function buildWeeklyHours(baseHours) {
  const base = {};
  if (baseHours && typeof baseHours === "object") {
    Object.keys(baseHours).forEach((k) => {
      base[k] = baseHours[k];
    });
  }
  const targetKey = randomChoice(weekKeys) || nowIso().slice(0, 10);
  const current = Number(base[targetKey] || 0);
  const delta = Math.random() < 0.5 ? -2 : 2;
  const next = Math.max(0, Math.min(40, current + delta));
  base[targetKey] = Math.round(next * 100) / 100;
  return base;
}

function recordResponse(response, kind, expectedStatuses) {
  const status = Number(response.status || 0);
  const ok = expectedStatuses.indexOf(status) >= 0;

  if (kind === "read") {
    readLatency.add(response.timings.duration);
  } else if (kind === "write") {
    writeLatency.add(response.timings.duration);
  }

  if (status === 409) status409.add(1);
  if (status === 412) status412.add(1);
  if (status === 429) status429.add(1);
  if (status >= 500) status5xx.add(1);

  httpErrors.add(!ok);
  return ok;
}

function authHeaders(session, extra) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) headers[k] = v;
  }
  return headers;
}

function loginWithCredential(credential) {
  const response = http.post(
    `${BASE_URL}/api/token/`,
    JSON.stringify({ username: credential.username, password: credential.password }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { category: "auth", op: "token_obtain" },
      timeout: "60s",
    }
  );
  const payload = parseJson(response) || {};
  const access = payload.access || null;
  const refreshBody = payload.refresh || null;
  const refreshCookie = getCookieValue(response, REFRESH_COOKIE_NAME);
  const refresh = refreshBody || refreshCookie || null;
  const ok = response.status === 200 && !!access;
  if (!ok) authFailures.add(1);
  return {
    ok,
    status: response.status,
    access,
    refresh,
  };
}

function refreshSession(session) {
  if (!session || !session.refreshToken) return false;
  const response = http.post(
    `${BASE_URL}/api/token/refresh/`,
    JSON.stringify({ refresh: session.refreshToken }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { category: "auth", op: "token_refresh" },
      timeout: "60s",
    }
  );
  const payload = parseJson(response) || {};
  if (response.status !== 200 || !payload.access) {
    authFailures.add(1);
    return false;
  }
  session.accessToken = payload.access;
  const refreshCookie = getCookieValue(response, REFRESH_COOKIE_NAME);
  if (refreshCookie) session.refreshToken = refreshCookie;
  return true;
}

function ensureSession(role) {
  const pool = role === "manager" ? managerUsers : userUsers;
  if (!pool || pool.length === 0) {
    throw new Error(`No credentials configured for role=${role}.`);
  }
  const idx = (__VU - 1) % pool.length;
  const key = `${role}-${idx}`;
  let session = sessionState[role][key];
  if (!session) {
    const login = loginWithCredential(pool[idx]);
    if (!login.ok) throw new Error(`Unable to authenticate role=${role}, status=${login.status}`);
    session = {
      username: pool[idx].username,
      password: pool[idx].password,
      accessToken: login.access,
      refreshToken: login.refresh,
      iterSinceRefresh: 0,
      localProjectIds: [],
      localPersonIds: [],
      localAssignmentIds: [],
      staleEtagByAssignment: {},
    };
    sessionState[role][key] = session;
  }

  session.iterSinceRefresh += 1;
  if (session.iterSinceRefresh >= REFRESH_EVERY) {
    const refreshed = refreshSession(session);
    if (!refreshed) {
      const relogin = loginWithCredential({ username: session.username, password: session.password });
      if (relogin.ok) {
        session.accessToken = relogin.access;
        session.refreshToken = relogin.refresh;
      }
    }
    session.iterSinceRefresh = 0;
  }
  return session;
}

function withPrefix(label) {
  const runPrefix = seedData.prefix || `LT_${__ENV.RUN_ID || "k6"}_`;
  const n = Math.floor(Math.random() * 1000000);
  return `${runPrefix}K6 ${label} ${n}`;
}

function pickProjectId(session) {
  return randomChoice(session.localProjectIds) || randomChoice(seedProjectIds);
}

function pickPersonId(session) {
  return randomChoice(session.localPersonIds) || randomChoice(seedPersonIds);
}

function pickAssignmentIds(session, count) {
  const source = session.localAssignmentIds.length > 0 ? session.localAssignmentIds : seedAssignmentIds;
  if (source.length === 0) return [];
  const out = [];
  for (let idx = 0; idx < count; idx += 1) out.push(source[(idx + __ITER + __VU) % source.length]);
  return out;
}

function readProjectsSearch(session) {
  const payload = {
    page: 1,
    page_size: 50,
    ordering: "name",
    search_tokens: [{ term: seedData.prefix || "LT_", op: "and" }],
  };
  const response = http.post(`${BASE_URL}/api/projects/search/`, JSON.stringify(payload), {
    headers: authHeaders(session),
    tags: { category: "read", op: "projects_search" },
    timeout: "60s",
  });
  return recordResponse(response, "read", [200]);
}

function readProjectsList(session) {
  const response = http.get(`${BASE_URL}/api/projects/?page=1&page_size=50`, {
    headers: authHeaders(session),
    tags: { category: "read", op: "projects_list" },
    timeout: "60s",
  });
  return recordResponse(response, "read", [200]);
}

function readPeopleSearch(session) {
  const payload = {
    page: 1,
    page_size: 50,
    include_inactive: 0,
    search_tokens: [{ term: seedData.prefix || "LT_", op: "and" }],
  };
  const response = http.post(`${BASE_URL}/api/people/search/`, JSON.stringify(payload), {
    headers: authHeaders(session),
    tags: { category: "read", op: "people_search" },
    timeout: "60s",
  });
  return recordResponse(response, "read", [200]);
}

function readGridSnapshot(session) {
  const response = http.get(`${BASE_URL}/api/assignments/grid_snapshot/?weeks=12&include_children=0`, {
    headers: authHeaders(session),
    tags: { category: "read", op: "grid_snapshot" },
    timeout: "60s",
  });
  return recordResponse(response, "read", [200]);
}

function readUiAssignmentsPage(session) {
  const response = http.get(
    `${BASE_URL}/api/ui/assignments-page/?weeks=20&include_children=0&include_placeholders=0&include=assignment%2Cproject`,
    {
      headers: authHeaders(session),
      tags: { category: "read", op: "ui_assignments_page" },
      timeout: "60s",
    }
  );
  return recordResponse(response, "read", [200]);
}

function writeCreateProject(session) {
  const payload = {
    name: withPrefix("Project"),
    client: withPrefix("Client"),
    status: "active",
    description: "k6 load test project",
  };
  const response = http.post(`${BASE_URL}/api/projects/`, JSON.stringify(payload), {
    headers: authHeaders(session),
    tags: { category: "write", op: "create_project" },
    timeout: "60s",
  });
  const ok = recordResponse(response, "write", [201]);
  if (ok) {
    const data = parseJson(response);
    if (data && data.id) session.localProjectIds.push(Number(data.id));
  }
  return ok;
}

function writeUpdateProject(session) {
  const projectId = pickProjectId(session);
  if (!projectId) return true;

  const getResponse = http.get(`${BASE_URL}/api/projects/${projectId}/`, {
    headers: authHeaders(session),
    tags: { category: "write", op: "update_project_prefetch" },
    timeout: "60s",
  });
  if (!recordResponse(getResponse, "read", [200])) return false;

  const etag = getResponse.headers.ETag || getResponse.headers.Etag || null;
  const response = http.patch(
    `${BASE_URL}/api/projects/${projectId}/`,
    JSON.stringify({ description: `k6 update ${nowIso()}` }),
    {
      headers: authHeaders(session, etag ? { "If-Match": etag } : null),
      tags: { category: "write", op: "update_project" },
      timeout: "60s",
    }
  );
  return recordResponse(response, "write", [200, 412]);
}

function writeCreatePerson(session) {
  const payload = {
    name: withPrefix("Person"),
    weeklyCapacity: randomInt(32, 40),
    department: randomChoice(departmentIds),
    role: randomChoice(roleIds),
    location: "LoadTest",
    notes: "k6 seeded person",
  };
  const response = http.post(`${BASE_URL}/api/people/`, JSON.stringify(payload), {
    headers: authHeaders(session),
    tags: { category: "write", op: "create_person" },
    timeout: "60s",
  });
  const ok = recordResponse(response, "write", [201]);
  if (ok) {
    const data = parseJson(response);
    if (data && data.id) session.localPersonIds.push(Number(data.id));
  }
  return ok;
}

function writeUpdatePerson(session) {
  const personId = pickPersonId(session);
  if (!personId) return true;
  const getResponse = http.get(`${BASE_URL}/api/people/${personId}/`, {
    headers: authHeaders(session),
    tags: { category: "write", op: "update_person_prefetch" },
    timeout: "60s",
  });
  if (!recordResponse(getResponse, "read", [200])) return false;

  const etag = getResponse.headers.ETag || getResponse.headers.Etag || null;
  const payload = {
    location: `Load-${Math.floor(Math.random() * 500)}`,
    notes: `updated ${nowIso()}`,
  };
  const response = http.patch(`${BASE_URL}/api/people/${personId}/`, JSON.stringify(payload), {
    headers: authHeaders(session, etag ? { "If-Match": etag } : null),
    tags: { category: "write", op: "update_person" },
    timeout: "60s",
  });
  return recordResponse(response, "write", [200, 412]);
}

function writeCreateAssignment(session) {
  const personId = pickPersonId(session);
  const projectId = pickProjectId(session);
  if (!personId || !projectId) return true;
  const payload = {
    person: personId,
    project: projectId,
    weeklyHours: buildWeeklyHours({}),
  };
  const response = http.post(`${BASE_URL}/api/assignments/`, JSON.stringify(payload), {
    headers: authHeaders(session),
    tags: { category: "write", op: "create_assignment" },
    timeout: "60s",
  });
  const ok = recordResponse(response, "write", [201, 400, 409]);
  if (ok && response.status === 201) {
    const data = parseJson(response);
    if (data && data.id) session.localAssignmentIds.push(Number(data.id));
  }
  return ok;
}

function writeBulkUpdateHours(session) {
  const assignmentIds = pickAssignmentIds(session, 3);
  if (assignmentIds.length === 0) return true;
  const updates = assignmentIds.map((assignmentId) => ({
    assignmentId,
    weeklyHours: buildWeeklyHours({}),
  }));
  const response = http.patch(
    `${BASE_URL}/api/assignments/bulk_update_hours/`,
    JSON.stringify({ updates }),
    {
      headers: authHeaders(session),
      tags: { category: "write", op: "bulk_update_hours" },
      timeout: "60s",
    }
  );
  return recordResponse(response, "write", [200, 404, 409]);
}

function performRead(session, selectedOp) {
  const op = selectedOp || weightedPick((weights.readOps || {})) || "projectsSearch";
  if (op === "projectsSearch") return readProjectsSearch(session);
  if (op === "projectsList") return readProjectsList(session);
  if (op === "peopleSearch") return readPeopleSearch(session);
  if (op === "gridSnapshot") return readGridSnapshot(session);
  return readUiAssignmentsPage(session);
}

function roleForReadOp(op) {
  // Project read endpoints require elevated access in this stack.
  if (op === "projectsSearch" || op === "projectsList") {
    return "manager";
  }
  return "user";
}

function performWrite(session) {
  const op = weightedPick((weights.writeOps || {})) || "bulkUpdateHours";
  if (op === "createProject") return writeCreateProject(session);
  if (op === "updateProject") return writeUpdateProject(session);
  if (op === "createPerson") return writeCreatePerson(session);
  if (op === "updatePerson") return writeUpdatePerson(session);
  if (op === "createAssignment") return writeCreateAssignment(session);
  return writeBulkUpdateHours(session);
}

function think() {
  const wait = THINK_MIN + Math.random() * Math.max(0, THINK_MAX - THINK_MIN);
  sleep(wait);
}

function requiredDataCheck() {
  if (managerUsers.length === 0) throw new Error("No managerUsers provided.");
  if (userUsers.length === 0) throw new Error("No userUsers provided.");
  if (seedProjectIds.length === 0) throw new Error("No seed project IDs provided.");
  if (seedPersonIds.length === 0) throw new Error("No seed person IDs provided.");
  if (seedAssignmentIds.length === 0) throw new Error("No seed assignment IDs provided.");
}

function hotspotUpdate(session, assignmentId) {
  const getResponse = http.get(`${BASE_URL}/api/assignments/${assignmentId}/`, {
    headers: authHeaders(session),
    tags: { category: "hotspot", op: "hotspot_prefetch" },
    timeout: "60s",
  });
  if (!recordResponse(getResponse, "read", [200])) return false;

  const data = parseJson(getResponse) || {};
  const currentEtag = getResponse.headers.ETag || getResponse.headers.Etag || null;
  const staleKey = String(assignmentId);
  const shouldUseStale = STALE_EVERY > 0 && (__ITER % STALE_EVERY === 0) && !!session.staleEtagByAssignment[staleKey];
  const etagToUse = shouldUseStale ? session.staleEtagByAssignment[staleKey] : currentEtag;
  const weeklyHours = buildWeeklyHours(data.weeklyHours || {});

  const patchResponse = http.patch(
    `${BASE_URL}/api/assignments/${assignmentId}/`,
    JSON.stringify({ weeklyHours }),
    {
      headers: authHeaders(session, etagToUse ? { "If-Match": etagToUse } : null),
      tags: { category: "hotspot", op: "hotspot_patch" },
      timeout: "60s",
    }
  );

  const ok = recordResponse(patchResponse, "write", [200, 412]);
  if (patchResponse.status === 412) expectedConflicts.add(1);
  const nextEtag = patchResponse.headers.ETag || patchResponse.headers.Etag || currentEtag;
  if (nextEtag) session.staleEtagByAssignment[staleKey] = nextEtag;
  return ok;
}

const thresholds = scenario.thresholds || {};
const scenarioOptions = {
  mixed_flow: {
    executor: "ramping-vus",
    exec: "mixedScenario",
    startVUs: Number((modeConfig.mixed || {}).startVUs || 10),
    stages: (modeConfig.mixed || {}).stages || [],
    gracefulRampDown: "30s",
  },
  hotspot_contention: {
    executor: "constant-vus",
    exec: "hotspotScenario",
    vus: Number((modeConfig.hotspot || {}).vus || 0),
    startTime: (modeConfig.hotspot || {}).startTime || "0s",
    duration: (modeConfig.hotspot || {}).duration || "0s",
  },
  auth_stability: {
    executor: "constant-vus",
    exec: "authScenario",
    vus: Number((modeConfig.auth || {}).vus || 0),
    duration: (modeConfig.auth || {}).duration || "0s",
    startTime: "0s",
  },
};

if (scenarioOptions.hotspot_contention.vus <= 0) delete scenarioOptions.hotspot_contention;
if (scenarioOptions.auth_stability.vus <= 0) delete scenarioOptions.auth_stability;

export const options = {
  scenarios: scenarioOptions,
  thresholds: {
    http_errors: [`rate<${Number(thresholds.errorRate || 0.01)}`],
    read_latency_ms: [`p(95)<${Number(thresholds.readP95Ms || 1000)}`],
    write_latency_ms: [`p(95)<${Number(thresholds.writeP95Ms || 1500)}`],
  },
  summaryTrendStats: ["min", "avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function setup() {
  requiredDataCheck();
  return {
    mode,
    baseUrl: BASE_URL,
  };
}

export function mixedScenario() {
  const doRead = Math.random() * 100 < READ_WEIGHT;
  if (doRead) {
    const op = weightedPick((weights.readOps || {})) || "projectsSearch";
    const session = ensureSession(roleForReadOp(op));
    performRead(session, op);
  } else {
    const session = ensureSession("manager");
    performWrite(session);
  }
  think();
}

export function hotspotScenario() {
  const session = ensureSession("manager");
  const assignmentId = hotAssignmentIds[(__VU + __ITER) % hotAssignmentIds.length];
  hotspotUpdate(session, assignmentId);
  sleep(0.2 + Math.random() * 0.4);
}

export function authScenario() {
  const role = __VU % 2 === 0 ? "manager" : "user";
  const session = ensureSession(role);
  const refreshed = refreshSession(session);
  check(refreshed, { "auth refresh succeeds": (v) => !!v });
  sleep(0.3 + Math.random() * 0.5);
}
