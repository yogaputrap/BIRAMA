// Router berbasis hash: situs publik, halaman autentikasi, dan situs admin dipisahkan.
//   Publik : #/  #/jadwal  #/riwayat (login)
//   Auth   : pop-up (tidak punya halaman sendiri); #/login & #/register hanya membuka pop-up
//            #/verify-email & #/reset-password: tautan dari email, memproses lalu membuka pop-up terkait
//   Admin  : #/admin  #/admin/bookings  #/admin/jadwal (khusus role admin)

const ROUTES = {
  '/':               { shell: 'public', page: 'interface1',    title: 'navRoomCatalog' },
  '/jadwal':         { shell: 'public', page: 'interface2',    title: 'navTimeGrid' },
  '/riwayat':        { shell: 'public', page: 'page-history',  title: 'navMyBookings', auth: true },
  // /login & /register hanya alias: membuka pop-up masuk/daftar di atas beranda
  '/login':          { alias: 'login' },
  '/register':       { alias: 'register' },
  // Tautan dari email: diproses sekali lalu hash dialihkan ke beranda (token tidak tertinggal di riwayat browser)
  '/verify-email':   { authAction: 'verify' },
  '/reset-password': { authAction: 'reset' },
  '/admin':          { shell: 'admin',  page: 'admin-dashboard', title: 'adminNavDashboard', admin: true },
  '/admin/bookings': { shell: 'admin',  page: 'admin-bookings',  title: 'adminNavBookings',  admin: true },
  '/admin/jadwal':   { shell: 'admin',  page: 'interface2',      title: 'adminNavSchedule',  admin: true },
  '/admin/akun':     { shell: 'admin',  page: 'admin-accounts',  title: 'adminNavAccounts',  admin: true }
};
const FORBIDDEN_ROUTE = { shell: 'public', page: 'page-forbidden', title: 'forbiddenTitle' };

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const qIndex = raw.indexOf('?');
  const path = (qIndex === -1 ? raw : raw.slice(0, qIndex)).replace(/\/+$/, '') || '/';
  return { path, params: new URLSearchParams(qIndex === -1 ? '' : raw.slice(qIndex + 1)) };
}

function navigate(path) {
  const target = '#' + path;
  if (location.hash === target) applyRoute();
  else location.hash = target;
}

function resolveRoute() {
  const { path, params } = parseHash();
  let route = ROUTES[path];
  if (!route) return { path: '/', route: ROUTES['/'], redirect: '/' };

  // Tautan verifikasi email / reset kata sandi
  if (route.authAction) {
    return { path, route, redirect: '/', authAction: { type: route.authAction, email: params.get('email') || '', token: params.get('token') || '' } };
  }
  // Alias pop-up login/register
  if (route.alias) {
    if (state.user) return { path, route, redirect: state.user.role === 'admin' ? '/admin' : '/' };
    const next = params.get('next');
    return { path, route, redirect: '/', auth: { mode: route.alias, next: next || undefined } };
  }
  // Halaman yang butuh login: kembali ke beranda dan tampilkan pop-up masuk
  if ((route.auth || route.admin) && !state.user) {
    return { path, route, redirect: '/', auth: { mode: 'login', next: path, notice: 'loginRequiredPage' } };
  }
  // Situs admin hanya untuk role admin
  if (route.admin && state.user.role !== 'admin') {
    return { path, route: FORBIDDEN_ROUTE };
  }
  return { path, route };
}

function applyRoute() {
  AUTH.refreshSession();
  const resolved = resolveRoute();
  if (resolved.redirect) {
    state.pendingAuth = resolved.auth || null;
    state.pendingAuthAction = resolved.authAction || null;
    location.replace('#' + resolved.redirect);
    return;   // hashchange akan memanggil applyRoute() lagi
  }
  const { path, route } = resolved;

  state.route = path;
  state.currentRole = route.shell === 'admin' ? 'admin' : 'public';
  closeAllModals();
  closeUserMenus();

  // Tampilkan shell yang sesuai
  ['public', 'admin'].forEach(name => {
    document.getElementById(`shell-${name}`)?.classList.toggle('hidden', name !== route.shell);
  });

  // Pindahkan matriks waktu ke situs yang sedang aktif (tampilan publik vs admin)
  if (route.page === 'interface2') {
    const mount = document.getElementById(route.shell === 'admin' ? 'admin-content' : 'public-content');
    const section = document.getElementById('interface2');
    if (mount && section && section.parentElement !== mount) mount.appendChild(section);
  }

  document.querySelectorAll('.route-page').forEach(el => el.classList.toggle('hidden', el.id !== route.page));

  // Menu aktif
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('is-active', a.getAttribute('data-nav') === path));
  setMobileMenu(false);
  setAdminSidebar(false);

  // Judul halaman & judul header admin
  const t = TRANSLATIONS[state.currentLang] || TRANSLATIONS.id;
  const pageTitle = t[route.title] || 'BIRAMA';
  document.title = `${pageTitle} · BIRAMA`;
  const adminTitle = document.getElementById('admin-page-title');
  if (adminTitle) adminTitle.innerText = pageTitle;

  const firstRender = !applyRoute._rendered;
  const enteringMatrix = route.page === 'interface2' && applyRoute._lastPage !== 'interface2';
  applyRoute._rendered = true;
  applyRoute._lastPage = route.page;

  window.renderAll();
  if (route.admin && window.BIRAMA_API_CONFIG?.useBackend && window.loadAdminBookingsFromApi) {
    window.loadAdminBookingsFromApi().catch(e => showToast(e.message || 'Gagal memuat data booking admin.', 'error'));
  }
  if (route.page === 'admin-accounts' && window.BIRAMA_API_CONFIG?.useBackend && window.loadAdminAccountsFromApi) {
    window.loadAdminAccountsFromApi().catch(e => showToast(e.message || 'Gagal memuat data akun admin.', 'error'));
  }
  if (path === '/riwayat' && state.user && window.loadMyBookingsFromApi) {
    window.loadMyBookingsFromApi().catch(e => showToast(e.message || 'Gagal memuat riwayat booking.', 'error'));
  }
  if (route.page === 'interface2' && window.BIRAMA_API_CONFIG?.useBackend && window.loadAvailabilityFromApi) {
    const date = document.getElementById('i2-date-picker')?.value || TODAY_STR;
    window.loadAvailabilityFromApi(date).then(() => window.renderInterface2())
      .catch(e => showToast(e.message || 'Gagal memuat jadwal ketersediaan ruangan.', 'error'));
  }

  if (enteringMatrix) scrollMatrixToWorkHours();
  if (!firstRender) window.scrollTo(0, 0);

  // Pop-up masuk yang tertunda (mis. dari halaman yang butuh login)
  if (state.pendingAuth && !state.user) {
    const { mode, next, notice } = state.pendingAuth;
    state.pendingAuth = null;
    openAuthModal(mode, next, notice);
  } else {
    state.pendingAuth = null;
  }

  if (state.pendingAuthAction) {
    const action = state.pendingAuthAction;
    state.pendingAuthAction = null;
    window.runAuthAction(action);
  }
}

// Pada layar sempit, mulai tampilan matriks dari jam kerja (bukan 00:00)
function scrollMatrixToWorkHours() {
  const wrap = document.getElementById('i2-matrix-scroll-wrapper');
  if (wrap && window.innerWidth < 1100) wrap.scrollLeft = 7 * 52;
}

function setMobileMenu(open) {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('btn-mobile-menu');
  if (!menu) return;
  menu.classList.toggle('hidden', !open);
  if (btn) {
    btn.setAttribute('aria-expanded', String(open));
    btn.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  }
}
function toggleMobileMenu() {
  setMobileMenu(document.getElementById('mobile-menu').classList.contains('hidden'));
}

function setAdminSidebar(open) {
  const side = document.getElementById('admin-sidebar');
  const overlay = document.getElementById('admin-sidebar-overlay');
  if (!side) return;
  side.classList.toggle('-translate-x-full', !open);
  overlay?.classList.toggle('hidden', !open);
}
function toggleAdminSidebar() {
  setAdminSidebar(document.getElementById('admin-sidebar').classList.contains('-translate-x-full'));
}

window.addEventListener('hashchange', () => applyRoute());

// Hitung ulang matriks saat layar diputar / diubah ukurannya (lebar kolom nama ruangan berbeda)
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.route === '/jadwal' || state.route === '/admin/jadwal') renderInterface2();
  }, 150);
});

Object.assign(window, {
  parseHash, navigate, applyRoute, setMobileMenu, toggleMobileMenu, setAdminSidebar, toggleAdminSidebar, ROUTES
});
