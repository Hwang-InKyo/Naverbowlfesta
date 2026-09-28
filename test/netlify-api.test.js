// Netlify Functions 백엔드 (netlify/functions/api.mjs) 동작 테스트 - 블롭을 메모리로 대체
const { test } = require('node:test');
const assert = require('node:assert');

async function setup() {
  const mod = await import('../netlify/functions/api.mjs');
  const mem = new Map();
  mod.__setStore({ async get(k) { return mem.has(k) ? mem.get(k) : null; }, async set(k, v) { mem.set(k, v); } });
  const call = async (method, body, query) => {
    const req = new Request('http://x/api' + (query ? '?' + new URLSearchParams(query) : ''), { method, body: body ? JSON.stringify(body) : undefined });
    const res = await mod.default(req);
    return { status: res.status, data: await res.json() };
  };
  return { call, mem };
}

test('getAll: 빈 저장소는 빈 데이터, PIN 노출 없음', async () => {
  const { call } = await setup();
  const r = await call('GET', null, { action: 'getAll' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { settings: {}, regions: [], players: [], teams: [], results: null });
  assert.ok(!('adminPin' in r.data.settings));
});

test('로그인: 기본 PIN 0000, 틀리면 오류, 토큰으로 쓰기 가능', async () => {
  const { call } = await setup();
  const bad = await call('POST', { action: 'login', pin: '1234' });
  assert.match(bad.data.error, /PIN/);
  const noTok = await call('POST', { action: 'saveRegion', region: { name: '서울' } });
  assert.match(noTok.data.error, /로그인/);
  const ok = await call('POST', { action: 'login', pin: '0000' });
  assert.ok(ok.data.token);
  const r = await call('POST', { action: 'saveRegion', token: ok.data.token, region: { name: '서울' } });
  assert.equal(r.data.regions.length, 1); assert.equal(r.data.regions[0].name, '서울'); assert.ok(r.data.regions[0].id);
  const bogus = await call('POST', { action: 'saveRegion', token: ok.data.token.split('.')[0] + '.abc', region: { name: 'x' } });
  assert.match(bogus.data.error, /토큰/);
});

test('선수·팀 저장/삭제/교체와 확정, PIN 변경 시 재로그인', async () => {
  const { call, mem } = await setup();
  const { data: { token } } = await call('POST', { action: 'login', pin: '0000' });
  const reg = (await call('POST', { action: 'saveRegion', token, region: { name: '일산' } })).data.regions[0];
  let r = await call('POST', { action: 'savePlayers', token, players: [{ name: '홍길동', regionId: reg.id, gender: 'M', handicap: 5 }, { name: '김영희', regionId: reg.id, gender: 'F', handicap: 15 }] });
  assert.equal(r.data.players.length, 2);
  const [p1, p2] = r.data.players;
  r = await call('POST', { action: 'savePlayers', token, players: [{ id: p1.id, games: [180, 200] }] });
  assert.deepEqual(r.data.players.find(p => p.id === p1.id).games, [180, 200]);
  assert.equal(r.data.players.find(p => p.id === p1.id).name, '홍길동', '부분 수정은 병합');
  r = await call('POST', { action: 'replaceTeams', token, regionId: reg.id, event: 'scotch', teams: [{ name: '일산1', members: [p1.id, p2.id] }] });
  assert.equal(r.data.teams.length, 1); assert.equal(r.data.teams[0].event, 'scotch');
  r = await call('POST', { action: 'deletePlayers', token, ids: [p2.id] });
  assert.equal(r.data.players.length, 1); assert.deepEqual(r.data.teams[0].members, [p1.id]);
  r = await call('POST', { action: 'deleteRegion', token, id: reg.id });
  assert.match(r.data.error, /소속 선수/);
  r = await call('POST', { action: 'finalize', token, results: { standings: [] } });
  const all = (await call('GET', null, { action: 'getAll' })).data;
  assert.equal(all.settings.status, 'final'); assert.deepEqual(all.results, { standings: [] });
  assert.ok(JSON.parse(mem.get('data')).players.length === 1, '블롭에 저장됨');
  r = await call('POST', { action: 'saveSettings', token, settings: { adminPin: '4321', name: '대회' } });
  assert.ok(!('adminPin' in r.data.settings)); assert.equal(r.data.settings.name, '대회');
  r = await call('POST', { action: 'saveSettings', token, settings: { name: 'x' } });
  assert.match(r.data.error, /토큰/, 'PIN 변경 후 이전 토큰 무효');
  const again = await call('POST', { action: 'login', pin: '4321' });
  assert.ok(again.data.token);
  const pub = (await call('GET', null, { action: 'getAll' })).data;
  assert.ok(!('adminPin' in pub.settings), '공개 조회에 PIN 없음');
});

test('importAll 은 전체 교체, exportAll 은 공개 뷰', async () => {
  const { call } = await setup();
  const { data: { token } } = await call('POST', { action: 'login', pin: '0000' });
  await call('POST', { action: 'importAll', token, data: { settings: { name: '복원', adminPin: '9999' }, regions: [{ name: '서울' }], players: [{ name: 'a' }], teams: [], results: null } });
  const ex = (await call('POST', { action: 'exportAll', token })).data;
  assert.equal(ex.settings.name, '복원'); assert.equal(ex.regions.length, 1); assert.equal(ex.players[0].name, 'a');
  assert.ok((await call('POST', { action: 'login', pin: '0000' })).data.token, '백업의 PIN은 무시');
});
