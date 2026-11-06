// Status booking, riwayat "Booking Saya", pelacakan (timeline) dan pembatalan

const STATUS_META = {
  Pending:   { cls: 'bg-amber-100 text-amber-800 border-amber-200',     icon: 'fa-hourglass-half', bar: 'bg-amber-400',   dot: 'bg-amber-500' },
  Approved:  { cls: 'bg-blue-100 text-blue-800 border-blue-200',        icon: 'fa-circle-check',   bar: 'bg-blue-600',    dot: 'bg-blue-600' },
  Rejected:  { cls: 'bg-rose-100 text-rose-800 border-rose-200',        icon: 'fa-circle-xmark',   bar: 'bg-rose-500',    dot: 'bg-rose-500' },
  Cancelled: { cls: 'bg-slate-200 text-slate-700 border-slate-300',     icon: 'fa-ban',            bar: 'bg-slate-400',   dot: 'bg-slate-500' },
  Completed: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: 'fa-flag-checkered', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  Expired:   { cls: 'bg-slate-100 text-slate-500 border-slate-200',     icon: 'fa-hourglass-end',  bar: 'bg-slate-300',   dot: 'bg-slate-400' },
  Edited:    { cls: 'bg-sky-100 text-sky-800 border-sky-200',           icon: 'fa-pen',            bar: 'bg-sky-400',     dot: 'bg-sky-500' }
};

function bookingDateTime(b, which) {
  const [y, m, d] = b.date.split('-').map(Number);
  const [hh, mm] = (which === 'end' ? b.endTime : b.startTime).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm || 0, which === 'end' && b.endTime === '23:59' ? 59 : 0);
}

// Status yang ditampilkan ke pengguna:
//  - Pending yang jam mulainya sudah terlewat (admin belum approve)  -> Expired
//  - Approved yang sesinya sudah berakhir                            -> Completed
function effectiveStatus(b) {
  const now = new Date();
  if (b.status === 'Pending' && bookingDateTime(b, 'start') <= now) return 'Expired';
  if (b.status === 'Approved' && bookingDateTime(b, 'end') <= now) return 'Completed';
  return b.status;
}

// Posisi sebuah slot terhadap waktu sekarang: 'past' (sudah lewat), 'partial' (sedang berjalan), 'future'
function slotTiming(date, startTime, endTime) {
  const now = new Date();
  const probe = { date, startTime, endTime };
  if (bookingDateTime(probe, 'end') <= now) return 'past';
  if (bookingDateTime(probe, 'start') <= now) return 'partial';
  return 'future';
}

// Jam mulai paling awal yang masih valid pada tanggal tertentu (pembulatan ke atas per 15 menit)
function earliestStartFor(date) {
  const now = new Date();
  if (date !== toDateStr(now)) return '00:00';
  const mins = Math.ceil((now.getHours() * 60 + now.getMinutes() + 0.001) / 15) * 15;
  if (mins >= 24 * 60) return '24:00';
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// Dapat dibatalkan: milik sendiri, masih Pending/Approved, dan sesi belum dimulai
function canCancel(b) {
  if (!state.user || b.ownerEmail !== state.user.email) return false;
  if (b.status !== 'Pending' && b.status !== 'Approved') return false;
  return bookingDateTime(b, 'start') > new Date();
}

function canAdminCancel(b) {
  return state.currentRole === 'admin' && AUTH.isAdmin() &&
    (b.status === 'Pending' || b.status === 'Approved') &&
    bookingDateTime(b, 'start') > new Date();
}

// Dapat diedit: milik sendiri, masih berstatus Menunggu (Pending) dan sesi belum dimulai
function canEdit(b) {
  if (!state.user || b.ownerEmail !== state.user.email) return false;
  return b.status === 'Pending' && effectiveStatus(b) === 'Pending';
}

function statusBadge(b, size = 'text-[10px]') {
  const eff = effectiveStatus(b);
  const m = STATUS_META[eff] || STATUS_META.Pending;
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${size} font-bold border whitespace-nowrap ${m.cls}"><i class="fa-solid ${m.icon} text-[9px]"></i>${esc(T()['st_' + eff] || eff)}</span>`;
}

function fmtDate(dateStr, opts) {
  const locale = state.currentLang === 'en' ? 'en-US' : 'id-ID';
  return parseDateStr(dateStr).toLocaleDateString(locale, opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function roomOf(b) { return ROOMS.find(r => r.id === toFrontendRoomId(b.roomId)); }

// ------------------------------------------------------------------ Riwayat "Booking Saya"
function myBookings() {
  if (!state.user) return [];
  return state.bookings
    .filter(b => b.ownerEmail === state.user.email)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
}

const HISTORY_TABS = [
  { key: 'all', label: 'tabAll', match: () => true },
  { key: 'Pending', label: 'tabPending', match: s => s === 'Pending' },
  { key: 'Approved', label: 'tabApproved', match: s => s === 'Approved' },
  { key: 'Rejected', label: 'tabRejected', match: s => s === 'Rejected' },
  { key: 'Cancelled', label: 'tabCancelled', match: s => s === 'Cancelled' },
  { key: 'done', label: 'tabDone', match: s => s === 'Completed' || s === 'Expired' }
];

function setHistoryFilter(key) {
  state.historyFilter = key;
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const tabsEl = document.getElementById('history-tabs');
  if (!list || !tabsEl) return;
  const t = T();
  const all = myBookings();
  const keyword = (document.getElementById('history-search')?.value || '').trim().toLowerCase();

  tabsEl.innerHTML = HISTORY_TABS.map(tab => {
    const count = all.filter(b => tab.match(effectiveStatus(b))).length;
    const active = state.historyFilter === tab.key;
    return `<button type="button" onclick="setHistoryFilter('${tab.key}')" class="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${active ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}">${t[tab.label]} <span class="ms-0.5 ${active ? 'text-brand-100' : 'text-slate-400'}">${count}</span></button>`;
  }).join('');

  const tab = HISTORY_TABS.find(x => x.key === state.historyFilter) || HISTORY_TABS[0];
  const rows = all.filter(b => {
    if (!tab.match(effectiveStatus(b))) return false;
    if (!keyword) return true;
    const room = roomOf(b);
    return [b.id, b.eventName, room?.name, b.satker].some(v => String(v || '').toLowerCase().includes(keyword));
  });

  if (rows.length === 0) {
    list.innerHTML = `
      <div class="bg-white border border-dashed border-slate-300 rounded-xl p-8 sm:p-12 text-center">
        <div class="w-14 h-14 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-3"><i class="fa-regular fa-calendar-xmark"></i></div>
        <p class="text-sm font-semibold text-slate-700">${all.length === 0 ? t.histEmpty : t.histEmptyFiltered}</p>
        ${all.length === 0 ? `<button type="button" onclick="openDirectBookingPopup()" class="mt-4 h-10 px-5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg shadow-sm"><i class="fa-solid fa-plus me-1.5 text-xs"></i>${t.histNew}</button>` : ''}
      </div>`;
    return;
  }

  list.innerHTML = rows.map(b => {
    const eff = effectiveStatus(b);
    const meta = STATUS_META[eff] || STATUS_META.Pending;
    const room = roomOf(b);
    const cancellable = canCancel(b);
    const editable = canEdit(b);
    const note = eff === 'Rejected' && b.rejectionReason ? `${t.reasonLabel}: ${b.rejectionReason}` : '';
    return `
      <article class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex">
        <div class="w-1.5 shrink-0 ${meta.bar}"></div>
        <div class="flex-1 min-w-0 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-[11px] font-bold text-slate-500">${esc(b.id)}</span>
              ${statusBadge(b)}
            </div>
            <h3 class="mt-1 font-bold text-slate-800 text-sm sm:text-base leading-snug break-words">${esc(b.eventName)}</h3>
            <div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-door-open text-brand-600 w-3.5"></i>${esc(room?.name || b.roomId)}</span>
              <span class="inline-flex items-center gap-1.5"><i class="fa-regular fa-calendar text-brand-600 w-3.5"></i>${esc(fmtDate(b.date))}</span>
              <span class="inline-flex items-center gap-1.5 font-mono"><i class="fa-regular fa-clock text-brand-600 w-3.5"></i>${esc(b.startTime)} – ${esc(b.endTime)} WIB</span>
            </div>
            ${note ? `<p class="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">${esc(note)}</p>` : ''}
          </div>
          <div class="flex gap-2 sm:flex-col lg:flex-row shrink-0">
            <button type="button" onclick="openBookingDetail('${b.id}')" class="flex-1 sm:flex-none h-9 px-3.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100 inline-flex items-center justify-center gap-1.5"><i class="fa-solid fa-route"></i>${t.btnTrack}</button>
            ${editable ? `<button type="button" onclick="openEditBooking('${b.id}')" class="flex-1 sm:flex-none h-9 px-3.5 rounded-lg text-xs font-semibold text-amber-700 hover:bg-amber-50 border border-amber-200 inline-flex items-center justify-center gap-1.5"><i class="fa-solid fa-pen-to-square"></i>${t.btnEdit}</button>` : ''}
            ${cancellable ? `<button type="button" onclick="openCancelModal('${b.id}')" class="flex-1 sm:flex-none h-9 px-3.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 inline-flex items-center justify-center gap-1.5"><i class="fa-solid fa-ban"></i>${t.btnCancelBooking}</button>` : ''}
          </div>
        </div>
      </article>`;
  }).join('');
}

// ------------------------------------------------------------------ Timeline pelacakan
function buildTimeline(b) {
  const t = T();
  const map = { Pending: 'tl_submitted', Approved: 'tl_approved', Rejected: 'tl_rejected', Cancelled: 'tl_cancelled', Edited: 'tl_edited' };
  const items = (b.auditLogs || []).map(l => ({
    label: t[map[l.status]] || l.status,
    actor: l.actor,
    time: l.timestamp,
    note: l.note || (l.status === 'Rejected' ? b.rejectionReason : ''),
    status: l.status
  }));
  const eff = effectiveStatus(b);
  if (b.status === 'Pending') {
    items.push(eff === 'Expired'
      ? { label: t.tl_expired, status: 'Expired' }
      : { label: t.tl_awaiting, status: 'Pending', future: true });
  }
  if (eff === 'Completed') items.push({ label: t.tl_completed, status: 'Completed' });
  return items;
}

function renderTimeline(b) {
  const items = buildTimeline(b);
  return `<ol class="relative">` + items.map((it, i) => {
    const meta = STATUS_META[it.status] || STATUS_META.Pending;
    const last = i === items.length - 1;
    return `
      <li class="relative flex gap-3 ${last ? '' : 'pb-4'}">
        ${last ? '' : `<span class="absolute left-[13px] top-7 bottom-0 w-0.5 ${it.future ? 'border-l-2 border-dashed border-slate-300 w-0' : 'bg-slate-200'}"></span>`}
        <span class="relative z-10 w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[11px] ${it.future ? 'bg-white border-2 border-dashed border-amber-400 text-amber-500 animate-pulse' : `${meta.dot} text-white`}"><i class="fa-solid ${meta.icon}"></i></span>
        <div class="min-w-0 pt-0.5">
          <p class="text-xs font-bold ${it.future ? 'text-slate-500' : 'text-slate-800'}">${esc(it.label)}</p>
          ${it.time ? `<p class="text-[11px] text-slate-500 font-mono">${esc(String(it.time).slice(0, 16))}${it.actor ? ` · ${esc(it.actor)}` : ''}</p>` : ''}
          ${it.note ? `<p class="mt-1 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 break-words">${it.status === 'Edited' ? '' : esc(T().reasonLabel) + ': '}${esc(it.note)}</p>` : ''}
        </div>
      </li>`;
  }).join('') + `</ol>`;
}

// ------------------------------------------------------------------ Detail / pelacakan
async function openBookingDetail(id) {
  const bk = state.bookings.find(b => b.id === id);
  if (!bk) return;
  const isAdminView = state.currentRole === 'admin' && AUTH.isAdmin();
  if (isAdminView && window.BIRAMA_API_CONFIG?.useBackend && bk.bookingId) {
    try {
      const detail = await BIRAMA_API.get(`/api/admin/bookings/${bk.bookingId}`);
      const data = detail.data || {};
      bk.rejectionReason = data.rejectionReason || data.RejectionReason || bk.rejectionReason || null;
      bk.auditLogs = (detail.statusHistory || []).map(log => ({
        status: log.newStatus || log.NewStatus,
        actor: log.changedBy || log.ChangedBy,
        timestamp: log.changedAt || log.ChangedAt,
        note: log.notes || log.Notes || ''
      }));
      const rejectedLog = [...bk.auditLogs].reverse().find(log => log.status === 'Rejected');
      if (rejectedLog && !bk.rejectionReason) bk.rejectionReason = rejectedLog.note;
    } catch (e) {
      showToast(e.message || 'Riwayat perubahan booking tidak dapat dimuat.', 'error');
    }
  }
  const t = T();
  const room = roomOf(bk);
  const set = (el, v) => { document.getElementById(el).innerText = v; };

  set('d-id', bk.id);
  set('d-room', room?.name || '--');
  set('d-location', room ? getBuildingName(room) : '--');
  set('d-date', fmtDate(bk.date));
  set('d-time', `${bk.startTime} - ${bk.endTime} WIB`);
  set('d-event', bk.eventName);
  set('d-participants', `${bk.participants} ${t.people}`);
  set('d-satker', bk.satker);
  set('d-vendor', bk.vendor);
  set('d-created', String(bk.createdAt || '').slice(0, 16));
  document.getElementById('d-status-badge').innerHTML = statusBadge(bk, 'text-[11px]');
  document.getElementById('d-timeline').innerHTML = renderTimeline(bk);

  const picSec = document.getElementById('d-pic-section');
  picSec.classList.toggle('hidden', !isAdminView);
  if (isAdminView) {
    set('d-pic-name', bk.picName);
    set('d-pic-contact', bk.picContact);
    set('d-applicant-email', bk.applicantEmail || bk.ownerEmail);
  }

  const cancelBtn = document.getElementById('d-cancel-btn');
  const lockHint = document.getElementById('d-cancel-locked');
  const cancellable = canCancel(bk) || canAdminCancel(bk);
  cancelBtn.classList.toggle('hidden', !cancellable);
  cancelBtn.onclick = () => { closeModal('modal-booking-detail'); openCancelModal(bk.id); };
  const editBtn = document.getElementById('d-edit-btn');
  if (editBtn) {
    editBtn.classList.toggle('hidden', !canEdit(bk));
    editBtn.onclick = () => { closeModal('modal-booking-detail'); openEditBooking(bk.id); };
  }
  const owner = state.user && bk.ownerEmail === state.user.email;
  const activeButLocked = owner && (bk.status === 'Pending' || bk.status === 'Approved') && !cancellable;
  lockHint.classList.toggle('hidden', !activeButLocked);
  openModal('modal-booking-detail');
}

// ------------------------------------------------------------------ Pembatalan
function openCancelModal(id) {
  const bk = state.bookings.find(b => b.id === id);
  if (!bk) return;
  if (!canCancel(bk) && !canAdminCancel(bk)) { showToast(T().cancelNotAllowed, 'error'); return; }
  const room = roomOf(bk);
  document.getElementById('cancel-booking-id').value = bk.id;
  document.getElementById('cancel-summary').innerHTML = `
    <p class="font-mono text-[11px] font-bold text-slate-500">${esc(bk.id)}</p>
    <p class="font-bold text-slate-800 text-sm break-words">${esc(bk.eventName)}</p>
    <p class="text-xs text-slate-600 mt-1">${esc(room?.name || bk.roomId)} · ${esc(fmtDate(bk.date))} · ${esc(bk.startTime)}–${esc(bk.endTime)} WIB</p>`;
  document.getElementById('cancel-reason-text').value = '';
  openModal('modal-cancel-booking');
}

async function confirmCancelBooking() {
  const id = document.getElementById('cancel-booking-id').value;
  const bk = state.bookings.find(b => b.id === id);
  const t = T();
  if (!bk || (!canCancel(bk) && !canAdminCancel(bk))) {
    closeModal('modal-cancel-booking');
    showToast(t.cancelNotAllowed, 'error');
    return;
  }
  const reason = document.getElementById('cancel-reason-text').value.trim();
  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try {
      if (!bk.bookingId) throw new Error('ID booking database tidak tersedia. Muat ulang daftar booking.');
      const adminMode = state.currentRole === 'admin' && AUTH.isAdmin();
      if (adminMode) {
        await BIRAMA_API.request(`/api/admin/bookings/${bk.bookingId}/cancel`, {
          method: 'PATCH', body: JSON.stringify({ notes: reason }), headers: { 'Content-Type': 'application/json' }
        });
      } else {
        await BIRAMA_API.post(`/api/bookings/${bk.bookingId}/my-cancel`, { reason });
      }
      closeModal('modal-cancel-booking');
      showToast(fmt(t.cancelDone, { id: bk.id }), 'success');
      if (adminMode && window.loadAdminBookingsFromApi) await window.loadAdminBookingsFromApi();
      else await window.loadMyBookingsFromApi();
      if (window.loadAvailabilityFromApi) {
        await window.loadAvailabilityFromApi(bk.date).catch(e => console.warn('Gagal refresh availability:', e.message));
      }
      if (window.renderAll) window.renderAll();
    } catch (e) { showToast(e.message || t.cancelNotAllowed, 'error'); }
    return;
  }
  bk.status = 'Cancelled';
  bk.cancelReason = reason || null;
  bk.auditLogs.push({
    status: 'Cancelled',
    actor: `${state.user.name} (${state.currentLang === 'en' ? 'Applicant' : 'Pemohon'})`,
    timestamp: nowStamp(),
    note: reason || ''
  });
  persistBookings();
  closeModal('modal-cancel-booking');
  showToast(fmt(t.cancelDone, { id: bk.id }), 'success');
  window.renderAll();
}

function nowStamp() {
  return `${toDateStr(new Date())} ${new Date().toTimeString().split(' ')[0]}`;
}

Object.assign(window, {
  STATUS_META, effectiveStatus, slotTiming, earliestStartFor, canCancel, canEdit, statusBadge, fmtDate, roomOf, myBookings, bookingDateTime,
  setHistoryFilter, renderHistory, openBookingDetail, openCancelModal, confirmCancelBooking, nowStamp, canAdminCancel
});
