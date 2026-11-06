// Central Application State Management & Constants
// Tanggal lokal (bukan UTC) agar tidak bergeser sehari pada zona waktu WIB
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const TODAY_STR = toDateStr(new Date());

// Penyimpanan lokal (aman terhadap localStorage yang diblokir)
const STORAGE_KEYS = {
  bookings: 'birama.bookings.v1',
  users: 'birama.users.v1',
  session: 'birama.session.v1',
  adminGrants: 'birama.admin-grants.v1',
  lang: 'birama.lang.v1'
};
const memoryStore = {};
function storeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) { /* abaikan */ }
  return key in memoryStore ? memoryStore[key] : fallback;
}
function storeSet(key, value) {
  memoryStore[key] = value;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* abaikan */ }
}
function storeRemove(key) {
  delete memoryStore[key];
  try { localStorage.removeItem(key); } catch (e) { /* abaikan */ }
}

const state = {
  currentLang: 'id',
  currentRole: 'public',   // 'public' | 'admin' (mengikuti situs yang sedang dibuka)
  user: null,              // pengguna yang login: { name, email, role, provider, satker, phone }
  route: '/',
  historyFilter: 'all',
  editingId: null,         // id booking yang sedang diedit pada form langsung
  currentTab: 'interface1',
  selectedRoom: null,
  i2ViewMode: 'grid', 
  currentZoomIndex: 0,
  scheduleViewDate: new Date(),
  bookings: [
    { 
      id: 'BK-2026-001', 
      seed: true,
      ownerEmail: 'ahmad.s@bi.go.id',
      roomId: 'AD', 
      date: TODAY_STR, 
      startTime: '08:00', 
      endTime: '12:00', 
      eventName: 'Pelatihan Kebijakan Moneter Digital', 
      participants: 35, 
      vendor: 'Tidak', 
      satker: 'Departemen Kebijakan Moneter', 
      picName: 'Ahmad Subagyo', 
      picContact: '081234567890', 
      picEmail: 'ahmad.s@bi.go.id', 
      status: 'Approved', 
      rejectionReason: null, 
      createdAt: `${TODAY_STR} 07:30:00`, 
      auditLogs: [
        { status: 'Pending', actor: 'Ahmad Subagyo (Pemohon)', timestamp: `${TODAY_STR} 07:30:00` }, 
        { status: 'Approved', actor: 'Admin BIRAMA', timestamp: `${TODAY_STR} 07:45:00` }
      ] 
    },
    { 
      id: 'BK-2026-002', 
      seed: true,
      ownerEmail: 'rina.w@bi.go.id',
      roomId: 'KHD', 
      date: TODAY_STR, 
      startTime: '13:00', 
      endTime: '16:00', 
      eventName: 'Sosialisasi QRIS', 
      participants: 45, 
      vendor: 'Ada', 
      satker: 'Departemen Sistem Pembayaran', 
      picName: 'Rina Wijaya', 
      picContact: '081987654321', 
      picEmail: 'rina.w@bi.go.id', 
      status: 'Pending', 
      rejectionReason: null, 
      createdAt: `${TODAY_STR} 08:15:00`, 
      auditLogs: [
        { status: 'Pending', actor: 'Rina Wijaya (Pemohon)', timestamp: `${TODAY_STR} 08:15:00` }
      ] 
    },
    { 
      id: 'BK-2026-003', 
      seed: true,
      ownerEmail: 'budi.s@bi.go.id',
      roomId: 'BHT', 
      date: TODAY_STR, 
      startTime: '09:00', 
      endTime: '15:00', 
      eventName: 'Workshop Risk Management', 
      participants: 40, 
      vendor: 'Tidak', 
      satker: 'BINS / BI Institute', 
      picName: 'Budi Santoso', 
      picContact: '081122334455', 
      picEmail: 'budi.s@bi.go.id', 
      status: 'Approved', 
      rejectionReason: null, 
      createdAt: `${TODAY_STR} 08:00:00`, 
      auditLogs: [
        { status: 'Pending', actor: 'Budi Santoso', timestamp: `${TODAY_STR} 08:00:00` }, 
        { status: 'Approved', actor: 'Admin BIRAMA', timestamp: `${TODAY_STR} 08:10:00` }
      ] 
    }
  ]
};

// Data availability dari API disimpan terpisah dari riwayat booking pengguna.
state.availabilityBookings = [];
state.availabilityDate = null;
state.adminAccounts = [];
state.pendingAdminGrants = [];

const ROOMS = [
  { id: 'AD', name: 'Ahmad Dahlan', buildingId: 'Gedung D Lt. 1', buildingEn: 'Building D Fl. 1', capacity: 40, soundSystem: 2, facilities: ['Proyektor LED', 'Sound System 2 Mic', 'Smart Board', 'AC Central', 'Wi-Fi High Speed'], image: 'src/assets/ruangan/AD.jpeg', gallery: ['src/assets/ruangan/AD.jpeg'] },
  { id: 'KHD', name: 'Ki Hajar Dewantara', buildingId: 'Gedung D Lt. 1', buildingEn: 'Building D Fl. 1', capacity: 50, soundSystem: 4, facilities: ['Dual Screen LED', 'Sound System 4 Mic', 'Podium', 'Video Conference', 'AC Central'], image: 'src/assets/ruangan/KHD.jpeg', gallery: ['src/assets/ruangan/KHD.jpeg'] },
  { id: 'STM', name: 'Soetomo', buildingId: 'Gedung D Lt. 1', buildingEn: 'Building D Fl. 1', capacity: 35, soundSystem: 2, facilities: ['Proyektor HD', 'Sound System 2 Mic', 'Whiteboard', 'Flexible Tables', 'AC Central'], image: 'src/assets/ruangan/STM.jpeg', gallery: ['src/assets/ruangan/STM.jpeg'] },
  { id: 'BHT', name: 'Bung Hatta', buildingId: 'Gedung D Lt. 1', buildingEn: 'Building D Fl. 1', capacity: 60, soundSystem: 4, facilities: ['Videowall 4K', 'Sound System 4 Mic', 'Live Streaming Kit', 'Wireless Mic', 'AC Central'], image: 'src/assets/ruangan/BHT.jpeg', gallery: ['src/assets/ruangan/BHT.jpeg'] },
  { id: 'CMT', name: 'Christina M. Tiahahu', buildingId: 'Gedung D Lt. 2', buildingEn: 'Building D Fl. 2', capacity: 30, soundSystem: 2, facilities: ['Interactive Screen', 'Sound System 2 Mic', 'Ergonomic Chairs', 'AC Central', 'Wi-Fi'], image: 'src/assets/ruangan/CMT.jpeg', gallery: ['src/assets/ruangan/CMT.jpeg'] },
  { id: 'CND', name: 'Cut Nyak Dien', buildingId: 'Gedung D Lt. 2', buildingEn: 'Building D Fl. 2', capacity: 45, soundSystem: 2, facilities: ['Dual Proyektor', 'Sound System 2 Mic', 'Hybrid Meeting Cam', 'Podium', 'AC Central'], image: 'src/assets/ruangan/CND.jpeg', gallery: ['src/assets/ruangan/CND.jpeg'] },
  { id: 'RAK', name: 'RA Kartini', buildingId: 'Gedung D Lt. 2', buildingEn: 'Building D Fl. 2', capacity: 40, soundSystem: 2, facilities: ['Proyektor LED', 'Sound System 2 Mic', 'Smart Board', 'AC Central', 'Glassboard'], image: 'src/assets/ruangan/RAK.jpeg', gallery: ['src/assets/ruangan/RAK.jpeg'] },
  { id: 'RM', name: 'Rasuna Said / Ruang Makan', buildingId: 'Gedung D Lt. 2', buildingEn: 'Building D Fl. 2', capacity: 80, soundSystem: 6, facilities: ['Sound System 6 Mic', 'Banquet Set-up', 'Projector & Screen', 'Stage & Microphone', 'Buffet Area'], image: 'src/assets/ruangan/RM.jpeg', gallery: ['src/assets/ruangan/RM.jpeg'] }
];

// Kode internal frontend dipetakan ke RoomCode master pada SQL Server.
const ROOM_API_CODE_BY_ID = Object.freeze({
  AD: 'ROOM-001',
  KHD: 'ROOM-002',
  STM: 'ROOM-003',
  BHT: 'ROOM-004',
  CMT: 'ROOM-005',
  CND: 'ROOM-006',
  RAK: 'ROOM-007',
  RM: 'ROOM-008'
});
const ROOM_FRONTEND_ID_BY_API_CODE = Object.freeze(
  Object.fromEntries(Object.entries(ROOM_API_CODE_BY_ID).map(([id, code]) => [code, id]))
);
// GUID RoomId dari master data BIRAMA_DB yang saat ini digunakan.
// Nama ruangan tetap menjadi fallback apabila GUID berbeda di lingkungan lain.
const ROOM_FRONTEND_ID_BY_DB_ID = Object.freeze({
  'ae884633-98d6-f111-b525-f9b9fbb7d2a8': 'AD',
  'af884633-98d6-f111-b525-f9b9fbb7d2a8': 'KHD',
  'b0884633-98d6-f111-b525-f9b9fbb7d2a8': 'STM',
  'b1884633-98d6-f111-b525-f9b9fbb7d2a8': 'BHT',
  'b2884633-98d6-f111-b525-f9b9fbb7d2a8': 'CMT',
  'b3884633-98d6-f111-b525-f9b9fbb7d2a8': 'CND',
  'b4884633-98d6-f111-b525-f9b9fbb7d2a8': 'RAK',
  'b5884633-98d6-f111-b525-f9b9fbb7d2a8': 'RM'
});

function toApiRoomCode(roomId) {
  const value = String(roomId ?? '').trim();
  return ROOM_API_CODE_BY_ID[value] || value;
}
function toFrontendRoomId(roomCode) {
  const value = String(roomCode ?? '').trim();
  return ROOM_FRONTEND_ID_BY_API_CODE[value] || ROOM_FRONTEND_ID_BY_DB_ID[value.toLowerCase()] || value;
}
function toFrontendRoomIdFromApi(roomCodeOrId, roomName) {
  const byCodeOrId = toFrontendRoomId(roomCodeOrId);
  if (ROOMS.some(room => room.id === byCodeOrId)) return byCodeOrId;
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidate = normalize(roomName);
  if (!candidate) return byCodeOrId;
  const aliases = {
    'ruangmakanrasunasaid': 'RM',
    'rasunasaidruangmakan': 'RM',
    'christinamtiahahu': 'CMT',
    'rakartini': 'RAK'
  };
  if (aliases[candidate]) return aliases[candidate];
  const match = ROOMS.find(room => normalize(room.name) === candidate || normalize(room.name).includes(candidate) || candidate.includes(normalize(room.name)));
  return match?.id || byCodeOrId;
}

function getBuildingName(room) {
  if (!room) return '';
  const currentLang = (typeof state !== 'undefined' && state.currentLang) ? state.currentLang : 'id';
  return currentLang === 'en' ? (room.buildingEn || room.buildingId) : (room.buildingId || room.buildingEn);
}

// ---- Persistensi booking ----
// Booking contoh (seed) dibuat ulang tiap hari agar tanggalnya selalu "hari ini";
// yang disimpan hanya booking baru + perubahan status pada booking contoh.
state.bookings.forEach(b => { if (b.seed) b.seedLogCount = b.auditLogs.length; });

function persistBookings() {
  const custom = state.bookings.filter(b => !b.seed);
  const overrides = {};
  state.bookings.filter(b => b.seed && b.auditLogs.length > b.seedLogCount).forEach(b => {
    overrides[b.id] = {
      status: b.status, rejectionReason: b.rejectionReason, auditLogs: b.auditLogs,
      // field yang dapat diedit pemohon (booking Menunggu)
      roomId: b.roomId, date: b.date, startTime: b.startTime, endTime: b.endTime, eventName: b.eventName,
      participants: b.participants, vendor: b.vendor, satker: b.satker, picName: b.picName, picContact: b.picContact, picEmail: b.picEmail
    };
  });
  storeSet(STORAGE_KEYS.bookings, { custom, overrides });
}

function restoreBookings() {
  const saved = storeGet(STORAGE_KEYS.bookings, null);
  if (!saved) return;
  state.bookings.forEach(b => {
    const o = saved.overrides && saved.overrides[b.id];
    if (o) Object.assign(b, o);
  });
  (saved.custom || []).forEach(b => {
    if (b.roomId === 'R. Makan') b.roomId = 'RM';   // kode ruangan lama
    state.bookings.push(b);
  });
}

function nextBookingId() {
  const max = state.bookings.reduce((m, b) => {
    const n = parseInt((b.id.match(/(\d+)$/) || [])[1], 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `BK-2026-${String(max + 1).padStart(3, '0')}`;
}

restoreBookings();
