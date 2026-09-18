/**
 * lanes.js - 조 편성 / 레인 배정 (순수 함수)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lanes = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

  /**
   * 개인전 조 편성: 지역별로 균등하게 각 조에 나눈다 (남/여도 고르게).
   * 반환: { playerId: groupId }
   */
  function assignGroups(players, groups) {
    const gids = (groups || []).map(g => g.id);
    if (!gids.length) return {};
    const result = {};
    const load = Object.fromEntries(gids.map(g => [g, 0]));
    const byRegion = new Map();
    players.forEach(p => { if (!byRegion.has(p.regionId)) byRegion.set(p.regionId, []); byRegion.get(p.regionId).push(p); });
    // 큰 지역부터, 지역 안에서는 성별 교차 + 에버 순으로 라운드로빈
    [...byRegion.values()].sort((a, b) => b.length - a.length).forEach(list => {
      const m = list.filter(p => p.gender !== 'F').sort((a, b) => num(b.avg) - num(a.avg));
      const f = list.filter(p => p.gender === 'F').sort((a, b) => num(b.avg) - num(a.avg));
      const ordered = []; while (m.length || f.length) { if (m.length) ordered.push(m.shift()); if (f.length) ordered.push(f.shift()); }
      // 이 지역의 시작 조는 현재 가장 적게 찬 조
      let start = gids.indexOf(gids.slice().sort((a, b) => load[a] - load[b])[0]);
      ordered.forEach((p, i) => { const g = gids[(start + i) % gids.length]; result[p.id] = g; load[g]++; });
    });
    return result;
  }

  /**
   * 한 조의 레인 배정.
   * players: 해당 조 선수, lanes: 사용할 레인 번호 배열, perLane: 레인당 인원
   * 같은 지역 선수가 같은 레인에 겹치지 않도록 우선 배치. 반환: { playerId: { lane, pos } }
   */
  function assignLanes(players, lanes, perLane) {
    perLane = Math.max(1, num(perLane, 4));
    const result = {};
    if (!lanes.length) return result;
    const slots = lanes.map(l => ({ lane: l, players: [] }));
    const byRegion = new Map();
    players.forEach(p => { if (!byRegion.has(p.regionId)) byRegion.set(p.regionId, []); byRegion.get(p.regionId).push(p); });
    const ordered = [...byRegion.values()].sort((a, b) => b.length - a.length).flat();
    ordered.forEach(p => {
      const open = slots.filter(s => s.players.length < perLane);
      const pool = open.length ? open : slots;
      const noSameRegion = pool.filter(s => !s.players.some(q => q.regionId === p.regionId));
      const cand = (noSameRegion.length ? noSameRegion : pool).sort((a, b) => a.players.length - b.players.length || a.lane - b.lane);
      cand[0].players.push(p);
    });
    slots.forEach(s => s.players.forEach((p, i) => { result[p.id] = { lane: s.lane, pos: i + 1 }; }));
    return result;
  }

  /** 필요한 레인 수 */
  function lanesNeeded(count, perLane) { return Math.ceil(count / Math.max(1, num(perLane, 4))); }

  /** 팀 종목 레인 배정: 팀을 레인에 순서대로(같은 지역 인접 회피는 단순 순환) */
  function assignTeamLanes(teams, lanes, teamsPerLane) {
    teamsPerLane = Math.max(1, num(teamsPerLane, 1));
    const result = {};
    if (!lanes.length) return result;
    const slots = lanes.map(l => ({ lane: l, teams: [] }));
    const byRegion = new Map();
    teams.forEach(t => { if (!byRegion.has(t.regionId)) byRegion.set(t.regionId, []); byRegion.get(t.regionId).push(t); });
    const queues = [...byRegion.values()];
    const ordered = []; let more = true;
    while (more) { more = false; queues.forEach(q => { if (q.length) { ordered.push(q.shift()); more = true; } }); }
    ordered.forEach(t => {
      const open = slots.filter(s => s.teams.length < teamsPerLane);
      const pool = open.length ? open : slots;
      const noSame = pool.filter(s => !s.teams.some(x => x.regionId === t.regionId));
      const cand = (noSame.length ? noSame : pool).sort((a, b) => a.teams.length - b.teams.length || a.lane - b.lane);
      cand[0].teams.push(t);
    });
    slots.forEach(s => s.teams.forEach(t => { result[t.id] = s.lane; }));
    return result;
  }

  function laneRange(from, count) { const out = []; for (let i = 0; i < count; i++) out.push(num(from, 1) + i); return out; }

  return { assignGroups, assignLanes, assignTeamLanes, lanesNeeded, laneRange };
});
