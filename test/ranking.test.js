const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/ranking.js');

const regions = [{ id: 'r1', name: '서울' }, { id: 'r2', name: '부산' }, { id: 'r3', name: '대구' }];
const settings = R.mergeSettings({ handicap: { type: 'diff', base: 200, rate: 0.8, cap: 60, femaleBonus: 8 }, repCount: 2 });
const players = [
  { id: 'p1', name: '김철수', regionId: 'r1', gender: 'M', avg: 190, isRep: true, games: [200, 190, 210] },  // hcp 8  -> 600+24 = 624
  { id: 'p2', name: '이영희', regionId: 'r1', gender: 'F', avg: 160, isRep: true, games: [150, 160, 170] },  // hcp 40 -> 480+120 = 600
  { id: 'p3', name: '박민수', regionId: 'r2', gender: 'M', avg: 200, isRep: true, games: [208, 208, 208] },  // hcp 0  -> 624
  { id: 'p4', name: '최지우', regionId: 'r2', gender: 'F', avg: 140, isRep: true, games: [130, 140, null] }, // hcp 56 -> 270+112 = 382
  { id: 'p5', name: '정대구', regionId: 'r3', gender: 'M', avg: 170, isRep: false, games: [180, 180, 180] },  // hcp 24 -> 540+72 = 612
  { id: 'p6', name: '한수지', regionId: 'r3', gender: 'F', avg: 150, isRep: true, games: [140, 150, 160] }    // hcp 48 -> 450+144 = 594
];
const teams = [
  { id: 't1', event: 'scotch', regionId: 'r1', members: ['p1', 'p2'], games: [180, 190] }, // hcp avg(8,40)=24 -> 370+48 = 418
  { id: 't2', event: 'scotch', regionId: 'r2', members: ['p3', 'p4'], games: [200, 170] }, // hcp avg(0,56)=28 -> 370+56 = 426
  { id: 't3', event: 'baker', regionId: 'r3', members: ['p5', 'p6'], games: [150, 150] },   // invalid size (2 of 3)
  { id: 't4', event: 'team5', regionId: 'r1', members: ['p1'], games: [900] }
];

test('handicap rule', () => {
  assert.equal(R.calcHandicap(190, 'M', settings.handicap), 8);
  assert.equal(R.calcHandicap(160, 'F', settings.handicap), 40);
  assert.equal(R.calcHandicap(100, 'M', settings.handicap), 60);
  assert.equal(R.calcHandicap(210, 'M', settings.handicap), 0);
  assert.equal(R.calcHandicap(150, 'M', { type: 'none' }), 0);
  assert.equal(R.playerHandicap({ avg: 150, gender: 'M', handicapOverride: 12 }, settings.handicap), 12);
});

test('mergeSettings fills defaults and keeps overrides', () => {
  const s = R.mergeSettings({ points: { scotch: [9] }, basis: 'scratch' });
  assert.deepEqual(s.points.scotch, [9]);
  assert.deepEqual(s.points.baker, [3, 2, 1]);
  assert.equal(s.basis, 'scratch');
  assert.equal(s.groups.length, 3);
});

test('individual ranking by gender with tiebreak and shared ranks', () => {
  const rows = R.playerRows(players, regions, settings);
  const male = R.individualRanking(rows, r => r.gender === 'M');
  assert.deepEqual(male.map(r => [r.name, r.total, r.rank]), [['박민수', 624, 1], ['김철수', 624, 2], ['정대구', 612, 3]]);
  const female = R.individualRanking(rows, r => r.gender === 'F');
  assert.deepEqual(female.map(r => r.name), ['이영희', '한수지', '최지우']);
  assert.equal(female[2].gamesPlayed, 2);
  // 완전 동점 → 공동 순위
  const tie = R.individualRanking(R.playerRows([{ id: 'a', name: 'A', gender: 'M', avg: 200, games: [200] }, { id: 'b', name: 'B', gender: 'M', avg: 200, games: [200] }, { id: 'c', name: 'C', gender: 'M', avg: 200, games: [100] }], regions, { games: { individual: 1 } }));
  assert.deepEqual(tie.map(r => r.rank), [1, 1, 3]);
});

test('scratch basis changes ordering', () => {
  const rows = R.playerRows(players, regions, { ...settings, basis: 'scratch' });
  const male = R.individualRanking(rows, r => r.gender === 'M');
  assert.deepEqual(male.map(r => r.name), ['박민수', '김철수', '정대구']);
  assert.equal(male[0].score, 624);
  assert.equal(male[1].score, 600);
});

test('team rows: handicap modes and validity', () => {
  const rows = R.playerRows(players, regions, settings);
  const scotch = R.teamRanking(R.teamRows(teams, 'scotch', rows, regions, settings));
  assert.deepEqual(scotch.map(r => [r.regionName, r.handicap, r.total, r.rank]), [['부산', 28, 426, 1], ['서울', 24, 418, 2]]);
  const sum = R.teamRows(teams, 'scotch', rows, regions, { ...settings, teamHandicap: { scotch: 'sum' } });
  assert.equal(sum.find(t => t.teamId === 't1').handicap, 48);
  const none = R.teamRows(teams, 'scotch', rows, regions, { ...settings, teamHandicap: { scotch: 'none' } });
  assert.equal(none[0].handicap, 0);
  const baker = R.teamRows(teams, 'baker', rows, regions, settings);
  assert.equal(baker[0].valid, false);
  const t5 = R.teamRows(teams, 'team5', rows, regions, settings);
  assert.equal(t5[0].handicap, 0);
  assert.equal(t5[0].total, 900);
});

test('rep ranking sums designated reps and flags short/over', () => {
  const rows = R.playerRows(players, regions, settings);
  const reps = R.repRanking(rows, regions, settings);
  // 서울 624+600=1224, 부산 624+382=1006, 대구 594 (1명, short)
  assert.deepEqual(reps.map(r => [r.regionName, r.score, r.rank, r.short]), [['서울', 1224, 1, false], ['부산', 1006, 2, false], ['대구', 594, 3, true]]);
});

test('region standings: points from every event', () => {
  const res = R.regionStandings({ settings, regions, players, teams });
  const by = Object.fromEntries(res.standings.map(r => [r.regionName, r]));
  // 남자: 박민수1(5) 김철수2(4) 정대구3(3) / 여자: 이영희1(5) 한수지2(4) 최지우3(3)
  // 대표: 서울1(5) 부산2(4) 대구3(3) / 스카치: 부산1(3) 서울2(2) / 베이커: 대구1(3)
  assert.equal(by['서울'].male, 4); assert.equal(by['서울'].female, 5); assert.equal(by['서울'].reps, 5); assert.equal(by['서울'].scotch, 2);
  assert.equal(by['서울'].total, 16);
  assert.equal(by['부산'].total, 5 + 3 + 4 + 3);
  assert.equal(by['대구'].total, 3 + 4 + 3 + 3);
  assert.deepEqual(res.standings.map(r => [r.regionName, r.rank]), [['서울', 1], ['부산', 2], ['대구', 3]]);
  assert.equal(by['서울'].details.length, 4);
  assert.equal(by['서울'].team5, 0); // 5인조는 기본 미반영
});

test('team5 counts only when enabled', () => {
  const res = R.regionStandings({ settings: { ...settings, countTeam5: true, points: { ...settings.points, team5: [7] } }, regions, players, teams });
  assert.equal(res.standings.find(r => r.regionName === '서울').team5, 7);
});

test('resultsOf uses snapshot when final', () => {
  const snap = { standings: [{ regionName: 'X', rank: 1 }] };
  assert.equal(R.resultsOf({ settings: { ...settings, status: 'final' }, results: snap, regions, players, teams }), snap);
  assert.notEqual(R.resultsOf({ settings, results: snap, regions, players, teams }), snap);
});

test('progress counts completed inputs', () => {
  const p = R.progress({ settings, regions, players, teams });
  assert.deepEqual(p.individual, { total: 6, done: 5 });
  assert.deepEqual(p.scotch, { total: 2, done: 2 });
  assert.deepEqual(p.team5, { total: 1, done: 1 });
});
