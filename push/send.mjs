// Envia os lembretes do Sól de Sóter. Rodado pelo GitHub Actions (.github/workflows/lembretes.yml).
// O agendamento do GitHub atrasa horas, então cada execução fica ativa por LOOP_MINUTES conferindo a
// agenda a cada minuto, e o workflow emenda a próxima execução quando esta termina.
//
// O site calcula a agenda de cada conta e grava em pushSchedules/{uid}:
//   reminders: [{ id, at (ms), title, body, url, tag }]  próximos lembretes (até 14 dias)
//   nextAt:    menor "at" ainda não enviado (para a consulta abaixo)
//   sent:      { id: ms } o que este script já enviou (só ele grava aqui)
// e os aparelhos inscritos em pushSchedules/{uid}/devices/{id}: { endpoint, keys: { p256dh, auth } }.
//
// Este script não lê os dados da conta (tarefas, finanças...), só a agenda já pronta.
// Os logs do Actions são públicos em repositório público: nada de títulos, textos ou uids neles.
import { createHash } from "node:crypto";
import admin from "firebase-admin";
import webpush from "web-push";

const COLLECTION = process.env.PUSH_COLLECTION || "pushSchedules";
const STALE_MS = 3 * 60 * 60 * 1000;      // atrasado mais que isso: não envia mais
const SENT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_ACCOUNT = 5;                // por rodada; o resto vira um resumo
const TTL_SECONDS = 4 * 60 * 60;
const TICK_MS = 60 * 1000;
// 0 = uma rodada só (rodar à mão ou em teste)
const LOOP_MINUTES = Math.max(0, Number(process.env.LOOP_MINUTES || 0) || 0);

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, FIREBASE_SERVICE_ACCOUNT } = process.env;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://marcosdeobjunior.github.io/planejamento-pessoal/";

function shortId(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
}

function initFirebase() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-soter" });
    return true;
  }
  if (!FIREBASE_SERVICE_ACCOUNT) return false;
  const credentials = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: credentials.project_id });
  return true;
}

function cleanText(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

// só caminhos do próprio site (ex.: "tarefas.html" ou "revisao.html?x=1")
function cleanUrl(value) {
  const url = String(value || "");
  return /^[a-z0-9-]+\.html(\?[A-Za-z0-9=&_-]*)?$/.test(url) ? url : "tarefas.html";
}

function validReminder(r) {
  // id vira nome de campo em "sent": só letras, números, "_" e "-"
  return !!r && typeof r.id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(r.id) &&
    typeof r.at === "number" && Number.isFinite(r.at) && typeof r.title === "string";
}

function buildPayload(uid, reminder) {
  return JSON.stringify({
    uid,
    id: reminder.id,
    title: cleanText(reminder.title, 90) || "Sól de Sóter",
    body: cleanText(reminder.body, 220),
    url: cleanUrl(reminder.url),
    tag: cleanText(reminder.tag || reminder.id, 80)
  });
}

async function sendToDevices(uid, devices, reminder, gone) {
  let delivered = 0;
  const payload = buildPayload(uid, reminder);
  for (const device of devices) {
    if (gone.has(device.id)) continue;
    const data = device.data();
    const subscription = { endpoint: data.endpoint, keys: data.keys || {} };
    try {
      await webpush.sendNotification(subscription, payload, { TTL: TTL_SECONDS, urgency: "high" });
      delivered += 1;
    } catch (err) {
      // 404/410: a inscrição não existe mais (o aparelho saiu, trocou de conta ou desinstalou)
      if (err && (err.statusCode === 404 || err.statusCode === 410)) gone.add(device.id);
      // diagnóstico: código e resposta do serviço de push (não têm dados da conta) e o servidor dele
      let host = "?";
      try { host = new URL(data.endpoint).host; } catch (e) { /* endereço inválido */ }
      console.warn("  " + host + ": " + (err && err.statusCode ? "HTTP " + err.statusCode : "erro") + " " +
        cleanText((err && (err.body || err.message)) || err, 200));
    }
  }
  return delivered;
}

function computeNextAt(reminders, sent, now) {
  let next = null;
  for (const r of reminders) {
    if (!validReminder(r) || sent[r.id]) continue;
    if (r.at < now - STALE_MS) continue;
    if (next === null || r.at < next) next = r.at;
  }
  return next;
}

async function processAccount(db, doc, now) {
  const uid = doc.id;
  const data = doc.data() || {};
  const reminders = Array.isArray(data.reminders) ? data.reminders.filter(validReminder) : [];
  const sent = data.sent && typeof data.sent === "object" ? data.sent : {};
  const due = reminders
    .filter((r) => r.at <= now && r.at >= now - STALE_MS && !sent[r.id])
    .sort((a, b) => a.at - b.at);

  const devices = due.length ? (await doc.ref.collection("devices").get()).docs : [];
  const gone = new Set();
  let delivered = 0;
  if (due.length && devices.length) {
    const head = due.length > MAX_PER_ACCOUNT ? due.slice(0, MAX_PER_ACCOUNT - 1) : due;
    for (const reminder of head) delivered += await sendToDevices(uid, devices, reminder, gone);
    if (head.length < due.length) {
      const rest = due.length - head.length;
      delivered += await sendToDevices(uid, devices, {
        id: "summary-" + now,
        title: "Sól de Sóter",
        body: "Você tem mais " + rest + " lembrete" + (rest === 1 ? "" : "s") + ". Abra o site para ver.",
        url: "tarefas.html",
        tag: "summary"
      }, gone);
    }
  }

  for (const id of gone) await doc.ref.collection("devices").doc(id).delete().catch(() => null);

  // marca como enviado e recalcula nextAt sobre a versão mais nova da agenda (o site pode ter
  // regravado os lembretes enquanto este script enviava)
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);
    if (!fresh.exists) return;
    const current = fresh.data() || {};
    const freshSent = Object.assign({}, current.sent && typeof current.sent === "object" ? current.sent : {});
    const updates = {};
    for (const r of due) { freshSent[r.id] = now; updates["sent." + r.id] = now; }
    for (const [id, at] of Object.entries(freshSent)) {
      if ((typeof at !== "number" || at < now - SENT_KEEP_MS) && /^[A-Za-z0-9_-]+$/.test(id)) updates["sent." + id] = admin.firestore.FieldValue.delete();
    }
    const freshReminders = Array.isArray(current.reminders) ? current.reminders : [];
    updates.nextAt = computeNextAt(freshReminders, freshSent, now + 1);
    updates.lastRunAt = now;
    tx.update(doc.ref, updates);
  });

  console.log("conta " + shortId(uid) + ": " + due.length + " lembrete(s) na hora, " +
    delivered + " entrega(s), " + devices.length + " aparelho(s), " + gone.size + " inscrição(ões) removida(s)");
}

async function main() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("Lembretes não configurados (faltam VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nos Secrets). Ver docs/LEMBRETES.md.");
    return;
  }
  if (!initFirebase()) {
    console.log("Lembretes não configurados (falta FIREBASE_SERVICE_ACCOUNT nos Secrets). Ver docs/LEMBRETES.md.");
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const db = admin.firestore();
  const deadline = Date.now() + LOOP_MINUTES * 60 * 1000;
  let rounds = 0;
  let quiet = 0;
  do {
    const started = Date.now();
    try {
      quiet = (await runRound(db, started, LOOP_MINUTES > 0)) ? 0 : quiet + 1;
    } catch (err) {
      // falha de rede ou do Firestore numa rodada: tenta de novo na próxima
      process.exitCode = 1;
      console.error("rodada: erro", err && err.message ? err.message : err);
    }
    rounds += 1;
    // a cada hora sem nada para enviar, uma linha só para mostrar que segue rodando
    if (LOOP_MINUTES > 0 && quiet && quiet % 60 === 0) console.log(new Date().toISOString() + " ativo, nada na hora");
    if (Date.now() + TICK_MS > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.max(1000, TICK_MS - (Date.now() - started))));
  } while (true);
  if (LOOP_MINUTES > 0) console.log(rounds + " rodada(s)");
}

// devolve true se havia alguma conta com lembretes na hora
async function runRound(db, now, quietWhenEmpty) {
  const snap = await db.collection(COLLECTION).where("nextAt", "<=", now).get();
  if (snap.empty && quietWhenEmpty) return false;
  console.log(new Date(now).toISOString() + " " + snap.size + " conta(s) com lembretes na hora");
  for (const doc of snap.docs) {
    try {
      await processAccount(db, doc, now);
    } catch (err) {
      process.exitCode = 1;
      console.error("conta " + shortId(doc.id) + ": erro", err && err.message ? err.message : err);
    }
  }
  return !snap.empty;
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});
