// Application Controller, Handlers & Initializers
window.onload = async function() {
  const filterDate = document.getElementById('filter-i1-date');
  const i2Picker = document.getElementById('i2-date-picker');
  const fDate = document.getElementById('f-date');
  const dfDate = document.getElementById('df-date');

  if (filterDate) filterDate.value = TODAY_STR;
  if (i2Picker) i2Picker.value = TODAY_STR;
  if (fDate) fDate.value = TODAY_STR;
  if (dfDate) dfDate.value = TODAY_STR;

  populateRoomDropdowns();
  populateTimeDropdowns();
  await AUTH.init();
  if (window.BIRAMA_API_CONFIG?.useBackend && filterDate?.value) {
    try { await loadAvailabilityFromApi(filterDate.value); }
    catch (e) { console.warn('Gagal memuat availability awal:', e.message); }
  }

  const savedLang = storeGet(STORAGE_KEYS.lang, 'id');
  changeLanguage(savedLang);   // menerjemahkan teks statis lalu memanggil applyRoute()
};

window.renderAll = function renderAll() {
  populateRoomDropdowns();
  if (typeof renderCatalog === 'function') renderCatalog();
  if (typeof renderInterface2 === 'function') renderInterface2();
  if (typeof renderInterface3 === 'function') renderInterface3();
  if (typeof renderHistory === 'function') renderHistory();
  if (typeof renderAccounts === 'function') renderAccounts();
  renderAuthUI();
  updateBadgesAndCounters();
};

function getI1FilterTimeValue() {
  const h = document.getElementById('filter-i1-start-hour')?.value || '00';
  const m = document.getElementById('filter-i1-start-min')?.value || '00';
  return `${h}:${m}`;
}

function getScheduleBookings() {
  const source = [...(state.bookings || []), ...(window.BIRAMA_API_CONFIG?.useBackend ? (state.availabilityBookings || []) : [])];
  const seen = new Set();
  return source.filter(b => {
    const key = b.bookingId || b.id;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

async function loadAvailabilityFromApi(date) {
  if (!window.BIRAMA_API_CONFIG?.useBackend || !date) return [];
  let result;
  try {
    result = await BIRAMA_API.get(`/api/bookings/availability?date=${encodeURIComponent(date)}`);
  } catch (e) {
    state.availabilityBookings = [];
    state.availabilityDate = null;
    throw e;
  }
  const rooms = Array.isArray(result?.rooms) ? result.rooms : [];
  state.availabilityBookings = rooms.flatMap(room => (room.occupiedSlots || []).map(slot => ({
    id: `availability-${slot.bookingId}`,
    bookingId: slot.bookingId,
    roomId: toFrontendRoomId(room.roomCode || room.roomId),
    date,
    startTime: slot.startTime || String(slot.startDateTime || '').slice(11, 16),
    endTime: slot.endTime || String(slot.endDateTime || '').slice(11, 16),
    status: slot.status,
    eventName: '',
    ownerEmail: '',
    auditLogs: []
  })));
  state.availabilityDate = date;
  return state.availabilityBookings;
}

async function applyCatalogFilter() {
  const date = document.getElementById('filter-i1-date')?.value || TODAY_STR;
  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try { await loadAvailabilityFromApi(date); }
    catch (e) { showToast(e.message || 'Gagal memuat jadwal ketersediaan ruangan.', 'error'); }
  }
  renderCatalog();
}

async function handleI2DateChange() {
  const date = document.getElementById('i2-date-picker')?.value || TODAY_STR;
  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try { await loadAvailabilityFromApi(date); }
    catch (e) { showToast(e.message || 'Gagal memuat jadwal ketersediaan ruangan.', 'error'); }
  }
  renderInterface2();
}

function getBookingAtTime(roomId, date, timeStr) {
  return getScheduleBookings().find(b => {
    if (b.roomId !== roomId || b.date !== date) return false;
    if (b.status !== 'Approved' && b.status !== 'Pending') return false;
    return timeStr >= b.startTime && timeStr < b.endTime;
  });
}

function populateTimeDropdowns() {
  const startHourSelect = document.getElementById('filter-i1-start-hour');
  const formStartHourSelect = document.getElementById('f-start-hour');
  const formEndHourSelect = document.getElementById('f-end-hour');
  const dfStartHourSelect = document.getElementById('df-start-hour');
  const dfEndHourSelect = document.getElementById('df-end-hour');

  if (startHourSelect) startHourSelect.innerHTML = '';
  if (formStartHourSelect) formStartHourSelect.innerHTML = '';
  if (formEndHourSelect) formEndHourSelect.innerHTML = '';
  if (dfStartHourSelect) dfStartHourSelect.innerHTML = '';
  if (dfEndHourSelect) dfEndHourSelect.innerHTML = '';

  for (let h = 0; h < 24; h++) {
    const val = String(h).padStart(2, '0');
    if (startHourSelect) startHourSelect.innerHTML += `<option value="${val}">${val}</option>`;
    if (formStartHourSelect) formStartHourSelect.innerHTML += `<option value="${val}" ${val === '08' ? 'selected' : ''}>${val}</option>`;
    if (formEndHourSelect) formEndHourSelect.innerHTML += `<option value="${val}" ${val === '12' ? 'selected' : ''}>${val}</option>`;
    if (dfStartHourSelect) dfStartHourSelect.innerHTML += `<option value="${val}" ${val === '08' ? 'selected' : ''}>${val}</option>`;
    if (dfEndHourSelect) dfEndHourSelect.innerHTML += `<option value="${val}" ${val === '12' ? 'selected' : ''}>${val}</option>`;
  }
}

function populateRoomDropdowns() {
  const selectI2 = document.getElementById('i2-filter-room');
  const selectDf = document.getElementById('df-room-id');
  const lang = (typeof state !== 'undefined' && state.currentLang) ? state.currentLang : 'id';
  const t = TRANSLATIONS[lang] || TRANSLATIONS.id;
  if (selectI2) {
    const currentVal = selectI2.value;
    selectI2.innerHTML = `<option value="ALL">${t.allRooms}</option>`;
    ROOMS.forEach(r => selectI2.innerHTML += `<option value="${r.id}">${r.name} (${getBuildingName(r)})</option>`);
    selectI2.value = currentVal || "ALL";
  }
  if (selectDf) {
    const currentVal = selectDf.value;
    selectDf.innerHTML = `<option value="">${t.selectRoomDefault}</option>`;
    ROOMS.forEach(r => selectDf.innerHTML += `<option value="${r.id}">${r.name} (${getBuildingName(r)})</option>`);
    selectDf.value = currentVal || "";
  }
}

function setFormTime(startTime, endTime) {
  if (startTime) {
    const [h, m] = startTime.split(':');
    document.getElementById('f-start-hour').value = h || '08';
    document.getElementById('f-start-minute').value = m || '00';
    document.getElementById('f-start-time').value = startTime;
  }
  if (endTime) {
    const [h, m] = endTime.split(':');
    document.getElementById('f-end-hour').value = h || '12';
    document.getElementById('f-end-minute').value = m || '00';
    document.getElementById('f-end-time').value = endTime;
  }
}

function syncFormTimeValues() {
  const sh = document.getElementById('f-start-hour').value;
  const sm = document.getElementById('f-start-minute').value;
  const eh = document.getElementById('f-end-hour').value;
  const em = document.getElementById('f-end-minute').value;
  document.getElementById('f-start-time').value = `${sh}:${sm}`;
  document.getElementById('f-end-time').value = `${eh}:${em}`;
}

function syncDirectFormTimeValues() {
  const sh = document.getElementById('df-start-hour').value;
  const sm = document.getElementById('df-start-minute').value;
  const eh = document.getElementById('df-end-hour').value;
  const em = document.getElementById('df-end-minute').value;
  document.getElementById('df-start-time').value = `${sh}:${sm}`;
  document.getElementById('df-end-time').value = `${eh}:${em}`;
}

function toggleAllDayBooking(prefix) {
  const isChecked = document.getElementById(`${prefix}-allday`).checked;
  const timeContainer = document.getElementById(`${prefix}-time-fields-container`);
  if (isChecked) {
    timeContainer.classList.add('opacity-40', 'pointer-events-none');
    document.getElementById(`${prefix}-start-time`).value = '00:00';
    document.getElementById(`${prefix}-end-time`).value = '23:59';
  } else {
    timeContainer.classList.remove('opacity-40', 'pointer-events-none');
    if (prefix === 'f') syncFormTimeValues();
    else syncDirectFormTimeValues();
  }
}

// Pesan error tampil di dalam form (banner merah di bagian atas) dan sebagai toast paling depan
function showFormError(prefix, messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  const messageText = list.filter(Boolean).map((message, index) => `${index + 1}. ${message}`).join('\n');
  const el = document.getElementById(`${prefix}-form-error`);
  if (el) {
    const messageEl = el.querySelector('span');
    if (messageEl) messageEl.textContent = messageText;
    el.classList.remove('hidden');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else {
    showToast(messageText, 'error');
  }
  return false;
}
function clearFormError(prefix) {
  document.getElementById(`${prefix}-form-error`)?.classList.add('hidden');
  document.querySelectorAll(`[id^="${prefix}-"].is-invalid`).forEach(el => { el.classList.remove('is-invalid'); el.setAttribute('aria-invalid', 'false'); });
}

// Validasi field wajib secara berurutan mengikuti urutan kolom pada form.
// Semua kolom yang bermasalah diberi highlight, bukan hanya error pertama.
function validateRequiredFields(prefix) {
  const form = document.getElementById(`${prefix}-form-error`)?.closest('form');
  if (!form) return true;
  const errors = [];
  let firstInvalid = null;
  form.querySelectorAll('[required]').forEach(el => {
    if (!el.id || !el.id.startsWith(`${prefix}-`) || el.disabled) return;
    const empty = !String(el.value ?? '').trim();
    el.classList.toggle('is-invalid', empty);
    el.setAttribute('aria-invalid', empty ? 'true' : 'false');
    if (empty) {
      if (!firstInvalid) firstInvalid = el;
      const label = form.querySelector(`label[for="${el.id}"]`) || el.closest('div')?.querySelector('label');
      const fieldName = (label?.textContent || el.getAttribute('placeholder') || 'Kolom ini').replace('*', '').trim();
      errors.push(`${fieldName} wajib diisi.`);
    }
    if (!el.dataset.invalidBound) {
      el.dataset.invalidBound = '1';
      const clear = () => {
        if (String(el.value ?? '').trim()) {
          el.classList.remove('is-invalid');
          el.setAttribute('aria-invalid', 'false');
        }
      };
      el.addEventListener('input', clear);
      el.addEventListener('change', clear);
    }
  });
  if (errors.length) {
    firstInvalid?.focus();
    showFormError(prefix, errors);
    return false;
  }
  return true;
}

// Membaca & memvalidasi form booking (prefix 'f' = dari slot, 'df' = form langsung), lalu menyimpan
async function submitBookingForm(prefix, roomId) {
  const t = TRANSLATIONS[state.currentLang] || TRANSLATIONS.id;
  clearFormError(prefix);
  if (!requireLogin()) return false;
  const fail = (msg) => showFormError(prefix, msg);
  if (!roomId) return fail(t.errPickRoom);

  const contactInput = document.getElementById(`${prefix}-pic-contact`);
  const emailInput = document.getElementById(`${prefix}-email`);
  const contactValue = String(contactInput?.value || '').trim();
  const emailValue = String(emailInput?.value || '').trim();

  // Validasi wajib dahulu, berurutan sesuai posisi kolom pada form.
  if (!validateRequiredFields(prefix)) return false;

  // Validasi format; kumpulkan semua error agar pesan dan penanda kolom konsisten.
  const formatErrors = [];
  if (!/^\+?[0-9]{9,15}$/.test(contactValue)) {
    contactInput?.classList.add('is-invalid');
    contactInput?.setAttribute('aria-invalid', 'true');
    formatErrors.push(t.errContactFormat);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailValue)) {
    emailInput?.classList.add('is-invalid');
    emailInput?.setAttribute('aria-invalid', 'true');
    formatErrors.push(t.errEmailFormat);
  }
  if (formatErrors.length) {
    (contactInput?.classList.contains('is-invalid') ? contactInput : emailInput)?.focus();
    return fail(formatErrors);
  }

  const get = id => document.getElementById(`${prefix}-${id}`).value;
  const date = get('date');
  const startTime = get('start-time');
  const endTime = get('end-time');
  const participants = parseInt(get('participants'), 10);
  const room = ROOMS.find(r => r.id === roomId);

  const markInvalid = id => {
    const field = document.getElementById(`${prefix}-${id}`);
    field?.classList.add('is-invalid');
    field?.setAttribute('aria-invalid', 'true');
    field?.focus();
  };
  if (date < toDateStr(new Date())) { markInvalid('date'); return fail(t.errPastDate); }
  if (endTime <= startTime) { markInvalid('end-hour'); document.getElementById(`${prefix}-end-minute`)?.classList.add('is-invalid'); return fail(t.errTimeOrder); }
  if (bookingDateTime({ date, startTime, endTime }, 'start') <= new Date()) { markInvalid('start-hour'); document.getElementById(`${prefix}-start-minute`)?.classList.add('is-invalid'); return fail(t.errPastTime); }
  if (!Number.isFinite(participants) || participants < 1) { markInvalid('participants'); return fail(t.errParticipants); }
  if (room && participants > room.capacity) { markInvalid('participants'); return fail(fmt(t.errOverCapacity, { cap: room.capacity })); }

  const editing = prefix === 'df' && state.editingId ? state.bookings.find(b => b.id === state.editingId) : null;
  if (prefix === 'df' && state.editingId && (!editing || !canEdit(editing))) return fail(t.errNotEditable);
  if (!window.BIRAMA_API_CONFIG?.useBackend && hasSlotConflict(roomId, date, startTime, endTime, editing && editing.id)) return fail(t.errSlotConflict);

  const picName = get('pic-name');
  const stamp = nowStamp();
  const payload = {
    roomId: window.BIRAMA_API_CONFIG?.useBackend ? toApiRoomCode(roomId) : roomId,
    date, startTime, endTime, eventName: get('event'), participants,
    vendor: get('vendor'), satker: get('satker'), applicantName: state.user.name,
    picName, picContact: get('pic-contact'), picEmail: get('email'), ownerEmail: state.user.email
  };

  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try {
      if (editing) {
        if (!editing.bookingId) throw new Error('ID booking database tidak tersedia. Muat ulang riwayat booking.');
        await BIRAMA_API.put(`/api/bookings/${editing.bookingId}/edit`, payload);
        showToast(fmt(t.bookingEdited, { id: editing.id }), 'success');
      } else {
        const result = await BIRAMA_API.post('/api/bookings', payload);
        showToast(fmt(t.bookingSubmitted, { id: result.bookingNumber || result.bookingId || '—' }), 'success');
      }
      if (state.currentRole === 'admin' && AUTH.isAdmin()) await loadAdminBookingsFromApi();
      else await loadMyBookingsFromApi();
      // Refresh availability agar slot yang baru diajukan langsung tampak di katalog/jadwal.
      await loadAvailabilityFromApi(date).catch(e => console.warn('Gagal refresh availability:', e.message));
      if (typeof window.renderAll === 'function') window.renderAll();
      return true;
    } catch (e) {
      return fail(e.message || t.errSlotConflict);
    }
  }

  if (editing) {
    Object.assign(editing, {
      roomId, date, startTime, endTime, eventName: get('event'), participants,
      vendor: get('vendor'), satker: get('satker'), picName, picContact: get('pic-contact'), picEmail: get('email')
    });
    editing.auditLogs = editing.auditLogs || [];
    editing.auditLogs.push({ status: 'Edited', actor: `${picName} (Pemohon)`, timestamp: stamp, note: 'Detail booking diperbarui.' });
    persistBookings();
    showToast(fmt(t.bookingEdited, { id: editing.id }), 'success');
    return true;
  }

  const newBooking = {
    id: nextBookingId(), ownerEmail: state.user.email, roomId, date, startTime, endTime,
    eventName: get('event'), participants, vendor: get('vendor'), satker: get('satker'),
    picName, picContact: get('pic-contact'), picEmail: get('email'), status: 'Pending',
    rejectionReason: null, createdAt: stamp,
    auditLogs: [{ status: 'Pending', actor: `${picName} (Pemohon)`, timestamp: stamp }]
  };
  state.bookings.push(newBooking);
  persistBookings();
  showToast(fmt(t.bookingSubmitted, { id: newBooking.id }), 'success');
  return true;
}

function mapAdminBookingFromApi(b) {
  const start = String(b.startDateTime || b.StartDateTime || '');
  const end = String(b.endDateTime || b.EndDateTime || '');
  const roomId = toFrontendRoomIdFromApi(b.roomCode || b.RoomCode || b.roomId || b.RoomId, b.roomName || b.RoomName);
  return {
    bookingId: b.bookingId || b.BookingId,
    id: b.bookingNumber || b.BookingNumber || String(b.bookingId || b.BookingId || '').slice(0, 8),
    ownerEmail: b.applicantEmail || b.ApplicantEmail || '',
    applicantEmail: b.applicantEmail || b.ApplicantEmail || '',
    roomId,
    roomName: b.roomName || b.RoomName || '',
    date: start.slice(0, 10),
    startTime: start.slice(11, 16),
    endTime: end.slice(11, 16),
    eventName: b.eventName || b.EventName || '',
    participants: b.participantCount ?? b.ParticipantCount ?? 0,
    vendor: (b.hasExternalParty ?? b.HasExternalParty) ? 'Ada' : 'Tidak',
    satker: b.institution || b.Institution || '',
    applicantName: b.applicantName || b.ApplicantName || '',
    picName: b.picName || b.PICName || '',
    picContact: b.picContact || b.PICContact || '',
    picEmail: b.picEmail || b.PICEmail || '',
    status: b.status || b.Status || 'Pending',
    rejectionReason: b.rejectionReason || b.RejectionReason || null,
    createdAt: b.createdAt || b.CreatedAt || b.submittedAt || b.SubmittedAt || '',
    auditLogs: []
  };
}

async function loadAdminBookingsFromApi() {
  if (!window.BIRAMA_API_CONFIG?.useBackend || !AUTH.isAdmin()) return [];
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await BIRAMA_API.get(`/api/admin/bookings?page=${page}&pageSize=100`);
    all.push(...(result.data || []).map(mapAdminBookingFromApi));
    totalPages = Math.max(1, Number(result.pagination?.totalPages || 1));
    page += 1;
  } while (page <= totalPages && page <= 100);
  state.bookings = all;
  if (typeof window.renderAll === 'function') window.renderAll();
  return state.bookings;
}

async function loadAdminAccountsFromApi() {
  if (!window.BIRAMA_API_CONFIG?.useBackend || !AUTH.isAdmin()) return [];
  const result = await BIRAMA_API.get('/api/admin/accounts');
  state.adminAccounts = result.data || [];
  state.pendingAdminGrants = result.pendingGrants || [];
  if (typeof window.renderAccounts === 'function') window.renderAccounts();
  return state.adminAccounts;
}

async function loadMyBookingsFromApi() {
  const result = await BIRAMA_API.get('/api/bookings/my');
  state.bookings = (result.data || []).map(b => ({ ...b, roomId: toFrontendRoomIdFromApi(b.roomId, b.roomName), bookingId: b.bookingId, id: b.id || b.bookingNumber, auditLogs: b.auditLogs || [] }));
  if (typeof window.renderAll === 'function') window.renderAll();
}

function hasSlotConflict(roomId, date, startTime, endTime, ignoreId) {
  return getScheduleBookings().some(b => {
    if (ignoreId && (b.id === ignoreId || b.bookingId === ignoreId)) return false;
    if (b.roomId !== roomId || b.date !== date) return false;
    if (b.status !== 'Approved' && b.status !== 'Pending') return false;
    return startTime < b.endTime && endTime > b.startTime;
  });
}

function afterBookingSubmitted(modalId, form) {
  closeModal(modalId);
  form.reset();
  // Pemohon langsung diarahkan ke halaman pelacakan; admin tetap di situs admin
  if (state.currentRole === 'public') { state.historyFilter = 'all'; navigate('/riwayat'); }
  else window.renderAll();
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  // submitBookingForm bersifat async: tunggu hasil API sebelum menutup form/navigasi.
  // Promise yang belum selesai selalu truthy, sehingga tanpa await halaman akan
  // berpindah ke Riwayat Saya meskipun API mengembalikan error.
  const submitted = await submitBookingForm('f', document.getElementById('f-room-id').value);
  if (submitted === true) {
    afterBookingSubmitted('modal-booking-form-popup', event.target);
  }
}

// Isi otomatis data pemohon dari akun yang sedang login
function prefillApplicantFields(prefix) {
  const u = state.user;
  if (!u) return;
  const set = (id, v) => { const el = document.getElementById(`${prefix}-${id}`); if (el) el.value = v || ''; };
  set('pic-name', u.name);
  set('email', u.email);
  set('satker', u.satker);
  set('pic-contact', u.phone);
}

function openDirectBookingPopup() {
  if (!requireLogin()) return;
  if (state.editingId) document.querySelector('#modal-direct-booking-popup form')?.reset();   // buang sisa data dari mode edit
  state.editingId = null;
  setDirectFormMode(false);
  const today = toDateStr(new Date());
  const dateEl = document.getElementById('df-date');
  dateEl.min = today;
  dateEl.value = today;
  document.getElementById('df-allday').checked = false;
  document.getElementById('df-time-fields-container').classList.remove('opacity-40', 'pointer-events-none');
  // Default 08:00–12:00, atau mulai dari jam terdekat bila 08:00 hari ini sudah lewat
  let start = '08:00';
  const earliest = earliestStartFor(today);
  if (earliest > start) start = earliest;
  let [sh, sm] = start.split(':').map(Number);
  const endH = Math.min(23, sh + 1);
  document.getElementById('df-start-hour').value = String(Math.min(sh, 23)).padStart(2, '0');
  document.getElementById('df-start-minute').value = String(sm).padStart(2, '0');
  document.getElementById('df-end-hour').value = String(start === '08:00' ? 12 : endH).padStart(2, '0');
  document.getElementById('df-end-minute').value = start === '08:00' ? '00' : String(sm).padStart(2, '0');
  syncDirectFormTimeValues();
  clearFormError('df');
  prefillApplicantFields('df');
  openModal('modal-direct-booking-popup');
}

async function handleDirectBookingSubmit(event) {
  event.preventDefault();
  const wasEditing = !!state.editingId;
  const res = await submitBookingForm('df', document.getElementById('df-room-id').value);
  if (res === 'nochange') { closeModal('modal-direct-booking-popup'); state.editingId = null; return; }
  if (res) {
    state.editingId = null;
    if (wasEditing) {   // edit: tetap di Booking Saya dengan filter yang sama
      closeModal('modal-direct-booking-popup');
      event.target.reset();
      window.renderAll();
    } else {
      afterBookingSubmitted('modal-direct-booking-popup', event.target);
    }
  }
}

// Judul/tombol form langsung sesuai mode (booking baru / edit)
function setDirectFormMode(editing) {
  const t = TRANSLATIONS[state.currentLang] || TRANSLATIONS.id;
  document.getElementById('df-modal-title').innerText = editing ? t.editTitle : t.directBookingTitle;
  document.getElementById('df-modal-subtitle').innerText = editing ? t.editSubtitle : t.directBookingSubtitle;
  document.getElementById('df-submit-btn').innerText = editing ? t.btnSaveChanges : t.btnSubmitBooking;
}

// Edit booking yang masih Menunggu: buka form berisi data lama
function openEditBooking(id) {
  const bk = state.bookings.find(b => b.id === id);
  const t = TRANSLATIONS[state.currentLang] || TRANSLATIONS.id;
  if (!bk) return;
  if (!canEdit(bk)) { showToast(t.errNotEditable, 'error'); return; }
  state.editingId = bk.id;
  setDirectFormMode(true);
  populateRoomDropdowns();
  const set = (k, v) => { document.getElementById(`df-${k}`).value = v ?? ''; };
  set('room-id', toFrontendRoomId(bk.roomId));
  const dateEl = document.getElementById('df-date');
  dateEl.min = toDateStr(new Date());
  dateEl.value = bk.date;
  set('event', bk.eventName);
  set('participants', bk.participants);
  set('vendor', bk.vendor);
  set('satker', bk.satker);
  set('pic-name', bk.picName);
  set('pic-contact', bk.picContact);
  set('email', bk.picEmail);
  const allDay = bk.startTime === '00:00' && bk.endTime === '23:59';
  document.getElementById('df-allday').checked = allDay;
  document.getElementById('df-time-fields-container').classList.toggle('opacity-40', allDay);
  document.getElementById('df-time-fields-container').classList.toggle('pointer-events-none', allDay);
  const [sh, sm] = bk.startTime.split(':');
  let [eh, em] = bk.endTime.split(':');
  if (eh === '24' || allDay) { eh = '23'; em = allDay ? '00' : '45'; }
  document.getElementById('df-start-hour').value = sh;
  document.getElementById('df-start-minute').value = sm;
  document.getElementById('df-end-hour').value = eh;
  document.getElementById('df-end-minute').value = em;
  syncDirectFormTimeValues();
  if (allDay) { document.getElementById('df-start-time').value = '00:00'; document.getElementById('df-end-time').value = '23:59'; }
  clearFormError('df');
  openModal('modal-direct-booking-popup');
}

function openScheduleViewModal(roomId) {
  state.selectedRoom = ROOMS.find(r => r.id === roomId);
  if (!state.selectedRoom) return;
  const lang = state.currentLang || 'id';
  const t = TRANSLATIONS[lang] || TRANSLATIONS.id;
  const dateInput = document.getElementById('filter-i1-date')?.value || TODAY_STR;
  state.scheduleViewDate = parseDateStr(dateInput);
  document.getElementById('sv-room-title').innerText = state.selectedRoom.name;
  document.getElementById('sv-room-sub').innerText = `${getBuildingName(state.selectedRoom)} • ${t.capacityLabel} ${state.selectedRoom.capacity} ${t.people}`;
  document.getElementById('sv-room-img-thumb').src = state.selectedRoom.image;
  document.getElementById('u-schedule-avatar').innerText = state.selectedRoom.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
  document.getElementById('u-schedule-room-name').innerText = state.selectedRoom.name;
  syncScheduleTimelineView();
  openModal('modal-schedule-view');
}

function openBookingFormPopup(roomId, targetDate, startTime, endTime) {
  const lang = state.currentLang || 'id';
  const t = TRANSLATIONS[lang] || TRANSLATIONS.id;

  // Slot yang sudah lewat tidak bisa dipesan; slot yang sedang berjalan dimulai dari jam terdekat berikutnya
  if (targetDate && startTime && endTime) {
    const timing = slotTiming(targetDate, startTime, endTime);
    if (timing === 'past') { showToast(t.errPastSlot, 'error'); return; }
    if (timing === 'partial') {
      startTime = earliestStartFor(targetDate);
      if (startTime >= endTime) { showToast(t.errPastSlot, 'error'); return; }
    }
  }
  if (!requireLogin()) return;
  state.selectedRoom = ROOMS.find(r => r.id === roomId) || ROOMS[0];

  if (startTime && endTime) {
    if (hasSlotConflict(state.selectedRoom.id, targetDate, startTime, endTime)) {
      showToast(t.bookCannot, 'error');
      return;
    }
  }

  document.getElementById('f-room-id').value = state.selectedRoom.id;
  document.getElementById('pop-form-room-name').innerText = `${t.formBookingTitle}: ${state.selectedRoom.name}`;
  document.getElementById('pop-form-room-sub').innerText = `${getBuildingName(state.selectedRoom)} • ${t.capacityLabel} ${state.selectedRoom.capacity} ${t.people}`;
  document.getElementById('f-date').value = targetDate || TODAY_STR;
  document.getElementById('f-allday').checked = false;
  document.getElementById('f-time-fields-container').classList.remove('opacity-40', 'pointer-events-none');
  document.getElementById('f-date').min = toDateStr(new Date());
  clearFormError('f');
  setFormTime(startTime || '08:00', endTime || '12:00');
  prefillApplicantFields('f');
  openModal('modal-booking-form-popup');
}

function syncScheduleTimelineView() {
  if (!state.selectedRoom) return;
  const targetDate = toDateStr(state.scheduleViewDate);
  const lang = state.currentLang || 'id';
  const t = TRANSLATIONS[lang] || TRANSLATIONS.id;
  const locale = state.currentLang === 'en' ? 'en-US' : 'id-ID';
  document.getElementById('u-schedule-date-display').innerText = state.scheduleViewDate.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  const hoursCol = document.getElementById('u-schedule-hours-col');
  const eventsCol = document.getElementById('u-schedule-events-container');
  if (!hoursCol || !eventsCol) return;
  
  hoursCol.innerHTML = ''; 
  const existingIndicator = document.getElementById('sv-current-time-indicator');
  eventsCol.innerHTML = '';
  if (existingIndicator) eventsCol.appendChild(existingIndicator);

  const HOUR_HEIGHT = 48;
  const dayBookings = getScheduleBookings().filter(b => b.roomId === state.selectedRoom.id && b.date === targetDate && (b.status === 'Approved' || b.status === 'Pending'));

  for (let h = 0; h < 24; h++) {
    const hour12 = h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    const timeStr = `${String(h).padStart(2, '0')}:00`;
    const nextHourStr = `${String(Math.min(24, h + 1)).padStart(2, '0')}:00`;

    hoursCol.innerHTML += `
      <div class="h-[48px] relative border-b border-transparent">
        ${hour12 ? `<span class="absolute top-0 right-3 -translate-y-1/2 text-[11px] font-semibold text-slate-600 select-none leading-none z-10">${hour12}</span>` : ''}
      </div>
    `;
    const slotEl = document.createElement('div');
    const slotPast = slotTiming(targetDate, timeStr, nextHourStr) === 'past';
    slotEl.className = slotPast
      ? "h-[48px] border-b border-slate-300/60 bg-slate-200/60 cursor-not-allowed relative"
      : "h-[48px] border-b border-slate-300/60 hover:bg-emerald-500/15 cursor-pointer transition relative group";
    slotEl.onclick = () => {
      openBookingFormPopup(state.selectedRoom.id, targetDate, timeStr, nextHourStr);
    };
    slotEl.innerHTML = slotPast ? '' : `<div class="hidden group-hover:flex absolute inset-0 bg-emerald-500/15 border-l-4 border-emerald-500 items-center justify-center text-[10px] font-bold text-emerald-800 pointer-events-none">${t.btnBook}</div>`;
    eventsCol.appendChild(slotEl);
  }

  dayBookings.forEach(bk => {
    const [sH, sM] = bk.startTime.split(':').map(Number);
    const [eH, eM] = bk.endTime.split(':').map(Number);
    const startMinutes = sH * 60 + (sM || 0);
    const durationMinutes = Math.max(30, (eH * 60 + (eM || 0)) - startMinutes);
    const topPx = (startMinutes / 60) * HOUR_HEIGHT;
    const heightPx = (durationMinutes / 60) * HOUR_HEIGHT;
    const isApproved = bk.status === 'Approved';
    const cardBg = isApproved ? 'bg-blue-600 text-white border-blue-700' : 'bg-amber-400 text-slate-900 border-amber-600';
    const card = document.createElement('div');
    const adminView = state.currentRole === 'admin';
    card.className = `absolute left-0 right-0 rounded-md p-2 border text-xs z-20 flex flex-col justify-between ${cardBg} overflow-hidden ${adminView ? 'cursor-pointer hover:brightness-105' : 'cursor-not-allowed opacity-95'} shadow-sm pointer-events-auto`;
    card.style.top = `${topPx}px`; card.style.height = `${heightPx}px`;
    card.onclick = (e) => { 
      e.stopPropagation(); 
      if (adminView) {
        openBookingDetail(bk.id);
      } else {
        showToast(t.bookCannot, 'error');
      }
    };
    card.innerHTML = `<div class="font-bold text-[11px] leading-tight truncate"><span>${adminView ? esc(bk.eventName || 'Booking') : (isApproved ? t.statusOccupied : t.statusPending)}</span></div><div class="text-[10px] opacity-90 font-mono font-semibold">${bk.startTime} - ${bk.endTime} WIB</div>`;
    eventsCol.appendChild(card);
  });

  const svTimeIndicator = document.getElementById('sv-current-time-indicator');
  const now = new Date();
  const isToday = targetDate === TODAY_STR;
  if (isToday && svTimeIndicator) {
    svTimeIndicator.classList.remove('hidden');
    const currentMinutes = (now.getHours() * 60) + now.getMinutes();
    const topPos = (currentMinutes / 60) * HOUR_HEIGHT;
    svTimeIndicator.style.top = `${topPos}px`;
  } else if (svTimeIndicator) {
    svTimeIndicator.classList.add('hidden');
  }
}

async function refreshScheduleModalAvailability() {
  const date = toDateStr(state.scheduleViewDate);
  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try { await loadAvailabilityFromApi(date); }
    catch (e) { showToast(e.message || 'Gagal memuat jadwal ketersediaan ruangan.', 'error'); }
  }
  syncScheduleTimelineView();
}

function scheduleNavToday() {
  state.scheduleViewDate = new Date();
  refreshScheduleModalAvailability();
}

function scheduleNavDate(days) {
  state.scheduleViewDate.setDate(state.scheduleViewDate.getDate() + days);
  refreshScheduleModalAvailability();
}

function resetI2DateToday() {
  document.getElementById('i2-date-picker').value = TODAY_STR;
  handleI2DateChange();
}

function adjustI2Date(days) {
  const picker = document.getElementById('i2-date-picker');
  const curDate = parseDateStr(picker.value || TODAY_STR);
  curDate.setDate(curDate.getDate() + days);
  picker.value = toDateStr(curDate);
  handleI2DateChange();
}

function setI2View(mode) {
  state.i2ViewMode = mode;
  const btnGrid = document.getElementById('btn-view-grid');
  const btnList = document.getElementById('btn-view-list');
  const gridContainer = document.getElementById('i2-grid-view-container');
  const listContainer = document.getElementById('i2-list-view-container');

  if (mode === 'grid') {
    btnGrid.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-slate-800 shadow-sm flex items-center gap-1';
    btnList.className = 'px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1';
    gridContainer.classList.remove('hidden');
    listContainer.classList.add('hidden');
  } else {
    btnList.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-slate-800 shadow-sm flex items-center gap-1';
    btnGrid.className = 'px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1';
    listContainer.classList.remove('hidden');
    gridContainer.classList.add('hidden');
  }
  if (typeof renderInterface2 === 'function') renderInterface2();
}

function adminActor() {
  return `${state.user?.name || 'Admin BIRAMA'} (Admin)`;
}

async function approveBooking(id) {
  if (!AUTH.isAdmin()) return;
  const bk = state.bookings.find(b => b.id === id);
  if (!bk || effectiveStatus(bk) !== 'Pending') return;
  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try {
      if (!bk.bookingId) throw new Error('ID booking database tidak tersedia. Muat ulang daftar booking.');
      await BIRAMA_API.request(`/api/admin/bookings/${bk.bookingId}/approve`, { method: 'PATCH' });
      showToast(fmt(T().bookingApproved, { id }), 'success');
      await loadAdminBookingsFromApi();
      if (bk.date) await loadAvailabilityFromApi(bk.date).catch(e => console.warn('Gagal refresh availability:', e.message));
      if (typeof window.renderAll === 'function') window.renderAll();
    } catch (e) { showToast(e.message || 'Gagal menyetujui booking.', 'error'); }
    return;
  }
  bk.status = 'Approved';
  bk.auditLogs.push({ status: 'Approved', actor: adminActor(), timestamp: nowStamp() });
  persistBookings();
  showToast(fmt(T().bookingApproved, { id }), 'success');
  window.renderAll();
}

function openRejectModal(id) { 
  document.getElementById('reject-booking-id').value = id; 
  document.getElementById('reject-reason-text').value = '';
  openModal('modal-reject-reason'); 
}

async function submitRejectBooking() {
  if (!AUTH.isAdmin()) return;
  const id = document.getElementById('reject-booking-id').value;
  const reason = document.getElementById('reject-reason-text').value.trim();
  const bk = state.bookings.find(b => b.id === id);
  if (!reason) { showToast('Alasan penolakan wajib diisi.', 'error'); return; }
  if (!bk || effectiveStatus(bk) !== 'Pending') { showToast('Booking tidak lagi berstatus Menunggu.', 'error'); return; }
  if (window.BIRAMA_API_CONFIG?.useBackend) {
    try {
      if (!bk.bookingId) throw new Error('ID booking database tidak tersedia. Muat ulang daftar booking.');
      await BIRAMA_API.request(`/api/admin/bookings/${bk.bookingId}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }), headers: { 'Content-Type': 'application/json' } });
      closeModal('modal-reject-reason');
      showToast(fmt(T().bookingRejected, { id }), 'info');
      await loadAdminBookingsFromApi();
      if (bk.date) await loadAvailabilityFromApi(bk.date).catch(e => console.warn('Gagal refresh availability:', e.message));
      if (typeof window.renderAll === 'function') window.renderAll();
    } catch (e) { showToast(e.message || 'Gagal menolak booking.', 'error'); }
    return;
  }
  bk.status = 'Rejected'; bk.rejectionReason = reason;
  bk.auditLogs.push({ status: 'Rejected', actor: adminActor(), timestamp: nowStamp(), note: reason });
  persistBookings(); closeModal('modal-reject-reason');
  showToast(fmt(T().bookingRejected, { id }), 'info'); window.renderAll();
}

function updateBadgesAndCounters() {
  const eff = state.bookings.map(effectiveStatus);
  const count = pred => eff.filter(pred).length;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  const pending = count(s => s === 'Pending');
  setText('stat-pending', pending);
  setText('stat-approved', count(s => s === 'Approved' || s === 'Completed'));
  setText('stat-rejected', count(s => s === 'Rejected' || s === 'Cancelled'));
  setText('stat-expired', count(s => s === 'Expired'));
  const badge = document.getElementById('admin-queue-badge');
  if (badge) { badge.innerText = pending; badge.classList.toggle('hidden', pending === 0); }
}

// Bind all interactive functions directly to the global window scope
window.getI1FilterTimeValue = getI1FilterTimeValue;
window.getBookingAtTime = getBookingAtTime;
window.getScheduleBookings = getScheduleBookings;
window.loadAvailabilityFromApi = loadAvailabilityFromApi;
window.applyCatalogFilter = applyCatalogFilter;
window.handleI2DateChange = handleI2DateChange;
window.populateTimeDropdowns = populateTimeDropdowns;
window.populateRoomDropdowns = populateRoomDropdowns;
window.setFormTime = setFormTime;
window.syncFormTimeValues = syncFormTimeValues;
window.syncDirectFormTimeValues = syncDirectFormTimeValues;
window.toggleAllDayBooking = toggleAllDayBooking;
window.handleBookingSubmit = handleBookingSubmit;
window.prefillApplicantFields = prefillApplicantFields;
window.openDirectBookingPopup = openDirectBookingPopup;
window.openEditBooking = openEditBooking;
window.setDirectFormMode = setDirectFormMode;
window.handleDirectBookingSubmit = handleDirectBookingSubmit;
window.openScheduleViewModal = openScheduleViewModal;
window.openBookingFormPopup = openBookingFormPopup;
window.syncScheduleTimelineView = syncScheduleTimelineView;
window.scheduleNavToday = scheduleNavToday;
window.scheduleNavDate = scheduleNavDate;
window.resetI2DateToday = resetI2DateToday;
window.adjustI2Date = adjustI2Date;
window.setI2View = setI2View;
window.approveBooking = approveBooking;
window.openRejectModal = openRejectModal;
window.submitRejectBooking = submitRejectBooking;
window.submitBookingForm = submitBookingForm;
window.loadMyBookingsFromApi = loadMyBookingsFromApi;
window.loadAdminBookingsFromApi = loadAdminBookingsFromApi;
window.loadAdminAccountsFromApi = loadAdminAccountsFromApi;
window.showFormError = showFormError;
window.clearFormError = clearFormError;
window.hasSlotConflict = hasSlotConflict;
window.updateBadgesAndCounters = updateBadgesAndCounters;