const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/ranking.js');

const regions = [{ id: 'r1', name: '서울' }, { id: 'r2', name: '부산' }, { id: 'r3', name: '대구' }];
const settings = R.mergeSettings({ repCount: 2, groups: [{ id: 'A', name: '1조', bonus: 0 }, { id: 'B', name: '2조', bonus: 0 }] });
// 핸디는 관리자 입력값(게임당). 총점 = 스크래치 + 핸디×게임수 + 가감
const players = [
  { id: 'p1', name: '김철수', regionId: 'r1', gender: 'M', handicap: 8, isRep: true, games: [200, 190, 210], birthYear: 1970 },  // 600+24 = 624
  { id: 'p2', name: '이영희', regionId: 'r1', gender: 'F', handicap: 40, isRep: true, games: [150, 160, 170] },                  // 480+120 = 600
  { id: 'p3', name: '박민수', regionId: 'r2', gender: 'M', handicap: 0, isRep: true, games: [208, 208, 208], birthYear: 1980 },  // 624
  { id: 'p4', name: '최지우', regionId: 'r2', gender: 'F', handicap: 56, isRep: true, games: [130, 140, null] },                 // 270+112 = 382
  { id: 'p5', name: '정대구', regionId: 'r3', gender: 'M', handicap: 24, isRep: false, games: [180, 180, 180] },                 // 540+72 = 612
  { id: 'p6', name: '한수지', regionId: 'r3', gender: 'F', handicap: 48, isRep: true, games: [140, 150, 160] }                   // 450+144 = 594
];
const teams = [
  { id: 't1', event: 'scotch', regionId: 'r1', members: ['p1', 'p2'], handicap: 24, games: [180, 190] }, // 370+48 = 418
  { id: 't2', event: 'scotch', regionId: 'r2', members: ['p3', 'p4'], handicap: 28, games: [200, 170] }, // 370+56 = 426
  { id: 't3', event: 'baker', regionId: 'r3', members: ['p5', 'p6'], handicap: 3, games: [150, 150] }    // invalid size (2 of 3)
];

test('manual handicap, group bonus and total adjustment', () => {
  const s = R.mergeSettings({ groups: [{ id: 'A', name: '1조', bonus: 10 }, { id: 'B', name: '2조', bonus: 0 }] });
  assert.equal(R.playerHandicap({ handicap: 15, group: 'A' }, s), 25);
  assert.equal(R.playerHandicap({ handicap: 15, group: 'B' }, s), 15);
  assert.equal(R.playerHandicap({ handicap: 15, group: '' }, s), 15);
  const rows = R.playerRows([{ id: 'x', name: 'X', gender: 'M', handicap: 5, group: 'A', adjust: -21, games: [200, 200, 200] }, { id: 'y', name: 'Y', gender: 'M', handicap: 5, group: 'A', adjust: -21, games: [null, null, null] }], regions, s);
  assert.equal(rows[0].handicap, 15);
  assert.equal(rows[0].total, 600 + 45 - 21);
  assert.equal(rows[1].total, 0); // 미입력 선수는 가감 미적용
  const tr = R.teamRows([{ id: 't', event: 'baker', regionId: 'r1', members: [], handicap: 5, adjust: -3, games: [100, 100] }], 'baker', [], regions, s)[0];
  assert.equal(tr.total, 200 + 10 - 3);
});

test('mergeSettings fills defaults, keeps overrides, migrates old points', () => {
  const s = R.mergeSettings({ points: { scotch: [9] }, basis: 'scratch' });
  assert.deepEqual(s.points.scotch, [9]);
  assert.deepEqual(s.points.baker, [3, 2, 1]);
  assert.deepEqual(s.points.individualM, [5, 4, 3, 2, 1]);
  assert.deepEqual(s.points.individualF, [3, 2, 1]);
  assert.deepEqual(s.points.reps, [3, 2, 1]);
  assert.equal(s.basis, 'scratch');
  assert.equal(s.groups.length, 3);
  const old = R.mergeSettings({ points: { individual: [7, 6] } });
  assert.deepEqual(old.points.individualM, [7, 6]);
  assert.deepEqual(old.points.individualF, [7, 6]);
  assert.equal(old.points.individual, undefined);
});

test('individual ranking by gender with tiebreak and shared ranks', () => {
  const rows = R.playerRows(players, regions, settings);
  const male = R.individualRanking(rows, r => r.gender === 'M');
  assert.deepEqual(male.map(r => [r.name, r.total, r.rank]), [['박민수', 624, 1], ['김철수', 624, 2], ['정대구', 612, 3]]);
  const female = R.individualRanking(rows, r => r.gender === 'F');
  assert.deepEqual(female.map(r => r.name), ['이영희', '한수지', '최지우']);
  assert.equal(female[2].gamesPlayed, 2);
  // 완전 동점 → 공동 순위
  const tie = R.individualRanking(R.playerRows([{ id: 'a', name: 'A', gender: 'M', games: [200] }, { id: 'b', name: 'B', gender: 'M', games: [200] }, { id: 'c', name: 'C', gender: 'M', games: [100] }], regions, { games: { individual: 1 } }));
  assert.deepEqual(tie.map(r => r.rank), [1, 1, 3]);
});

test('tiebreak order: scratch → high → low → older', () => {
  const mk = (id, handicap, games, birthYear) => ({ id, name: id, gender: 'M', handicap, games, birthYear });
  // 모두 총점 630
  const rows = R.playerRows([
    mk('a', 10, [200, 200, 200], 1980),   // scratch 600
    mk('b', 0, [230, 200, 200], 1980),    // scratch 630, high 230
    mk('c', 0, [220, 210, 200], 1980),    // scratch 630, high 220, low 200
    mk('d', 0, [220, 205, 205], 1975),    // scratch 630, high 220, low 205, older
    mk('e', 0, [220, 205, 205], 1985)     // same as d, younger
  ], regions, settings);
  const r = R.individualRanking(rows);
  assert.deepEqual(r.map(x => x.name), ['b', 'd', 'e', 'c', 'a']);
  assert.deepEqual(r.map(x => x.rank), [1, 2, 3, 4, 5]);
});

test('scratch basis changes ordering', () => {
  const rows = R.playerRows(players, regions, { ...settings, basis: 'scratch' });
  const male = R.individualRanking(rows, r => r.gender === 'M');
  assert.deepEqual(male.map(r => r.name), ['박민수', '김철수', '정대구']);
  assert.equal(male[0].score, 624);
  assert.equal(male[1].score, 600);
});

test('team rows: manual handicap and validity', () => {
  const rows = R.playerRows(players, regions, settings);
  const scotch = R.teamRanking(R.teamRows(teams, 'scotch', rows, regions, settings));
  assert.deepEqual(scotch.map(r => [r.regionName, r.handicap, r.total, r.rank]), [['부산', 28, 426, 1], ['서울', 24, 418, 2]]);
  const baker = R.teamRows(teams, 'baker', rows, regions, settings);
  assert.equal(baker[0].valid, false);
  assert.equal(baker[0].total, 300 + 6);
});

test('rep ranking sums designated reps and flags short/over', () => {
  const rows = R.playerRows(players, regions, settings);
  const reps = R.repRanking(rows, regions, settings);
  // 서울 624+600=1224, 부산 624+382=1006, 대구 594 (1명, short)
  assert.deepEqual(reps.map(r => [r.regionName, r.score, r.rank, r.short]), [['서울', 1224, 1, false], ['부산', 1006, 2, false], ['대구', 594, 3, true]]);
});

test('region standings: points from every event with the official table', () => {
  const res = R.regionStandings({ settings, regions, players, teams });
  const by = Object.fromEntries(res.standings.map(r => [r.regionName, r]));
  // 남자(5/4/3/2/1): 박민수1(5) 김철수2(4) 정대구3(3) / 여자(3/2/1): 이영희1(3) 한수지2(2) 최지우3(1)
  // 3인조(3/2/1): 서울1(3) 부산2(2) 대구3(1) / 스카치: 부산1(3) 서울2(2) / 베이커: 대구1(3)
  assert.equal(by['서울'].male, 4); assert.equal(by['서울'].female, 3); assert.equal(by['서울'].reps, 3); assert.equal(by['서울'].scotch, 2);
  assert.equal(by['서울'].total, 12);
  assert.equal(by['부산'].total, 5 + 1 + 2 + 3);
  assert.equal(by['대구'].total, 3 + 2 + 1 + 3);
  assert.deepEqual(res.standings.map(r => [r.regionName, r.rank]), [['서울', 1], ['부산', 2], ['대구', 3]]);
  assert.equal(by['서울'].details.length, 4);
  assert.equal(by['서울'].team5, undefined);
});

test('male points reach 5th place, female stop at 3rd', () => {
  const many = [];
  for (let i = 0; i < 6; i++) { many.push({ id: 'm' + i, name: 'M' + i, regionId: 'r' + ((i % 3) + 1), gender: 'M', games: [200 - i] }); many.push({ id: 'f' + i, name: 'F' + i, regionId: 'r' + ((i % 3) + 1), gender: 'F', games: [200 - i] }); }
  const res = R.regionStandings({ settings: { ...settings, games: { individual: 1 } }, regions, players: many, teams: [] });
  const by = Object.fromEntries(res.standings.map(r => [r.regionName, r]));
  // 남자 1~6위 지역: r1 r2 r3 r1 r2 r3 → r1: 5+2, r2: 4+1, r3: 3+0 / 여자: r1: 3, r2: 2, r3: 1
  assert.equal(by['서울'].male, 7); assert.equal(by['부산'].male, 5); assert.equal(by['대구'].male, 3);
  assert.equal(by['서울'].female, 3); assert.equal(by['부산'].female, 2); assert.equal(by['대구'].female, 1);
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
  assert.equal(p.team5, undefined);
});
