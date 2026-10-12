const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const m = require('./msgs');

admin.initializeApp();
const db = admin.firestore();

// يجب أن تطابق منطقة قاعدة بيانات Firestore (مثال: europe-west1 أو us-central1)
setGlobalOptions({ region: process.env.FN_REGION || 'us-central1', maxInstances: 5 });

async function tokensOf(uids) {
  const tokens = [];
  for (const uid of uids) {
    const q = await db.collection('tokens').where('uid', '==', uid).get();
    q.forEach((d) => tokens.push(d.id));
  }
  return [...new Set(tokens)];
}

async function adminUids() {
  const q = await db.collection('users').where('role', '==', 'admin').get();
  return q.docs.map((d) => d.id);
}

async function agentUids() {
  const q = await db.collection('users').where('role', '==', 'agent').get();
  return q.docs.filter((d) => d.data().active === true && !d.data().pending).map((d) => d.id);
}

async function push(uids, msg) {
  const tokens = await tokensOf(uids);
  if (!tokens.length) return;
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: msg.title, body: msg.body },
    android: { priority: 'high', notification: { channelId: 'orders', sound: 'default' } },
  });
  // تنظيف الرموز المنتهية
  const dead = [];
  res.responses.forEach((r, i) => {
    const c = r.error && r.error.code;
    if (!r.success && (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token')) dead.push(tokens[i]);
  });
  await Promise.all(dead.map((t) => db.collection('tokens').doc(t).delete()));
}

// ترقيم الطلبات تسلسلياً (1001, 1002, ...) ثم إشعار المدير
exports.onOrderCreated = onDocumentCreated('orders/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const ref = db.doc('counters/orders');
  const no = await db.runTransaction(async (tx) => {
    const c = await tx.get(ref);
    const n = ((c.exists && c.data().n) || 1000) + 1;
    tx.set(ref, { n });
    return n;
  });
  await snap.ref.update({ no });
  const o = { ...snap.data(), no };
  if (o.status === 'pending') await push(await adminUids(), m.newOrderMsg(o));
});

exports.onOrderUpdated = onDocumentUpdated('orders/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || before.status !== 'pending') return;
  if (after.status === 'done') await push([after.agentId], m.orderDoneMsg(after));
  else if (after.status === 'rejected') await push([after.agentId], m.orderRejectedMsg(after));
});

exports.onPaymentCreated = onDocumentCreated('payments/{id}', async (event) => {
  const p = event.data && event.data.data();
  if (!p || p.kind === 'debt') return;
  await push([p.agentId], p.kind === 'adjust' ? m.adjustMsg(p) : m.topupMsg(p));
});

exports.onTicketCreated = onDocumentCreated('tickets/{id}', async (event) => {
  const t = event.data && event.data.data();
  if (t) await push(await adminUids(), m.newTicketMsg(t));
});

exports.onTicketUpdated = onDocumentUpdated('tickets/{id}', async (event) => {
  const b = event.data.before.data();
  const a = event.data.after.data();
  if (b.status === 'open' && a.status === 'resolved') await push([a.agentId], m.ticketResolvedMsg(a));
});

// المحادثة: رسالة الوكيل تصل للمدير، ورسالة المدير تصل لذلك الوكيل
exports.onChatMessage = onDocumentCreated('msgs/{id}', async (event) => {
  const x = event.data && event.data.data();
  if (!x || !x.text) return;
  if (x.from === 'admin') await push([x.agentId], m.chatMsg(x));
  else if (x.from === 'agent') await push(await adminUids(), m.chatMsg(x));
});

exports.onUserCreated = onDocumentCreated('users/{uid}', async (event) => {
  const u = event.data && event.data.data();
  if (u && u.role === 'agent' && u.pending) await push(await adminUids(), m.newAgentMsg(u));
});

exports.onUserUpdated = onDocumentUpdated('users/{uid}', async (event) => {
  const b = event.data.before.data();
  const a = event.data.after.data();
  if (a.role === 'agent' && b.pending && !a.pending && a.active) await push([event.params.uid], m.agentActivatedMsg());
});

// عرض جديد أو محدَّث: يُرسل إشعار لكل الوكلاء المفعّلين عندما يختار المدير "إشعار الوكلاء" (يتغيّر notifyAt)
exports.onPackageWritten = onDocumentWritten('packages/{id}', async (event) => {
  const a = event.data.after && event.data.after.data();
  if (!a || !a.isOffer || a.active === false || !a.notifyAt) return;
  const b = event.data.before && event.data.before.data();
  if (b && b.notifyAt === a.notifyAt) return;
  let cname = '';
  if (a.companyId) {
    const c = await db.collection('companies').doc(a.companyId).get();
    cname = (c.exists && c.data().name) || '';
  }
  await push(await agentUids(), m.offerMsg(a, cname));
});

// المدير يغيّر كلمة مرور وكيل (لا يمكن ذلك من التطبيق مباشرة، فيمر عبر الخادم)
exports.adminSetPassword = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'سجّل الدخول أولاً');
  if (!auth.token.firebase || auth.token.firebase.sign_in_provider !== 'password') {
    throw new HttpsError('permission-denied', 'غير مسموح');
  }
  const me = await db.collection('users').doc(auth.uid).get();
  if (!me.exists || me.data().role !== 'admin' || me.data().active !== true) {
    throw new HttpsError('permission-denied', 'للمدير فقط');
  }
  const { uid, password } = request.data || {};
  if (typeof uid !== 'string' || !uid || typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'كلمة المرور 6 أحرف على الأقل');
  }
  const t = await db.collection('users').doc(uid).get();
  if (!t.exists || t.data().role !== 'agent') throw new HttpsError('not-found', 'الوكيل غير موجود');
  if (t.data().provider === 'google') throw new HttpsError('failed-precondition', 'هذا الوكيل يدخل بحساب Google');
  await admin.auth().updateUser(uid, { password });
  await admin.auth().revokeRefreshTokens(uid);
  return { ok: true };
});
