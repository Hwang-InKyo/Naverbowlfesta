/**
 * Google Apps Script - 전국대회 관리 API (이번 대회 전용)
 *
 * [설치 방법]
 * 1. Google Sheets 새 스프레드시트 생성 → URL의 /d/ 와 /edit 사이 값이 스프레드시트 ID
 * 2. 확장 프로그램 > Apps Script > 이 파일 내용 붙여넣기
 * 3. 아래 SPREADSHEET_ID 를 본인 스프레드시트 ID로 교체
 * 4. 프로젝트 설정 > 스크립트 속성 에 ADMIN_PIN 추가 (관리자 PIN). 없으면 '0000'.
 * 5. 배포 > 새 배포 > 웹 앱 (실행 사용자: 본인 / 액세스: 모든 사용자)
 * 6. 배포 URL을 웹앱 관리자 로그인 창 "서버 연결 설정" 에 입력 (또는 js/store.js 의 DEFAULT_API_URL)
 *
 * 조회(getAll)는 누구나 가능하고, 수정은 관리자 PIN 로그인 토큰이 있어야 합니다.
 * 시트는 첫 호출 시 자동 생성됩니다.
 *  - 설정 : 키 | 값(JSON)
 *  - 지역 : ID | 이름 | 대표 | 비고
 *  - 선수 : ID | 이름 | 지역ID | 성별 | 생년 | 핸디 | 가감 | 대표 | 조 | 레인 | 순번 | 게임(JSON) | 종목(JSON) | 비고
 *  - 팀   : ID | 종목 | 지역ID | 팀명 | 선수(JSON) | 레인 | 핸디 | 가감 | 게임(JSON)
 *  - 결과 : 키 | 데이터(JSON)   ← 확정 스냅샷
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

const SH = { settings: '설정', regions: '지역', players: '선수', teams: '팀', results: '결과' };
const H = {
  settings: ['키', '값'],
  regions: ['ID', '이름', '대표', '비고'],
  players: ['ID', '이름', '지역ID', '성별', '생년', '핸디', '가감', '대표', '조', '레인', '순번', '게임', '종목', '비고'],
  teams: ['ID', '종목', '지역ID', '팀명', '선수', '레인', '핸디', '가감', '게임'],
  results: ['키', '데이터']
};
const TOKEN_TTL_SEC = 12 * 60 * 60;

function doGet(e) {
  try {
    const action = (e.parameter || {}).action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    switch (action) {
      case 'getAll': return resp(getAll(ss));
      case 'ping': return resp({ ok: true, time: new Date().toISOString() });
      default: return resp({ error: 'Unknown action: ' + action });
    }
  } catch (err) { return resp({ error: err.message }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const action = body.action;
    if (action === 'login') return resp(login(body.pin));
    requireAdminToken(body.token);
    switch (action) {
      case 'saveSettings': return resp({ settings: saveSettings(ss, body.settings) });
      case 'saveRegion': return resp({ regions: saveRegion(ss, body.region) });
      case 'deleteRegion': return resp({ regions: deleteRegion(ss, body.id) });
      case 'savePlayers': return resp({ players: savePlayers(ss, body.players) });
      case 'deletePlayer': return resp(deletePlayer(ss, body.id));
      case 'replacePlayers': return resp(replacePlayers(ss, body.players));
      case 'saveTeams': return resp({ teams: saveTeams(ss, body.teams) });
      case 'deleteTeam': return resp({ teams: deleteTeam(ss, body.id) });
      case 'finalize': return resp(finalize(ss, body.results));
      case 'unfinalize': return resp(unfinalize(ss));
      case 'exportAll': return resp(getAll(ss));
      case 'importAll': return resp(importAll(ss, body.data || {}));
      default: return resp({ error: 'Unknown action: ' + action });
    }
  } catch (err) { return resp({ error: err.message }); }
  finally { try { lock.releaseLock(); } catch (e) { /* ignore */ } }
}

// ===== 인증 =====
function adminPin() { return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '0000'; }
function login(pin) {
  if (String(pin) !== String(adminPin())) throw new Error('관리자 PIN이 올바르지 않습니다.');
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, 'admin', TOKEN_TTL_SEC);
  return { token, role: 'admin' };
}
function requireAdminToken(token) {
  if (!token) throw new Error('관리자 로그인이 필요합니다.');
  if (CacheService.getScriptCache().get('tok_' + token) !== 'admin') throw new Error('로그인 토큰이 만료되었습니다. 다시 로그인하세요.');
}

// ===== 조회 =====
function getAll(ss) {
  return { settings: getSettings(ss), regions: getRegions(ss), players: getPlayers(ss), teams: getTeams(ss), results: getResults(ss) };
}

// ===== 설정 =====
function getSettings(ss) {
  const sheet = sheetOf(ss, 'settings');
  const data = sheet.getDataRange().getValues();
  const s = {};
  for (let i = 1; i < data.length; i++) {
    const k = str(data[i][0]); if (!k || k === 'adminPin') continue;
    try { s[k] = JSON.parse(data[i][1]); } catch (e) { s[k] = str(data[i][1]); }
  }
  return s;
}
function saveSettings(ss, patch) {
  patch = patch || {};
  if (patch.adminPin) {
    if (!/^\d{4,6}$/.test(String(patch.adminPin))) throw new Error('관리자 PIN은 숫자 4~6자리여야 합니다.');
    PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', String(patch.adminPin));
    delete patch.adminPin;
  }
  const sheet = sheetOf(ss, 'settings');
  Object.keys(patch).forEach(k => {
    const v = JSON.stringify(patch[k]);
    const idx = findRow(sheet, k);
    if (idx > 0) sheet.getRange(idx, 2).setValue(v); else sheet.appendRow([k, v]);
  });
  return getSettings(ss);
}

// ===== 지역 =====
function getRegions(ss) {
  return rows(ss, 'regions').map(r => ({ id: str(r[0]), name: str(r[1]), leader: str(r[2]), note: str(r[3]) }));
}
function regionRow(r) { return [r.id, r.name || '', r.leader || '', r.note || '']; }
function saveRegion(ss, r) {
  r.id = r.id || newId('r');
  upsertRow(sheetOf(ss, 'regions'), r.id, regionRow(r));
  return getRegions(ss);
}
function deleteRegion(ss, id) {
  if (getPlayers(ss).some(p => p.regionId === id)) throw new Error('소속 선수가 있는 지역은 삭제할 수 없습니다.');
  deleteRowById(sheetOf(ss, 'regions'), id);
  getTeams(ss).filter(t => t.regionId === id).forEach(t => deleteRowById(sheetOf(ss, 'teams'), t.id));
  return getRegions(ss);
}

// ===== 선수 =====
function getPlayers(ss) {
  return rows(ss, 'players').map(r => ({
    id: str(r[0]), name: str(r[1]), regionId: str(r[2]), gender: str(r[3]) === 'F' ? 'F' : 'M',
    birthYear: Number(r[4]) || '', handicap: Number(r[5]) || 0, adjust: Number(r[6]) || 0,
    isRep: r[7] === true || r[7] === 1 || str(r[7]) === '1' || str(r[7]) === 'TRUE',
    group: str(r[8]), lane: r[9] === '' ? '' : Number(r[9]) || '', pos: r[10] === '' ? '' : Number(r[10]) || '',
    games: parseJson(r[11], []), events: parseJson(r[12], { individual: true }), note: str(r[13])
  }));
}
function playerRow(p) {
  return [p.id, p.name || '', p.regionId || '', p.gender === 'F' ? 'F' : 'M', Number(p.birthYear) || '',
    Number(p.handicap) || 0, Number(p.adjust) || 0, p.isRep ? 1 : 0,
    p.group || '', p.lane === '' || p.lane == null ? '' : Number(p.lane), p.pos === '' || p.pos == null ? '' : Number(p.pos),
    JSON.stringify(p.games || []), JSON.stringify(p.events || { individual: true }), p.note || ''];
}
function savePlayers(ss, list) {
  const sheet = sheetOf(ss, 'players');
  const existing = getPlayers(ss);
  (list || []).forEach(p => {
    p.id = p.id || newId('p');
    const ex = existing.find(x => x.id === p.id);
    upsertRow(sheet, p.id, playerRow(ex ? Object.assign({}, ex, p) : p));
  });
  return getPlayers(ss);
}
function deletePlayer(ss, id) {
  deleteRowById(sheetOf(ss, 'players'), id);
  const teams = getTeams(ss);
  teams.filter(t => (t.members || []).indexOf(id) >= 0).forEach(t => { t.members = t.members.filter(m => m !== id); upsertRow(sheetOf(ss, 'teams'), t.id, teamRow(t)); });
  return { players: getPlayers(ss), teams: getTeams(ss) };
}
function replacePlayers(ss, list) {
  const sheet = sheetOf(ss, 'players'); clearRows(sheet);
  const r = (list || []).map(p => playerRow(Object.assign({}, p, { id: p.id || newId('p') })));
  if (r.length) sheet.getRange(2, 1, r.length, H.players.length).setValues(r);
  clearRows(sheetOf(ss, 'teams'));
  return { players: getPlayers(ss), teams: [] };
}

// ===== 팀 =====
function getTeams(ss) {
  return rows(ss, 'teams').map(r => ({ id: str(r[0]), event: str(r[1]), regionId: str(r[2]), name: str(r[3]), members: parseJson(r[4], []), lane: r[5] === '' ? '' : Number(r[5]) || '', handicap: Number(r[6]) || 0, adjust: Number(r[7]) || 0, games: parseJson(r[8], []) }));
}
function teamRow(t) { return [t.id, t.event || '', t.regionId || '', t.name || '', JSON.stringify(t.members || []), t.lane === '' || t.lane == null ? '' : Number(t.lane), Number(t.handicap) || 0, Number(t.adjust) || 0, JSON.stringify(t.games || [])]; }
function saveTeams(ss, list) {
  const sheet = sheetOf(ss, 'teams');
  const existing = getTeams(ss);
  (list || []).forEach(t => { t.id = t.id || newId('t'); const ex = existing.find(x => x.id === t.id); upsertRow(sheet, t.id, teamRow(ex ? Object.assign({}, ex, t) : t)); });
  return getTeams(ss);
}
function deleteTeam(ss, id) { deleteRowById(sheetOf(ss, 'teams'), id); return getTeams(ss); }

// ===== 확정 =====
function getResults(ss) {
  const sheet = sheetOf(ss, 'results');
  const idx = findRow(sheet, 'final');
  if (idx <= 0) return null;
  return parseJson(sheet.getRange(idx, 2).getValue(), null);
}
function finalize(ss, results) {
  upsertRow(sheetOf(ss, 'results'), 'final', ['final', JSON.stringify(results || {})]);
  saveSettings(ss, { status: 'final' });
  return { ok: true };
}
function unfinalize(ss) {
  deleteRowById(sheetOf(ss, 'results'), 'final');
  saveSettings(ss, { status: 'live' });
  return { ok: true };
}

// ===== 백업 =====
function importAll(ss, d) {
  if (d.settings) saveSettings(ss, d.settings);
  if (Array.isArray(d.regions)) { const sh = sheetOf(ss, 'regions'); clearRows(sh); const r = d.regions.map(x => regionRow(Object.assign({}, x, { id: x.id || newId('r') }))); if (r.length) sh.getRange(2, 1, r.length, H.regions.length).setValues(r); }
  if (Array.isArray(d.players)) { const sh = sheetOf(ss, 'players'); clearRows(sh); const r = d.players.map(x => playerRow(Object.assign({}, x, { id: x.id || newId('p') }))); if (r.length) sh.getRange(2, 1, r.length, H.players.length).setValues(r); }
  if (Array.isArray(d.teams)) { const sh = sheetOf(ss, 'teams'); clearRows(sh); const r = d.teams.map(x => teamRow(Object.assign({}, x, { id: x.id || newId('t') }))); if (r.length) sh.getRange(2, 1, r.length, H.teams.length).setValues(r); }
  if (d.results) upsertRow(sheetOf(ss, 'results'), 'final', ['final', JSON.stringify(d.results)]); else deleteRowById(sheetOf(ss, 'results'), 'final');
  return { ok: true };
}

// ===== 유틸 =====
function sheetOf(ss, key) {
  let sheet = ss.getSheetByName(SH[key]);
  if (!sheet) { sheet = ss.insertSheet(SH[key]); sheet.appendRow(H[key]); sheet.getRange(1, 1, 1, H[key].length).setFontWeight('bold'); sheet.setFrozenRows(1); }
  return sheet;
}
function rows(ss, key) { const data = sheetOf(ss, key).getDataRange().getValues(); const out = []; for (let i = 1; i < data.length; i++) if (data[i][0] !== '' && data[i][0] != null) out.push(data[i]); return out; }
function clearRows(sheet) { if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1); }
function findRow(sheet, id) {
  const last = sheet.getLastRow(); if (last < 2) return -1;
  const col = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) if (str(col[i][0]) === String(id)) return i + 2;
  return -1;
}
function upsertRow(sheet, id, row) { const idx = findRow(sheet, id); if (idx > 0) sheet.getRange(idx, 1, 1, row.length).setValues([row]); else sheet.appendRow(row); }
function deleteRowById(sheet, id) { const idx = findRow(sheet, id); if (idx > 0) sheet.deleteRow(idx); }
function parseJson(v, d) { try { const r = JSON.parse(v); return r == null ? d : r; } catch (e) { return d; } }
function newId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function str(v) { return v == null ? '' : String(v).trim(); }
function resp(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
