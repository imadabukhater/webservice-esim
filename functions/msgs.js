// نصوص الإشعارات (دوال نقية قابلة للاختبار)
const TYPE = {
  card: 'شحن كرت',
  bill: 'شحن فاتورة',
  activate_new: 'تفعيل فاتورة جديدة',
  activate_old: 'تجديد خط (زبون سابق)',
  game: 'شحن ألعاب وتطبيقات',
};
const TK = { tech: 'خلل تقني', swap: 'تبديل SIM', esim: 'تحويل إلى eSIM', slow: 'إنترنت ضعيف', cut: 'فصل رقم' };
const money = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US') + ' ₪';
const ref = (o) => (o.no ? ' رقم ' + o.no : '');

function newOrderMsg(o) {
  return {
    title: 'طلب جديد' + ref(o),
    body: `${o.agentName || ''} — ${TYPE[o.type] || o.type}${o.number ? ' — ' + o.number : o.account ? ' — ' + o.account : ''}`,
  };
}
function orderDoneMsg(o) {
  const act = String(o.type || '').startsWith('activate');
  const what = act
    ? `تم تفعيل الرقم ${o.number || ''}`
    : `تم تنفيذ ${TYPE[o.type] || 'الطلب'}${o.number ? ' للرقم ' + o.number : o.account ? ' للحساب ' + o.account : ''}`;
  return { title: 'تم تنفيذ الطلب' + ref(o), body: `${what}${o.no ? ' (طلب رقم ' + o.no + ')' : ''} — خُصم ${money(o.amount)}` };
}
function orderRejectedMsg(o) {
  return { title: 'تم رفض الطلب' + ref(o), body: `${TYPE[o.type] || ''}${o.adminNote ? ' — ' + o.adminNote : ''}` };
}
function topupMsg(p) {
  return { title: 'تم شحن رصيدك', body: `أُضيف ${money(p.amount)} إلى رصيدك` };
}
function adjustMsg(p) {
  const v = +p.amount || 0;
  return { title: 'تم تعديل رصيدك', body: `${v > 0 ? 'أُضيف' : 'خُصم'} ${money(Math.abs(v))}${p.note ? ' — ' + p.note : ''}` };
}
function newTicketMsg(t) {
  return { title: 'رسالة دعم جديدة', body: `${t.agentName || ''} — ${TK[t.kind] || t.kind} — ${t.number || ''}` };
}
function ticketResolvedMsg(t) {
  return { title: 'تم حل طلب الدعم', body: `${TK[t.kind] || ''} ${t.number || ''}${t.reply ? ' — ' + t.reply : ''}` };
}
function newAgentMsg(u) {
  return { title: 'وكيل جديد بانتظار التفعيل', body: `${u.name || u.username} — ${u.whatsapp || u.phone || ''}` };
}
function agentActivatedMsg() {
  return { title: 'تم تفعيل حسابك', body: 'يمكنك الآن استخدام التطبيق. تواصل مع الدعم لشحن رصيدك.' };
}

function offerMsg(p, companyName) {
  const price = money(p.price);
  return {
    title: 'عرض جديد 🎁',
    body: `${companyName ? companyName + ': ' : ''}${p.name || ''} — ${price}${p.offerEnd ? ' (حتى ' + p.offerEnd + ')' : ''}`,
  };
}

function chatMsg(x) {
  const t = String(x.text || '');
  return x.from === 'admin'
    ? { title: 'رسالة من الدعم الفني', body: t.slice(0, 120) }
    : { title: `رسالة من ${x.agentName || 'وكيل'}`, body: t.slice(0, 120) };
}

module.exports = { chatMsg, adjustMsg, offerMsg, newOrderMsg, orderDoneMsg, orderRejectedMsg, topupMsg, newTicketMsg, ticketResolvedMsg, newAgentMsg, agentActivatedMsg };
