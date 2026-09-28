/**
 * api.mjs - Netlify Functions 백엔드 (Google Sheets 대체)
 *
 *  저장소 : Netlify Blobs (스토어 'tournament', 키 'data' 에 전체 데이터 JSON 하나)
 *  경로   : /api            GET  ?action=getAll | ping        (누구나)
 *           /api            POST { action, token, ... }        (login 외에는 관리자 토큰 필요)
 *  PIN    : 설정의 adminPin(앱에서 변경) → 없으면 환경변수 ADMIN_PIN → 없으면 '0000'
 *           PIN은 서버(블롭/환경변수)에만 있고 웹 코드에는 절대 내려가지 않는다.
 *  토큰   : HMAC 서명 + 만료(12시간). 서버에 세션을 두지 않아 함수가 여러 인스턴스여도 동작.
 *
 *  로컬 테스트: test/netlify-api.test.js (블롭을 메모리로 대체)
 */
import { getStore } from '@netlify/blobs';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const STORE_NAME = 'tournament';
const KEY = 'data';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export const config = { path: '/api' };

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return json({ ok: true });
    if (req.method === 'GET') {
      const action = url.searchParams.get('action');
      if (action === 'ping') return json({ ok: true, time: new Date().toISOString() });
      if (action === 'getAll') return json(publicView(await load()), { 'Cache-Control': 'no-store' });
      return json({ error: 'Unknown action: ' + action }, {}, 400);
    }
    if (req.method === 'POST') {
      let body = {};
      try { body = JSON.parse((await req.text()) || '{}'); } catch { return json({ error: '잘못된 요청 본문' }, {}, 400); }
      return json(await handlePost(body), { 'Cache-Control': 'no-store' });
    }
    return json({ error: 'Method not allowed' }, {}, 405);
  } catch (err) {
    return json({ error: err.message || String(err) }, { 'Cache-Control': 'no-store' });
  }
}

// ===== 저장소 =====
let storeOverride = null;
/** 테스트용: 블롭 대신 { get(key), set(key, value) } 를 가진 객체를 주입 */
export function __setStore(s) { storeOverride = s; }
function store() { return storeOverride || getStore({ name: STORE_NAME, consistency: 'strong' }); }

function emptyData() { return { settings: {}, regions: [], players: [], teams: [], results: null }; }
async function load() {
  const raw = await store().get(KEY);
  if (!raw) return emptyData();
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { settings: d.settings || {}, regions: d.regions || [], players: d.players || [], teams: d.teams || [], results: d.results || null };
}
async function save(d) { await store().set(KEY, JSON.stringify(d)); }
function publicView(d) { const { adminPin, ...settings } = d.settings || {}; return { settings, regions: d.regions, players: d.players, teams: d.teams, results: d.results }; }

// ===== 인증 =====
function currentPin(d) { return String((d.settings && d.settings.adminPin) || process.env.ADMIN_PIN || '0000'); }
function secret(d) { return process.env.TOKEN_SECRET || createHash('sha256').update('naverbowlfesta:' + currentPin(d)).digest('hex'); }
function sign(payload, d) { return createHmac('sha256', secret(d)).update(payload).digest('base64url'); }
function issueToken(d) { const exp = String(Date.now() + TOKEN_TTL_MS); return exp + '.' + sign(exp, d); }
function verifyToken(token, d) {
  if (!token || typeof token !== 'string') throw new Error('관리자 로그인이 필요합니다.');
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) throw new Error('로그인 토큰이 만료되었습니다. 다시 로그인하세요.');
  const want = Buffer.from(sign(exp, d)); const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw new Error('로그인 토큰이 만료되었습니다. 다시 로그인하세요.');
}
function safeEq(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }

// ===== 쓰기 =====
async function handlePost(body) {
  const d = await load();
  const action = body.action;
  if (action === 'login') {
    if (!safeEq(body.pin, currentPin(d))) throw new Error('관리자 PIN이 올바르지 않습니다.');
    return { token: issueToken(d), role: 'admin' };
  }
  verifyToken(body.token, d);
  const result = apply(d, action, body);
  if (d.__dirty) { delete d.__dirty; await save(d); }
  return result;
}
// 각 쓰기 함수는 d 를 직접 수정하고 __dirty 를 표시한다. 저장은 handlePost 에서 한 번만.
function apply(d, action, body) {
  switch (action) {
    case 'saveSettings': return { settings: saveSettings(d, body.settings) };
    case 'saveRegion': return { regions: saveRegion(d, body.region) };
    case 'deleteRegion': return { regions: deleteRegion(d, body.id) };
    case 'savePlayers': return { players: savePlayers(d, body.players) };
    case 'deletePlayer': return deletePlayers(d, [body.id]);
    case 'deletePlayers': return deletePlayers(d, body.ids || []);
    case 'replacePlayers': return replacePlayers(d, body.players || []);
    case 'replaceTeams': return { teams: replaceTeams(d, body.regionId, body.event, body.teams || []) };
    case 'saveTeams': return { teams: saveTeams(d, body.teams) };
    case 'deleteTeam': return { teams: deleteTeam(d, body.id) };
    case 'finalize': return finalize(d, body.results);
    case 'unfinalize': return unfinalize(d);
    case 'exportAll': return publicView(d);
    case 'importAll': return importAll(d, body.data || {});
    case 'resetAll': return resetAll(d, !!body.keepSettings);
    default: throw new Error('Unknown action: ' + action);
  }
}

function saveSettings(d, patch) {
  patch = { ...(patch || {}) };
  if (patch.adminPin != null) {
    if (!/^\d{4,6}$/.test(String(patch.adminPin))) throw new Error('관리자 PIN은 숫자 4~6자리여야 합니다.');
    patch.adminPin = String(patch.adminPin);
  }
  d.settings = { ...(d.settings || {}), ...patch };
  d.__dirty = true; return publicView(d).settings;
}
function saveRegion(d, r) {
  r = { ...(r || {}) }; r.id = r.id || newId('r');
  upsert(d.regions, { id: r.id, name: r.name || '', leader: r.leader || '', note: r.note || '' });
  d.__dirty = true; return d.regions;
}
function deleteRegion(d, id) {
  if (d.players.some(p => p.regionId === id)) throw new Error('소속 선수가 있는 지역은 삭제할 수 없습니다.');
  d.regions = d.regions.filter(r => r.id !== id); d.teams = d.teams.filter(t => t.regionId !== id);
  d.__dirty = true; return d.regions;
}
function normPlayer(p) {
  return { id: p.id, name: p.name || '', regionId: p.regionId || '', gender: p.gender === 'F' ? 'F' : 'M', birthYear: Number(p.birthYear) || '',
    handicap: Number(p.handicap) || 0, adjust: Number(p.adjust) || 0, isRep: !!p.isRep, group: p.group || '',
    lane: p.lane === '' || p.lane == null ? '' : Number(p.lane) || '', pos: p.pos === '' || p.pos == null ? '' : Number(p.pos) || '',
    games: Array.isArray(p.games) ? p.games : [], events: p.events && typeof p.events === 'object' ? p.events : { individual: true }, note: p.note || '' };
}
function savePlayers(d, list) {
  (list || []).forEach(p => { p = { ...p }; p.id = p.id || newId('p'); const ex = d.players.find(x => x.id === p.id); upsert(d.players, normPlayer(ex ? { ...ex, ...p } : p)); });
  d.__dirty = true; return d.players;
}
function deletePlayers(d, ids) {
  const set = new Set(ids);
  d.players = d.players.filter(p => !set.has(p.id));
  d.teams.forEach(t => { t.members = (t.members || []).filter(m => !set.has(m)); });
  d.__dirty = true; return { players: d.players, teams: d.teams };
}
function replacePlayers(d, list) {
  d.players = list.map(p => normPlayer({ ...p, id: p.id || newId('p') })); d.teams = [];
  d.__dirty = true; return { players: d.players, teams: d.teams };
}
function normTeam(t) {
  return { id: t.id, event: t.event || '', regionId: t.regionId || '', name: t.name || '', members: Array.isArray(t.members) ? t.members : [],
    lane: t.lane === '' || t.lane == null ? '' : Number(t.lane) || '', handicap: Number(t.handicap) || 0, adjust: Number(t.adjust) || 0, games: Array.isArray(t.games) ? t.games : [] };
}
function replaceTeams(d, regionId, event, list) {
  d.teams = d.teams.filter(t => !(t.regionId === regionId && t.event === event));
  list.forEach(t => d.teams.push(normTeam({ ...t, id: t.id || newId('t'), regionId, event })));
  d.__dirty = true; return d.teams;
}
function saveTeams(d, list) {
  (list || []).forEach(t => { t = { ...t }; t.id = t.id || newId('t'); const ex = d.teams.find(x => x.id === t.id); upsert(d.teams, normTeam(ex ? { ...ex, ...t } : t)); });
  d.__dirty = true; return d.teams;
}
function deleteTeam(d, id) { d.teams = d.teams.filter(t => t.id !== id); d.__dirty = true; return d.teams; }
function finalize(d, results) { d.results = results || {}; d.settings = { ...(d.settings || {}), status: 'final' }; d.__dirty = true; return { ok: true }; }
function unfinalize(d) { d.results = null; d.settings = { ...(d.settings || {}), status: 'live' }; d.__dirty = true; return { ok: true }; }
/** 전체 초기화: 지역·선수·팀·결과 삭제. keepSettings 면 대회 설정(이름·조·포인트)은 유지하고 상태만 준비중으로. PIN 은 항상 유지 */
function resetAll(d, keepSettings) {
  const pin = d.settings && d.settings.adminPin;
  d.settings = keepSettings ? { ...(d.settings || {}), status: 'ready' } : {};
  if (pin) d.settings.adminPin = pin;
  d.regions = []; d.players = []; d.teams = []; d.results = null;
  d.__dirty = true; return { ok: true };
}
function importAll(d, src) {
  if (src.settings) { const { adminPin, ...rest } = src.settings; d.settings = { ...(d.settings || {}), ...rest }; }
  if (Array.isArray(src.regions)) d.regions = src.regions.map(r => ({ id: r.id || newId('r'), name: r.name || '', leader: r.leader || '', note: r.note || '' }));
  if (Array.isArray(src.players)) d.players = src.players.map(p => normPlayer({ ...p, id: p.id || newId('p') }));
  if (Array.isArray(src.teams)) d.teams = src.teams.map(t => normTeam({ ...t, id: t.id || newId('t') }));
  d.results = src.results || null;
  d.__dirty = true; return { ok: true };
}

// ===== 유틸 =====
function upsert(list, item) { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); }
function newId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function json(data, headers, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) } });
}
