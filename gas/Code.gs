/**
 * Google Apps Script - 전국 볼링 클럽 연합 전국대회 관리 API
 *
 * [설치 방법]
 * 1. Google Sheets 새 스프레드시트 생성 → URL의 /d/ 와 /edit 사이 값이 스프레드시트 ID
 * 2. 확장 프로그램 > Apps Script > 이 파일 내용 붙여넣기
 * 3. 아래 SPREADSHEET_ID 를 본인 스프레드시트 ID로 교체
 * 4. 프로젝트 설정 > 스크립트 속성 에 ADMIN_PIN 추가 (관리자 PIN, 예: 4~6자리 숫자)
 *    - 설정하지 않으면 '0000' 이 사용되므로 반드시 변경하세요.
 * 5. 배포 > 새 배포 > 웹 앱
 *    - 실행 사용자: 본인 / 액세스: 모든 사용자
 * 6. 배포 URL을 웹앱 설정 탭 "서버 연결" 에 입력 (또는 js/store.js 의 DEFAULT_API_URL)
 *
 * 시트는 첫 호출 시 자동 생성됩니다.
 *  - 클럽 : ID | 이름 | 지역 | 회장 | 비고
 *  - 회원 : ID | 이름 | 클럽ID | 성별 | 에버 | PIN | 역할 | 연락처 | 가입일 | 비고
 *  - 대회 : ID | 이름 | 날짜 | 상태 | 데이터(JSON)
 *  - 설정 : 키 | 값
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

const SHEET_CLUBS = '클럽';
const SHEET_MEMBERS = '회원';
const SHEET_TOURNAMENTS = '대회';
const SHEET_SETTINGS = '설정';

const H_CLUBS = ['ID', '이름', '지역', '회장', '비고'];
const H_MEMBERS = ['ID', '이름', '클럽ID', '성별', '에버', 'PIN', '역할', '연락처', '가입일', '비고'];
const H_TOURNAMENTS = ['ID', '이름', '날짜', '상태', '데이터'];
const H_SETTINGS = ['키', '값'];

const TOKEN_TTL_SEC = 6 * 60 * 60; // 6시간
const DEFAULT_PIN = '1234';

// ===== 진입점 =====
function doGet(e) {
  try {
    const action = (e.parameter || {}).action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    switch (action) {
      case 'getAll': return resp(getAll(ss));
      case 'ping': return resp({ ok: true, time: new Date().toISOString() });
      default: return resp({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return resp({ error: err.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const action = body.action;
    if (action === 'login') return resp(login(ss, body));

    const sess = requireToken(body.token);
    switch (action) {
      // 관리자
      case 'saveClub': requireAdmin(sess); return resp(saveClub(ss, body.club));
      case 'deleteClub': requireAdmin(sess); return resp(deleteClub(ss, body.id));
      case 'saveMember': requireAdmin(sess); return resp(saveMember(ss, body.member));
      case 'saveMembersBulk': requireAdmin(sess); return resp(saveMembersBulk(ss, body.members));
      case 'deleteMember': requireAdmin(sess); return resp(deleteMember(ss, body.id));
      case 'saveTournament': requireAdmin(sess); return resp(saveTournament(ss, body.tournament));
      case 'deleteTournament': requireAdmin(sess); return resp(deleteTournament(ss, body.id));
      case 'saveSettings': requireAdmin(sess); return resp(saveSettings(ss, body.settings));
      case 'exportAll': requireAdmin(sess); return resp(exportAll(ss));
      case 'importAll': requireAdmin(sess); return resp(importAll(ss, body));
      // 본인
      case 'changePin': requireSelf(sess, body.memberId); return resp(changePin(ss, sess, body));
      case 'updateProfile': requireSelf(sess, body.memberId); return resp(updateProfile(ss, body.memberId, body.updates));
      default: return resp({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return resp({ error: err.message });
  } finally {
    try { lock.releaseLock(); } catch (e) { /* ignore */ }
  }
}

// ===== 인증 =====
function adminPin() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '0000';
}

function login(ss, body) {
  const cache = CacheService.getScriptCache();
  let sess;
  if (body.type === 'admin') {
    if (String(body.pin) !== String(adminPin())) throw new Error('관리자 PIN이 올바르지 않습니다.');
    sess = { role: 'admin', name: '관리자' };
  } else {
    const rows = readMembersRaw(ss);
    const name = String(body.name || '').trim();
    const m = rows.find(r => r.clubId === body.clubId && r.name === name);
    if (!m) throw new Error('해당 클럽에 등록된 회원이 없습니다.');
    const pin = m.pin || settingValue(ss, 'defaultPin') || DEFAULT_PIN;
    if (String(body.pin) !== String(pin)) throw new Error('PIN이 올바르지 않습니다.');
    sess = { role: m.role === 'admin' ? 'admin' : 'member', memberId: m.id, name: m.name, clubId: m.clubId };
  }
  const token = Utilities.getUuid();
  cache.put('tok_' + token, JSON.stringify(sess), TOKEN_TTL_SEC);
  return Object.assign({ token }, sess);
}

function requireToken(token) {
  if (!token) throw new Error('로그인이 필요합니다.');
  const raw = CacheService.getScriptCache().get('tok_' + token);
  if (!raw) throw new Error('로그인 토큰이 만료되었습니다. 다시 로그인하세요.');
  return JSON.parse(raw);
}
function requireAdmin(sess) { if (sess.role !== 'admin') throw new Error('관리자 권한이 필요합니다.'); }
function requireSelf(sess, memberId) {
  if (sess.role !== 'admin' && sess.memberId !== memberId) throw new Error('본인 정보만 수정할 수 있습니다.');
}

// ===== 조회 =====
function getAll(ss) {
  return {
    clubs: getClubs(ss),
    members: readMembersRaw(ss).map(stripPin),
    tournaments: getTournaments(ss),
    settings: publicSettings(getSettings(ss))
  };
}

function stripPin(m) {
  const o = {}; Object.keys(m).forEach(k => { if (k !== 'pin') o[k] = m[k]; });
  o.hasPin = !!m.pin;
  return o;
}

// ===== 클럽 =====
function getClubs(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_CLUBS, H_CLUBS);
  const data = sheet.getDataRange().getValues();
  const clubs = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    clubs.push({ id: str(data[i][0]), name: str(data[i][1]), region: str(data[i][2]), leader: str(data[i][3]), note: str(data[i][4]) });
  }
  return clubs;
}

function saveClub(ss, club) {
  const sheet = getOrCreateSheet(ss, SHEET_CLUBS, H_CLUBS);
  const id = club.id || newId('c');
  const row = [id, club.name || '', club.region || '', club.leader || '', club.note || ''];
  const idx = findRow(sheet, id);
  if (idx > 0) sheet.getRange(idx, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return { clubs: getClubs(ss) };
}

function deleteClub(ss, id) {
  if (readMembersRaw(ss).some(m => m.clubId === id)) throw new Error('소속 회원이 있는 클럽은 삭제할 수 없습니다.');
  const sheet = getOrCreateSheet(ss, SHEET_CLUBS, H_CLUBS);
  const idx = findRow(sheet, id);
  if (idx > 0) sheet.deleteRow(idx);
  return { clubs: getClubs(ss) };
}

// ===== 회원 =====
function readMembersRaw(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, H_MEMBERS);
  const data = sheet.getDataRange().getValues();
  const members = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    members.push({
      id: str(data[i][0]), name: str(data[i][1]), clubId: str(data[i][2]), gender: str(data[i][3]) || 'M',
      avg: Number(data[i][4]) || 0, pin: str(data[i][5]), role: str(data[i][6]) || 'member',
      phone: str(data[i][7]), joinDate: fmtDate(data[i][8]), note: str(data[i][9])
    });
  }
  return members;
}

function memberRow(m, existing) {
  const pin = m.pin ? String(m.pin) : (existing ? existing.pin : '');
  return [m.id, m.name || '', m.clubId || '', m.gender || 'M', Number(m.avg) || 0, pin, m.role || 'member', m.phone || '', m.joinDate || '', m.note || ''];
}

function saveMember(ss, member) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, H_MEMBERS);
  const all = readMembersRaw(ss);
  member.id = member.id || newId('m');
  if (all.some(x => x.id !== member.id && x.clubId === member.clubId && x.name === member.name)) throw new Error('같은 클럽에 동명 회원이 이미 있습니다.');
  const existing = all.find(x => x.id === member.id);
  const row = memberRow(member, existing);
  const idx = findRow(sheet, member.id);
  if (idx > 0) sheet.getRange(idx, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return { members: readMembersRaw(ss).map(stripPin) };
}

function saveMembersBulk(ss, list) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, H_MEMBERS);
  const all = readMembersRaw(ss);
  const appended = [];
  (list || []).forEach(m => {
    const ex = all.find(x => x.clubId === m.clubId && x.name === m.name);
    if (ex) {
      const merged = Object.assign({}, ex, { gender: m.gender || ex.gender, avg: m.avg != null ? m.avg : ex.avg, phone: m.phone || ex.phone });
      const idx = findRow(sheet, ex.id);
      if (idx > 0) sheet.getRange(idx, 1, 1, H_MEMBERS.length).setValues([memberRow(merged, ex)]);
    } else {
      const nm = Object.assign({ role: 'member', pin: '', phone: '', joinDate: '', note: '' }, m, { id: newId('m') });
      appended.push(memberRow(nm, null));
      all.push(nm);
    }
  });
  if (appended.length) sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, H_MEMBERS.length).setValues(appended);
  return { members: readMembersRaw(ss).map(stripPin) };
}

function deleteMember(ss, id) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, H_MEMBERS);
  const idx = findRow(sheet, id);
  if (idx > 0) sheet.deleteRow(idx);
  return { members: readMembersRaw(ss).map(stripPin) };
}

function changePin(ss, sess, body) {
  if (!/^\d{4,6}$/.test(String(body.newPin))) throw new Error('PIN은 숫자 4~6자리여야 합니다.');
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, H_MEMBERS);
  const m = readMembersRaw(ss).find(x => x.id === body.memberId);
  if (!m) throw new Error('회원을 찾을 수 없습니다.');
  const cur = m.pin || settingValue(ss, 'defaultPin') || DEFAULT_PIN;
  if (sess.role !== 'admin' && String(body.oldPin) !== String(cur)) throw new Error('현재 PIN이 올바르지 않습니다.');
  const idx = findRow(sheet, m.id);
  sheet.getRange(idx, 6).setValue(String(body.newPin));
  return { ok: true };
}

function updateProfile(ss, memberId, updates) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, H_MEMBERS);
  const idx = findRow(sheet, memberId);
  if (idx <= 0) throw new Error('회원을 찾을 수 없습니다.');
  if (updates && updates.phone !== undefined) sheet.getRange(idx, 8).setValue(String(updates.phone || ''));
  return { members: readMembersRaw(ss).map(stripPin) };
}

// ===== 대회 =====
function getTournaments(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_TOURNAMENTS, H_TOURNAMENTS);
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    try {
      const t = JSON.parse(data[i][4] || '{}');
      t.id = str(data[i][0]); t.name = str(data[i][1]); t.date = fmtDate(data[i][2]); t.status = str(data[i][3]) || 'upcoming';
      list.push(t);
    } catch (e) { /* skip bad row */ }
  }
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list;
}

function saveTournament(ss, t) {
  const sheet = getOrCreateSheet(ss, SHEET_TOURNAMENTS, H_TOURNAMENTS);
  t.id = t.id || newId('t');
  const rest = Object.assign({}, t); delete rest.id; delete rest.name; delete rest.date; delete rest.status;
  const row = [t.id, t.name || '', t.date || '', t.status || 'upcoming', JSON.stringify(rest)];
  const idx = findRow(sheet, t.id);
  if (idx > 0) sheet.getRange(idx, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return { tournaments: getTournaments(ss) };
}

function deleteTournament(ss, id) {
  const sheet = getOrCreateSheet(ss, SHEET_TOURNAMENTS, H_TOURNAMENTS);
  const idx = findRow(sheet, id);
  if (idx > 0) sheet.deleteRow(idx);
  return { tournaments: getTournaments(ss) };
}

// ===== 설정 =====
function getSettings(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_SETTINGS, H_SETTINGS);
  const data = sheet.getDataRange().getValues();
  const s = { orgName: '전국 볼링 클럽 연합', defaultPin: DEFAULT_PIN, pointsTable: [10, 8, 6, 5, 4, 3, 2, 1], defaultHandicap: { type: 'diff', base: 200, rate: 0.8, cap: 60, femaleBonus: 8 } };
  for (let i = 1; i < data.length; i++) {
    const k = str(data[i][0]); if (!k) continue;
    const v = str(data[i][1]);
    try { s[k] = JSON.parse(v); } catch (e) { s[k] = v; }
  }
  return s;
}
function settingValue(ss, key) { return getSettings(ss)[key]; }
function publicSettings(s) { const o = Object.assign({}, s); delete o.adminPin; delete o.defaultPin; return o; }

function saveSettings(ss, settings) {
  settings = settings || {};
  if (settings.adminPin) {
    if (!/^\d{4,6}$/.test(String(settings.adminPin))) throw new Error('관리자 PIN은 숫자 4~6자리여야 합니다.');
    PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', String(settings.adminPin));
    delete settings.adminPin;
  }
  const sheet = getOrCreateSheet(ss, SHEET_SETTINGS, H_SETTINGS);
  Object.keys(settings).forEach(k => {
    const v = typeof settings[k] === 'string' ? settings[k] : JSON.stringify(settings[k]);
    const idx = findRow(sheet, k);
    if (idx > 0) sheet.getRange(idx, 2).setValue(v); else sheet.appendRow([k, v]);
  });
  return { settings: publicSettings(getSettings(ss)) };
}

// ===== 백업 =====
function exportAll(ss) {
  return { clubs: getClubs(ss), members: readMembersRaw(ss), tournaments: getTournaments(ss), settings: getSettings(ss) };
}

function importAll(ss, data) {
  if (Array.isArray(data.clubs)) {
    const sheet = getOrCreateSheet(ss, SHEET_CLUBS, H_CLUBS);
    clearRows(sheet);
    const rows = data.clubs.map(c => [c.id || newId('c'), c.name || '', c.region || '', c.leader || '', c.note || '']);
    if (rows.length) sheet.getRange(2, 1, rows.length, H_CLUBS.length).setValues(rows);
  }
  if (Array.isArray(data.members)) {
    const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, H_MEMBERS);
    clearRows(sheet);
    const rows = data.members.map(m => memberRow(Object.assign({}, m, { id: m.id || newId('m') }), null));
    if (rows.length) sheet.getRange(2, 1, rows.length, H_MEMBERS.length).setValues(rows);
  }
  if (Array.isArray(data.tournaments)) {
    const sheet = getOrCreateSheet(ss, SHEET_TOURNAMENTS, H_TOURNAMENTS);
    clearRows(sheet);
    const rows = data.tournaments.map(t => {
      const rest = Object.assign({}, t); delete rest.id; delete rest.name; delete rest.date; delete rest.status;
      return [t.id || newId('t'), t.name || '', t.date || '', t.status || 'upcoming', JSON.stringify(rest)];
    });
    if (rows.length) sheet.getRange(2, 1, rows.length, H_TOURNAMENTS.length).setValues(rows);
  }
  if (data.settings && typeof data.settings === 'object') saveSettings(ss, data.settings);
  return { ok: true };
}

// ===== 유틸 =====
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function clearRows(sheet) { if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1); }
function findRow(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const col = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) if (str(col[i][0]) === String(id)) return i + 2;
  return -1;
}
function newId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function str(v) { return v == null ? '' : String(v).trim(); }
function fmtDate(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  const d = new Date(val);
  if (isNaN(d)) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function resp(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
