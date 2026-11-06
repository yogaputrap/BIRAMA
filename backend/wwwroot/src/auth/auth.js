// Autentikasi BIRAMA: email/password (dengan verifikasi email & reset kata sandi) dan OAuth Google.
// Token Google diverifikasi server-side oleh BIRAMA API sebelum JWT aplikasi diterbitkan.

const T = () => TRANSLATIONS[state.currentLang] || TRANSLATIONS.id;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.esc = esc;
window.T = T;

const AUTH = {
  users: [],
  pendingProvider: null,

  async init() {
    this.users = [];
    if (window.BIRAMA_API_CONFIG?.useBackend) state.bookings = [];
    const session = storeGet(STORAGE_KEYS.session, null);
    const token = window.BIRAMA_API?.token();
    if (token) {
      try {
        const result = await BIRAMA_API.get('/api/auth/me');
        const u = result.data || result.user || result;
        state.user = { name: u.name, email: u.email, role: u.role, provider: u.provider || 'email', satker: u.satker || '', phone: u.phone || '' };
        storeSet(STORAGE_KEYS.session, { email: u.email, user: state.user });
      } catch (e) {
        if (e.status === 401 || e.status === 403) {
          BIRAMA_API.setToken(null); storeRemove(STORAGE_KEYS.session); state.user = null;
        } else {
          if (session?.user) state.user = session.user;
          console.warn('Validasi sesi API tertunda:', e.message);
        }
      }
    } else state.user = null;
    this.preloadProviders();
  },

  save() { storeSet(STORAGE_KEYS.users, this.users); },

  // Sinkronkan pengguna aktif dengan data akun terbaru (mis. role baru saja dicabut/diberikan)
  refreshSession() {
    // Role and identity are server-authoritative; do not rebuild them from local demo accounts.
    return state.user;
  },
  normalizeEmail(e) { return String(e || '').trim().toLowerCase(); },
  findUser(email) { const e = this.normalizeEmail(email); return this.users.find(u => u.email === e); },
  publicUser(u) { return { name: u.name, email: u.email, role: u.role, provider: u.provider, satker: u.satker || '', phone: u.phone || '' }; },
  isAdmin() { return !!(state.user && state.user.role === 'admin'); },

  async hash(email, password) {
    const input = `${this.normalizeEmail(email)}:${password}`;
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* jatuh ke fallback */ }
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    return `fallback-${h}`;
  },

  startSession(user, token) {
    state.user = this.publicUser(user);
    if (token) BIRAMA_API.setToken(token);
    storeSet(STORAGE_KEYS.session, { email: user.email, user: state.user });
  },

  // ---- Kelola akun (khusus admin) ----
  // Akses admin diberikan per EMAIL yang dimasukkan admin (bukan dipilih dari semua akun terdaftar).
  // Daftar email yang diberi akses disimpan di STORAGE_KEYS.adminGrants. Email tersebut boleh belum
  // terdaftar: akses aktif otomatis begitu pemilik email mendaftar / masuk.
  adminCount() { return this.users.filter(u => u.role === 'admin').length; },

  baseAdminEmails() {
    return ((window.AUTH_CONFIG || {}).adminEmails || []).map(e => this.normalizeEmail(e));
  },
  loadGrants() {
    const raw = storeGet(STORAGE_KEYS.adminGrants, []);
    return Array.isArray(raw) ? raw.map(g => ({ ...g, email: this.normalizeEmail(g.email) })) : [];
  },
  saveGrants(list) { storeSet(STORAGE_KEYS.adminGrants, list); },
  isGranted(email) {
    const e = this.normalizeEmail(email);
    return this.baseAdminEmails().includes(e) || this.loadGrants().some(g => g.email === e);
  },
  // Daftar yang tampil di Kelola Akun: admin awal + email yang diberi akses
  managedEmails() {
    const legacyAdmins = this.users.filter(u => u.role === 'admin').map(u => u.email);   // admin lama yang belum tercatat di daftar akses
    return [...new Set([...this.baseAdminEmails(), ...this.loadGrants().map(g => g.email), ...legacyAdmins])];
  },
  // Sinkronkan role akun terdaftar dengan daftar akses admin
  applyGrantsToUsers() {
    this.users = storeGet(STORAGE_KEYS.users, this.users);
    let changed = false;
    for (const u of this.users) {
      const should = this.isGranted(u.email);
      if (should && u.role !== 'admin') { u.role = 'admin'; changed = true; }
    }
    if (changed) this.save();
  },

  // Beri akses admin lewat input email. Pengaman: hanya admin; format email valid.
  grantAdmin(email) {
    const actor = state.user && this.findUser(state.user.email);
    if (!actor || actor.role !== 'admin') return { ok: false, error: 'errNoPermission' };
    email = this.normalizeEmail(email);
    if (!email) return { ok: false, error: 'errFillAll' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'errEmailInvalid' };
    if (this.isGranted(email)) return { ok: false, error: 'errAlreadyAdmin' };
    const grants = this.loadGrants();
    grants.push({ email, grantedBy: actor.email, grantedAt: Date.now() });
    this.saveGrants(grants);
    this.users = storeGet(STORAGE_KEYS.users, this.users);
    const target = this.findUser(email);
    if (target) { target.role = 'admin'; target.roleChangedBy = actor.email; target.roleChangedAt = Date.now(); this.save(); }
    return { ok: true, email, registered: !!target, user: target || null };
  },

  // Cabut akses admin. Pengaman: hanya admin; tidak boleh akun sendiri; admin awal tidak bisa dicabut; minimal satu admin.
  revokeAdmin(email) {
    this.users = storeGet(STORAGE_KEYS.users, this.users);
    const actor = state.user && this.findUser(state.user.email);
    if (!actor || actor.role !== 'admin') return { ok: false, error: 'errNoPermission' };
    email = this.normalizeEmail(email);
    if (email === actor.email) return { ok: false, error: 'errSelfRevoke' };
    if (this.baseAdminEmails().includes(email)) return { ok: false, error: 'errBaseAdmin' };
    const grants = this.loadGrants();
    const target = this.findUser(email);
    if (!grants.some(g => g.email === email) && !(target && target.role === 'admin')) return { ok: false, error: 'errUserNotFound' };
    if (target && target.role === 'admin' && this.adminCount() <= 1) return { ok: false, error: 'errLastAdmin' };
    this.saveGrants(grants.filter(g => g.email !== email));
    if (target) { target.role = 'user'; target.roleChangedBy = actor.email; target.roleChangedAt = Date.now(); this.save(); }
    return { ok: true, email, user: target || null };
  },

  // ---- Email ----
  async register({ name, email, satker, phone, password, confirm }) {
    name = String(name || '').trim(); email = this.normalizeEmail(email);
    if (!name || !email || !password) return { ok: false, error: 'errFillAll' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'errEmailInvalid' };
    if (password.length < 10) return { ok: false, error: 'errPasswordShort' };
    if (password !== confirm) return { ok: false, error: 'errPasswordMismatch' };
    try {
      const result = await BIRAMA_API.post('/api/auth/register', { name, email, password, satker: String(satker || '').trim(), phone: String(phone || '').trim() });
      // Akun baru belum punya sesi: harus verifikasi email dulu.
      if (!result?.requiresEmailVerification) throw new Error('Respons registrasi API tidak valid.');
      return { ok: true, pendingVerification: true, email: result.email || email };
    } catch (e) { return { ok: false, error: e.status === 409 ? 'errEmailExists' : e.status === 429 ? 'errTooManyRequests' : e.message }; }
  },

  async login(email, password) {
    email = this.normalizeEmail(email);
    if (!email || !password) return { ok: false, error: 'errFillAll' };
    try {
      const result = await BIRAMA_API.post('/api/auth/login', { email, password });
      if (!result?.token || !result?.user) throw new Error('Respons login API tidak memuat token atau profil pengguna.');
      this.startSession(result.user, result.token); return { ok: true, user: result.user };
    } catch (e) {
      if (e.code === 'EMAIL_NOT_VERIFIED') return { ok: false, unverified: true, error: 'errEmailNotVerified' };
      return { ok: false, error: e.status === 401 ? 'errBadCredentials' : e.status === 429 ? 'errTooManyRequests' : e.message };
    }
  },

  // ---- Verifikasi email & reset kata sandi ----
  async verifyEmail(email, token) {
    try { await BIRAMA_API.post('/api/auth/verify-email', { email, token }); return { ok: true }; }
    catch (e) { return { ok: false, error: e.code === 'TOKEN_INVALID' ? 'verifyLinkInvalid' : e.status === 429 ? 'errTooManyRequests' : e.message }; }
  },

  async resendVerification(email) {
    email = this.normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'errEmailInvalid' };
    try { await BIRAMA_API.post('/api/auth/resend-verification', { email }); return { ok: true }; }
    catch (e) { return { ok: false, error: e.status === 429 ? 'errTooManyRequests' : e.message }; }
  },

  async forgotPassword(email) {
    email = this.normalizeEmail(email);
    if (!email) return { ok: false, error: 'errFillAll' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'errEmailInvalid' };
    try { await BIRAMA_API.post('/api/auth/forgot-password', { email }); return { ok: true, email }; }
    catch (e) { return { ok: false, error: e.status === 429 ? 'errTooManyRequests' : e.message }; }
  },

  async resetPassword({ email, token, password, confirm }) {
    if (!password || !confirm) return { ok: false, error: 'errFillAll' };
    if (password.length < 10) return { ok: false, error: 'errPasswordShort' };
    if (password !== confirm) return { ok: false, error: 'errPasswordMismatch' };
    try { await BIRAMA_API.post('/api/auth/reset-password', { email, token, newPassword: password }); return { ok: true, email }; }
    catch (e) { return { ok: false, error: e.code === 'TOKEN_INVALID' ? 'errResetLinkInvalid' : e.status === 429 ? 'errTooManyRequests' : e.message }; }
  },

  logout() {
    state.user = null; BIRAMA_API.setToken(null); storeRemove(STORAGE_KEYS.session);
  },

  // ---- Google ----
  providerLabel(p) { return p === 'google' ? 'Google' : String(p || ''); },
  isProviderConfigured(p) {
    const c = window.AUTH_CONFIG || {};
    return p === 'google' && !!c.googleClientId;
  },

  loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Gagal memuat ${src}`));
      document.head.appendChild(s);
    });
  },

  preloadProviders() {
    // Memuat SDK di awal agar popup login tidak diblokir browser (harus dibuka dari klik pengguna)
    if (this.isProviderConfigured('google')) this.loadScript('https://accounts.google.com/gsi/client').catch(() => {});
  },

  async realGoogleProfile() {
    await this.loadScript('https://accounts.google.com/gsi/client');
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: AUTH_CONFIG.googleClientId,
        scope: 'openid email profile',
        callback: (resp) => {
          if (resp.error || !resp.access_token) return reject(new Error(resp.error || 'Google tidak memberikan access token.'));
          resolve({ accessToken: resp.access_token });
        },
        error_callback: (e) => reject(new Error(e && e.type ? e.type : 'popup_closed'))
      });
      client.requestAccessToken();
    });
  },

  async signInWithProvider(provider) {
    if (provider !== 'google') return { ok: false, error: 'errProviderFailed' };
    if (!this.isProviderConfigured(provider)) {
      return { ok: false, message: `Login ${this.providerLabel(provider)} belum dikonfigurasi. Isi Client ID pada src/config.js terlebih dahulu.` };
    }
    try {
      const authResult = await this.realGoogleProfile();
      const result = await BIRAMA_API.post('/api/auth/external', { provider, accessToken: authResult.accessToken });
      if (!result?.token || !result?.user) throw new Error('Respons API OAuth tidak memuat token atau profil pengguna.');
      this.startSession(result.user, result.token);
      return { ok: true, user: result.user };
    } catch (e) {
      console.warn(`Login ${this.providerLabel(provider)} gagal:`, e);
      return { ok: false, message: e.status === 409 ? (e.message || 'Email sudah terdaftar dengan metode login lain.') : (e.message || `Login ${this.providerLabel(provider)} gagal.`) };
    }
  },

  finishProvider(provider, profile, real) {
    const email = this.normalizeEmail(profile.email);
    if (!email || profile.verified === false) return { ok: false, error: 'errProviderFailed', vars: { provider: this.providerLabel(provider) } };
    let user = this.findUser(email);
    if (user && user.provider !== provider && !real) {
      // Mode simulasi: jangan izinkan "mengambil alih" akun email/kata sandi hanya dengan mengetik emailnya
      return { ok: false, error: 'errProviderConflict' };
    }
    if (!user) {
      user = {
        name: String(profile.name || email).trim(), email, passHash: null,
        role: real && this.isGranted(email) ? 'admin' : 'user',   // simulasi tidak pernah menghasilkan admin
        provider, satker: '', phone: '', createdAt: Date.now()
      };
      this.users.push(user);
      this.save();
    }
    this.startSession(user);
    return { ok: true, user };
  },

  openSimulation(provider) {
    this.pendingProvider = provider;
    const label = this.providerLabel(provider);
    const t = T();
    document.getElementById('sim-title').innerText = fmt(t.simTitle, { provider: label });
    document.getElementById('sim-note').innerText = fmt(t.simNote, { provider: label });
    document.getElementById('sim-form').reset();
    document.getElementById('sim-error').classList.add('hidden');
    openModal('modal-oauth-sim');
  }
};
window.AUTH = AUTH;

// ---------------------------------------------------------------- UI handlers
function showAuthError(id, key, vars) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = fmt(T()[key] || key, vars);
  el.classList.remove('hidden');
}
function clearAuthErrors() {
  document.querySelectorAll('.auth-error').forEach(el => el.classList.add('hidden'));
  ['forgot-success', 'verify-success', 'login-unverified'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

// ---- Pop-up masuk / daftar ----
// next: path tujuan setelah login | 'stay' (tetap di halaman ini) | undefined (admin -> /admin, lainnya tetap)
function openAuthModal(mode = 'login', next, notice) {
  AUTH.next = next;
  clearAuthErrors();
  ['login-form', 'register-form', 'forgot-form', 'reset-form'].forEach(id => document.getElementById(id)?.reset());
  const noticeEl = document.getElementById('auth-notice');
  if (noticeEl) {
    noticeEl.innerText = notice ? T()[notice] || notice : '';
    noticeEl.classList.toggle('hidden', !notice);
  }
  switchAuthMode(mode);
  openModal('modal-auth');
  const focusId = { login: 'login-email', register: 'reg-name', forgot: 'forgot-email', reset: 'reset-password' }[mode];
  if (focusId) setTimeout(() => document.getElementById(focusId)?.focus(), 50);
}

const AUTH_MODES = {
  login:    { pane: 'auth-pane-login',    title: 'authLoginTitle',    sub: 'authLoginSub',    oauth: true },
  register: { pane: 'auth-pane-register', title: 'authRegisterTitle', sub: 'authRegisterSub', oauth: true },
  forgot:   { pane: 'auth-pane-forgot',   title: 'authForgotTitle',   sub: 'authForgotSub',   oauth: false },
  reset:    { pane: 'auth-pane-reset',    title: 'authResetTitle',    sub: 'authResetSub',    oauth: false },
  verify:   { pane: 'auth-pane-verify',   title: 'authVerifyTitle',   sub: 'authVerifySub',   oauth: false }
};

function switchAuthMode(mode) {
  if (!AUTH_MODES[mode]) mode = 'login';
  clearAuthErrors();
  const cfg = AUTH_MODES[mode];
  Object.entries(AUTH_MODES).forEach(([key, m]) => document.getElementById(m.pane)?.classList.toggle('hidden', key !== mode));
  document.getElementById('auth-oauth-block')?.classList.toggle('hidden', !cfg.oauth);
  const t = T();
  const title = document.getElementById('auth-modal-title');
  const sub = document.getElementById('auth-modal-sub');
  title.innerText = t[cfg.title]; title.setAttribute('data-i18n', cfg.title);
  sub.innerText = t[cfg.sub]; sub.setAttribute('data-i18n', cfg.sub);
}

// Tampilkan panel "cek email" untuk alamat tertentu. msgKey: kunci terjemahan pesan.
function showVerifyPane(email, msgKey) {
  switchAuthMode('verify');
  document.getElementById('verify-email-value').value = email;
  document.getElementById('verify-message').innerText = fmt(T()[msgKey] || msgKey, { email });
}

function afterAuth(isRegister) {
  const t = T();
  showToast(fmt(isRegister ? t.registerSuccess : t.loginSuccess, { name: state.user.name }), 'success');
  closeModal('modal-oauth-sim');
  closeModal('modal-auth');
  const next = AUTH.next;
  AUTH.next = undefined;
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return navigate(next);
  if (next !== 'stay' && state.user.role === 'admin') return navigate('/admin');
  applyRoute();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  clearAuthErrors();
  const btn = event.submitter;
  if (btn) btn.disabled = true;
  const res = await AUTH.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
  if (btn) btn.disabled = false;
  if (!res.ok) {
    if (res.unverified) return document.getElementById('login-unverified')?.classList.remove('hidden');
    return showAuthError('login-error', res.error);
  }
  event.target.reset();
  afterAuth(false);
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  clearAuthErrors();
  const btn = event.submitter;
  if (btn) btn.disabled = true;
  const res = await AUTH.register({
    name: document.getElementById('reg-name').value,
    email: document.getElementById('reg-email').value,
    satker: document.getElementById('reg-satker').value,
    phone: document.getElementById('reg-phone').value,
    password: document.getElementById('reg-password').value,
    confirm: document.getElementById('reg-confirm').value
  });
  if (btn) btn.disabled = false;
  if (!res.ok) return showAuthError('register-error', res.error);
  event.target.reset();
  showVerifyPane(res.email, 'verifyEmailSent');   // belum login: email harus diverifikasi dulu
}

async function handleResendVerification(sourceInputId) {
  const email = document.getElementById(sourceInputId)?.value;
  clearAuthErrors();
  const res = await AUTH.resendVerification(email);
  if (!res.ok) {
    const onVerifyPane = !document.getElementById('auth-pane-verify').classList.contains('hidden');
    return showAuthError(onVerifyPane ? 'verify-error' : 'login-error', res.error);
  }
  showVerifyPane(AUTH.normalizeEmail(email), 'verifyResent');
}

async function handleForgotSubmit(event) {
  event.preventDefault();
  clearAuthErrors();
  const btn = event.submitter;
  if (btn) btn.disabled = true;
  const res = await AUTH.forgotPassword(document.getElementById('forgot-email').value);
  if (btn) btn.disabled = false;
  if (!res.ok) return showAuthError('forgot-error', res.error);
  const el = document.getElementById('forgot-success');
  el.innerText = fmt(T().forgotSent, { email: res.email });
  el.classList.remove('hidden');
}

async function handleResetSubmit(event) {
  event.preventDefault();
  clearAuthErrors();
  const ctx = AUTH.resetCtx;
  if (!ctx) return showAuthError('reset-error', 'errResetLinkInvalid');
  const btn = event.submitter;
  if (btn) btn.disabled = true;
  const res = await AUTH.resetPassword({
    email: ctx.email, token: ctx.token,
    password: document.getElementById('reset-password').value,
    confirm: document.getElementById('reset-confirm').value
  });
  if (btn) btn.disabled = false;
  if (!res.ok) return showAuthError('reset-error', res.error);
  AUTH.resetCtx = null;
  openAuthModal('login', undefined, 'resetSuccessNotice');
  document.getElementById('login-email').value = res.email;
  document.getElementById('login-password')?.focus();
}

// Dipanggil router saat pengguna membuka tautan dari email (#/verify-email atau #/reset-password).
async function runAuthAction(action) {
  if (!action) return;
  const email = AUTH.normalizeEmail(action.email);
  const token = String(action.token || '');
  if (action.type === 'verify') {
    if (!email || !token) return openAuthModal('login');
    const res = await AUTH.verifyEmail(email, token);
    if (res.ok) {
      if (state.user) return showToast(T().emailVerifiedToast, 'success');
      openAuthModal('login', undefined, 'emailVerifiedNotice');
      document.getElementById('login-email').value = email;
      return document.getElementById('login-password')?.focus();
    }
    openAuthModal('login');
    showVerifyPane(email, res.error === 'verifyLinkInvalid' ? 'verifyLinkInvalid' : 'verifyEmailSent');
    if (res.error !== 'verifyLinkInvalid') showAuthError('verify-error', res.error);
    return;
  }
  if (action.type === 'reset') {
    if (!email || !token) return openAuthModal('forgot');
    AUTH.resetCtx = { email, token };
    openAuthModal('reset');
  }
}

async function handleProviderClick(provider, errorElId) {
  clearAuthErrors();
  const res = await AUTH.signInWithProvider(provider);
  if (res.pending) return;
  if (!res.ok) return showAuthError(errorElId, res.message || res.error, res.vars);
  afterAuth(false);
}

function handleSimSubmit(event) {
  event.preventDefault();
  const provider = AUTH.pendingProvider;
  const name = document.getElementById('sim-name').value.trim();
  const email = document.getElementById('sim-email').value.trim();
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const el = document.getElementById('sim-error');
    el.innerText = T().errEmailInvalid;
    el.classList.remove('hidden');
    return;
  }
  const res = AUTH.finishProvider(provider, { name, email, verified: true }, false);
  if (!res.ok) {
    const el = document.getElementById('sim-error');
    el.innerText = fmt(T()[res.error] || res.error, res.vars);
    el.classList.remove('hidden');
    return;
  }
  closeModal('modal-oauth-sim');
  afterAuth(false);
}

function togglePassword(btn) {
  const input = btn.parentElement.querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

function logout() {
  AUTH.logout();
  closeUserMenus();
  showToast(T().logoutSuccess, 'info');
  if (state.route.startsWith('/admin') || state.route === '/riwayat') navigate('/');
  else applyRoute();
}

// Pengguna yang belum login diminta masuk lewat pop-up, lalu tetap di halaman yang sama
function requireLogin() {
  if (state.user) return true;
  openAuthModal('login', 'stay', 'loginRequiredToBook');
  return false;
}

// ---------------------------------------------------------------- Header auth UI
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?';
}

function providerBadge(p) {
  const icon = p === 'google' ? 'fa-google' : 'fa-envelope';
  const kind = p === 'email' ? 'fa-solid' : 'fa-brands';
  return `<i class="${kind} ${icon} text-[10px]"></i>`;
}

function renderAuthUI() {
  const t = T();
  const u = state.user;
  const desktop = document.getElementById('auth-area-public');
  const mobile = document.getElementById('mobile-auth-area');
  const adminChip = document.getElementById('admin-user-chip');

  if (desktop) {
    desktop.innerHTML = u ? `
      <div class="relative">
        <button type="button" onclick="toggleUserMenu(event)" class="flex items-center gap-2 h-10 ps-1 pe-2 rounded-full hover:bg-slate-100 transition" aria-haspopup="true" aria-label="${esc(u.name)}">
          <span class="w-8 h-8 rounded-full ${u.role === 'admin' ? 'bg-amber-500' : 'bg-brand-600'} text-white text-xs font-bold flex items-center justify-center">${esc(initials(u.name))}</span>
          <span class="hidden lg:block max-w-[120px] truncate text-xs font-semibold text-slate-700">${esc(u.name)}</span>
          <i class="fa-solid fa-chevron-down text-[9px] text-slate-400"></i>
        </button>
        <div id="user-menu" class="hidden absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
          <div class="px-4 py-2 border-b border-slate-100">
            <p class="text-sm font-bold text-slate-800 truncate">${esc(u.name)}</p>
            <p class="text-xs text-slate-500 truncate flex items-center gap-1.5">${providerBadge(u.provider)} ${esc(u.email)}</p>
          </div>
          ${u.role === 'admin' ? `<a href="#/admin" class="flex items-center gap-2.5 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 font-semibold"><i class="fa-solid fa-user-shield w-4"></i>${t.adminSite}</a>` : ''}
          <button type="button" onclick="logout()" class="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 text-left"><i class="fa-solid fa-arrow-right-from-bracket w-4"></i>${t.navLogout}</button>
        </div>
      </div>` : `
      <button type="button" onclick="openAuthModal('login')" class="h-9 px-4 inline-flex items-center gap-2 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition"><i class="fa-solid fa-right-to-bracket text-[11px]"></i>${t.navLogin}</button>`;
  }

  if (mobile) {
    mobile.innerHTML = u ? `
      <div class="flex items-center gap-3 px-1 py-2">
        <span class="w-10 h-10 rounded-full ${u.role === 'admin' ? 'bg-amber-500' : 'bg-brand-600'} text-white text-sm font-bold flex items-center justify-center">${esc(initials(u.name))}</span>
        <div class="min-w-0"><p class="text-sm font-bold text-slate-800 truncate">${esc(u.name)}</p><p class="text-xs text-slate-500 truncate">${esc(u.email)}</p></div>
      </div>
      ${u.role === 'admin' ? `<a href="#/admin" class="mobile-link text-amber-700 font-semibold"><i class="fa-solid fa-user-shield"></i>${t.adminSite}</a>` : ''}
      <button type="button" onclick="logout()" class="mobile-link text-rose-600 w-full text-left"><i class="fa-solid fa-arrow-right-from-bracket"></i>${t.navLogout}</button>` : `
      <button type="button" onclick="setMobileMenu(false); openAuthModal('login')" class="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold bg-brand-600 text-white"><i class="fa-solid fa-right-to-bracket"></i>${t.navLogin}</button>`;
  }

  if (adminChip) {
    adminChip.innerHTML = u ? `
      <span class="w-8 h-8 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">${esc(initials(u.name))}</span>
      <span class="hidden sm:block leading-tight min-w-0"><span class="block text-xs font-bold text-slate-800 truncate max-w-[140px]">${esc(u.name)}</span><span class="block text-[10px] text-slate-500 truncate max-w-[140px]">${esc(u.email)}</span></span>` : '';
  }
}

function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('user-menu');
  if (m) m.classList.toggle('hidden');
}
function closeUserMenus() {
  const m = document.getElementById('user-menu');
  if (m) m.classList.add('hidden');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#auth-area-public')) closeUserMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeUserMenus(); closeAllModals(); }
});

Object.assign(window, {
  handleLoginSubmit, handleRegisterSubmit, handleResendVerification, handleForgotSubmit, handleResetSubmit, runAuthAction, handleProviderClick, handleSimSubmit,
  openAuthModal, switchAuthMode, togglePassword, logout, requireLogin, renderAuthUI, toggleUserMenu, closeUserMenus, initials
});
