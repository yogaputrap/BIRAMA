// BIRAMA API client. Configure API base URL for local/prod deployment.
window.BIRAMA_API_CONFIG = window.BIRAMA_API_CONFIG || {
  baseUrl: '', // Same-origin API when frontend and backend are hosted together.
  useBackend: true
};
const BIRAMA_API = {
  token() { return localStorage.getItem('birama.jwt.v1') || ''; },
  setToken(token) { if (token) localStorage.setItem('birama.jwt.v1', token); else localStorage.removeItem('birama.jwt.v1'); },
  async request(path, options = {}) {
    const cfg = window.BIRAMA_API_CONFIG || {};
    if (!cfg.useBackend) throw new Error('Backend BIRAMA sedang dinonaktifkan.');
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = this.token();
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(`${String(cfg.baseUrl || '').replace(/\/$/, '')}${path}`, { ...options, headers });
    } catch (e) {
      throw new Error('Tidak dapat menghubungi API BIRAMA. Periksa backend, HTTPS, dan CORS.');
    }
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!response.ok) {
      const err = new Error(data?.message || data?.title || `API gagal (${response.status}).`);
      err.status = response.status; err.data = data; err.code = data?.code; throw err;
    }
    return data;
  },
  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); },
  put(path, body) { return this.request(path, { method: 'PUT', body: JSON.stringify(body) }); }
};
window.BIRAMA_API = BIRAMA_API;
