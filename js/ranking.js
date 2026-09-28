/**
 * ranking.js - 대회 순위 집계 엔진 (순수 함수, 브라우저/Node 공용)
 *
 * 종목
 *  - individual : 개인전 3게임 (남/여 각각 순위)
 *  - scotch     : 스카치 더블 (남1 여1, 2게임)
 *  - baker      : 베이커 (3인, 2게임)
 *
 * 핸디: 규정 계산 없이 관리자가 선수별(게임당)·팀별(게임당)로 직접 입력한다.
 *       게임당 핸디(여성·시니어·프로 등)는 매 게임 적용: 핸디 × 친 게임 수.
 *       조 보너스(예: 1조 +10)는 설정의 groups[].bonus 로, 총점에 한 번만 가산.
 *       총점 가감(adjust)도 한 번만 가산.
 *       총점 = 총핀 + 핸디×게임수 + 조 보너스 + 가감
 *       scoresIncludeHandicap[종목] = true 이면 입력 점수에 게임당 핸디가 이미 포함된 것으로 보고
 *       (볼링장 시스템이 핸디를 미리 적용해 출력하는 경우) 핸디를 다시 더하지 않고, 총핀 = 입력값 − 핸디.
 * 동점: 총점 → 총핀(비핸디) → 하이게임 → 로우게임 → 연장자(생년 빠른 순)
 *
 * 지역 종합 포인트 (기본 배점)
 *  - 개인전 남자 상위 5명: 5·4·3·2·1 / 개인전 여자 상위 3명: 3·2·1
 *  - 3인조: 지역 대표(repCount명) 개인전 점수 합계 → 지역 순위 3·2·1
 *  - 스카치 / 베이커 상위 3팀: 3·2·1
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ranking = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const EVENTS = {
    individual: { key: 'individual', name: '개인전', games: 3, size: 1 },
    scotch: { key: 'scotch', name: '스카치 더블', games: 2, size: 2 },
    baker: { key: 'baker', name: '베이커', games: 2, size: 3 }
  };

  const DEFAULT_SETTINGS = {
    name: '전국대회', venue: '', dates: ['', ''], lanes: 20, tableFrom: 1,
    status: 'ready', // ready | live | final
    basis: 'total',              // 개인전 순위 기준: total(핸디 포함) | scratch
    games: { individual: 3, scotch: 2, baker: 2 },
    scoresIncludeHandicap: { individual: false, scotch: false, baker: false }, // 입력 점수에 게임당 핸디 포함 여부
    groups: [{ id: 'A', name: '1조', day: 1, time: '', bonus: 10 }, { id: 'B', name: '2조', day: 1, time: '', bonus: 0 }, { id: 'C', name: '3조', day: 2, time: '', bonus: 0 }],
    rulesNote: '개인전: 1인 3게임 총점, 매 게임 우측 4테이블 이동. 남자 1~5위, 여자 1~5위 시상.\n동점: 비핸디 → 하이/로우 → 연장자 순.\n1조(일요일 첫 경기) 총점 +10점 (1회).\n핸디(개인전, 매 게임 적용): 여성 15, 시니어(만 60세 이상) 연도별 1~5점, 최고 20점. 장애인 4급 이상 7점(사전 통보).\n스카치: 팀당 2게임, 남녀 2인(여자 초구), 여자 회원 없는 클럽 제외. 장애인 +3/게임. 1~3위 시상.\n베이커: 팀당 2게임, 여자 1명 +3, 여자 2명 이상 +5, 장애인 +3 (게임당). 1~3위 시상.\n감점: 클럽티 미착용 -10/게임, 복장 불이행 -5/게임. 프로: 개인전 총점 -21, 스카치·베이커 -3/게임.',
    perTable: 4,                 // 테이블(좌우 2레인)당 인원
    repCount: 3,
    points: { individualM: [5, 4, 3, 2, 1], individualF: [3, 2, 1], reps: [3, 2, 1], scotch: [3, 2, 1], baker: [3, 2, 1] }
  };

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function mergeSettings(s) {
    const d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!s) return d;
    const out = { ...d, ...s };
    ['games', 'points', 'scoresIncludeHandicap'].forEach(k => { out[k] = { ...d[k], ...(s[k] || {}) }; });
    delete out.handicap; delete out.teamHandicap;
    // 이전 형식(레인 단위) 호환
    if (s.perLane != null && s.perTable == null) out.perTable = s.perLane;
    if (s.laneFrom != null && s.tableFrom == null) out.tableFrom = s.laneFrom;
    delete out.perLane; delete out.laneFrom;
    // 이전 형식(points.individual 하나) 호환
    if (s.points && s.points.individual && !s.points.individualM) { out.points.individualM = s.points.individual; if (!s.points.individualF) out.points.individualF = s.points.individual; }
    delete out.points.individual; delete out.points.team5; delete out.countTeam5;
    if (!Array.isArray(out.groups) || !out.groups.length) out.groups = d.groups;
    return out;
  }

  /** 조 보너스 (게임당) */
  function groupBonus(groupId, settings) {
    const g = (settings.groups || []).find(x => x.id === groupId);
    return g ? num(g.bonus) : 0;
  }

  /** 게임당 개인 핸디 (관리자 입력값). 조 보너스는 총점에 1회 가산되므로 여기 포함하지 않는다 */
  function playerHandicap(p) { return num(p.handicap); }

  function makeComparator(keys, nameKey) {
    nameKey = nameKey || (r => r.name);
    const cmp = (a, b) => { for (const k of keys) { const d = num(k(b)) - num(k(a)); if (d) return d; } return 0; };
    const sortCmp = (a, b) => cmp(a, b) || String(nameKey(a)).localeCompare(String(nameKey(b)), 'ko');
    sortCmp.tie = cmp;
    return sortCmp;
  }

  /** 정렬 + 순위 부여 (완전 동점은 공동 순위, 다음 순위 건너뜀) */
  function assignRanks(rows, cmp) {
    const tie = cmp.tie || cmp;
    rows.sort(cmp);
    let rank = 0;
    rows.forEach((r, i) => { if (i === 0 || tie(rows[i - 1], r) !== 0) rank = i + 1; r.rank = rank; });
    return rows;
  }

  /**
   * 게임 통계. included=true 이면 입력값에 게임당 핸디(hcp)가 포함된 것으로 보고 총핀·하이·로우는 핸디를 뺀 값으로 계산한다.
   * games 배열(표시용)은 입력값 그대로 둔다.
   */
  function gameStats(games, n, included, hcp) {
    const arr = [];
    for (let i = 0; i < n; i++) { const g = (games || [])[i]; arr.push(g === '' || g == null ? null : num(g)); }
    const played = arr.filter(g => g != null);
    const off = included ? num(hcp) : 0;
    const sc = played.map(g => g - off);
    const scratch = sc.reduce((s, g) => s + g, 0);
    return { games: arr, gamesPlayed: played.length, entered: played.reduce((s, g) => s + g, 0), scratch, high: sc.length ? Math.max(...sc) : 0, low: sc.length ? Math.min(...sc) : 0, lastGame: sc.length ? sc[sc.length - 1] : 0 };
  }

  // ===== 개인전 =====
  function playerRows(players, regions, settings) {
    const s = mergeSettings(settings);
    const rMap = new Map((regions || []).map(r => [r.id, r]));
    const n = num(s.games.individual, 3);
    return (players || []).map(p => {
      const handicap = num(p.handicap);                 // 게임당
      const included = !!s.scoresIncludeHandicap.individual;
      const g = gameStats(p.games, n, included, handicap);
      const bonus = g.gamesPlayed ? groupBonus(p.group, s) : 0;   // 총점 1회
      const adjust = g.gamesPlayed ? num(p.adjust) : 0;           // 총점 1회
      const region = rMap.get(p.regionId) || {};
      const total = g.scratch + handicap * g.gamesPlayed + bonus + adjust;
      return {
        playerId: p.id, name: p.name, regionId: p.regionId, regionName: region.name || '(미정)', gender: p.gender === 'F' ? 'F' : 'M',
        birthYear: num(p.birthYear) || '', handicap, included, bonus, adjust, onceTotal: bonus + adjust, group: p.group || '', lane: p.lane || '', pos: p.pos || '', isRep: !!p.isRep,
        ...g, total, score: s.basis === 'scratch' ? g.scratch : total,
        avgGame: g.gamesPlayed ? Math.round((g.scratch / g.gamesPlayed) * 10) / 10 : 0
      };
    });
  }

  // 총점 → 총핀(비핸디) → 하이게임 → 로우게임 → 연장자(생년 빠른 순, 미입력은 최후순)
  const cmpIndividual = makeComparator([r => r.score, r => r.total, r => r.scratch, r => r.high, r => r.low, r => -(num(r.birthYear) || 9999)]);

  function individualRanking(rows, filter) {
    const list = rows.filter(filter || (() => true)).map(r => ({ ...r }));
    return assignRanks(list, cmpIndividual);
  }

  // ===== 팀 종목 =====
  function teamRows(teams, event, pRows, regions, settings) {
    const s = mergeSettings(settings);
    const pMap = new Map(pRows.map(r => [r.playerId, r]));
    const rMap = new Map((regions || []).map(r => [r.id, r]));
    const n = num(s.games[event], EVENTS[event].games);
    return (teams || []).filter(t => t.event === event).map(t => {
      const members = (t.members || []).map(id => pMap.get(id)).filter(Boolean);
      const region = rMap.get(t.regionId) || {};
      const handicap = num(t.handicap);
      const included = !!s.scoresIncludeHandicap[event];
      const g = gameStats(t.games, n, included, handicap);
      const adjust = g.gamesPlayed ? num(t.adjust) : 0;
      const memberNames = members.map(m => m.name);
      return {
        teamId: t.id, event, regionId: t.regionId, regionName: region.name || '(미정)',
        name: t.name || memberNames.join(' · ') || '(팀)', memberIds: (t.members || []).slice(), memberNames, members,
        lane: t.lane || '', handicap, included, adjust, ...g, total: g.scratch + handicap * g.gamesPlayed + adjust,
        avgGame: g.gamesPlayed ? Math.round((g.scratch / g.gamesPlayed) * 10) / 10 : 0,
        valid: members.length === EVENTS[event].size
      };
    });
  }

  const cmpTeam = makeComparator([r => r.total, r => r.scratch, r => r.high, r => r.low]);
  function teamRanking(rows) { return assignRanks(rows.map(r => ({ ...r })), cmpTeam); }

  // ===== 지역 대표 =====
  function repRanking(pRows, regions, settings) {
    const s = mergeSettings(settings);
    const byRegion = new Map();
    (regions || []).forEach(r => byRegion.set(r.id, { regionId: r.id, regionName: r.name, reps: [], score: 0, scratch: 0, count: 0, short: true }));
    pRows.filter(r => r.isRep).forEach(r => {
      if (!byRegion.has(r.regionId)) byRegion.set(r.regionId, { regionId: r.regionId, regionName: r.regionName, reps: [], score: 0, scratch: 0, count: 0, short: true });
      const a = byRegion.get(r.regionId);
      a.reps.push({ name: r.name, score: r.score, total: r.total, scratch: r.scratch, gamesPlayed: r.gamesPlayed });
      a.score += r.score; a.scratch += r.scratch; a.count += 1;
    });
    const rows = [...byRegion.values()].map(a => ({ ...a, short: a.count < num(s.repCount, 3), over: a.count > num(s.repCount, 3) }));
    return assignRanks(rows, makeComparator([r => r.score, r => r.scratch], r => r.regionName));
  }

  // ===== 포인트 =====
  function pointsForRank(rank, table) {
    if (!rank || rank < 1 || !Array.isArray(table)) return 0;
    return rank <= table.length ? num(table[rank - 1]) : 0;
  }

  /** 지역 종합 집계 */
  function regionStandings(data) {
    const s = mergeSettings(data.settings);
    const regions = data.regions || [];
    const pRows = playerRows(data.players, regions, s);
    const male = individualRanking(pRows, r => r.gender === 'M');
    const female = individualRanking(pRows, r => r.gender === 'F');
    const scotch = teamRanking(teamRows(data.teams, 'scotch', pRows, regions, s));
    const baker = teamRanking(teamRows(data.teams, 'baker', pRows, regions, s));
    const reps = repRanking(pRows, regions, s);

    const acc = new Map();
    regions.forEach(r => acc.set(r.id, { regionId: r.id, regionName: r.name, male: 0, female: 0, reps: 0, scotch: 0, baker: 0, total: 0, details: [] }));
    const add = (regionId, field, pts, detail) => {
      if (!pts || !acc.has(regionId)) return;
      const a = acc.get(regionId); a[field] += pts; a.total += pts; a.details.push({ field, pts, ...detail });
    };
    male.forEach(r => add(r.regionId, 'male', pointsForRank(r.rank, s.points.individualM), { event: '개인전 남자', who: r.name, rank: r.rank }));
    female.forEach(r => add(r.regionId, 'female', pointsForRank(r.rank, s.points.individualF), { event: '개인전 여자', who: r.name, rank: r.rank }));
    reps.forEach(r => add(r.regionId, 'reps', pointsForRank(r.rank, s.points.reps), { event: '3인조(지역 대표)', who: r.reps.map(x => x.name).join('·'), rank: r.rank }));
    scotch.forEach(r => add(r.regionId, 'scotch', pointsForRank(r.rank, s.points.scotch), { event: '스카치', who: r.name, rank: r.rank }));
    baker.forEach(r => add(r.regionId, 'baker', pointsForRank(r.rank, s.points.baker), { event: '베이커', who: r.name, rank: r.rank }));

    const standings = assignRanks([...acc.values()], makeComparator([r => r.total, r => r.male + r.female, r => r.reps], r => r.regionName));
    return { settings: s, playerRows: pRows, male, female, scotch, baker, reps, standings, computedAt: new Date().toISOString() };
  }

  /** 확정된 대회는 스냅샷 사용 */
  function resultsOf(data) {
    if (data.settings && data.settings.status === 'final' && data.results && data.results.standings) return data.results;
    return regionStandings(data);
  }

  /** 입력 진행률 */
  function progress(data) {
    const s = mergeSettings(data.settings);
    const ind = (data.players || []).filter(p => p.events ? p.events.individual !== false : true);
    const indDone = ind.filter(p => gameStats(p.games, s.games.individual).gamesPlayed === num(s.games.individual, 3)).length;
    const ev = {};
    ['scotch', 'baker'].forEach(e => {
      const ts = (data.teams || []).filter(t => t.event === e);
      ev[e] = { total: ts.length, done: ts.filter(t => gameStats(t.games, s.games[e]).gamesPlayed === num(s.games[e], 1)).length };
    });
    return { individual: { total: ind.length, done: indDone }, ...ev };
  }

  return { EVENTS, DEFAULT_SETTINGS, mergeSettings, groupBonus, playerHandicap, makeComparator, assignRanks, gameStats,
    playerRows, individualRanking, teamRows, teamRanking, repRanking, pointsForRank, regionStandings, resultsOf, progress };
});
