/**
 * ranking.js - 전국대회 순위 집계 엔진 (순수 함수, 브라우저/Node 공용)
 *
 * 용어
 *  - 에버(avg)     : 회원의 기준 평균 점수
 *  - 핸디(handicap): 게임당 핸디캡 핀 수
 *  - 스크래치      : 핸디 없이 실제 친 점수 합계
 *  - 총점(total)   : 스크래치 + 핸디 × 게임수
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ranking = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_HANDICAP = { type: 'diff', base: 200, rate: 0.8, cap: 60, femaleBonus: 8 };
  const DEFAULT_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
  const PARTICIPATION_POINT = 1;

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

  /** 게임당 핸디캡 계산 */
  function calcHandicap(avg, gender, rule) {
    rule = rule || DEFAULT_HANDICAP;
    if (!rule || rule.type === 'none') return 0;
    let h = 0;
    if (rule.type === 'diff') {
      const base = num(rule.base);
      const rate = rule.rate === '' || rule.rate == null ? 1 : num(rule.rate, 1);
      h = Math.floor(Math.max(0, base - num(avg)) * rate);
      if (rule.cap !== '' && rule.cap != null) h = Math.min(h, num(rule.cap));
    }
    if (gender === 'F' && rule.femaleBonus) h += num(rule.femaleBonus);
    return h;
  }

  /** 에버 기준 부(division) 배정. divisions: [{name, min}] */
  function assignDivision(avg, divisions) {
    if (!Array.isArray(divisions) || divisions.length === 0) return '';
    const sorted = [...divisions].sort((a, b) => num(b.min) - num(a.min));
    for (const d of sorted) if (num(avg) >= num(d.min)) return d.name;
    return sorted[sorted.length - 1].name;
  }

  /**
   * 정렬 키 기반 비교기 생성.
   * keys: 내림차순으로 비교할 숫자 키 함수 목록. 모든 키가 같으면 동순위(0).
   * 표시 순서는 이름(가나다)으로 안정화하지만 순위 판정에는 쓰지 않는다.
   */
  function makeComparator(keys, nameKey) {
    nameKey = nameKey || (r => r.name);
    const cmp = (a, b) => {
      for (const k of keys) { const d = num(k(b)) - num(k(a)); if (d) return d; }
      return 0;
    };
    const sortCmp = (a, b) => cmp(a, b) || String(nameKey(a)).localeCompare(String(nameKey(b)), 'ko');
    sortCmp.tie = cmp;
    return sortCmp;
  }

  /** 개인 순위 비교 (총점 → 스크래치 → 하이게임 → 마지막 게임) */
  const compareRows = makeComparator([r => r.total, r => r.scratch, r => r.high, r => r.lastGame]);

  /** 정렬된 배열에 rank 부여 (동점은 같은 순위, 다음 순위 건너뜀) */
  function assignRanks(rows, cmp) {
    cmp = cmp || compareRows;
    const tie = cmp.tie || cmp;
    rows.sort(cmp);
    let rank = 0;
    rows.forEach((r, i) => {
      if (i === 0 || tie(rows[i - 1], r) !== 0) rank = i + 1;
      r.rank = rank;
    });
    return rows;
  }

  /** 대회 참가자 → 개인 성적 행 생성 (순위 미부여) */
  function buildRows(tournament, members, clubs) {
    const mMap = new Map((members || []).map(m => [m.id, m]));
    const cMap = new Map((clubs || []).map(c => [c.id, c]));
    const numGames = num(tournament.numGames, 3);
    const rule = tournament.handicap || DEFAULT_HANDICAP;

    return (tournament.entries || []).map(e => {
      const m = mMap.get(e.memberId) || {};
      const club = cMap.get(e.clubId || m.clubId) || {};
      const avg = e.avg != null && e.avg !== '' ? num(e.avg) : num(m.avg);
      const gender = e.gender || m.gender || 'M';
      const games = [];
      for (let i = 0; i < numGames; i++) {
        const g = (e.games || [])[i];
        games.push(g === '' || g == null ? null : num(g));
      }
      const played = games.filter(g => g != null);
      const scratch = played.reduce((s, g) => s + g, 0);
      const handicap = e.handicapOverride != null && e.handicapOverride !== ''
        ? num(e.handicapOverride) : calcHandicap(avg, gender, rule);
      return {
        memberId: e.memberId,
        name: e.name || m.name || '(미상)',
        clubId: club.id || e.clubId || m.clubId || '',
        clubName: club.name || e.clubName || '',
        gender,
        avg,
        lane: e.lane || '',
        division: e.division || assignDivision(avg, tournament.divisions),
        games,
        gamesPlayed: played.length,
        scratch,
        handicap,
        handicapTotal: handicap * played.length,
        total: scratch + handicap * played.length,
        high: played.length ? Math.max(...played) : 0,
        lastGame: played.length ? played[played.length - 1] : 0,
        avgGame: played.length ? Math.round((scratch / played.length) * 10) / 10 : 0
      };
    });
  }

  /** 개인 종합 순위 */
  function individualRanking(tournament, members, clubs) {
    return assignRanks(buildRows(tournament, members, clubs));
  }

  /** 부분 집합 순위 (성별/부별) - 원본 rank는 유지하고 subRank 부여 */
  function subRanking(rows, predicate) {
    const subset = rows.filter(predicate).map(r => ({ ...r }));
    return assignRanks(subset);
  }

  /** 클럽 대항 순위: 클럽별 상위 N명 총점 합계 */
  function clubRanking(rows, clubs, topN) {
    topN = num(topN, 5);
    const byClub = new Map();
    rows.forEach(r => {
      const key = r.clubId || '_none';
      if (!byClub.has(key)) byClub.set(key, { clubId: r.clubId, clubName: r.clubName || '(무소속)', players: [] });
      byClub.get(key).players.push(r);
    });
    const result = [...byClub.values()].map(c => {
      const sorted = [...c.players].sort(compareRows);
      const counted = topN > 0 ? sorted.slice(0, topN) : sorted;
      const total = counted.reduce((s, r) => s + r.total, 0);
      const scratch = counted.reduce((s, r) => s + r.scratch, 0);
      const gamesPlayed = counted.reduce((s, r) => s + r.gamesPlayed, 0);
      return {
        clubId: c.clubId,
        clubName: c.clubName,
        entries: c.players.length,
        counted: counted.length,
        short: topN > 0 && counted.length < topN,
        total,
        scratch,
        avgGame: gamesPlayed ? Math.round((scratch / gamesPlayed) * 10) / 10 : 0,
        top: counted.map(r => ({ name: r.name, total: r.total }))
      };
    });
    return assignRanks(result, makeComparator([c => c.total, c => c.scratch, c => c.avgGame], c => c.clubName));
  }

  /** 하이게임 순위 (단일 게임 최고점) */
  function highGameRanking(rows) {
    const list = rows.filter(r => r.gamesPlayed > 0).map(r => ({ ...r }));
    return assignRanks(list, makeComparator([r => r.high, r => r.scratch]));
  }

  /** 대회 결과 전체 집계 */
  function computeResults(tournament, members, clubs) {
    const individual = individualRanking(tournament, members, clubs);
    const topN = tournament.clubScoring && tournament.clubScoring.topN != null ? tournament.clubScoring.topN : 5;
    const divisions = {};
    (tournament.divisions || []).forEach(d => { divisions[d.name] = subRanking(individual, r => r.division === d.name); });
    return {
      individual,
      male: subRanking(individual, r => r.gender !== 'F'),
      female: subRanking(individual, r => r.gender === 'F'),
      divisions,
      club: clubRanking(individual, clubs, topN),
      highGame: highGameRanking(individual),
      computedAt: new Date().toISOString()
    };
  }

  /** 확정된 대회는 스냅샷, 아니면 실시간 계산 */
  function resultsOf(tournament, members, clubs) {
    if (tournament.status === 'final' && tournament.results && tournament.results.individual) return tournament.results;
    return computeResults(tournament, members, clubs);
  }

  /** 순위 → 시즌 포인트 */
  function pointsForRank(rank, table) {
    table = Array.isArray(table) && table.length ? table : DEFAULT_POINTS;
    if (!rank || rank < 1) return 0;
    return rank <= table.length ? num(table[rank - 1]) : PARTICIPATION_POINT;
  }

  /** 시즌(연도) 랭킹: 포인트 합산 */
  function seasonRanking(tournaments, members, clubs, year, pointsTable) {
    const list = (tournaments || []).filter(t => t.status === 'final' && (!year || String(t.date || '').startsWith(String(year))));
    const acc = new Map();
    list.forEach(t => {
      const res = resultsOf(t, members, clubs);
      res.individual.forEach(r => {
        if (!acc.has(r.memberId)) acc.set(r.memberId, { memberId: r.memberId, name: r.name, clubName: r.clubName, gender: r.gender, points: 0, tournaments: 0, games: 0, scratch: 0, high: 0, best: null, wins: 0 });
        const a = acc.get(r.memberId);
        a.points += pointsForRank(r.rank, pointsTable);
        a.tournaments += 1;
        a.games += r.gamesPlayed;
        a.scratch += r.scratch;
        a.high = Math.max(a.high, r.high);
        a.best = a.best == null ? r.rank : Math.min(a.best, r.rank);
        if (r.rank === 1) a.wins += 1;
      });
    });
    const rows = [...acc.values()].map(a => ({ ...a, avgGame: a.games ? Math.round((a.scratch / a.games) * 10) / 10 : 0 }));
    return assignRanks(rows, makeComparator([r => r.points, r => r.wins, r => r.avgGame]));
  }

  /** 시즌 클럽 랭킹: 대회별 클럽 순위 포인트 합산 */
  function seasonClubRanking(tournaments, members, clubs, year, pointsTable) {
    const list = (tournaments || []).filter(t => t.status === 'final' && (!year || String(t.date || '').startsWith(String(year))));
    const acc = new Map();
    list.forEach(t => {
      const res = resultsOf(t, members, clubs);
      res.club.forEach(c => {
        const key = c.clubId || '_none';
        if (!acc.has(key)) acc.set(key, { clubId: c.clubId, clubName: c.clubName, points: 0, tournaments: 0, wins: 0, total: 0 });
        const a = acc.get(key);
        a.points += pointsForRank(c.rank, pointsTable);
        a.tournaments += 1;
        a.total += c.total;
        if (c.rank === 1) a.wins += 1;
      });
    });
    return assignRanks([...acc.values()], makeComparator([c => c.points, c => c.wins, c => c.total], c => c.clubName));
  }

  /** 회원 개인 대회 이력 */
  function memberHistory(memberId, tournaments, members, clubs) {
    const out = [];
    (tournaments || []).forEach(t => {
      if (!(t.entries || []).some(e => e.memberId === memberId)) return;
      const res = resultsOf(t, members, clubs);
      const row = res.individual.find(r => r.memberId === memberId);
      if (!row) return;
      const clubRow = res.club.find(c => c.clubId === row.clubId);
      const genderRow = (row.gender === 'F' ? res.female : res.male).find(r => r.memberId === memberId);
      out.push({
        tournamentId: t.id,
        name: t.name,
        date: t.date,
        status: t.status,
        games: row.games,
        gamesPlayed: row.gamesPlayed,
        scratch: row.scratch,
        handicap: row.handicap,
        total: row.total,
        high: row.high,
        avgGame: row.avgGame,
        rank: row.rank,
        entries: res.individual.length,
        genderRank: genderRow ? genderRow.rank : null,
        genderEntries: (row.gender === 'F' ? res.female : res.male).length,
        clubRank: clubRow ? clubRow.rank : null,
        clubCount: res.club.length,
        division: row.division,
        points: t.status === 'final' ? pointsForRank(row.rank) : 0
      });
    });
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  }

  /** 이력 → 개인 통계 */
  function memberStats(history) {
    const done = history.filter(h => h.gamesPlayed > 0);
    const games = done.reduce((s, h) => s + h.gamesPlayed, 0);
    const scratch = done.reduce((s, h) => s + h.scratch, 0);
    const allGames = done.flatMap(h => h.games.filter(g => g != null));
    return {
      tournaments: history.length,
      games,
      avgGame: games ? Math.round((scratch / games) * 10) / 10 : 0,
      high: allGames.length ? Math.max(...allGames) : 0,
      low: allGames.length ? Math.min(...allGames) : 0,
      bestRank: done.length ? Math.min(...done.map(h => h.rank)) : null,
      wins: done.filter(h => h.rank === 1 && h.status === 'final').length,
      podiums: done.filter(h => h.rank <= 3 && h.status === 'final').length,
      points: history.reduce((s, h) => s + (h.points || 0), 0)
    };
  }

  return {
    DEFAULT_HANDICAP, DEFAULT_POINTS, PARTICIPATION_POINT,
    calcHandicap, assignDivision, makeComparator, compareRows, assignRanks, buildRows,
    individualRanking, subRanking, clubRanking, highGameRanking,
    computeResults, resultsOf, pointsForRank, seasonRanking, seasonClubRanking,
    memberHistory, memberStats
  };
});
