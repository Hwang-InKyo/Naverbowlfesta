/**
 * sample-data.js - 데모(로컬) 모드용 초기 데이터. 서버 연결 시 사용되지 않음.
 */
const SampleData = (() => {
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  const regions = [
    { id: 'r_seoul', name: '서울', leader: '황인교', note: '주최' },
    { id: 'r_gyeonggi', name: '경기', leader: '김경기', note: '' },
    { id: 'r_busan', name: '부산', leader: '김해성', note: '' },
    { id: 'r_daegu', name: '대구', leader: '박대구', note: '' },
    { id: 'r_gwangju', name: '광주', leader: '정빛나', note: '' }
  ];
  const M = ['황인교', '장영민', '천성일', '지옥명', '강희태', '최현수', '이우석', '박시진', '고경훈', '이정석', '이대용', '김종훈', '변상필', '최진', '김해성', '이동해', '강태풍', '박대구', '윤성호', '남기훈', '문호남', '임강산', '오하늘', '홍길동', '신중앙', '한바다', '구본영', '김경기', '서준호', '조민재', '유재석', '정우성', '이병헌', '차태현', '송강호', '하정우'];
  const F = ['이승미', '김선미', '박소라', '최윤아', '서지원', '조은별', '정빛나', '배수지', '권유리', '백설아', '송미래', '류하린', '김태희', '전지현', '손예진', '한지민', '박보영', '김고은', '아이유', '수지', '윤아', '태연', '제니', '지수'];

  const rand = rng(2026);
  const players = []; const skillOf = {};
  let mi = 0, fi = 0;
  regions.forEach((r, ri) => {
    for (let i = 0; i < 12; i++) {
      const isF = i % 3 === 2;
      const name = isF ? F[fi++ % F.length] : M[mi++ % M.length];
      const skill = Math.round(isF ? 140 + rand() * 45 : 160 + rand() * 45);
      const birthYear = 1960 + Math.floor(rand() * 40);
      const senior = birthYear <= 1962 ? 5 : birthYear <= 1966 ? 1967 - birthYear : 0;
      const handicap = Math.min(20, (isF ? 15 : 0) + senior);
      players.push({
        id: 'p_' + r.id.slice(2) + '_' + (i + 1), name, regionId: r.id, gender: isF ? 'F' : 'M', birthYear, handicap, adjust: 0,
        isRep: i < 3, group: '', lane: '', pos: '', games: [null, null, null],
        events: { individual: true, scotch: i < 4, baker: i >= 4 && i < 10 }, note: ''
      });
      skillOf['p_' + r.id.slice(2) + '_' + (i + 1)] = skill;
    }
  });

  const settings = {
    ...Ranking.DEFAULT_SETTINGS,
    name: '2026 전국 볼링 페스타', venue: '서울 강남볼링센터 (24레인)', dates: ['2026-10-17', '2026-10-18'], lanes: 24, laneFrom: 1,
    hostRegionId: 'r_seoul', status: 'live', perTable: 4, tableFrom: 1, repCount: 3,
    groups: [{ id: 'A', name: '1조', day: 1, time: '10:00', bonus: 10 }, { id: 'B', name: '2조', day: 1, time: '14:00', bonus: 0 }, { id: 'C', name: '3조', day: 2, time: '10:00', bonus: 0 }],
    schedule: '1일차 10:00 1조 개인전 / 14:00 2조 개인전\n2일차 10:00 3조 개인전 / 14:00 스카치·베이커 / 17:00 시상',
    adminPin: '0000'
  };

  function game(avg) { return Math.max(90, Math.min(290, Math.round(avg + (rand() - 0.5) * 70))); }

  function build() {
    // 조 편성 + 레인 배정
    const g = Lanes.assignGroups(players, settings.groups);
    players.forEach(p => { p.group = g[p.id]; });
    settings.groups.forEach(gr => {
      const list = players.filter(p => p.group === gr.id);
      const tables = Lanes.laneRange(settings.tableFrom, Lanes.lanesNeeded(list.length, settings.perTable));
      const a = Lanes.assignLanes(list, tables, settings.perTable);
      list.forEach(p => { p.lane = a[p.id].lane; p.pos = a[p.id].pos; });
    });
    // 점수: 1조 완료, 2조 2게임, 3조 미입력
    players.forEach(p => {
      const n = p.group === 'A' ? 3 : p.group === 'B' ? 2 : 0;
      p.games = [0, 1, 2].map(i => i < n ? game(skillOf[p.id]) : null);
    });
    // 팀 편성
    const teams = [];
    regions.forEach(r => {
      const rp = players.filter(p => p.regionId === r.id);
      const men = rp.filter(p => p.gender === 'M'), women = rp.filter(p => p.gender === 'F');
      // 스카치 2팀 (남1 여1)
      for (let i = 0; i < 2; i++) teams.push({ id: 't_sc_' + r.id.slice(2) + i, event: 'scotch', regionId: r.id, name: '', members: [men[i].id, women[i].id], lane: '', handicap: 0, adjust: 0, games: [null, null] });
      // 베이커 1~2팀
      const bk = r.id === 'r_seoul' || r.id === 'r_busan' ? 2 : 1;
      for (let i = 0; i < bk; i++) teams.push({ id: 't_bk_' + r.id.slice(2) + i, event: 'baker', regionId: r.id, name: '', members: [men[2 + i * 2].id, men[3 + i * 2].id, women[2 + i].id], lane: '', handicap: 3, adjust: 0, games: [null, null] });
    });
    // 스카치 1게임 입력, 레인 배정
    const sc = teams.filter(t => t.event === 'scotch');
    const scl = Lanes.assignTeamLanes(sc, Lanes.laneRange(1, 5), 2);
    sc.forEach(t => { t.lane = scl[t.id]; t.games = [Math.round((game(170) + game(170)) / 2), null]; });
    const bk = teams.filter(t => t.event === 'baker');
    const bkl = Lanes.assignTeamLanes(bk, Lanes.laneRange(6, 7), 1);
    bk.forEach(t => { t.lane = bkl[t.id]; });
    return JSON.parse(JSON.stringify({ settings, regions, players, teams, results: null }));
  }
  return { build };
})();
if (typeof module === 'object' && module.exports) module.exports = SampleData;
