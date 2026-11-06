// Kelola Akun (situs admin): beri / cabut akses admin lewat input email.
// Hanya email yang dimasukkan admin (plus admin awal di src/config.js) yang tampil & dikelola di sini —
// BUKAN seluruh akun yang sudah terdaftar / pernah masuk.

function accountMethodBadge(p) {
  const t = T();
  const icon = p === 'google' ? 'fa-brands fa-google' : 'fa-solid fa-envelope';
  const label = p === 'google' ? 'Google' : t.fieldEmail;
  return `<span class="inline-flex items-center gap-1.5 text-[11px] text-slate-600"><i class="${icon} text-slate-400"></i>${esc(label)}</span>`;
}

function accStatusBadge(u) {
  const t = T();
  return u.pending
    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-500 border border-dashed border-slate-300"><i class="fa-solid fa-hourglass-half text-[9px]"></i>${t.accPendingSignup}</span>`
    : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"><i class="fa-solid fa-user-shield text-[9px]"></i>${t.accActive}</span>`;
}

function accountActionBtn(u, full) {
  const t = T();
  const size = full ? 'w-full h-10' : 'h-8 px-3';
  const isSelf = state.user && String(u.email).toLowerCase() === String(state.user.email).toLowerCase();
  if (isSelf) return `<span class="inline-flex items-center justify-center ${size} text-[11px] text-slate-400 italic">${t.youLabel}</span>`;
  if (u.base) return `<span class="inline-flex items-center justify-center gap-1 ${size} text-[11px] text-slate-400 italic"><i class="fa-solid fa-lock text-[10px]"></i>${t.accOwner}</span>`;
  const email = esc(u.email).replace(/'/g, '&#39;');
  return `<button type="button" onclick="requestRoleChange('${email}', 'user')" class="${size} rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 inline-flex items-center justify-center gap-1.5"><i class="fa-solid fa-user-minus"></i>${t.btnRevokeAdmin}</button>`;
}

function renderAccounts() {
  const body = document.getElementById('acc-table-body');
  const cards = document.getElementById('acc-cards');
  if (!body || !cards || !AUTH.isAdmin()) return;
  const t = T();
  const backend = !!window.BIRAMA_API_CONFIG?.useBackend;
  const q = (document.getElementById('acc-search')?.value || '').trim().toLowerCase();
  const base = AUTH.baseAdminEmails();

  let all;
  if (backend) {
    const accounts = Array.isArray(state.adminAccounts) ? state.adminAccounts : [];
    const activeAdmins = accounts.filter(u => String(u.role || '').toLowerCase() === 'admin').map(u => ({
      email: u.email, name: u.name, provider: u.provider || 'email', base: base.includes(String(u.email).toLowerCase()), pending: false
    }));
    const registeredEmails = new Set(accounts.map(u => String(u.email || '').toLowerCase()));
    const pending = (state.pendingAdminGrants || []).filter(g => !registeredEmails.has(String(g.email || '').toLowerCase())).map(g => ({
      email: g.email, name: '', provider: null, base: base.includes(String(g.email).toLowerCase()), pending: true
    }));
    all = [...activeAdmins, ...pending];
  } else {
    AUTH.users = storeGet(STORAGE_KEYS.users, AUTH.users);
    all = AUTH.managedEmails().map(email => {
      const u = window.BIRAMA_API_CONFIG?.useBackend
    ? (state.adminAccounts || []).find(x => String(x.email).toLowerCase() === email)
    : AUTH.findUser(email);
      return u
        ? { email: u.email, name: u.name, provider: u.provider, base: base.includes(u.email), pending: false }
        : { email, name: '', provider: null, base: base.includes(email), pending: true };
    });
  }

  const totalEl = document.getElementById('acc-stat-total');
  const adminEl = document.getElementById('acc-stat-admin');
  if (totalEl) totalEl.innerText = all.length;
  if (adminEl) adminEl.innerText = all.filter(u => !u.pending).length;

  const rows = all
    .filter(u => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
    .sort((a, b) => (a.pending === b.pending) ? a.email.localeCompare(b.email) : a.pending ? 1 : -1);

  const pg = paginate('accounts', rows, q, renderAccounts);
  renderPager('acc-pager', 'accounts', pg);

  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 italic">${t.accEmpty}</td></tr>`;
    cards.innerHTML = `<p class="p-6 text-center text-slate-400 italic text-xs">${t.accEmpty}</p>`;
    return;
  }
  const nameOf = u => u.pending ? `<span class="italic text-slate-400">—</span>` : esc(u.name);
  const avatar = (u, size) => `<span class="${size} rounded-full ${u.pending ? 'bg-slate-300' : 'bg-amber-500'} text-white text-[11px] font-bold flex items-center justify-center shrink-0">${u.pending ? '?' : esc(initials(u.name))}</span>`;
  const method = u => u.pending ? `<span class="text-[11px] text-slate-400 italic">${t.accNotRegistered}</span>` : accountMethodBadge(u.provider);

  body.innerHTML = pg.rows.map(u => `
    <tr class="hover:bg-slate-50">
      <td class="p-3"><div class="flex items-center gap-2.5">${avatar(u, 'w-8 h-8')}<span class="font-semibold text-slate-800">${nameOf(u)}</span></div></td>
      <td class="p-3 font-mono text-[11px] text-slate-600">${esc(u.email)}</td>
      <td class="p-3">${method(u)}</td>
      <td class="p-3">${accStatusBadge(u)}</td>
      <td class="p-3 text-center">${accountActionBtn(u, false)}</td>
    </tr>`).join('');
  cards.innerHTML = pg.rows.map(u => `
    <div class="p-4 space-y-3">
      <div class="flex items-center gap-3 min-w-0">
        ${avatar(u, 'w-10 h-10')}
        <div class="min-w-0 flex-1"><p class="font-bold text-sm text-slate-800 truncate">${nameOf(u)}</p><p class="text-xs text-slate-500 truncate">${esc(u.email)}</p></div>
        ${accStatusBadge(u)}
      </div>
      <div class="flex items-center justify-between gap-3">${method(u)}<div class="min-w-[9rem]">${accountActionBtn(u, true)}</div></div>
    </div>`).join('');
}

// ---- Form "Tambah admin lewat email" ----
function handleGrantAdminSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('acc-grant-email');
  const err = document.getElementById('acc-grant-error');
  err.classList.add('hidden');
  const email = AUTH.normalizeEmail(input.value);
  const fail = (key) => { err.innerText = T()[key] || key; err.classList.remove('hidden'); };
  if (!email) return fail('errFillAll');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('errEmailInvalid');
  const alreadyManaged = window.BIRAMA_API_CONFIG?.useBackend
    ? [...(state.adminAccounts || []), ...(state.pendingAdminGrants || [])].some(u => String(u.email || '').toLowerCase() === email && String(u.role || 'admin').toLowerCase() === 'admin')
    : AUTH.isGranted(email);
  if (alreadyManaged) return fail('errAlreadyAdmin');
  requestRoleChange(email, 'admin');
}

function requestRoleChange(email, role) {
  const t = T();
  const grant = role === 'admin';
  email = AUTH.normalizeEmail(email);
  const u = window.BIRAMA_API_CONFIG?.useBackend
    ? (state.adminAccounts || []).find(x => String(x.email).toLowerCase() === email)
    : AUTH.findUser(email);
  document.getElementById('role-confirm-email').value = email;
  document.getElementById('role-confirm-role').value = role;
  document.getElementById('role-confirm-title').innerText = grant ? t.grantTitle : t.revokeTitle;
  document.getElementById('role-confirm-desc').innerText = grant ? t.grantDesc : t.revokeDesc;
  const nameLine = u ? `<p class="font-bold text-slate-800 text-sm">${esc(u.name)}</p>` : `<p class="text-slate-500 italic">${t.accNotRegistered}</p>`;
  document.getElementById('role-confirm-user').innerHTML = `${nameLine}<p class="font-mono text-slate-500">${esc(email)}</p>`;
  const icon = document.getElementById('role-confirm-icon');
  icon.className = `w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${grant ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`;
  const btn = document.getElementById('role-confirm-btn');
  btn.className = `h-10 px-4 text-white text-xs font-semibold rounded-lg shadow-sm ${grant ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}`;
  btn.innerText = grant ? t.btnGrantAdmin : t.btnRevokeAdmin;
  openModal('modal-role-confirm');
}

async function confirmRoleChange() {
  const email = document.getElementById('role-confirm-email').value;
  const role = document.getElementById('role-confirm-role').value;
  closeModal('modal-role-confirm');
  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try {
      if (role === 'admin') {
        const result = await BIRAMA_API.post('/api/admin/accounts/grants', { email });
        document.getElementById('acc-grant-form')?.reset();
        showToast(result.message || fmt(T().roleGrantedPending, { name: email }), 'success');
      } else {
        await BIRAMA_API.request(`/api/admin/accounts/grants/${encodeURIComponent(email)}`, {
          method: 'DELETE', body: JSON.stringify({ revokedBy: state.user?.email || '' }), headers: { 'Content-Type': 'application/json' }
        });
        showToast(fmt(T().roleRevoked, { name: email }), 'success');
      }
      await loadAdminAccountsFromApi();
    } catch (e) { showToast(e.message || 'Gagal mengubah akses admin.', 'error'); }
    return;
  }

  const res = role === 'admin' ? AUTH.grantAdmin(email) : AUTH.revokeAdmin(email);
  if (!res.ok) { showToast(T()[res.error] || res.error, 'error'); return; }
  if (role === 'admin') {
    document.getElementById('acc-grant-form')?.reset();
    showToast(fmt(res.registered ? T().roleGranted : T().roleGrantedPending, { name: res.user ? res.user.name : res.email }), 'success');
  } else {
    showToast(fmt(T().roleRevoked, { name: res.user ? res.user.name : res.email }), 'success');
  }
  window.renderAll();
}


Object.assign(window, { renderAccounts, requestRoleChange, confirmRoleChange, handleGrantAdminSubmit });
