// Modal Popup Management & Lightbox Module
let highestZIndex = 9999;

function openModal(id) { 
  const modalEl = document.getElementById(id);
  if (modalEl) {
    highestZIndex += 5;
    modalEl.style.zIndex = highestZIndex;
    modalEl.classList.remove('hidden'); 
    syncBodyScrollLock();
  }
}

function closeModal(id) { 
  const modalEl = document.getElementById(id);
  if (modalEl) {
    modalEl.classList.add('hidden'); 
  }
  syncBodyScrollLock();
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
  syncBodyScrollLock();
}

// Cegah halaman di belakang modal ikut ter-scroll (terutama di layar sentuh)
function syncBodyScrollLock() {
  const anyOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(el => !el.classList.contains('hidden'));
  document.body.classList.toggle('overflow-hidden', anyOpen);
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const styles = {
    success: ['fa-circle-check', 'bg-emerald-600 border-emerald-500'],
    error: ['fa-circle-exclamation', 'bg-rose-600 border-rose-500'],
    info: ['fa-circle-info', 'bg-slate-900 border-slate-700']
  };
  const [icon, tone] = styles[type] || styles.info;
  toast.className = `p-3 rounded-xl ${tone} text-white text-xs font-semibold shadow-2xl border flex items-start gap-2 pointer-events-auto`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<i class="fa-solid ${icon} mt-0.5"></i><div class="flex-1">${esc(msg)}</div>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), type === 'error' ? 6000 : 4000);
}

function openGalleryZoom(index) {
  if (!state.selectedRoom || !state.selectedRoom.gallery || state.selectedRoom.gallery.length === 0) return;
  state.currentZoomIndex = index;
  document.getElementById('z-image-main').src = state.selectedRoom.gallery[state.currentZoomIndex];
  renderGalleryDots();
  openModal('modal-gallery-zoom');
}

function navigateGallery(direction) {
  if (!state.selectedRoom || !state.selectedRoom.gallery) return;
  state.currentZoomIndex = (state.currentZoomIndex + direction + state.selectedRoom.gallery.length) % state.selectedRoom.gallery.length;
  document.getElementById('z-image-main').src = state.selectedRoom.gallery[state.currentZoomIndex];
  renderGalleryDots();
}

function renderGalleryDots() {
  const dotsContainer = document.getElementById('z-dots-container');
  if (!dotsContainer || !state.selectedRoom) return;
  dotsContainer.innerHTML = '';
  state.selectedRoom.gallery.forEach((_, idx) => {
    dotsContainer.innerHTML += `<button onclick="openGalleryZoom(${idx})" class="w-2.5 h-2.5 rounded-full ${idx === state.currentZoomIndex ? 'bg-white scale-125' : 'bg-white/40'} transition"></button>`;
  });
}
window.closeAllModals = closeAllModals;
