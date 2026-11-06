// Interface View Component Renderers (Catalog, Grid Matrix, Calendar, Admin Dashboard)
window.renderCatalog = function renderCatalog() {
  const grid = document.getElementById('rooms-grid');
  if (!grid) return;
  const selectedDate = document.getElementById('filter-i1-date')?.value || TODAY_STR;
  const targetTime = getI1FilterTimeValue();
  const t = TRANSLATIONS[state.currentLang];
  grid.innerHTML = '';
  
  ROOMS.forEach(room => {
    const activeBooking = getBookingAtTime(room.id, selectedDate, targetTime);
    let statusText = t.statusAvailable, badgeBg = 'bg-emerald-500 text-white', cardStyle = 'hover:shadow-md cursor-pointer border-slate-200', opacityStyle = '';
    if (activeBooking) {
      if (activeBooking.status === 'Approved') {
        statusText = t.statusOccupied;
        badgeBg = 'bg-blue-600 text-white'; cardStyle = 'border-blue-200 opacity-90 bg-blue-50/20 cursor-pointer'; opacityStyle = '';
      } else {
        statusText = t.statusPendingSlot;
        badgeBg = 'bg-amber-500 text-white'; cardStyle = 'border-amber-200 opacity-90 bg-amber-50/20 cursor-pointer';
      }
    }
    grid.innerHTML += `
      <div onclick="openScheduleViewModal('${room.id}')" class="bg-white rounded-xl border ${cardStyle} overflow-hidden shadow-xs transition duration-200 flex flex-col group ${opacityStyle}">
        <div class="relative h-36 sm:h-40 overflow-hidden">
          <img src="${room.image}" alt="${esc(room.name)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          <span class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-xs ${badgeBg}">${statusText}</span>
        </div>
        <div class="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
          <div>
            <h3 class="font-bold text-slate-800 text-sm sm:text-base leading-snug group-hover:text-brand-600 transition mb-2 truncate">${room.name}</h3>
            <div class="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div class="flex items-center gap-1 min-w-0"><i class="fa-solid fa-users text-brand-600 shrink-0 text-[10px]"></i><span class="truncate"><strong>${room.capacity}</strong> ${t.people}</span></div>
              <div class="flex items-center gap-1 min-w-0"><i class="fa-solid fa-location-dot text-brand-600 shrink-0 text-[10px]"></i><span class="truncate">${getBuildingName(room)}</span></div>
            </div>
          </div>
          <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span class="font-semibold text-brand-600 group-hover:underline flex items-center gap-1"><i class="fa-solid fa-calendar-days text-[10px]"></i> ${t.viewSchedule}</span>
            <i class="fa-solid fa-chevron-right text-[10px] text-slate-400 group-hover:translate-x-1 transition"></i>
          </div>
        </div>
      </div>
    `;
  });
};

// Lebar kolom nama ruangan pada matriks: ringkas di layar kecil
function matrixLabelWidth() {
  return window.matchMedia && window.matchMedia('(min-width: 640px)').matches ? 200 : 132;
}
window.matrixLabelWidth = matrixLabelWidth;

window.renderInterface2 = function renderInterface2() {
  const currentDate = document.getElementById('i2-date-picker')?.value || TODAY_STR;
  const roomFilter = document.getElementById('i2-filter-room')?.value || 'ALL';
  const statusFilter = document.getElementById('i2-filter-status')?.value || 'ALL';
  const t = TRANSLATIONS[state.currentLang];
  const isAdminView = state.currentRole === 'admin';
  const LABEL_W = matrixLabelWidth();

  // Lebar tabel dikunci = kolom nama + 24 jam x 52px, agar posisi blok booking & garis waktu selalu akurat
  const matrixTable = document.querySelector('#interface2 .matrix-table');
  if (matrixTable) matrixTable.style.width = `${LABEL_W + 24 * 52}px`;

  const infoText = document.getElementById('grid-info-text');
  if (infoText) infoText.innerText = isAdminView ? t.adminGridInfo : t.gridInfoText;
  document.getElementById('i2-admin-filter-container')?.classList.toggle('hidden', !isAdminView);

  if (state.i2ViewMode === 'list') {
    renderCalendarView(currentDate);
    return;
  }

  const headerObj = document.getElementById('i2-grid-header');
  if (headerObj) {
    headerObj.innerHTML = `<th class="matrix-label-col px-3 py-2.5 font-bold text-slate-700 sticky-frozen-header text-left">${t.roomTableHeader}</th>`;
    for (let i = 0; i < 24; i++) {
      const hourNum = i + 1;
      const hourLabel = hourNum === 24 ? '' : hourNum < 12 ? `${hourNum} AM` : hourNum === 12 ? '12 PM' : `${hourNum - 12} PM`;
      headerObj.innerHTML += `<th class="h-10 font-sans text-[11px] bg-slate-100 font-semibold text-slate-600 box-border w-[52px] select-none relative p-0 border-r-0">${hourLabel ? `<span class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-slate-100 px-1 z-10 text-slate-600 font-semibold text-[10px] whitespace-nowrap">${hourLabel}</span>` : ''}</th>`;
    }
  }

  const gridRowsContainer = document.getElementById('i2-grid-rows');
  if (!gridRowsContainer) return;
  gridRowsContainer.innerHTML = '';
  
  const adminSearch = (document.getElementById('i2-filter-search')?.value || '').trim().toLowerCase();

  ROOMS.filter(r => roomFilter === 'ALL' || r.id === roomFilter).forEach(room => {
    let rowHtml = `<tr class="relative h-12">`;
    rowHtml += `<td class="matrix-label-col px-3 py-2 sticky-frozen-col font-semibold text-xs box-border"><div class="truncate text-slate-800">${room.name}</div><div class="text-[10px] text-slate-400">${getBuildingName(room)}</div></td>`;
    
    for (let hour = 0; hour < 24; hour++) {
      const startTimeStr = `${String(hour).padStart(2, '0')}:00`;
      const endTimeStr = `${String(Math.min(24, hour + 1)).padStart(2, '0')}:00`;
      const isPast = slotTiming(currentDate, startTimeStr, endTimeStr) === 'past';
      rowHtml += isPast
        ? `<td onclick="openBookingFormPopup('${room.id}', '${currentDate}', '${startTimeStr}', '${endTimeStr}')" class="border-r border-slate-300 h-12 cursor-not-allowed relative p-0 bg-slate-200/70 w-[52px]"></td>`
        : `<td onclick="openBookingFormPopup('${room.id}', '${currentDate}', '${startTimeStr}', '${endTimeStr}')" class="border-r border-slate-300 h-12 hover:bg-emerald-500/15 cursor-pointer relative group p-0 text-center bg-white w-[52px]"><span class="hidden group-hover:inline-block text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">${t.btnBook}</span></td>`;
    }

    rowHtml += `<td class="p-0 border-0 pointer-events-none" style="width:0px; height:0px;">`;
    getScheduleBookings().filter(b => b.roomId === room.id && b.date === currentDate && (statusFilter === 'ALL' || b.status === statusFilter)).forEach(bk => {
      if (bk.status !== 'Approved' && bk.status !== 'Pending') return;
      if (isAdminView && adminSearch && !`${bk.satker} ${bk.picName} ${bk.eventName}`.toLowerCase().includes(adminSearch)) return;
      const [sH, sM] = bk.startTime.split(':').map(Number);
      const [eH, eM] = bk.endTime.split(':').map(Number);
      const leftPx = LABEL_W + ((sH + (sM / 60)) * 52);
      const widthPx = Math.max(0.5, (eH + (eM / 60)) - (sH + (sM / 60))) * 52;
      const isApproved = bk.status === 'Approved';
      const click = isAdminView ? `openBookingDetail('${bk.id}')` : `showToast(TRANSLATIONS[state.currentLang].bookCannot, 'error')`;
      // Situs publik: hanya blok warna (tanpa teks). Situs admin tetap menampilkan nama kegiatan.
      const label = isAdminView ? `<span>${esc(bk.eventName || 'Booking')}</span>` : '';
      const aria = isAdminView ? '' : ` role="img" aria-label="${isApproved ? t.statusOccupied : t.statusPendingSlot}"`;
      rowHtml += `<div${aria} onclick="event.stopPropagation(); ${click}" style="position: absolute; left: ${leftPx}px; width: ${widthPx}px; top: 2px; height: 44px;" class="z-20 px-1.5 py-0.5 rounded ${isApproved ? 'bg-blue-600 text-white' : 'bg-amber-400 text-slate-900'} text-[10px] font-bold shadow-xs flex flex-col justify-center items-center overflow-hidden truncate ${isAdminView ? 'cursor-pointer hover:brightness-95' : 'cursor-not-allowed'} pointer-events-auto">${label}</div>`;
    });
    rowHtml += `</td></tr>`;
    gridRowsContainer.innerHTML += rowHtml;
  });

  const timeIndicator = document.getElementById('current-time-indicator');
  const now = new Date();
  const isToday = currentDate === TODAY_STR;
  if (isToday && timeIndicator) {
    timeIndicator.classList.remove('hidden');
    const currentHours = now.getHours() + (now.getMinutes() / 60);
    const leftPos = LABEL_W + (currentHours * 52);
    timeIndicator.style.left = `${leftPos}px`;
  } else if (timeIndicator) {
    timeIndicator.classList.add('hidden');
  }
};

window.renderCalendarView = function renderCalendarView(currentDate) {
  const container = document.getElementById('calendar-grid-days');
  if (!container) return;
  container.innerHTML = '';
  const [year, month] = currentDate.split('-').map(Number);
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const locale = state.currentLang === 'en' ? 'en-US' : 'id-ID';

  const monthTitle = document.getElementById('calendar-month-title');
  if (monthTitle) {
    monthTitle.innerText = new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }

  container.className = 'grid grid-cols-7 gap-1 sm:gap-2';
  for (let i = 0; i < startDayIndex; i++) {
    container.innerHTML += `<div class="h-16 sm:h-24 bg-slate-50/50 rounded-lg border border-slate-100 opacity-30"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayBookings = getScheduleBookings().filter(b => b.date === dStr && (b.status === 'Approved' || b.status === 'Pending'));
    const isToday = dStr === TODAY_STR;
    container.innerHTML += `
      <div class="h-16 sm:h-24 bg-white rounded-lg border ${isToday ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'} p-1 sm:p-1.5 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md transition">
        <div class="flex items-center justify-between text-xs"><span class="font-bold ${isToday ? 'bg-brand-600 text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-slate-700'}">${d}</span><span class="hidden sm:inline text-[9px] text-slate-400">${dayBookings.length} booking</span></div>
        <div class="sm:hidden flex flex-wrap gap-0.5 mt-0.5">${dayBookings.slice(0, 6).map(b => `<span class="w-1.5 h-1.5 rounded-full ${b.status === 'Approved' ? 'bg-blue-600' : 'bg-amber-400'}"></span>`).join('')}</div>
        <div class="hidden sm:block flex-1 overflow-y-auto space-y-1 mt-1 text-[10px]">
          ${dayBookings.map(b => `<div class="px-1.5 py-0.5 rounded truncate select-none ${b.status === 'Approved' ? 'bg-blue-100 text-blue-800 font-semibold' : 'bg-amber-100 text-amber-800'}">[${esc(b.roomId)}] ${b.startTime} - ${b.endTime}</div>`).join('')}
        </div>
      </div>
    `;
  }
};

// ---- Pagination (page listing) untuk tabel admin ----
const PAGE_SIZE = 10;
const pagerState = {};   // key -> { page, sig, rerender }

// Ambil potongan halaman aktif. Halaman kembali ke 1 bila filter/pencarian (sig) berubah; otomatis dibatasi jumlah halaman.
function paginate(key, items, sig, rerender) {
  const st = pagerState[key] || (pagerState[key] = { page: 1, sig: '' });
  if (st.sig !== sig) { st.page = 1; st.sig = sig; }
  st.rerender = rerender;
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  st.page = Math.min(Math.max(1, st.page), pages);
  const from = (st.page - 1) * PAGE_SIZE;
  return { rows: items.slice(from, from + PAGE_SIZE), page: st.page, pages, total: items.length, from: from + 1, to: Math.min(items.length, from + PAGE_SIZE) };
}

function goPage(key, n) {
  const st = pagerState[key];
  if (!st) return;
  st.page = n;
  if (st.rerender) st.rerender();
}

function pagerNumbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

function renderPager(elId, key, info) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (info.total === 0) { el.innerHTML = ''; return; }
  const t = TRANSLATIONS[state.currentLang] || TRANSLATIONS.id;
  const btn = 'min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold border inline-flex items-center justify-center transition';
  const nav = (label, icon, target, disabled) => `<button type="button" ${disabled ? 'disabled' : `onclick="goPage('${key}', ${target})"`} aria-label="${label}" class="${btn} ${disabled ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}"><i class="fa-solid ${icon} text-[10px]"></i></button>`;
  const nums = pagerNumbers(info.page, info.pages).map(n => n === '…'
    ? `<span class="px-1 text-slate-400 text-xs select-none">…</span>`
    : `<button type="button" onclick="goPage('${key}', ${n})" ${n === info.page ? 'aria-current="page"' : ''} class="${btn} ${n === info.page ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}">${n}</button>`).join('');
  el.innerHTML = `
    <div class="px-4 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <p class="text-[11px] text-slate-500 text-center sm:text-left">${fmt(t.pagerShowing, { from: info.from, to: info.to, total: info.total })}</p>
      <div class="flex items-center justify-center gap-1">${nav(t.pagerPrev, 'fa-chevron-left', info.page - 1, info.page <= 1)}${nums}${nav(t.pagerNext, 'fa-chevron-right', info.page + 1, info.page >= info.pages)}</div>
    </div>`;
}
Object.assign(window, { paginate, goPage, renderPager });

window.renderInterface3 = function renderInterface3() {
  const t = TRANSLATIONS[state.currentLang];
  const pendingQueue = state.bookings
    .filter(b => effectiveStatus(b) === 'Pending')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const pendingCountLabel = document.getElementById('i3-pending-count-label');
  if (pendingCountLabel) pendingCountLabel.innerText = `${pendingQueue.length} ${t.pendingSubmissionCount}`;

  const approveRejectBtns = (b, full) => `
    <button type="button" onclick="approveBooking('${b.id}')" class="${full ? 'flex-1 h-10' : 'px-2.5 py-1'} bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold me-1 transition"><i class="fa-solid fa-check me-1"></i>${t.btnApprove}</button>
    <button type="button" onclick="openRejectModal('${b.id}')" class="${full ? 'flex-1 h-10' : 'px-2.5 py-1'} bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition"><i class="fa-solid fa-xmark me-1"></i>${t.btnReject}</button>`;

  const pendingTable = document.getElementById('i3-pending-table-body');
  if (pendingTable) {
    pendingTable.innerHTML = pendingQueue.length === 0 ? `<tr><td colspan="7" class="p-6 text-center text-slate-400 italic">${t.noPendingQueue}</td></tr>` : '';
    pendingQueue.forEach(b => {
      const room = ROOMS.find(r => r.id === b.roomId);
      pendingTable.innerHTML += `<tr class="hover:bg-slate-50 border-l-4 border-l-amber-400"><td class="p-3 text-[11px]">${esc(b.createdAt)}</td><td class="p-3 font-semibold">${esc(room?.name)}</td><td class="p-3">${esc(b.date)}<br>${esc(b.startTime)} - ${esc(b.endTime)}</td><td class="p-3"><b>${esc(b.picName)}</b><br>${esc(b.satker)}</td><td class="p-3">${esc(b.eventName)}</td><td class="p-3">${esc(b.participants)} ${t.people}</td><td class="p-3 text-center whitespace-nowrap">${approveRejectBtns(b, false)}</td></tr>`;
    });
  }
  const pendingCards = document.getElementById('i3-pending-cards');
  if (pendingCards) {
    pendingCards.innerHTML = pendingQueue.length === 0 ? `<p class="p-6 text-center text-slate-400 italic text-xs">${t.noPendingQueue}</p>` : pendingQueue.map(b => {
      const room = ROOMS.find(r => r.id === b.roomId);
      return `
        <div class="p-4 border-l-4 border-l-amber-400 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0"><p class="font-mono text-[11px] font-bold text-slate-500">${esc(b.id)}</p><p class="font-bold text-sm text-slate-800 break-words">${esc(b.eventName)}</p></div>
            <span class="text-[10px] text-slate-400 shrink-0">${esc(String(b.createdAt).slice(0, 16))}</span>
          </div>
          <div class="text-xs text-slate-600 space-y-0.5">
            <p><i class="fa-solid fa-door-open text-brand-600 w-4"></i>${esc(room?.name)}</p>
            <p><i class="fa-regular fa-calendar text-brand-600 w-4"></i>${esc(b.date)} · <span class="font-mono">${esc(b.startTime)} - ${esc(b.endTime)}</span></p>
            <p><i class="fa-solid fa-user text-brand-600 w-4"></i>${esc(b.picName)} · ${esc(b.satker)}</p>
            <p><i class="fa-solid fa-users text-brand-600 w-4"></i>${esc(b.participants)} ${t.people}</p>
          </div>
          <div class="flex gap-2 pt-1">${approveRejectBtns(b, true)}</div>
        </div>`;
    }).join('');
  }

  const masterTable = document.getElementById('i3-master-table-body');
  const masterCards = document.getElementById('i3-master-cards');
  if (masterTable || masterCards) {
    const searchKeyword = (document.getElementById('i3-search-all')?.value || '').trim().toLowerCase();
    const statusFilter = document.getElementById('i3-filter-status-master')?.value || 'ALL';

    const filteredMaster = state.bookings
      .filter(b => {
        const room = ROOMS.find(r => r.id === b.roomId);
        const matchesStatus = statusFilter === 'ALL' || effectiveStatus(b) === statusFilter;
        const matchesSearch = !searchKeyword ||
          b.id.toLowerCase().includes(searchKeyword) ||
          b.eventName.toLowerCase().includes(searchKeyword) ||
          b.picName.toLowerCase().includes(searchKeyword) ||
          b.satker.toLowerCase().includes(searchKeyword) ||
          (room && room.name.toLowerCase().includes(searchKeyword));
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));

    const pg = paginate('bookings', filteredMaster, `${searchKeyword}|${statusFilter}`, renderInterface3);
    renderPager('i3-master-pager', 'bookings', pg);

    if (masterTable) {
      masterTable.innerHTML = pg.total === 0 ? `<tr><td colspan="8" class="p-6 text-center text-slate-400 italic">${t.noHistoryData}</td></tr>` : '';
      pg.rows.forEach(b => {
        const room = ROOMS.find(r => r.id === b.roomId);
        masterTable.innerHTML += `
          <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="p-3 font-mono font-bold text-slate-800">${esc(b.id)}</td>
            <td class="p-3 font-medium text-slate-800">${esc(room?.name || b.roomId)}</td>
            <td class="p-3 text-slate-600 font-mono text-[11px]">${esc(b.date)}<br>${esc(b.startTime)} - ${esc(b.endTime)}</td>
            <td class="p-3 text-slate-800 font-medium">${esc(b.eventName)}</td>
            <td class="p-3 text-slate-600">${esc(b.satker)}</td>
            <td class="p-3 text-slate-600">${esc(b.picName)}</td>
            <td class="p-3">${statusBadge(b)}</td>
            <td class="p-3 text-center">
              <button type="button" onclick="openBookingDetail('${b.id}')" title="${t.btnDetail}" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"><i class="fa-solid fa-eye"></i></button>
            </td>
          </tr>`;
      });
    }
    if (masterCards) {
      masterCards.innerHTML = pg.total === 0 ? `<p class="p-6 text-center text-slate-400 italic text-xs">${t.noHistoryData}</p>` : pg.rows.map(b => {
        const room = ROOMS.find(r => r.id === b.roomId);
        return `
          <button type="button" onclick="openBookingDetail('${b.id}')" class="w-full text-left p-4 space-y-1.5 hover:bg-slate-50 block">
            <div class="flex items-center justify-between gap-2"><span class="font-mono text-[11px] font-bold text-slate-500">${esc(b.id)}</span>${statusBadge(b)}</div>
            <p class="font-bold text-sm text-slate-800 break-words">${esc(b.eventName)}</p>
            <p class="text-xs text-slate-600">${esc(room?.name || b.roomId)} · ${esc(b.date)} · <span class="font-mono">${esc(b.startTime)}-${esc(b.endTime)}</span></p>
            <p class="text-xs text-slate-500">${esc(b.picName)} · ${esc(b.satker)}</p>
          </button>`;
      }).join('');
    }
  }
};

function renderCatalog() { window.renderCatalog(); }
function renderInterface2() { window.renderInterface2(); }
function renderCalendarView(date) { window.renderCalendarView(date); }
function renderInterface3() { window.renderInterface3(); }