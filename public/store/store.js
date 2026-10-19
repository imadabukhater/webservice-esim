/* Customer store: direct eSIM activation + prepaid card top-up.
   Talks to the API served from the same origin under /api. */
(() => {
  'use strict';

  const API = '/api';
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ILS = (n) => `${n} ₪`;

  const state = {
    token: localStorage.getItem('esim_token') || '',
    user: JSON.parse(localStorage.getItem('esim_user') || 'null'),
    plans: [],
    providerFilter: 0, // 0 = all
    balance: 0,
    instructions: null,
    pollTimer: null,
    topupTimer: null,
  };

  // ------------------------------------------------------------------ api
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(API + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      if (response.status === 401 && state.token) logout(true);
      const message =
        (data && (data.message || (data.details && JSON.stringify(data.details)))) ||
        'حدث خطأ غير متوقع';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  // ---------------------------------------------------------------- toast
  let toastTimer = null;
  function toast(message, isError) {
    const box = $('#toast');
    box.textContent = message;
    box.classList.toggle('error', !!isError);
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (box.hidden = true), 4200);
  }

  function busy(button, on) {
    if (!button) return;
    button.disabled = on;
    if (on) {
      button.dataset.label = button.textContent;
      button.textContent = '... لحظة';
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
    }
  }

  // ----------------------------------------------------------------- auth
  function setSession(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('esim_token', token);
    localStorage.setItem('esim_user', JSON.stringify(user || null));
  }

  function logout(expired) {
    state.token = '';
    state.user = null;
    localStorage.removeItem('esim_token');
    localStorage.removeItem('esim_user');
    stopPolling();
    render();
    if (expired) toast('انتهت الجلسة، سجّل الدخول من جديد', true);
  }

  $('#logoutBtn').addEventListener('click', () => logout(false));

  document.querySelectorAll('.seg').forEach((button) =>
    button.addEventListener('click', () => {
      document.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      const mode = button.dataset.auth;
      $('#loginForm').hidden = mode !== 'login';
      $('#registerForm').hidden = mode !== 'register';
    }),
  );

  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button');
    busy(button, true);
    try {
      const body = Object.fromEntries(new FormData(form));
      const result = await api('POST', '/sessions', body);
      setSession(result.token, { email: body.email });
      await render();
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy(button, false);
    }
  });

  $('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button');
    busy(button, true);
    try {
      const body = Object.fromEntries(new FormData(form));
      if (!body.phone_number) delete body.phone_number;
      const result = await api('POST', '/users', body);
      setSession(result.accessToken, result.user);
      toast('تم إنشاء حسابك، أهلًا بك');
      await render();
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy(button, false);
    }
  });

  // ----------------------------------------------------------------- tabs
  document.querySelectorAll('.main-tab').forEach((button) =>
    button.addEventListener('click', () => {
      document.querySelectorAll('.main-tab').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      const tab = button.dataset.tab;
      $('#tab-esim').hidden = tab !== 'esim';
      $('#tab-topup').hidden = tab !== 'topup';
      if (tab === 'topup') refreshTopupTab();
    }),
  );

  // --------------------------------------------------------------- dialog
  const dialog = $('#dialog');
  $('#dialogClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', stopPolling);

  function openDialog(title) {
    stopPolling();
    $('#dialogTitle').textContent = title;
    const body = $('#dialogBody');
    body.textContent = '';
    if (!dialog.open) dialog.showModal();
    return body;
  }

  function stopPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  function walletBox() {
    const info = state.instructions;
    if (!info || !info.wallet_number) return null;
    const box = el('div', 'wallet-box');
    const label = el('div');
    label.append(
      el('div', 'small muted', `حوّل عبر جوال باي إلى${info.wallet_name ? ` (${info.wallet_name})` : ''}:`),
      el('div', 'wallet-number', info.wallet_number),
    );
    const copy = el('button', 'btn ghost small', 'نسخ');
    copy.type = 'button';
    copy.addEventListener('click', () => {
      navigator.clipboard?.writeText(info.wallet_number);
      toast('تم نسخ رقم المحفظة');
    });
    box.append(label, copy);
    return box;
  }

  // ------------------------------------------------------------- checkout
  function payDialog(order, context) {
    const body = openDialog(
      context === 'renew' ? 'دفع التجديد / التمديد' : 'إتمام الدفع',
    );
    body.append(
      el('p', 'muted', `طلب ${order.order_number} — المطلوب ${ILS(order.amount)}`),
    );
    const options = el('div', 'pay-options');

    // Option 1: prepaid balance
    const balanceOption = el('div', 'pay-option');
    balanceOption.append(el('strong', '', `الدفع من رصيدك (${ILS(state.balance)})`));
    const balanceButton = el('button', 'btn primary block', 'ادفع من الرصيد الآن');
    balanceButton.type = 'button';
    if (state.balance < order.amount) {
      balanceButton.disabled = true;
      balanceOption.append(
        el('span', 'small muted', 'رصيدك لا يكفي — اشحن كرت الدفع المسبق أو ادفع عبر جوال باي.'),
      );
    }
    balanceButton.addEventListener('click', async () => {
      busy(balanceButton, true);
      try {
        const result = await api(
          'POST',
          `/payments/orders/${order.esim_purchase_id}/pay-with-balance`,
        );
        state.balance = result.balance;
        updateBalanceUi();
        await afterPaid(result.order);
      } catch (error) {
        toast(error.message, true);
        busy(balanceButton, false);
      }
    });
    balanceOption.append(balanceButton);

    // Option 2: Jawwal Pay transfer
    const jawwal = el('div', 'pay-option');
    jawwal.append(el('strong', '', 'التحويل عبر محفظة جوال باي'));
    const wallet = walletBox();
    if (wallet) jawwal.append(wallet);
    jawwal.append(
      el('span', 'small muted', `حوّل ${ILS(order.amount)} بالضبط، ثم أدخل واحدًا مما يلي:`),
    );
    const form = el('form', 'form');
    form.innerHTML = `
      <label>اسم صاحب المحفظة المحوِّلة<input name="sender_name" maxlength="150" placeholder="كما يظهر في جوال باي"></label>
      <div class="row">
        <label>أو رقم المحفظة<input name="sender_phone" inputmode="tel" maxlength="20"></label>
        <label>أو رقم المرجع<input name="reference" inputmode="numeric" maxlength="100"></label>
      </div>
      <button class="btn primary" type="submit">تأكيد: لقد حوّلت المبلغ</button>
      <p class="form-note" hidden></p>`;
    const note = form.querySelector('.form-note');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      busy(button, true);
      try {
        const raw = Object.fromEntries(new FormData(form));
        const claim = { order_id: order.esim_purchase_id };
        for (const key of ['sender_name', 'sender_phone', 'reference']) {
          if (raw[key] && raw[key].trim()) claim[key] = raw[key].trim();
        }
        const result = await api('POST', '/payments/claims', claim);
        if (result.status === 'matched' || result.status === 'already_paid') {
          await afterPaid(await api('GET', `/orders/${order.esim_purchase_id}`));
          return;
        }
        note.hidden = false;
        note.classList.remove('ok');
        note.innerHTML = '';
        note.append(
          el('span', 'spinner'),
          document.createTextNode(
            result.status === 'ambiguous'
              ? ' أكثر من تحويل يطابق الاسم — أدخل رقم المرجع من وصل جوال باي.'
              : ' تم حفظ طلبك. ننتظر إشعار التحويل وسيُفعَّل الطلب تلقائيًا خلال دقيقة من وصوله.',
          ),
        );
        startClaimPolling(order.esim_purchase_id, note);
      } catch (error) {
        toast(error.message, true);
      } finally {
        busy(button, false);
      }
    });
    jawwal.append(form);

    options.append(balanceOption, jawwal);
    body.append(options);
  }

  function startClaimPolling(orderId, note) {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      try {
        const result = await api('GET', `/payments/claims/order/${orderId}`);
        if (result.status === 'matched' || result.status === 'already_paid') {
          stopPolling();
          note.classList.add('ok');
          note.textContent = 'تم التحقق من الدفع ✓';
          await afterPaid(await api('GET', `/orders/${orderId}`));
        }
      } catch {
        /* keep polling */
      }
    }, 10000);
  }

  async function afterPaid(order) {
    toast('تم الدفع بنجاح');
    await Promise.all([loadLines(), loadBalance()]);
    showOrderResult(order);
  }

  // ------------------------------------------------------- order result UI
  async function showOrderResult(order) {
    const isRenewal = order.purchase_type && order.purchase_type !== 'new';
    const body = openDialog(isRenewal ? 'تم تجديد الخط' : 'شريحتك جاهزة 🎉');
    if (isRenewal) {
      body.append(
        el(
          'p',
          '',
          `تم ${order.purchase_type === 'extension' ? 'تمديد' : 'تجديد'} الخط حتى ${dateOnly(order.expiry_date)}.`,
        ),
      );
      return;
    }
    if (order.qr_visible === false) {
      body.append(
        el('p', '', 'تم حجز شريحتك بنجاح. هذه الباقة يفعّلها فريقنا يدويًا وسنتواصل معك قريبًا — ستصلك التفاصيل على بريدك الإلكتروني.'),
      );
      return;
    }
    const holder = el('div', 'qr-box');
    holder.append(el('span', 'spinner'));
    body.append(holder);
    try {
      const qr = await api('GET', `/orders/${order.esim_purchase_id}/qr`);
      holder.textContent = '';
      const img = new Image();
      img.src = qr.qr_image;
      img.alt = 'eSIM QR';
      holder.append(
        img,
        el('div', 'small muted', `الرقم: ${qr.phone_number} — ICCID: ${qr.iccid}`),
        el('div', 'code', qr.qr_code),
      );
      const activate = el('button', 'btn primary block', 'فعّلت الشريحة ✓');
      activate.type = 'button';
      activate.addEventListener('click', async () => {
        busy(activate, true);
        try {
          await api('POST', `/orders/${order.esim_purchase_id}/activate`);
          toast('تم تفعيل الشريحة');
          dialog.close();
          await loadLines();
        } catch (error) {
          toast(error.message, true);
          busy(activate, false);
        }
      });
      holder.append(
        el('p', 'small muted', 'امسح الرمز من إعدادات الهاتف ← بيانات الجوال ← إضافة eSIM، ثم اضغط الزر.'),
        activate,
      );
    } catch (error) {
      holder.textContent = '';
      holder.append(el('p', 'form-note', error.message));
    }
  }

  // ------------------------------------------------------------- catalog
  async function loadCatalog() {
    const plans = await api('GET', '/plans?is_active=true');
    state.plans = plans;
    const providers = new Map();
    for (const plan of plans) providers.set(plan.provider.provider_id, plan.provider);

    const chips = $('#providerChips');
    chips.textContent = '';
    const all = el('button', 'chip' + (state.providerFilter === 0 ? ' active' : ''), 'الكل');
    all.type = 'button';
    all.addEventListener('click', () => {
      state.providerFilter = 0;
      loadCatalogView();
    });
    chips.append(all);
    for (const provider of providers.values()) {
      const chip = el(
        'button',
        'chip' + (state.providerFilter === provider.provider_id ? ' active' : ''),
        provider.name,
      );
      chip.type = 'button';
      chip.addEventListener('click', () => {
        state.providerFilter = provider.provider_id;
        loadCatalogView();
      });
      chips.append(chip);
    }
    loadCatalogView();
  }

  function loadCatalogView() {
    document.querySelectorAll('#providerChips .chip').forEach((chip, index) => {
      const active =
        (index === 0 && state.providerFilter === 0) ||
        chip.textContent ===
          state.plans.find((p) => p.provider.provider_id === state.providerFilter)?.provider.name;
      chip.classList.toggle('active', active);
    });
    const grid = $('#plans');
    grid.textContent = '';
    const plans = state.plans.filter(
      (plan) => state.providerFilter === 0 || plan.provider.provider_id === state.providerFilter,
    );
    if (plans.length === 0) {
      grid.append(el('div', 'empty', 'لا توجد باقات متاحة حاليًا'));
      return;
    }
    for (const plan of plans) grid.append(planCard(plan));
  }

  function planCard(plan) {
    const card = el('div', 'card plan');
    card.append(el('div', 'plan-provider', plan.provider.name));
    card.append(el('h3', '', plan.plan_name));
    const specs = el('div', 'plan-specs');
    specs.append(el('span', 'spec', `${plan.data_amount_gb}GB`));
    if (plan.call_minutes) specs.append(el('span', 'spec', `${plan.call_minutes} دقيقة`));
    if (plan.sms_count) specs.append(el('span', 'spec', `${plan.sms_count} SMS`));
    specs.append(el('span', 'spec', `${plan.validity_days} يوم`));
    card.append(specs);

    const pricing = plan.pricing;
    const prices = el('div', 'price-lines');
    if (pricing.qr_price > 0) {
      const line1 = el('div', 'price-line');
      line1.append(el('span', '', 'الباقة'), el('span', '', ILS(pricing.plan_price)));
      const line2 = el('div', 'price-line');
      line2.append(el('span', '', 'شريحة eSIM (QR)'), el('span', '', ILS(pricing.qr_price)));
      prices.append(line1, line2);
    }
    const total = el('div', 'price-total');
    total.append(el('span', '', 'الإجمالي'), el('span', '', ILS(pricing.new_esim_total)));
    prices.append(total);
    prices.append(
      el('div', 'price-line', ''),
    );
    prices.lastChild.append(
      el('span', '', 'التجديد لاحقًا'),
      el('span', '', ILS(pricing.renewal_price)),
    );
    card.append(prices);

    const buy = el('button', 'btn primary', 'شراء وتفعيل الآن');
    buy.type = 'button';
    buy.addEventListener('click', async () => {
      busy(buy, true);
      try {
        const order = await api('POST', '/orders', { plan_id: plan.plan_id });
        payDialog(order, 'new');
      } catch (error) {
        toast(error.message, true);
      } finally {
        busy(buy, false);
      }
    });
    card.append(buy);
    return card;
  }

  // ---------------------------------------------------------------- lines
  const dateOnly = (value) => (value ? String(value).slice(0, 10) : '—');

  const STATUS = {
    pending: ['بانتظار الدفع', 'warn'],
    code_sent: ['مدفوع — جاهز للتفعيل', 'ok'],
    activated: ['مفعّل', 'ok'],
    expired: ['منتهي', ''],
  };

  async function loadLines() {
    const orders = await api('GET', '/orders');
    const wrap = $('#lines');
    wrap.textContent = '';
    const lines = orders.filter((order) => order.purchase_type === 'new');
    const pendingRenewals = orders.filter(
      (order) => order.purchase_type !== 'new' && order.payment_status === 'pending',
    );
    if (lines.length === 0) {
      wrap.append(el('div', 'empty', 'لم تشترِ أي شريحة بعد'));
      return;
    }
    for (const order of lines) wrap.append(lineCard(order, pendingRenewals));
  }

  function lineCard(order, pendingRenewals) {
    const card = el('div', 'card line');
    const info = el('div');
    const title = el('div');
    title.append(el('strong', '', order.plan ? order.plan.plan_name : `طلب ${order.order_number}`));
    const [label, badgeCls] = STATUS[order.purchase_status] || [order.purchase_status, ''];
    title.append(document.createTextNode(' '), el('span', `badge ${badgeCls}`, label));
    info.append(title);
    const meta = el('div', 'line-meta');
    if (order.esim) meta.append(el('span', '', `الرقم: ${order.esim.phone_number}`));
    meta.append(el('span', '', `ينتهي: ${dateOnly(order.expiry_date)}`));
    meta.append(el('span', '', `المبلغ: ${ILS(order.amount)}`));
    info.append(meta);
    card.append(info);

    const actions = el('div', 'line-actions');
    const paid = order.payment_status === 'completed';
    if (!paid && order.payment_status === 'pending') {
      actions.append(actionButton('ادفع الآن', 'primary', () => payDialog(order, 'new')));
    }
    if (paid && order.esim) {
      if (order.qr_visible !== false) {
        actions.append(actionButton('عرض QR', 'ghost', () => showOrderResult(order)));
      }
      if (order.purchase_status !== 'activated') {
        actions.append(
          actionButton('تفعيل', 'primary', async () => {
            await api('POST', `/orders/${order.esim_purchase_id}/activate`);
            toast('تم تفعيل الشريحة');
            await loadLines();
          }),
        );
      }
      const waiting = pendingRenewals.find(
        (r) => r.renews_purchase_id === order.esim_purchase_id,
      );
      if (waiting) {
        actions.append(actionButton('ادفع التجديد', 'primary', () => payDialog(waiting, 'renew')));
      } else {
        actions.append(
          actionButton('تجديد', 'ghost', () => renew(order, 'renewal')),
          actionButton('تمديد', 'ghost', () => renew(order, 'extension')),
        );
      }
    }
    card.append(actions);
    return card;
  }

  function actionButton(label, kind, handler) {
    const button = el('button', `btn ${kind} small`, label);
    button.type = 'button';
    button.addEventListener('click', async () => {
      busy(button, true);
      try {
        await handler();
      } catch (error) {
        toast(error.message, true);
      } finally {
        busy(button, false);
      }
    });
    return button;
  }

  async function renew(order, type) {
    const renewal = await api('POST', `/orders/${order.esim_purchase_id}/renew`, { type });
    payDialog(renewal, 'renew');
  }

  $('#refreshLines').addEventListener('click', () => loadLines().catch(() => {}));

  // -------------------------------------------------------------- balance
  function updateBalanceUi() {
    $('#balancePill').textContent = ILS(state.balance);
    $('#balanceBig').textContent = ILS(state.balance);
  }

  async function loadBalance() {
    const result = await api('GET', '/payments/balance');
    state.balance = result.balance;
    updateBalanceUi();
    const ledger = $('#ledger');
    ledger.textContent = '';
    const KINDS = {
      topup: 'شحن رصيد',
      purchase: 'شراء',
      refund: 'استرداد',
      adjustment: 'تعديل إداري',
    };
    if (result.transactions.length === 0) {
      ledger.append(el('div', 'empty', 'لا حركات بعد'));
    }
    for (const entry of result.transactions) {
      const row = el('div', 'card list-item');
      const right = el('div');
      right.append(el('strong', '', KINDS[entry.kind] || entry.kind));
      right.append(el('div', 'small muted', entry.note || dateOnly(entry.created_at)));
      const amount = el(
        'span',
        entry.amount >= 0 ? 'amount-pos' : 'amount-neg',
        `${entry.amount > 0 ? '+' : ''}${entry.amount} ₪`,
      );
      row.append(right, amount);
      ledger.append(row);
    }
  }

  async function loadTopups() {
    const topups = await api('GET', '/payments/topups');
    const wrap = $('#topups');
    wrap.textContent = '';
    if (topups.length === 0) {
      wrap.append(el('div', 'empty', 'لا طلبات شحن بعد'));
      return;
    }
    const LABELS = {
      pending: ['بانتظار التحويل', 'warn'],
      matched: ['تم الشحن ✓', 'ok'],
      rejected: ['مرفوض', ''],
    };
    for (const topup of topups) {
      const row = el('div', 'card list-item');
      const right = el('div');
      right.append(el('strong', '', ILS(topup.topup_amount || 0)));
      right.append(
        el('div', 'small muted', topup.sender_name || topup.sender_phone || topup.reference || ''),
      );
      const [label, cls] = LABELS[topup.status] || [topup.status, ''];
      row.append(right, el('span', `badge ${cls}`, label));
      wrap.append(row);
    }
  }

  function refreshTopupTab() {
    Promise.all([loadBalance(), loadTopups()]).catch((error) => toast(error.message, true));
  }

  $('#topupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button');
    const note = $('#topupNote');
    busy(button, true);
    try {
      const raw = Object.fromEntries(new FormData(form));
      const body = { amount: Number(raw.amount) };
      for (const key of ['sender_name', 'sender_phone', 'reference']) {
        if (raw[key] && raw[key].trim()) body[key] = raw[key].trim();
      }
      const result = await api('POST', '/payments/topups', body);
      note.hidden = false;
      if (result.status === 'matched') {
        note.classList.add('ok');
        note.textContent = `تم الشحن ✓ رصيدك الآن ${ILS(result.balance)}`;
        state.balance = result.balance;
        updateBalanceUi();
      } else {
        note.classList.remove('ok');
        note.textContent =
          'تم حفظ طلب الشحن. سيُضاف الرصيد تلقائيًا فور وصول إشعار التحويل (حوّل نفس المبلغ بالضبط).';
        pollTopups();
      }
      form.reset();
      await loadTopups();
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy(button, false);
    }
  });

  function pollTopups() {
    clearInterval(state.topupTimer);
    let attempts = 0;
    state.topupTimer = setInterval(async () => {
      attempts += 1;
      if (attempts > 30 || $('#tab-topup').hidden) {
        clearInterval(state.topupTimer);
        return;
      }
      const before = state.balance;
      await loadBalance().catch(() => {});
      if (state.balance !== before) {
        toast('تم شحن رصيدك ✓');
        await loadTopups().catch(() => {});
        clearInterval(state.topupTimer);
      }
    }, 12000);
  }

  async function loadInstructions() {
    state.instructions = await api('GET', '/payments/instructions');
    const steps = $('#topupSteps');
    steps.textContent = '';
    const wallet = walletBox();
    if (wallet) steps.before(wallet);
    for (const step of state.instructions.steps || []) steps.append(el('li', '', step));
  }

  // --------------------------------------------------------------- render
  async function render() {
    const authed = !!state.token;
    $('#authView').hidden = authed;
    $('#storeView').hidden = !authed;
    $('#account').hidden = !authed;
    if (!authed) return;
    $('#who').textContent = state.user?.email || '';
    try {
      await Promise.all([loadInstructions(), loadCatalog(), loadLines(), loadBalance()]);
    } catch (error) {
      if (error.status !== 401) toast(error.message, true);
    }
  }

  render();
})();
