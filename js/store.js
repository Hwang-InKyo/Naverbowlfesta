/**
 * store.js - 데이터 저장/조회 계층
 *
 *  - 로컬 모드 : 브라우저 localStorage (데모/단일 기기용). API URL 미설정 시 자동.
 *  - 조회는 로그인 없이 가능하며, 수정은 관리자 PIN 로그인 후에만 허용된다.
 *  - 서버 모드 : Google Apps Script 웹앱 (gas/Code.gs) + Google Sheets. 설정 탭에서 URL 입력.
 *
 * 두 모드 모두 동일한 비동기 API를 제공하므로 app.js는 모드를 구분하지 않는다.
 */
const Store = (() => {
  // 배포 시 여기에 Apps Script 웹앱 URL을 넣어두면 설정 없이 서버 모드로 동작
  const DEFAULT_API_URL = '';

  const LS = { data: 'nt_data_v1', api: 'nt_api_url', auth: 'nt_auth_v1' };

  function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  let apiUrl = (lsGet(LS.api) || DEFAULT_API_URL || '').trim();
  let auth = lsGet(LS.auth);
  let cache = null; // 마지막으로 불러온 전체 데이터 (읽기 전용 스냅샷)

  function mode() { return apiUrl ? 'remote' : 'local'; }

  // ===== 로컬 모드 =====
  function localLoad() {
    let d = lsGet(LS.data);
    if (!d || !Array.isArray(d.members)) { d = SampleData.build(); lsSet(LS.data, d); }
    d.settings = Object.assign({ orgName: '전국 볼링 클럽 연합', adminPin: '0000', pointsTable: Ranking.DEFAULT_POINTS, defaultHandicap: Ranking.DEFAULT_HANDICAP }, d.settings || {});
    return d;
  }
  function localSave(d) { lsSet(LS.data, d); }

  // 연락처는 관리자에게만 노출
  function publicMember(m) { const { phone, ...rest } = m; return rest; }
  function publicSettings(s) { const { adminPin, ...rest } = s; return rest; }
  function publicView(d) {
    const admin = auth && auth.role === 'admin';
    return { clubs: clone(d.clubs || []), members: (d.members || []).map(m => admin ? clone(m) : publicMember(m)), tournaments: clone(d.tournaments || []), settings: publicSettings(d.settings || {}) };
  }

  function requireAdmin() { if (!auth || auth.role !== 'admin') throw new Error('관리자 권한이 필요합니다.'); }

  // ===== 서버 모드 =====
  async function gasGet(action, params) {
    const q = new URLSearchParams({ action, ...(params || {}) });
    const res = await fetch(apiUrl + '?' + q.toString());
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }
  async function gasPost(body) {
    const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ ...body, token: auth ? auth.token : '' }) });
    const data = await res.json();
    if (data.error) {
      if (/토큰|token|로그인/.test(data.error)) { auth = null; lsDel(LS.auth); }
      throw new Error(data.error);
    }
    return data;
  }

  function setCache(d) { cache = d; return d; }

  // ===== 공개 API =====
  return {
    mode,
    getApiUrl() { return apiUrl; },
    setApiUrl(url) {
      apiUrl = (url || '').trim();
      if (apiUrl) lsSet(LS.api, apiUrl); else lsDel(LS.api);
      auth = null; lsDel(LS.auth); cache = null;
    },
    session() { return auth; },
    cached() { return cache; },
    uid,

    /** 전체 데이터 로드 (회원 PIN 제외) */
    async loadAll() {
      if (mode() === 'local') return setCache(publicView(localLoad()));
      const r = await gasGet('getAll', auth && auth.token ? { token: auth.token } : {});
      return setCache({ clubs: r.clubs || [], members: r.members || [], tournaments: r.tournaments || [], settings: r.settings || {} });
    },

    /** 관리자 로그인 (조회는 로그인 없이 가능) */
    async login(pin) {
      if (mode() === 'local') {
        const d = localLoad();
        if (String(pin) !== String(d.settings.adminPin)) throw new Error('관리자 PIN이 올바르지 않습니다.');
        auth = { role: 'admin', token: 'local' };
      } else {
        const r = await gasPost({ action: 'login', pin });
        auth = { role: 'admin', token: r.token };
      }
      lsSet(LS.auth, auth);
      return auth;
    },
    isAdmin() { return !!(auth && auth.role === 'admin'); },
    logout() { auth = null; lsDel(LS.auth); },

    // ----- 클럽 -----
    async saveClub(club) {
      requireAdmin();
      if (!club.id) club.id = uid('c');
      if (mode() === 'local') {
        const d = localLoad(); const i = d.clubs.findIndex(c => c.id === club.id);
        if (i >= 0) d.clubs[i] = { ...d.clubs[i], ...club }; else d.clubs.push(club);
        localSave(d); return clone(d.clubs);
      }
      return (await gasPost({ action: 'saveClub', club })).clubs;
    },
    async deleteClub(id) {
      requireAdmin();
      if (mode() === 'local') {
        const d = localLoad();
        if (d.members.some(m => m.clubId === id)) throw new Error('소속 회원이 있는 클럽은 삭제할 수 없습니다.');
        d.clubs = d.clubs.filter(c => c.id !== id); localSave(d); return clone(d.clubs);
      }
      return (await gasPost({ action: 'deleteClub', id })).clubs;
    },

    // ----- 회원 -----
    async saveMember(member) {
      requireAdmin();
      if (!member.id) member.id = uid('m');
      if (mode() === 'local') {
        const d = localLoad(); const i = d.members.findIndex(m => m.id === member.id);
        const dup = d.members.find(m => m.id !== member.id && m.clubId === member.clubId && m.name === member.name);
        if (dup) throw new Error('같은 클럽에 동명 회원이 이미 있습니다.');
        if (i >= 0) d.members[i] = { ...d.members[i], ...member }; else d.members.push(member);
        localSave(d); return clone(d.members);
      }
      return (await gasPost({ action: 'saveMember', member })).members;
    },
    async saveMembersBulk(list) {
      requireAdmin();
      if (mode() === 'local') {
        const d = localLoad();
        list.forEach(member => {
          const ex = d.members.find(m => m.clubId === member.clubId && m.name === member.name);
          if (ex) Object.assign(ex, { gender: member.gender || ex.gender, avg: member.avg != null ? member.avg : ex.avg, phone: member.phone || ex.phone });
          else d.members.push({ id: uid('m'), phone: '', joinDate: '', note: '', ...member });
        });
        localSave(d); return clone(d.members);
      }
      return (await gasPost({ action: 'saveMembersBulk', members: list })).members;
    },
    async deleteMember(id) {
      requireAdmin();
      if (mode() === 'local') {
        const d = localLoad(); d.members = d.members.filter(m => m.id !== id); localSave(d); return clone(d.members);
      }
      return (await gasPost({ action: 'deleteMember', id })).members;
    },
    // ----- 대회 -----
    async saveTournament(t) {
      requireAdmin();
      if (!t.id) t.id = uid('t');
      if (mode() === 'local') {
        const d = localLoad(); const i = d.tournaments.findIndex(x => x.id === t.id);
        if (i >= 0) d.tournaments[i] = t; else d.tournaments.push(t);
        localSave(d); return clone(d.tournaments);
      }
      return (await gasPost({ action: 'saveTournament', tournament: t })).tournaments;
    },
    async deleteTournament(id) {
      requireAdmin();
      if (mode() === 'local') {
        const d = localLoad(); d.tournaments = d.tournaments.filter(t => t.id !== id); localSave(d); return clone(d.tournaments);
      }
      return (await gasPost({ action: 'deleteTournament', id })).tournaments;
    },

    // ----- 설정 -----
    async saveSettings(s) {
      requireAdmin();
      if (mode() === 'local') {
        const d = localLoad(); Object.assign(d.settings, s); localSave(d); return publicSettings(d.settings);
      }
      return (await gasPost({ action: 'saveSettings', settings: s })).settings;
    },

    // ----- 백업 -----
    async exportAll() {
      requireAdmin();
      if (mode() === 'local') { const d = localLoad(); return JSON.stringify({ ...d, exportDate: new Date().toISOString() }, null, 2); }
      const r = await gasPost({ action: 'exportAll' });
      return JSON.stringify({ ...r, exportDate: new Date().toISOString() }, null, 2);
    },
    async importAll(json) {
      requireAdmin();
      const d = JSON.parse(json);
      if (!Array.isArray(d.members) || !Array.isArray(d.clubs)) throw new Error('올바른 백업 파일이 아닙니다.');
      if (mode() === 'local') {
        const cur = localLoad();
        localSave({ clubs: d.clubs, members: d.members, tournaments: d.tournaments || [], settings: { ...cur.settings, ...(d.settings || {}) } });
        return true;
      }
      await gasPost({ action: 'importAll', clubs: d.clubs, members: d.members, tournaments: d.tournaments || [], settings: d.settings || {} });
      return true;
    },
    /** 로컬 데모 데이터 초기화 */
    resetLocal(empty) {
      requireAdmin();
      if (empty) localSave({ clubs: [], members: [], tournaments: [], settings: { orgName: '전국 볼링 클럽 연합', adminPin: '0000', pointsTable: Ranking.DEFAULT_POINTS, defaultHandicap: Ranking.DEFAULT_HANDICAP } });
      else lsDel(LS.data);
    }
  };
})();
