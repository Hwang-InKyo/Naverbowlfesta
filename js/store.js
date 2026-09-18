/**
 * store.js - 데이터 저장/조회 계층 (이번 대회 전용)
 *
 *  - 로컬 모드 : 브라우저 localStorage (데모/단일 기기용). API URL 미설정 시 자동.
 *  - 서버 모드 : Google Apps Script 웹앱 (gas/Code.gs) + Google Sheets. 설정 탭에서 URL 입력.
 *  - 조회는 로그인 없이 가능하며, 수정은 관리자 PIN 로그인 후에만 허용된다.
 *
 * 데이터: { settings, regions[], players[], teams[], results }
 */
const Store = (() => {
  const DEFAULT_API_URL = ''; // 배포 시 Apps Script 웹앱 URL을 넣으면 설정 없이 서버 모드
  const LS = { data: 'bf_data_v1', api: 'bf_api_url', auth: 'bf_auth_v1' };

  function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  let apiUrl = (lsGet(LS.api) || DEFAULT_API_URL || '').trim();
  let auth = lsGet(LS.auth);
  function mode() { return apiUrl ? 'remote' : 'local'; }
  function isAdmin() { return !!(auth && auth.role === 'admin'); }
  function requireAdmin() { if (!isAdmin()) throw new Error('관리자 로그인이 필요합니다.'); }

  // ===== 로컬 =====
  function emptyData() { return { settings: { ...Ranking.DEFAULT_SETTINGS, adminPin: '0000' }, regions: [], players: [], teams: [], results: null }; }
  function localLoad() {
    let d = lsGet(LS.data);
    if (!d || !Array.isArray(d.players)) { d = SampleData.build(); lsSet(LS.data, d); }
    d.settings = { ...Ranking.mergeSettings(d.settings), adminPin: (d.settings && d.settings.adminPin) || '0000' };
    d.regions = d.regions || []; d.teams = d.teams || []; d.players = d.players || [];
    return d;
  }
  function localSave(d) { lsSet(LS.data, d); }
  function publicSettings(s) { const { adminPin, ...rest } = s; return rest; }
  function publicView(d) { return { settings: publicSettings(d.settings), regions: clone(d.regions), players: clone(d.players), teams: clone(d.teams), results: d.results ? clone(d.results) : null }; }
  function upsert(list, item, idPrefix) {
    if (!item.id) item.id = uid(idPrefix);
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = { ...list[i], ...item }; else list.push(item);
    return list;
  }

  // ===== 서버 =====
  async function gasGet(action, params) {
    const res = await fetch(apiUrl + '?' + new URLSearchParams({ action, ...(params || {}) }).toString());
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }
  async function gasPost(body) {
    const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ ...body, token: auth ? auth.token : '' }) });
    const data = await res.json();
    if (data.error) { if (/토큰|로그인/.test(data.error)) { auth = null; lsDel(LS.auth); } throw new Error(data.error); }
    return data;
  }

  return {
    mode, isAdmin, uid,
    getApiUrl() { return apiUrl; },
    setApiUrl(url) { apiUrl = (url || '').trim(); if (apiUrl) lsSet(LS.api, apiUrl); else lsDel(LS.api); auth = null; lsDel(LS.auth); },

    async login(pin) {
      if (mode() === 'local') {
        const d = localLoad();
        if (String(pin) !== String(d.settings.adminPin)) throw new Error('관리자 PIN이 올바르지 않습니다.');
        auth = { role: 'admin', token: 'local' };
      } else {
        const r = await gasPost({ action: 'login', pin });
        auth = { role: 'admin', token: r.token };
      }
      lsSet(LS.auth, auth); return auth;
    },
    logout() { auth = null; lsDel(LS.auth); },

    async loadAll() {
      if (mode() === 'local') return publicView(localLoad());
      const r = await gasGet('getAll');
      return { settings: Ranking.mergeSettings(r.settings), regions: r.regions || [], players: r.players || [], teams: r.teams || [], results: r.results || null };
    },

    // ----- 설정 -----
    async saveSettings(patch) {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); Object.assign(d.settings, patch); localSave(d); return publicSettings(d.settings); }
      return (await gasPost({ action: 'saveSettings', settings: patch })).settings;
    },

    // ----- 지역 -----
    async saveRegion(region) {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); upsert(d.regions, region, 'r'); localSave(d); return clone(d.regions); }
      return (await gasPost({ action: 'saveRegion', region })).regions;
    },
    async deleteRegion(id) {
      requireAdmin();
      if (mode() === 'local') {
        const d = localLoad();
        if (d.players.some(p => p.regionId === id)) throw new Error('소속 선수가 있는 지역은 삭제할 수 없습니다.');
        d.regions = d.regions.filter(r => r.id !== id); d.teams = d.teams.filter(t => t.regionId !== id); localSave(d); return clone(d.regions);
      }
      return (await gasPost({ action: 'deleteRegion', id })).regions;
    },

    // ----- 선수 -----
    async savePlayers(list) {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); list.forEach(p => upsert(d.players, p, 'p')); localSave(d); return clone(d.players); }
      return (await gasPost({ action: 'savePlayers', players: list })).players;
    },
    async savePlayer(p) { return this.savePlayers([p]); },
    async deletePlayer(id) {
      requireAdmin();
      if (mode() === 'local') {
        const d = localLoad(); d.players = d.players.filter(p => p.id !== id);
        d.teams.forEach(t => { t.members = (t.members || []).filter(m => m !== id); });
        localSave(d); return { players: clone(d.players), teams: clone(d.teams) };
      }
      const r = await gasPost({ action: 'deletePlayer', id }); return { players: r.players, teams: r.teams };
    },
    async replacePlayers(list) { // 신청서 업로드: 전체 교체
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); d.players = list.map(p => ({ ...p, id: p.id || uid('p') })); d.teams = []; localSave(d); return { players: clone(d.players), teams: [] }; }
      const r = await gasPost({ action: 'replacePlayers', players: list }); return { players: r.players, teams: r.teams };
    },

    // ----- 팀 -----
    async saveTeams(list) {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); list.forEach(t => upsert(d.teams, t, 't')); localSave(d); return clone(d.teams); }
      return (await gasPost({ action: 'saveTeams', teams: list })).teams;
    },
    async saveTeam(t) { return this.saveTeams([t]); },
    async deleteTeam(id) {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); d.teams = d.teams.filter(t => t.id !== id); localSave(d); return clone(d.teams); }
      return (await gasPost({ action: 'deleteTeam', id })).teams;
    },

    // ----- 확정 -----
    async finalize(results) {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); d.results = results; d.settings.status = 'final'; localSave(d); return true; }
      await gasPost({ action: 'finalize', results }); return true;
    },
    async unfinalize() {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); d.results = null; d.settings.status = 'live'; localSave(d); return true; }
      await gasPost({ action: 'unfinalize' }); return true;
    },

    // ----- 백업 -----
    async exportAll() {
      requireAdmin();
      const d = mode() === 'local' ? publicView(localLoad()) : await gasPost({ action: 'exportAll' });
      return JSON.stringify({ ...d, exportDate: new Date().toISOString() }, null, 2);
    },
    async importAll(json) {
      requireAdmin();
      const d = JSON.parse(json);
      if (!Array.isArray(d.players) || !Array.isArray(d.regions)) throw new Error('올바른 백업 파일이 아닙니다.');
      if (mode() === 'local') {
        const cur = localLoad();
        localSave({ settings: { ...cur.settings, ...(d.settings || {}), adminPin: cur.settings.adminPin }, regions: d.regions, players: d.players, teams: d.teams || [], results: d.results || null });
        return true;
      }
      await gasPost({ action: 'importAll', data: { settings: d.settings || {}, regions: d.regions, players: d.players, teams: d.teams || [], results: d.results || null } }); return true;
    },
    resetLocal(empty) { requireAdmin(); if (empty) localSave(emptyData()); else lsDel(LS.data); }
  };
})();
