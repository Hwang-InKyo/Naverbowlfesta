const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/ranking.js');

const clubs = [
  { id: 'c1', name: '서울' }, { id: 'c2', name: '부산' }
];
const members = [
  { id: 'm1', name: '김철수', clubId: 'c1', gender: 'M', avg: 190 },
  { id: 'm2', name: '이영희', clubId: 'c1', gender: 'F', avg: 160 },
  { id: 'm3', name: '박민수', clubId: 'c2', gender: 'M', avg: 200 },
  { id: 'm4', name: '최지우', clubId: 'c2', gender: 'F', avg: 140 }
];
const rule = { type: 'diff', base: 200, rate: 0.8, cap: 60, femaleBonus: 8 };

test('calcHandicap: diff rule, cap and female bonus', () => {
  assert.equal(R.calcHandicap(190, 'M', rule), 8);        // (200-190)*0.8 = 8
  assert.equal(R.calcHandicap(160, 'F', rule), 40);       // 32 + 8
  assert.equal(R.calcHandicap(140, 'F', rule), 56);       // 48 + 8
  assert.equal(R.calcHandicap(100, 'M', rule), 60);       // capped
  assert.equal(R.calcHandicap(100, 'F', rule), 68);       // cap applies before bonus
  assert.equal(R.calcHandicap(210, 'M', rule), 0);        // no negative handicap
  assert.equal(R.calcHandicap(191, 'M', rule), 7);        // 7.2 -> floor
  assert.equal(R.calcHandicap(150, 'M', { type: 'none' }), 0);
  assert.equal(R.calcHandicap(150, 'M', { type: 'diff', base: 200 }), 50); // rate defaults to 1
});

test('assignDivision picks the highest matching band', () => {
  const divs = [{ name: 'C', min: 0 }, { name: 'A', min: 180 }, { name: 'B', min: 160 }];
  assert.equal(R.assignDivision(185, divs), 'A');
  assert.equal(R.assignDivision(180, divs), 'A');
  assert.equal(R.assignDivision(170, divs), 'B');
  assert.equal(R.assignDivision(120, divs), 'C');
  assert.equal(R.assignDivision(120, []), '');
});

test('individualRanking: totals, tiebreak and ranks', () => {
  const t = {
    numGames: 3, handicap: rule,
    entries: [
      { memberId: 'm1', games: [200, 190, 210] },          // scratch 600 + 8*3 = 624
      { memberId: 'm2', games: [150, 160, 170] },          // 480 + 40*3 = 600
      { memberId: 'm3', games: [208, 208, 208] },          // 624 + 0   = 624 -> tie with m1 on total; scratch 624 > 600 -> m3 first
      { memberId: 'm4', games: [130, 140, null] }          // 270 + 56*2 = 382 (2 games)
    ]
  };
  const rows = R.individualRanking(t, members, clubs);
  assert.deepEqual(rows.map(r => r.name), ['박민수', '김철수', '이영희', '최지우']);
  assert.deepEqual(rows.map(r => r.rank), [1, 2, 3, 4]);
  assert.equal(rows[0].total, 624);
  assert.equal(rows[1].total, 624);
  assert.equal(rows[3].gamesPlayed, 2);
  assert.equal(rows[3].total, 382);
  assert.equal(rows[3].high, 140);
});

test('identical rows share a rank and the next rank is skipped', () => {
  const t = {
    numGames: 1, handicap: { type: 'none' },
    entries: [
      { memberId: 'm1', games: [200] }, { memberId: 'm3', games: [200] }, { memberId: 'm2', games: [150] }
    ]
  };
  const rows = R.individualRanking(t, members, clubs);
  assert.deepEqual(rows.map(r => r.rank), [1, 1, 3]);
});

test('entry snapshot avg / handicap override win over member record', () => {
  const t = { numGames: 1, handicap: rule, entries: [
    { memberId: 'm1', avg: 150, games: [100] },              // handicap 40 from snapshot avg
    { memberId: 'm3', handicapOverride: 15, games: [100] }
  ] };
  const rows = R.buildRows(t, members, clubs);
  assert.equal(rows[0].handicap, 40);
  assert.equal(rows[1].handicap, 15);
});

test('clubRanking sums top N and flags short rosters', () => {
  const t = { numGames: 1, handicap: { type: 'none' }, clubScoring: { topN: 1 }, entries: [
    { memberId: 'm1', games: [180] }, { memberId: 'm2', games: [170] },
    { memberId: 'm3', games: [175] }, { memberId: 'm4', games: [120] }
  ] };
  const res = R.computeResults(t, members, clubs);
  assert.deepEqual(res.club.map(c => [c.clubName, c.total, c.rank, c.short]), [['서울', 180, 1, false], ['부산', 175, 2, false]]);
  const res2 = R.computeResults({ ...t, clubScoring: { topN: 3 } }, members, clubs);
  assert.equal(res2.club[0].clubName, '서울');
  assert.equal(res2.club[0].total, 350);
  assert.equal(res2.club[0].short, true);
});

test('gender sub-rankings and high game', () => {
  const t = { numGames: 2, handicap: rule, entries: [
    { memberId: 'm1', games: [180, 220] }, { memberId: 'm2', games: [170, 150] },
    { memberId: 'm3', games: [200, 190] }, { memberId: 'm4', games: [120, 130] }
  ] };
  const res = R.computeResults(t, members, clubs);
  assert.deepEqual(res.female.map(r => [r.name, r.rank]), [['이영희', 1], ['최지우', 2]]);
  assert.deepEqual(res.male.map(r => r.name), ['김철수', '박민수']);
  assert.equal(res.highGame[0].name, '김철수');
  assert.equal(res.highGame[0].high, 220);
});

test('season ranking uses only final tournaments and awards points', () => {
  const base = { numGames: 1, handicap: { type: 'none' } };
  const t1 = { ...base, id: 't1', date: '2026-03-01', status: 'final', entries: [{ memberId: 'm1', games: [200] }, { memberId: 'm3', games: [190] }] };
  const t2 = { ...base, id: 't2', date: '2026-06-01', status: 'final', entries: [{ memberId: 'm1', games: [150] }, { memberId: 'm3', games: [190] }] };
  const t3 = { ...base, id: 't3', date: '2026-09-01', status: 'live', entries: [{ memberId: 'm3', games: [300] }] };
  const t4 = { ...base, id: 't4', date: '2025-09-01', status: 'final', entries: [{ memberId: 'm3', games: [300] }] };
  const s = R.seasonRanking([t1, t2, t3, t4], members, clubs, 2026);
  assert.deepEqual(s.map(r => [r.name, r.points, r.rank, r.wins]), [['박민수', 18, 1, 1], ['김철수', 18, 2, 1]]);
  assert.equal(R.pointsForRank(1), 10);
  assert.equal(R.pointsForRank(9), 1);
  assert.equal(R.pointsForRank(2, [5, 3]), 3);
  assert.equal(R.pointsForRank(0), 0);
});

test('final tournaments use stored results snapshot', () => {
  const t = { id: 't', numGames: 1, status: 'final', handicap: { type: 'none' },
    entries: [{ memberId: 'm1', games: [100] }],
    results: { individual: [{ memberId: 'm1', name: '김철수', rank: 7, total: 999, scratch: 999, gamesPlayed: 1, games: [999], high: 999, avgGame: 999, gender: 'M', clubId: 'c1', handicap: 0 }], male: [{ memberId: 'm1', rank: 7 }], female: [], club: [], highGame: [], divisions: {} } };
  const h = R.memberHistory('m1', [t], members, clubs);
  assert.equal(h[0].rank, 7);
  assert.equal(h[0].total, 999);
});

test('memberHistory and memberStats', () => {
  const rule0 = { type: 'none' };
  const t1 = { id: 't1', name: 'A', date: '2026-03-01', status: 'final', numGames: 2, handicap: rule0, entries: [{ memberId: 'm1', games: [200, 180] }, { memberId: 'm3', games: [150, 150] }] };
  const t2 = { id: 't2', name: 'B', date: '2026-05-01', status: 'final', numGames: 2, handicap: rule0, entries: [{ memberId: 'm1', games: [120, 130] }, { memberId: 'm3', games: [150, 150] }] };
  const h = R.memberHistory('m1', [t1, t2], members, clubs);
  assert.equal(h.length, 2);
  assert.equal(h[0].name, 'B'); // newest first
  assert.equal(h[0].rank, 2);
  assert.equal(h[1].rank, 1);
  assert.equal(h[1].clubRank, 1);
  assert.equal(h[1].genderRank, 1);
  const s = R.memberStats(h);
  assert.equal(s.tournaments, 2);
  assert.equal(s.games, 4);
  assert.equal(s.avgGame, 157.5);
  assert.equal(s.high, 200);
  assert.equal(s.low, 120);
  assert.equal(s.bestRank, 1);
  assert.equal(s.wins, 1);
  assert.equal(s.podiums, 2);
  assert.equal(s.points, 18);
});
