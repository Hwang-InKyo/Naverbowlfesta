const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/lanes.js');

function mk(n, regions) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: 'p' + i, regionId: regions[i % regions.length], gender: i % 3 === 0 ? 'F' : 'M', avg: 150 + (i * 7) % 60 });
  return out;
}
const groups = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

test('assignGroups splits every region evenly across groups', () => {
  const players = mk(60, ['r1', 'r2', 'r3', 'r4', 'r5']);
  const g = L.assignGroups(players, groups);
  assert.equal(Object.keys(g).length, 60);
  const count = {};
  players.forEach(p => { const k = p.regionId + '/' + g[p.id]; count[k] = (count[k] || 0) + 1; });
  Object.values(count).forEach(c => assert.equal(c, 4)); // 12명 지역 → 조당 4명
  const perGroup = {};
  players.forEach(p => { perGroup[g[p.id]] = (perGroup[g[p.id]] || 0) + 1; });
  assert.deepEqual(Object.values(perGroup), [20, 20, 20]);
});

test('assignGroups balances uneven regions', () => {
  const players = mk(10, ['r1', 'r1', 'r1', 'r1', 'r2']); // r1: 8명, r2: 2명
  const g = L.assignGroups(players, groups);
  const perGroup = {}; players.forEach(p => { perGroup[g[p.id]] = (perGroup[g[p.id]] || 0) + 1; });
  const vals = Object.values(perGroup).sort();
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, JSON.stringify(perGroup));
});

test('assignLanes fills lanes up to perLane and avoids same-region lanes when possible', () => {
  const players = mk(20, ['r1', 'r2', 'r3', 'r4', 'r5']);
  const lanes = L.laneRange(1, 5);
  const a = L.assignLanes(players, lanes, 4);
  assert.equal(Object.keys(a).length, 20);
  const byLane = {};
  players.forEach(p => { const k = a[p.id].lane; byLane[k] = byLane[k] || []; byLane[k].push(p.regionId); });
  Object.values(byLane).forEach(list => { assert.equal(list.length, 4); assert.equal(new Set(list).size, 4); });
  // positions 1..4 unique per lane
  const pos = {}; players.forEach(p => { const k = a[p.id].lane + ':' + a[p.id].pos; assert.ok(!pos[k]); pos[k] = 1; });
});

test('assignLanes overflows gracefully when lanes are short', () => {
  const players = mk(9, ['r1', 'r2']);
  const a = L.assignLanes(players, L.laneRange(3, 2), 4);
  assert.equal(Object.keys(a).length, 9);
  const lanesUsed = new Set(Object.values(a).map(x => x.lane));
  assert.deepEqual([...lanesUsed].sort(), [3, 4]);
  assert.equal(L.lanesNeeded(9, 4), 3);
});

test('assignTeamLanes interleaves regions', () => {
  const teams = [{ id: 'a', regionId: 'r1' }, { id: 'b', regionId: 'r1' }, { id: 'c', regionId: 'r2' }, { id: 'd', regionId: 'r2' }];
  const a = L.assignTeamLanes(teams, [1, 2], 2);
  assert.equal(Object.keys(a).length, 4);
  assert.notEqual(a.a, a.b); // 같은 지역 두 팀은 다른 레인
  assert.notEqual(a.c, a.d);
});
