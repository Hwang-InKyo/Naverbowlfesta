// 정산 계산 테스트 (브라우저 전역 Store/Ranking 을 흉내내어 finance.js 로드)
const test = require('node:test');
const assert = require('node:assert/strict');
global.Ranking = require('../js/ranking.js');
global.Store = { defaultFinance: () => ({ fees: { individual: 35000, champ: 10000, club: 110000, clubDonation: 50000, team5: 0, side: 10000, gameFee: 4500 }, pools: { champ: { basis: 'total', prizes: [50000, 30000, 20000] }, side: { basis: 'total', prizes: [20000, 10000] } }, account: '', cashDonations: [], goodsDonations: [], expenses: [], payments: {} }) };
const Finance = require('../js/finance.js');
const Signup = require('../js/signup.js');
const ftpl = require('./fixtures/signup-template.json');

const mkState = (players, finance) => ({ data: { settings: { ...Ranking.DEFAULT_SETTINGS, groups: [{ id: 'A', name: '1조', bonus: 10 }, { id: 'B', name: '2조', bonus: 0 }] }, regions: [{ id: 'r1', name: '청주' }, { id: 'r2', name: '서울' }], players, teams: [] }, finance: Store.defaultFinance() && Object.assign(Store.defaultFinance(), finance || {}) });

test('checkSignupFees: consistent form passes, mismatches are listed', () => {
  const p = Signup.parse(ftpl.rows);
  const ok = Finance.checkSignupFees(p, Store.defaultFinance());
  assert.deepEqual(ok.issues, []); assert.equal(ok.total, 505000); assert.deepEqual(ok.counts, { players: 7, champ: 2, side: 5 });
  const bad = JSON.parse(JSON.stringify(p)); bad.fees.items.individual.qty = 8; bad.fees.items.individual.amount = 280000;
  const r = Finance.checkSignupFees(bad, Store.defaultFinance());
  assert.ok(r.issues.some(w => w.includes('개인전 인원')) && r.issues.some(w => w.includes('총금액')), r.issues.join(' / '));
  const none = Finance.checkSignupFees({ ...p, fees: null }, Store.defaultFinance());
  assert.equal(none.issues.length, 1);
});

test('expectedFor: per-region expected amount uses only priced items', () => {
  const fees = Store.defaultFinance().fees;
  const e = Finance.expectedFor({ players: 10, champ: 1, side: 4 }, fees);
  assert.equal(e.total, 10 * 35000 + 10000 + 4 * 10000 + 110000 + 50000);
  assert.ok(!e.items.some(i => i.key === 'team5'), '단가 0 항목은 제외');
});

test('assignPrizes: ties split the prize money of the ranks they occupy', () => {
  const rows = [{ rank: 1 }, { rank: 2 }, { rank: 2 }, { rank: 4 }];
  Finance.assignPrizes(rows, [50000, 30000, 20000]);
  assert.deepEqual(rows.map(r => r.prize), [50000, 25000, 25000, 0]);
});

test('champRanking: only champ entrants, 3-game total, prizes by rank, outside-1조 warning', () => {
  const players = [
    { id: 'p1', name: 'A', regionId: 'r1', gender: 'M', group: 'A', handicap: 0, games: [200, 200, 200], events: { champ: true } },
    { id: 'p2', name: 'B', regionId: 'r1', gender: 'F', group: 'A', handicap: 15, games: [180, 180, 180], events: { champ: true } },
    { id: 'p3', name: 'C', regionId: 'r2', gender: 'M', group: 'A', handicap: 0, games: [150, 150, 150], events: { champ: true } },
    { id: 'p4', name: 'D', regionId: 'r2', gender: 'M', group: 'A', handicap: 0, games: [250, 250, 250], events: {} },
    { id: 'p5', name: 'E', regionId: 'r2', gender: 'M', group: 'B', handicap: 0, games: [null, null, null], events: { champ: true } },
  ];
  const st = mkState(players);
  const ch = Finance.champRanking(st);
  assert.equal(ch.participants, 4); assert.deepEqual(ch.outside, ['E']);
  assert.deepEqual(ch.rows.slice(0, 3).map(r => [r.name, r.rank, r.total, r.prize]), [['A', 1, 610, 50000], ['B', 2, 595, 30000], ['C', 3, 460, 20000]]);
  assert.equal(ch.prizeTotal, 100000);
  st.finance.pools.champ.basis = 'scratch';
  assert.deepEqual(Finance.champRanking(st).rows.slice(0, 2).map(r => r.name), ['A', 'B']);
});

test('sideGame: per group per game ranking with handicap, and statement includes prize expenses', () => {
  const players = [
    { id: 'p1', name: 'A', regionId: 'r1', gender: 'M', group: 'A', handicap: 0, games: [200, 150, null], events: { side: true } },
    { id: 'p2', name: 'B', regionId: 'r1', gender: 'F', group: 'A', handicap: 15, games: [190, 190, null], events: { side: true } },
    { id: 'p3', name: 'C', regionId: 'r2', gender: 'M', group: 'A', handicap: 0, games: [205, 100, null], events: {} },
    { id: 'p4', name: 'D', regionId: 'r2', gender: 'M', group: 'B', handicap: 0, games: [220, null, null], events: { side: true } },
  ];
  const st = mkState(players);
  const g1 = Finance.sideGame(st, 'A', 0);
  assert.deepEqual(g1.map(r => [r.name, r.poolScore, r.rank, r.prize]), [['B', 205, 1, 20000], ['A', 200, 2, 10000]]);
  const g2 = Finance.sideGame(st, 'A', 1);
  assert.deepEqual(g2.map(r => [r.name, r.rank, r.prize]), [['B', 1, 20000], ['A', 2, 10000]]);
  assert.deepEqual(Finance.sideGame(st, 'A', 2), []);
  const sd = Finance.sideSummary(st);
  assert.equal(sd.participants, 3); assert.equal(sd.paid, 60000 + 20000);
  const stm = Finance.statement(st);
  assert.equal(stm.prizeTotal, 80000);
  assert.equal(stm.feeTotal, 4 * 35000 + 3 * 10000 + 2 * 110000 + 2 * 50000);
  assert.equal(stm.balance, stm.feeTotal + stm.cashTotal - stm.gameTotal - stm.expTotal - stm.prizeTotal);
});
