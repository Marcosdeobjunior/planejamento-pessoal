// Testes de sincronização: dois "aparelhos" (contextos de navegador independentes) na mesma conta,
// contra o Firebase Emulator Suite. Rodar com `npm test` nesta pasta (ver docs/PLANO_ARMAZENAMENTO.md).
// Nada aqui fala com o projeto real: o js/firebase-config.js é trocado por uma configuração de
// emulador (projectId demo-soter) em todas as páginas abertas pelo teste.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = "demo-soter";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const SITE_PORT = 5181;
const SITE = "http://127.0.0.1:" + SITE_PORT + "/";
const CHROME = process.env.CHROME_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const ONLY = process.argv.slice(2);

const TEST_CONFIG = `window.SOTER_FIREBASE_CONFIG = {
  apiKey: "fake-api-key", authDomain: "${PROJECT}.firebaseapp.com", projectId: "${PROJECT}",
  appId: "1:1:web:1", appName: "soter-app", userCollection: "users",
  auth: { enabled: true, emailPassword: true, google: false, allowGuest: false },
  emulators: { firestore: "${FS_HOST}", auth: "http://${AUTH_HOST}" }
};`;

// ---------- servidor estático do site ----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
function startSite() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, SITE).pathname);
    if (url === "/js/firebase-config.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(TEST_CONFIG);
    }
    if (url === "/sw.js") { res.writeHead(404); return res.end(); }
    const file = path.join(ROOT, url === "/" ? "index.html" : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(SITE_PORT, "127.0.0.1", () => resolve(server)));
}

// ---------- emuladores ----------
async function createUser(email, password) {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await res.json();
  if (!body.localId) throw new Error("signUp falhou: " + JSON.stringify(body));
  return body.localId;
}

async function resetEmulators() {
  await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

function fromFirestore(value) {
  if (!value || typeof value !== "object") return value;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestore);
  if ("mapValue" in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = fromFirestore(v);
    return out;
  }
  return value;
}

// lê um documento direto do emulador, como administrador (sem passar pelas regras)
async function readDoc(docPath) {
  const res = await fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`, {
    headers: { authorization: "Bearer owner" }
  });
  if (res.status === 404) return null;
  const body = await res.json();
  return fromFirestore({ mapValue: { fields: body.fields || {} } });
}

async function cloudState(uid) {
  const doc = await readDoc(`users/${uid}/private/siteState`);
  return doc && doc.state ? doc.state : null;
}

// ---------- utilitários ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 10000, interval = 150, message = "condição" } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) { last = err; }
    await sleep(interval);
  }
  throw new Error("tempo esgotado esperando: " + message + (last instanceof Error ? " (" + last.message + ")" : ""));
}

// evaluate que tolera a página recarregando no meio (o app-shell recarrega após o login)
async function evalSafe(page, fn, arg) {
  return waitFor(async () => {
    try { return { v: await page.evaluate(fn, arg) }; } catch (err) {
      if (/Execution context was destroyed|navigation|Target closed/i.test(String(err && err.message))) return null;
      throw err;
    }
  }, { message: "avaliar na página" }).then((r) => r.v);
}

async function waitHydrated(page) {
  await waitFor(async () => {
    try {
      return await page.evaluate(() => !!(window.SoterStorage && window.SoterStorage.getSyncDebug && window.SoterStorage.getSyncDebug().hydrated));
    } catch (err) { return false; }
  }, { timeout: 15000, message: "leitura da nuvem (hydrated)" });
}

const EMAIL = "teste@soter.dev";
const PASSWORD = "senha-de-teste-123";

class Device {
  constructor(browser, name) { this.browser = browser; this.name = name; this.logs = []; }
  async start() {
    this.context = await this.browser.newContext({ bypassCSP: true, serviceWorkers: "block" });
    return this;
  }
  async open(file) {
    if (this.page) await this.page.close().catch(() => {});
    this.page = await this.context.newPage();
    this.page.on("console", (msg) => this.logs.push(msg.type() + ": " + msg.text()));
    this.page.on("pageerror", (err) => this.logs.push("pageerror: " + err.message));
    await this.page.goto(SITE + file);
    return this.page;
  }
  async login() {
    await evalSafe(this.page, ({ email, password }) => window.SoterStorage.loginWithEmail(email, password, { remember: true }).then(() => true), { email: EMAIL, password: PASSWORD });
    await waitHydrated(this.page);
  }
  // mexe na lista da página de Livros/Cinema/Mangás (variável S da página) e salva como o botão
  async editLibrary(fn, arg) {
    return evalSafe(this.page, new Function("arg", "return (" + fn + ")(S, arg), save(), true;"), arg);
  }
  state() { return evalSafe(this.page, () => window.SoterStorage.getState()); }
  async saveData(key, value) {
    return evalSafe(this.page, ({ key, value }) => { const s = window.SoterStorage.getState(); s.data[key] = value; window.SoterStorage.save(s); return true; }, { key, value });
  }
  close() { return this.context.close(); }
}

// ---------- cenários ----------
const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

function book(id, titulo) { return { id, titulo, autor: "", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() }; }

test("T1", "aparelho com cópia antiga abre Livros e não apaga a alteração do outro aparelho", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  try {
    await A.open("livros.html");
    await A.login();
    await A.editLibrary((S) => { S.livros.push({ id: 101, titulo: "Duna", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => ((await cloudState(uid)) || {}).data?.trackerLivraria?.[0]?.titulo === "Duna", { message: "Duna na nuvem" });
    await A.page.close(); A.page = null;

    await B.open("livros.html");
    await B.login();
    await waitFor(() => evalSafe(B.page, () => S.livros.some((x) => x.titulo === "Duna")), { message: "B recebe Duna" });
    await B.editLibrary((S) => { S.livros[0].titulo = "Dunaa"; S.livros[0].updatedAt = Date.now(); });
    await waitFor(async () => ((await cloudState(uid)) || {}).data?.trackerLivraria?.[0]?.titulo === "Dunaa", { message: "Dunaa na nuvem" });

    // A volta: mostra a cópia antiga antes do login confirmar e a página de Livros grava ao abrir
    await A.open("livros.html");
    await waitHydrated(A.page);
    await sleep(2500);
    const cloud = await cloudState(uid);
    const titleCloud = cloud?.data?.trackerLivraria?.[0]?.titulo;
    if (titleCloud !== "Dunaa") throw new Error("nuvem perdeu a alteração de B: título = " + JSON.stringify(titleCloud));
    const titleA = await evalSafe(A.page, () => S.livros[0] && S.livros[0].titulo);
    if (titleA !== "Dunaa") throw new Error("A não mostra a alteração de B: título = " + JSON.stringify(titleA));
  } finally { await A.close(); await B.close(); }
});

test("T2", "Livros aberto recebe a alteração do outro aparelho e não a desfaz ao salvar", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  try {
    await A.open("livros.html");
    await A.login();
    await A.editLibrary((S) => { S.livros.push({ id: 201, titulo: "Fundação", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() }); });
    await B.open("livros.html");
    await B.login();
    await waitFor(() => evalSafe(B.page, () => S.livros.some((x) => x.id === 201)), { message: "B recebe Fundação" });
    await B.editLibrary((S) => { const it = S.livros.find((x) => x.id === 201); it.titulo = "Fundação e Império"; it.updatedAt = Date.now(); });
    await waitFor(() => evalSafe(A.page, () => (S.livros.find((x) => x.id === 201) || {}).titulo === "Fundação e Império"), { timeout: 8000, message: "A mostra o título novo" });
    await A.editLibrary((S) => { S.cinema.push({ id: 202, titulo: "Interestelar", status: "concluido", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => {
      const d = ((await cloudState(uid)) || {}).data || {};
      return (d.trackerCinema || []).some((x) => x.id === 202) && ((d.trackerLivraria || []).find((x) => x.id === 201) || {}).titulo === "Fundação e Império";
    }, { message: "nuvem com o filme de A e o título de B" });
  } finally { await A.close(); await B.close(); }
});

test("T3", "edições simultâneas em módulos diferentes (A offline) ficam as duas", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  try {
    await A.open("tarefas.html");
    await A.login();
    await B.open("livros.html");
    await B.login();
    await A.context.setOffline(true);
    await A.saveData("tasks", [{ id: "t-301", title: "Tarefa feita offline em A", done: false }]);
    await B.editLibrary((S) => { S.mangas.push({ id: 302, titulo: "Berserk", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerMangas || []).some((x) => x.id === 302), { message: "mangá de B na nuvem" });
    await A.context.setOffline(false);
    await A.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitFor(async () => {
      const d = ((await cloudState(uid)) || {}).data || {};
      return (d.tasks || []).some((x) => x.id === "t-301") && (d.trackerMangas || []).some((x) => x.id === 302);
    }, { timeout: 15000, message: "nuvem com a tarefa de A e o mangá de B" });
  } finally { await A.close(); await B.close(); }
});

test("T4", "Salvar em Livros chega à nuvem em menos de 1,5 s", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  try {
    await A.open("livros.html");
    await A.login();
    await sleep(1500);
    const t0 = Date.now();
    await A.editLibrary((S) => { S.livros.push({ id: 401, titulo: "O Hobbit", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).some((x) => x.id === 401), { timeout: 5000, interval: 50, message: "livro na nuvem" });
    const ms = Date.now() - t0;
    if (ms > 1500) throw new Error("demorou " + ms + " ms");
    return ms + " ms";
  } finally { await A.close(); }
});

test("T5", "estado acima de 1 MB: não grava, avisa uma vez e não repete", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  try {
    await A.open("tarefas.html");
    await A.login();
    await A.saveData("tasks", [{ id: "t-501", title: "antes do excesso", done: false }]);
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.tasks || []).length === 1, { message: "tarefa na nuvem" });
    await A.saveData("tasks", [{ id: "t-501", title: "x".repeat(1100 * 1024), done: false }]);
    await sleep(12000);
    const failures = A.logs.filter((l) => /Falha ao sincronizar/.test(l)).length;
    const toast = await A.page.evaluate(() => (document.getElementById("soter-sync-toast") || {}).textContent || "");
    const cloudTitle = (((await cloudState(uid)) || {}).data?.tasks || [])[0]?.title;
    if (cloudTitle !== "antes do excesso") throw new Error("a nuvem mudou: " + String(cloudTitle).slice(0, 40));
    if (!/grande/i.test(toast)) throw new Error("sem aviso de tamanho (toast: " + JSON.stringify(toast) + ")");
    if (failures > 1) throw new Error(failures + " tentativas de envio com falha (esperado no máximo 1)");
  } finally { await A.close(); }
});

test("T6", "exclusão feita num aparelho chega ao outro e não volta", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  try {
    await A.open("livros.html");
    await A.login();
    await A.editLibrary((S) => {
      S.livros.push({ id: 601, titulo: "Fica", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() });
      S.livros.push({ id: 602, titulo: "Sai", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() });
    });
    await B.open("livros.html");
    await B.login();
    await waitFor(() => evalSafe(B.page, () => S.livros.length === 2), { message: "B recebe os dois livros" });
    await A.editLibrary((S) => { S.livros = S.livros.filter((x) => x.id !== 602); });
    await waitFor(() => evalSafe(B.page, () => S.livros.length === 1), { timeout: 8000, message: "B vê a exclusão" });
    await B.editLibrary((S) => { S.cinema.push({ id: 603, titulo: "Alien", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() }); });
    await sleep(2000);
    const d = ((await cloudState(uid)) || {}).data || {};
    const ids = (d.trackerLivraria || []).map((x) => x.id);
    if (ids.includes(602)) throw new Error("o livro excluído voltou: " + JSON.stringify(ids));
    if (!(d.trackerCinema || []).some((x) => x.id === 603)) throw new Error("o filme de B não chegou");
  } finally { await A.close(); await B.close(); }
});

test("T7", "outra conta no mesmo navegador não recebe nem grava os dados da primeira", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  try {
    await A.open("livros.html");
    await A.login();
    await A.editLibrary((S) => { S.livros.push({ id: 701, titulo: "Só da conta 1", status: "lendo", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).length === 1, { message: "livro na nuvem da conta 1" });
    const uid2 = await createUser("outra@soter.dev", PASSWORD);
    await evalSafe(A.page, () => window.SoterStorage.logoutFirebase().catch(() => true));
    await sleep(1500);
    await A.open("livros.html");
    await evalSafe(A.page, (p) => window.SoterStorage.loginWithEmail("outra@soter.dev", p, { remember: true }).then(() => true), PASSWORD);
    await waitHydrated(A.page);
    await sleep(2500);
    const titles = await evalSafe(A.page, () => S.livros.map((x) => x.titulo));
    if (titles.length) throw new Error("a conta 2 mostra livros da conta 1: " + JSON.stringify(titles));
    const d2 = ((await cloudState(uid2)) || {}).data || {};
    if ((d2.trackerLivraria || []).length) throw new Error("a nuvem da conta 2 recebeu livros da conta 1");
    const d1 = ((await cloudState(uid)) || {}).data || {};
    if ((d1.trackerLivraria || []).length !== 1) throw new Error("a nuvem da conta 1 mudou");
  } finally { await A.close(); }
});

// ---------- execução ----------
const site = await startSite();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failed = 0;
for (const t of tests) {
  if (ONLY.length && !ONLY.includes(t.id)) continue;
  await resetEmulators();
  const uid = await createUser(EMAIL, PASSWORD);
  const started = Date.now();
  try {
    const extra = await t.fn({ browser, uid });
    console.log(`✔ ${t.id} ${t.name} (${((Date.now() - started) / 1000).toFixed(1)} s${extra ? ", " + extra : ""})`);
  } catch (err) {
    failed += 1;
    console.log(`✘ ${t.id} ${t.name}\n    ${err && err.message}`);
  }
}
await browser.close();
site.close();
console.log(failed ? `\n${failed} teste(s) falharam` : "\ntodos os testes passaram");
process.exit(failed ? 1 : 0);
