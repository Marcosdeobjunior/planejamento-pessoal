// Testes das regras do Firestore (firestore.rules) no emulador. Rodam antes dos cenários de
// sincronização no `npm test`. Cada caso confere se uma gravação ou leitura é aceita ou recusada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");

const env = await initializeTestEnvironment({
  projectId: "demo-soter-rules",
  firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8") }
});

const ALICE = "alice";
const BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();
const user = (db, uid) => db.collection("users").doc(uid);
const mod = (rev, extra) => Object.assign({ schema: 2, rev, data: { tasks: [] }, deviceId: "d1" }, extra || {});

const cases = [];
function rule(name, fn) { cases.push({ name, fn }); }

// ---- dono e isolamento ----
rule("o dono grava e lê o próprio siteState", async () => {
  await assertSucceeds(user(alice, ALICE).collection("private").doc("siteState").set({ state: { data: {} } }));
  await assertSucceeds(user(alice, ALICE).collection("private").doc("siteState").get());
});
rule("outra conta não lê nem grava os dados de alice", async () => {
  await assertFails(user(bob, ALICE).collection("private").doc("siteState").get());
  await assertFails(user(bob, ALICE).collection("modules").doc("planejamento").set(mod(1)));
});
rule("sem login não lê nada", async () => {
  await assertFails(user(anon, ALICE).collection("private").doc("siteState").get());
});
rule("coleção desconhecida é recusada", async () => {
  await assertFails(user(alice, ALICE).collection("qualquer").doc("x").set({ a: 1 }));
});
rule("o documento users/{uid} em si não é gravável", async () => {
  await assertFails(user(alice, ALICE).set({ a: 1 }));
});

// ---- módulos (schema 2) ----
rule("módulo: cria com rev 1 e sobe para 2", async () => {
  const ref = user(alice, ALICE).collection("modules").doc("planejamento");
  await assertSucceeds(ref.set(mod(1)));
  await assertSucceeds(ref.set(mod(2)));
});
rule("módulo: rev igual ou menor é recusado (gravação velha)", async () => {
  const ref = user(alice, ALICE).collection("modules").doc("financas");
  await assertSucceeds(ref.set(mod(1)));
  await assertSucceeds(ref.set(mod(3)));
  await assertFails(ref.set(mod(3)));
  await assertFails(ref.set(mod(2)));
});
rule("módulo: a migração regrava rev 1 sobre rev 1", async () => {
  const ref = user(alice, ALICE).collection("modules").doc("sonhos");
  await assertSucceeds(ref.set(mod(1)));
  await assertSucceeds(ref.set(mod(1, { migratedFrom: "private/siteState" })));
});
rule("módulo: sem schema 2, rev não inteiro ou data que não é mapa é recusado", async () => {
  const ref = user(alice, ALICE).collection("modules").doc("viagens");
  await assertFails(ref.set({ schema: 1, rev: 1, data: {} }));
  await assertFails(ref.set({ schema: 2, rev: "1", data: {} }));
  await assertFails(ref.set({ schema: 2, rev: 1, data: [] }));
});

// ---- imagens ----
rule("imagem: grava, repete o mesmo conteúdo, recusa conteúdo diferente no mesmo hash", async () => {
  const ref = user(alice, ALICE).collection("images").doc("abc");
  await assertSucceeds(ref.set({ data: "data:image/png;base64,AAA", mime: "image/png" }));
  await assertSucceeds(ref.set({ data: "data:image/png;base64,AAA", mime: "image/png" }));
  await assertFails(ref.set({ data: "data:image/png;base64,BBB", mime: "image/png" }));
});
rule("imagem: acima de 950.000 caracteres é recusada", async () => {
  await assertFails(user(alice, ALICE).collection("images").doc("big").set({ data: "x".repeat(950001) }));
});

// ---- rubrica ----
rule("rubrica: só p, s e em", async () => {
  const col = user(alice, ALICE).collection("rubrica");
  await assertSucceeds(col.doc("pg1").set({ p: { title: "a" }, em: "2026" }));
  await assertFails(col.doc("pg2").set({ p: { title: "a" }, outro: 1 }));
});

// ---- lembretes ----
rule("lembretes: o site grava a agenda, mas não sent nem lastRunAt", async () => {
  const ref = alice.collection("pushSchedules").doc(ALICE);
  await assertSucceeds(ref.set({ v: 1, reminders: [], nextAt: null, updatedAt: 1 }));
  await assertFails(ref.set({ v: 1, reminders: [], nextAt: null, updatedAt: 2, sent: { a: 1 } }, { merge: true }));
  await assertFails(bob.collection("pushSchedules").doc(ALICE).get());
});
rule("lembretes: aparelho só com endpoint https e as chaves", async () => {
  const devices = alice.collection("pushSchedules").doc(ALICE).collection("devices");
  await assertSucceeds(devices.doc("d1").set({ endpoint: "https://push.example/1", keys: { p256dh: "x", auth: "y" }, ua: "teste", createdAt: 1, lastSeen: 1 }));
  await assertFails(devices.doc("d2").set({ endpoint: "http://push.example/1", keys: { p256dh: "x", auth: "y" } }));
});

let failed = 0;
for (const c of cases) {
  await env.clearFirestore();
  try {
    await c.fn();
    console.log("✔ regra: " + c.name);
  } catch (err) {
    failed += 1;
    console.log("✘ regra: " + c.name + "\n    " + String(err && err.message).split("\n")[0]);
  }
}
await env.cleanup();
console.log(failed ? `${failed} regra(s) falharam\n` : "todas as regras passaram\n");
process.exit(failed ? 1 : 0);
