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
// formatos de sincronização testados: SCHEMA=1 ou SCHEMA=2 restringe a um só
const SCHEMAS = process.env.SCHEMA ? [Number(process.env.SCHEMA)] : [1, 2];

// configuração de emulador; schema 2 liga a sincronização por módulos (sync: { schema: 2 })
// extra: trecho de configuração a mais (ex.: 'appCheck: {...}'), por aparelho
function testConfig(schema, extra) {
  return `window.SOTER_FIREBASE_CONFIG = {
  apiKey: "fake-api-key", authDomain: "${PROJECT}.firebaseapp.com", projectId: "${PROJECT}",
  appId: "1:1:web:1", appName: "soter-app", userCollection: "users",
  auth: { enabled: true, emailPassword: true, google: false, allowGuest: false },
  emulators: { firestore: "${FS_HOST}", auth: "http://${AUTH_HOST}" }${schema === 2 ? ",\n  sync: { schema: 2 }" : ""}${extra ? ",\n  " + extra : ""}
};`;
}

// ---------- servidor estático do site ----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
function startSite() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, SITE).pathname);
    if (url === "/js/firebase-config.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(testConfig(1));
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

// grava direto no emulador, como administrador (só campos de texto: suficiente para os testes)
async function writeDoc(docPath, fields) {
  const toValue = (v) => typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } } : { stringValue: String(v) };
  const res = await fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`, {
    method: "PATCH", headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields: toValue(fields).mapValue.fields })
  });
  if (!res.ok) throw new Error("writeDoc falhou: " + res.status);
}

async function listDocs(collectionPath) {
  const res = await fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}?pageSize=300`, {
    headers: { authorization: "Bearer owner" }
  });
  const body = await res.json();
  return (body.documents || []).map((d) => ({ id: d.name.split("/").pop(), data: fromFirestore({ mapValue: { fields: d.fields || {} } }) }));
}

// estado da conta na nuvem, no formato que a conta usa: módulos (schema 2, quando meta/sync
// existe) ou private/siteState (schema 1)
async function cloudState(uid) {
  const meta = await readDoc(`users/${uid}/meta/sync`);
  if (meta && Number(meta.schema) >= 2) {
    const state = { profile: {}, data: {} };
    for (const mod of await listDocs(`users/${uid}/modules`)) {
      const data = mod.data.data || {};
      if (mod.id === "perfil") state.profile = data.profile || {};
      else Object.assign(state.data, data);
    }
    return state;
  }
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

let currentSchema = 1;
// aparelhos do cenário em curso: em caso de falha, o fim do console de cada um vai para o relatório
let liveDevices = [];

class Device {
  // schema: formato configurado neste aparelho (padrão: o da rodada atual)
  constructor(browser, name, schema, extraConfig) { this.browser = browser; this.name = name; this.logs = []; this.schema = schema || currentSchema; this.extraConfig = extraConfig || ""; }
  async start() {
    liveDevices.push(this);
    this.context = await this.browser.newContext({ bypassCSP: true, serviceWorkers: "block" });
    await this.context.route("**/js/firebase-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: testConfig(this.schema, this.extraConfig) }));
    return this;
  }
  async open(file) {
    if (this.page) await this.page.close().catch(() => {});
    this.page = await this.context.newPage();
    this.page.on("console", (msg) => this.logs.push(msg.type() + ": " + msg.text()));
    this.page.on("pageerror", (err) => this.logs.push("pageerror: " + err.message));
    this.loads = 0;
    this.page.on("load", () => { this.loads += 1; });
    await this.page.goto(SITE + file);
    return this.page;
  }
  // login com a página já aberta: o app-shell lê a nuvem da conta e recarrega a página (ver
  // reloadAfterOwnerChange); só depois dessa recarga a página está pronta para editar
  async login(email) {
    await waitFor(() => this.loads >= 1, { message: "página carregada" });
    const loadsBefore = this.loads;
    await evalSafe(this.page, ({ email, password }) => window.SoterStorage.loginWithEmail(email, password, { remember: true }).then(() => true), { email: email || EMAIL, password: PASSWORD });
    await waitFor(() => this.loads > loadsBefore, { timeout: 20000, message: "recarga depois do login" });
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
// nos dados de teste, livros/mangás usam status "quero" (sem páginas lidas): é o que a própria página
// calcula ao abrir; com outro status, ela normaliza e grava, o que vira uma edição concorrente
const tests = [];
// schemas: formatos em que o cenário roda (padrão: todos)
function test(id, name, fn, schemas) { tests.push({ id, name, fn, schemas: schemas || [1, 2] }); }

function book(id, titulo) { return { id, titulo, autor: "", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }; }

test("T1", "aparelho com cópia antiga abre Livros e não apaga a alteração do outro aparelho", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  try {
    await A.open("livros.html");
    await A.login();
    await A.editLibrary((S) => { S.livros.push({ id: 101, titulo: "Duna", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
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
    await A.editLibrary((S) => { S.livros.push({ id: 201, titulo: "Fundação", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
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
    await B.editLibrary((S) => { S.mangas.push({ id: 302, titulo: "Berserk", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
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
    await A.editLibrary((S) => { S.livros.push({ id: 401, titulo: "O Hobbit", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
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
    if (!/grande|limite/i.test(toast)) throw new Error("sem aviso de tamanho (toast: " + JSON.stringify(toast) + ")");
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
      S.livros.push({ id: 601, titulo: "Fica", status: "quero", updatedAt: Date.now(), createdAt: Date.now() });
      S.livros.push({ id: 602, titulo: "Sai", status: "quero", updatedAt: Date.now(), createdAt: Date.now() });
    });
    await B.open("livros.html");
    await B.login();
    await waitFor(() => evalSafe(B.page, () => S.livros.length === 2), { message: "B recebe os dois livros" });
    await A.editLibrary((S) => { S.livros = S.livros.filter((x) => x.id !== 602); });
    await waitFor(() => evalSafe(B.page, () => S.livros.length === 1), { timeout: 8000, message: "B vê a exclusão" });
    await B.editLibrary((S) => { S.cinema.push({ id: 603, titulo: "Alien", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
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
    await A.editLibrary((S) => { S.livros.push({ id: 701, titulo: "Só da conta 1", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).length === 1, { message: "livro na nuvem da conta 1" });
    const uid2 = await createUser("outra@soter.dev", PASSWORD);
    await evalSafe(A.page, () => window.SoterStorage.logoutFirebase().catch(() => true));
    await sleep(1500);
    await A.open("livros.html");
    await A.login("outra@soter.dev");
    await sleep(2500);
    const titles = await evalSafe(A.page, () => S.livros.map((x) => x.titulo));
    if (titles.length) throw new Error("a conta 2 mostra livros da conta 1: " + JSON.stringify(titles));
    const d2 = ((await cloudState(uid2)) || {}).data || {};
    if ((d2.trackerLivraria || []).length) throw new Error("a nuvem da conta 2 recebeu livros da conta 1");
    const d1 = ((await cloudState(uid)) || {}).data || {};
    if ((d1.trackerLivraria || []).length !== 1) throw new Error("a nuvem da conta 1 mudou");
  } finally { await A.close(); }
});

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("T8", "exclusão e edição simultâneas na mesma lista: o excluído não volta e a edição fica", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  try {
    await A.open("livros.html");
    await A.login();
    await A.editLibrary((S) => {
      S.livros.push({ id: 801, titulo: "Excluir", status: "quero", updatedAt: Date.now(), createdAt: Date.now() });
      S.livros.push({ id: 802, titulo: "Editar", status: "quero", updatedAt: Date.now(), createdAt: Date.now() });
    });
    await B.open("livros.html");
    await B.login();
    await waitFor(() => evalSafe(B.page, () => S.livros.length === 2), { message: "B recebe os dois livros" });
    await sleep(800);
    await B.context.setOffline(true);
    await A.editLibrary((S) => { S.livros = S.livros.filter((x) => x.id !== 801); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).length === 1, { message: "exclusão na nuvem" });
    await B.editLibrary((S) => { const it = S.livros.find((x) => x.id === 802); it.titulo = "Editado em B"; it.updatedAt = Date.now(); });
    await B.context.setOffline(false);
    await B.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitFor(async () => {
      const list = ((await cloudState(uid)) || {}).data?.trackerLivraria || [];
      return list.length === 1 && list[0].id === 802 && list[0].titulo === "Editado em B";
    }, { timeout: 15000, message: "nuvem só com o livro editado" });
    await waitFor(() => evalSafe(A.page, () => S.livros.length === 1 && S.livros[0].titulo === "Editado em B"), { timeout: 8000, message: "A com o resultado" });
  } finally { await A.close(); await B.close(); }
}, [2]);

test("T9", "migração do formato antigo para módulos preserva dados e imagens", async ({ browser, uid }) => {
  const A = await new Device(browser, "A", 1).start();
  const B = await new Device(browser, "B", 2).start();
  try {
    await A.open("livros.html");
    await A.login();
    await A.editLibrary((S, png) => { S.livros.push({ id: 901, titulo: "Com capa", img: png, status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); }, PNG);
    await A.saveData("tasks", [{ id: "t-901", title: "Tarefa antiga", done: false }]);
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.tasks || []).length === 1, { message: "siteState com a tarefa" });
    await B.open("livros.html");
    await B.login();
    const meta = await waitFor(() => readDoc(`users/${uid}/meta/sync`), { message: "meta/sync criado" });
    if (Number(meta.schema) !== 2) throw new Error("meta/sync sem schema 2");
    const d = ((await cloudState(uid)) || {}).data || {};
    const bookCloud = (d.trackerLivraria || [])[0] || {};
    if (!String(bookCloud.img || "").startsWith("soterimg:")) throw new Error("capa não virou referência: " + String(bookCloud.img).slice(0, 30));
    const image = await readDoc(`users/${uid}/images/${bookCloud.img.slice(9)}`);
    if (!image || image.data !== PNG) throw new Error("imagem não está em images/");
    if (!(d.tasks || []).some((x) => x.id === "t-901")) throw new Error("tarefa não migrou");
    await waitFor(() => evalSafe(B.page, (png) => (S.livros[0] || {}).img === png, PNG), { message: "B mostra a capa original" });
  } finally { await A.close(); await B.close(); }
}, [2]);

test("T10", "o formato é decidido pela conta: aparelho sem schema 2 configurado sincroniza com a conta migrada", async ({ browser, uid }) => {
  const A = await new Device(browser, "A", 2).start();
  const B = await new Device(browser, "B", 1).start();
  try {
    await A.open("livros.html");
    await A.login();
    await waitFor(() => readDoc(`users/${uid}/meta/sync`), { message: "conta migrada" });
    await B.open("livros.html");
    await B.login();
    await B.editLibrary((S) => { S.livros.push({ id: 1001, titulo: "Gravado por B", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).some((x) => x.id === 1001), { message: "livro de B nos módulos" });
    await waitFor(() => evalSafe(A.page, () => S.livros.some((x) => x.id === 1001)), { timeout: 8000, message: "A recebe o livro de B" });
    await A.editLibrary((S) => { S.livros[0].titulo = "Editado por A"; S.livros[0].updatedAt = Date.now(); });
    await waitFor(() => evalSafe(B.page, () => (S.livros[0] || {}).titulo === "Editado por A"), { timeout: 8000, message: "B recebe a edição de A" });
  } finally { await A.close(); await B.close(); }
}, [2]);

test("T11", "itens alterados sem updatedAt ganham a data da alteração", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  try {
    await A.open("tarefas.html");
    await A.login();
    await A.saveData("tasks", [{ id: "t-1101", title: "sem data", done: false }, { id: "t-1102", title: "fica igual", done: false }]);
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.tasks || []).length === 2, { message: "tarefas na nuvem" });
    const first = (((await cloudState(uid)) || {}).data.tasks || []).map((x) => x.updatedAt);
    if (!first.every((v) => typeof v === "number" && v > 0)) throw new Error("tarefas novas sem updatedAt: " + JSON.stringify(first));
    await sleep(50);
    await evalSafe(A.page, () => { const s = window.SoterStorage.getState(); s.data.tasks = s.data.tasks.map((t) => t.id === "t-1101" ? Object.assign({}, t, { title: "mudou" }) : t); window.SoterStorage.save(s); return true; });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.tasks || [])[0]?.title === "mudou", { message: "edição na nuvem" });
    const tasks = ((await cloudState(uid)) || {}).data.tasks;
    if (!(tasks[0].updatedAt > first[0])) throw new Error("updatedAt da tarefa editada não avançou");
    if (tasks[1].updatedAt !== first[1]) throw new Error("updatedAt da tarefa não editada mudou");
  } finally { await A.close(); }
});

// prepara A e B com o mesmo livro e deixa B offline; devolve os dois aparelhos
async function twoDevicesOneBookBOffline(browser, uid, book) {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  await A.open("livros.html");
  await A.login();
  await A.editLibrary((S, b) => { S.livros.push(Object.assign({ updatedAt: Date.now(), createdAt: Date.now() }, b)); }, book);
  await B.open("livros.html");
  await B.login();
  await waitFor(() => evalSafe(B.page, (id) => S.livros.some((x) => x.id === id), book.id), { message: "B recebe o livro" });
  await sleep(800);
  await B.context.setOffline(true);
  return { A, B };
}

async function bringOnline(device) {
  await device.context.setOffline(false);
  await device.page.evaluate(() => window.dispatchEvent(new Event("online")));
}

test("T12", "o mesmo item editado nos dois aparelhos em campos diferentes fica com as duas edições", async ({ browser, uid }) => {
  const { A, B } = await twoDevicesOneBookBOffline(browser, uid, { id: 1201, titulo: "Título", autor: "Autor", status: "quero" });
  try {
    await A.editLibrary((S) => { const it = S.livros[0]; it.titulo = "Título novo (A)"; it.updatedAt = Date.now(); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || [])[0]?.titulo === "Título novo (A)", { message: "título de A na nuvem" });
    await B.editLibrary((S) => { const it = S.livros[0]; it.autor = "Autor novo (B)"; it.updatedAt = Date.now(); });
    await bringOnline(B);
    await waitFor(async () => {
      const it = (((await cloudState(uid)) || {}).data?.trackerLivraria || [])[0] || {};
      return it.titulo === "Título novo (A)" && it.autor === "Autor novo (B)";
    }, { timeout: 15000, message: "nuvem com o título de A e o autor de B" });
    const conflicts = await evalSafe(B.page, () => window.SoterStorage.listSyncConflicts().then((l) => l.length));
    if (conflicts !== 0) throw new Error("campos diferentes não deveriam gerar cópia de conflito (" + conflicts + ")");
  } finally { await A.close(); await B.close(); }
}, [2]);

test("T13", "o mesmo campo editado nos dois: vence a edição mais recente e a outra vira cópia de conflito", async ({ browser, uid }) => {
  const { A, B } = await twoDevicesOneBookBOffline(browser, uid, { id: 1301, titulo: "Original", status: "quero" });
  try {
    await A.editLibrary((S) => { const it = S.livros[0]; it.titulo = "Versão de A"; it.updatedAt = Date.now(); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || [])[0]?.titulo === "Versão de A", { message: "A na nuvem" });
    await sleep(50);
    await B.editLibrary((S) => { const it = S.livros[0]; it.titulo = "Versão de B (mais recente)"; it.updatedAt = Date.now(); });
    await bringOnline(B);
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || [])[0]?.titulo === "Versão de B (mais recente)", { timeout: 15000, message: "versão mais recente na nuvem" });
    const conflicts = await waitFor(() => evalSafe(B.page, () => window.SoterStorage.listSyncConflicts()).then((l) => l.length ? l : null), { message: "cópia de conflito" });
    if (conflicts.length !== 1) throw new Error("esperada 1 cópia de conflito, há " + conflicts.length);
    if ((conflicts[0].remote.trackerLivraria || [])[0]?.titulo !== "Versão de A") throw new Error("a cópia não guarda a versão de A");
  } finally { await A.close(); await B.close(); }
}, [2]);

test("T14", "navegador com o banco local antigo (versão 1, sem a base) atualiza e sincroniza", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  try {
    await A.open("livros.html");
    // banco do schema 2 como a versão anterior do site criava (só images e soter_conflicts)
    await A.page.evaluate((uid) => new Promise((resolve, reject) => {
      const req = indexedDB.open("soter_sync_v2_" + uid, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("images", { keyPath: "hash" });
        req.result.createObjectStore("soter_conflicts", { keyPath: "id", autoIncrement: true });
      };
      req.onsuccess = () => { req.result.close(); resolve(true); };
      req.onerror = () => reject(req.error);
    }), uid);
    await A.login();
    await A.editLibrary((S) => { S.livros.push({ id: 1401, titulo: "Depois da atualização", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).some((x) => x.id === 1401), { message: "livro na nuvem" });
    const stores = await A.page.evaluate((uid) => new Promise((resolve) => {
      const req = indexedDB.open("soter_sync_v2_" + uid);
      req.onsuccess = () => { const names = Array.from(req.result.objectStoreNames); const v = req.result.version; req.result.close(); resolve({ v, names }); };
    }), uid);
    if (stores.v !== 2 || !stores.names.includes("base")) throw new Error("banco não atualizou: " + JSON.stringify(stores));
  } finally { await A.close(); }
}, [2]);

test("T15", "migração que não cabe (imagem acima de 900 KB) continua sincronizando no formato antigo", async ({ browser, uid }) => {
  const A = await new Device(browser, "A", 1).start();
  const B = await new Device(browser, "B", 2).start();
  try {
    await A.open("livros.html");
    await A.login();
    const bigImage = "data:image/png;base64," + "A".repeat(930 * 1024);
    await A.editLibrary((S, img) => { S.livros.push({ id: 1501, titulo: "Capa enorme", img, status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); }, bigImage);
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).length === 1, { message: "livro com a capa no siteState" });
    await B.open("tarefas.html");
    await B.login();
    await B.saveData("tasks", [{ id: "t-1501", title: "depois da migração recusada", done: false }]);
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.tasks || []).some((x) => x.id === "t-1501"), { timeout: 10000, message: "tarefa de B no siteState" });
    if (await readDoc(`users/${uid}/meta/sync`)) throw new Error("meta/sync não deveria existir");
    const toast = await B.page.evaluate(() => (document.getElementById("soter-sync-toast") || {}).textContent || "");
    if (!/formato antigo/.test(toast)) throw new Error("sem aviso da migração recusada (toast: " + JSON.stringify(toast) + ")");
  } finally { await A.close(); await B.close(); }
}, [2]);

// ---------- Rubrica (projetos.html): sincroniza página a página em users/{uid}/rubrica ----------
async function openRubrica(device) {
  await device.open("projetos.html");
  await device.login();
  await waitFor(() => evalSafe(device.page, () => !!(S && S.pages && typeof mkPage === "function")), { timeout: 15000, message: "Rubrica carregada" });
  await sleep(1000);
}

test("T16", "Rubrica: versão do histórico com mais de 30 dias é apagada ao gravar uma nova", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  try {
    await openRubrica(A);
    const pid = await evalSafe(A.page, () => { const id = mkPage("Com histórico", null, "📄"); save(); return id; });
    await waitFor(() => readDoc(`users/${uid}/rubrica/${pid}`), { message: "página na nuvem" });
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
    const recent = Date.now() - 2 * 24 * 60 * 60 * 1000;
    await writeDoc(`users/${uid}/rubrica/~h_${pid}_${old}`, { p: { title: "velha" }, s: { motivo: "auto" }, em: "x" });
    await writeDoc(`users/${uid}/rubrica/~h_${pid}_${recent}`, { p: { title: "recente" }, s: { motivo: "auto" }, em: "x" });
    await evalSafe(A.page, (pid) => guardaVersao(pid, S.pages[pid], "teste"), pid);
    await waitFor(async () => !(await readDoc(`users/${uid}/rubrica/~h_${pid}_${old}`)), { message: "versão velha apagada" });
    if (!(await readDoc(`users/${uid}/rubrica/~h_${pid}_${recent}`))) throw new Error("a versão recente foi apagada");
  } finally { await A.close(); }
}, [2]);

test("T17", "Rubrica: edição feita offline vai para a nuvem quando a conexão volta, sem nova edição", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  try {
    await openRubrica(A);
    const pid = await evalSafe(A.page, () => { const id = mkPage("Antes", null, "📄"); save(); return id; });
    await waitFor(async () => ((await readDoc(`users/${uid}/rubrica/${pid}`)) || {}).p?.title === "Antes", { message: "página na nuvem" });
    await A.context.setOffline(true);
    await evalSafe(A.page, (pid) => { S.pages[pid].title = "Editada offline"; save(); return true; }, pid);
    // tempo para a transação desistir (sem rede, o SDK tenta algumas vezes e falha)
    await waitFor(() => A.logs.some((l) => /\[Rubrica\] Firestore/.test(l)), { timeout: 40000, message: "envio falhar offline" });
    await A.context.setOffline(false);
    await A.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitFor(async () => ((await readDoc(`users/${uid}/rubrica/${pid}`)) || {}).p?.title === "Editada offline", { timeout: 15000, message: "edição offline na nuvem" });
  } finally { await A.close(); }
}, [2]);

test("T18", "Rubrica: 25 páginas de uma vez chegam todas, e a edição do outro aparelho na mesma página não se perde", async ({ browser, uid }) => {
  const A = await new Device(browser, "A").start();
  const B = await new Device(browser, "B").start();
  try {
    await openRubrica(A);
    const shared = await evalSafe(A.page, () => { const id = mkPage("Compartilhada", null, "📄"); save(); return id; });
    await waitFor(() => readDoc(`users/${uid}/rubrica/${shared}`), { message: "página compartilhada na nuvem" });
    await openRubrica(B);
    await waitFor(() => evalSafe(B.page, (id) => !!S.pages[id], shared), { message: "B tem a página" });
    // A fica offline e cria as 25 páginas; enquanto isso B muda o ícone da página compartilhada
    await A.context.setOffline(true);
    const ids = await evalSafe(A.page, (id) => {
      const out = [];
      for (let i = 0; i < 25; i++) out.push(mkPage("Lote " + i, null, "📄"));
      S.pages[id].title = "Compartilhada (A)";
      save();
      return out;
    }, shared);
    await evalSafe(B.page, (id) => { S.pages[id].icon = "⭐"; save(); return true; }, shared);
    await waitFor(async () => ((await readDoc(`users/${uid}/rubrica/${shared}`)) || {}).p?.icon === "⭐", { message: "ícone de B na nuvem" });
    await sleep(1500);
    await A.context.setOffline(false);
    await A.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitFor(async () => {
      const docs = await listDocs(`users/${uid}/rubrica`);
      return ids.every((id) => docs.some((d) => d.id === id));
    }, { timeout: 30000, message: "as 25 páginas na nuvem" });
    await waitFor(async () => {
      const p = ((await readDoc(`users/${uid}/rubrica/${shared}`)) || {}).p || {};
      return p.title === "Compartilhada (A)" && p.icon === "⭐";
    }, { timeout: 15000, message: "página com o título de A e o ícone de B" });
  } finally { await A.close(); await B.close(); }
}, [2]);

test("T19", "App Check configurado: o SDK é carregado e ativado, e a sincronização continua", async ({ browser, uid }) => {
  const A = await new Device(browser, "A", undefined, 'appCheck: { siteKey: "chave-de-teste", debug: true }').start();
  // o serviço do App Check é do Google (não há emulador): responde como se o token de depuração
  // fosse aceito, e conta os pedidos para provar que o SDK foi mesmo ativado
  let exchanges = 0;
  await A.context.route("https://content-firebaseappcheck.googleapis.com/**", (route) => {
    exchanges += 1;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ token: "token-de-teste", ttl: "3600s" }) });
  });
  try {
    await A.open("livros.html");
    await A.login();
    const active = await evalSafe(A.page, () => !!(window.firebase && window.firebase.appCheck && document.querySelector('script[data-soter-src*="app-check"]')));
    if (!active) throw new Error("App Check não foi carregado");
    await A.editLibrary((S) => { S.livros.push({ id: 1901, titulo: "Com App Check", status: "quero", updatedAt: Date.now(), createdAt: Date.now() }); });
    await waitFor(async () => (((await cloudState(uid)) || {}).data?.trackerLivraria || []).some((x) => x.id === 1901), { message: "livro na nuvem" });
    const errors = A.logs.filter((l) => /^pageerror/.test(l));
    if (errors.length) throw new Error("erros na página: " + errors.join(" | "));
    if (!exchanges) throw new Error("nenhum pedido de token ao App Check");
    return exchanges + " pedido(s) de token";
  } finally { await A.close(); }
}, [2]);

test("T20", "criação de contas fechada: sem a aba Registrar e o cadastro pelo site é recusado", async ({ browser }) => {
  const A = await new Device(browser, "A", undefined, "auth: { enabled: true, emailPassword: true, google: false, allowGuest: false, allowSignup: false }").start();
  try {
    await A.open("livros.html");
    await evalSafe(A.page, () => window.SoterStorage.openAuthModal());
    await waitFor(() => evalSafe(A.page, () => !!document.getElementById("ltab-signup")), { message: "modal aberto" });
    const hidden = await evalSafe(A.page, () => getComputedStyle(document.getElementById("ltab-signup")).display === "none");
    if (!hidden) throw new Error("a aba Registrar aparece");
    const result = await evalSafe(A.page, () => window.SoterStorage.registerWithEmail("nova@soter.dev", "senha-123456", {}).then(() => "criou", (e) => e.message));
    if (result !== "signup_disabled") throw new Error("cadastro não foi recusado: " + result);
  } finally { await A.close(); }
}, [2]);

// ---------- execução ----------
const site = await startSite();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failed = 0;
for (const schema of SCHEMAS) {
  currentSchema = schema;
  console.log(`\n— schema ${schema} —`);
  for (const t of tests) {
    if (ONLY.length && !ONLY.includes(t.id)) continue;
    if (!t.schemas.includes(schema) && !ONLY.includes(t.id)) continue;
    await resetEmulators();
    liveDevices = [];
    const uid = await createUser(EMAIL, PASSWORD);
    const started = Date.now();
    try {
      const extra = await t.fn({ browser, uid, schema });
      console.log(`✔ ${t.id} ${t.name} (${((Date.now() - started) / 1000).toFixed(1)} s${extra ? ", " + extra : ""})`);
    } catch (err) {
      failed += 1;
      console.log(`✘ ${t.id} ${t.name}\n    ${err && err.message}`);
      if (process.env.VERBOSE) liveDevices.forEach((d) => console.log(`    [${d.name}] ` + d.logs.slice(-12).join(`\n    [${d.name}] `)));
    }
  }
}
await browser.close();
site.close();
console.log(failed ? `\n${failed} teste(s) falharam` : "\ntodos os testes passaram");
process.exit(failed ? 1 : 0);
