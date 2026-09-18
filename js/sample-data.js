/**
 * sample-data.js - 데모(로컬) 모드용 초기 데이터
 * 실제 운영 시에는 설정 탭에서 데이터를 초기화하거나 Apps Script 서버를 연결하면 사용되지 않습니다.
 */
const SampleData = (() => {
  // 결정적 난수 (매번 같은 데모 데이터)
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  const clubs = [
    { id: 'c_seoul', name: '아르케 존', region: '서울', leader: '황인교', note: '' },
    { id: 'c_busan', name: '부산 스트라이크', region: '부산', leader: '김해성', note: '' },
    { id: 'c_daegu', name: '대구 텐핀', region: '대구', leader: '박대구', note: '' },
    { id: 'c_gwangju', name: '광주 볼링사랑', region: '광주', leader: '정빛나', note: '' },
    { id: 'c_daejeon', name: '대전 퍼펙트', region: '대전', leader: '오하늘', note: '' },
    { id: 'c_incheon', name: '인천 스페어', region: '인천', leader: '한바다', note: '' }
  ];

  const names = {
    c_seoul: [['황인교', 'M', 184], ['장영민', 'M', 200], ['이승미', 'F', 165], ['천성일', 'M', 191], ['김선미', 'F', 161], ['지옥명', 'M', 183]],
    c_busan: [['김해성', 'M', 195], ['박소라', 'F', 172], ['이동해', 'M', 178], ['최윤아', 'F', 150], ['강태풍', 'M', 168]],
    c_daegu: [['박대구', 'M', 188], ['서지원', 'F', 158], ['윤성호', 'M', 175], ['조은별', 'F', 143], ['남기훈', 'M', 199]],
    c_gwangju: [['정빛나', 'F', 176], ['문호남', 'M', 182], ['배수지', 'F', 155], ['임강산', 'M', 170]],
    c_daejeon: [['오하늘', 'M', 190], ['권유리', 'F', 168], ['홍길동', 'M', 160], ['백설아', 'F', 147], ['신중앙', 'M', 186]],
    c_incheon: [['한바다', 'M', 179], ['송미래', 'F', 163], ['구본영', 'M', 173], ['류하린', 'F', 152]]
  };

  const members = [];
  Object.keys(names).forEach((clubId, ci) => {
    names[clubId].forEach((n, i) => {
      members.push({
        id: 'm_' + clubId.slice(2) + '_' + (i + 1),
        name: n[0], clubId, gender: n[1], avg: n[2],
        pin: '1234', role: ci === 0 && i === 0 ? 'admin' : 'member',
        phone: '', joinDate: '2025-0' + ((i % 9) + 1) + '-01', note: ''
      });
    });
  });

  function game(rand, avg) {
    const v = Math.round(avg + (rand() - 0.5) * 70);
    return Math.max(80, Math.min(290, v));
  }

  function entriesFor(rand, memberIds, numGames, playedGames) {
    return memberIds.map(id => {
      const m = members.find(x => x.id === id);
      const games = [];
      for (let g = 0; g < numGames; g++) games.push(g < playedGames ? game(rand, m.avg) : null);
      return { memberId: id, clubId: m.clubId, avg: m.avg, gender: m.gender, lane: '', games };
    });
  }

  const handicap = { type: 'diff', base: 200, rate: 0.8, cap: 60, femaleBonus: 8 };
  const divisions = [{ name: 'A조', min: 180 }, { name: 'B조', min: 160 }, { name: 'C조', min: 0 }];

  const all = members.map(m => m.id);
  const r1 = rng(20260516);
  const t1 = {
    id: 't_2026_spring', name: '2026 상반기 전국대회', date: '2026-05-16', venue: '부산 사직볼링장',
    hostClubId: 'c_busan', status: 'final', numGames: 3, handicap, divisions, clubScoring: { topN: 4 },
    entries: entriesFor(r1, all.filter((_, i) => i % 7 !== 3), 3, 3), note: '', finalizedAt: '2026-05-16T18:30:00.000Z'
  };

  const r2 = rng(20260919);
  const lanes = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const t2 = {
    id: 't_2026_autumn', name: '2026 추계 전국대회', date: '2026-09-19', venue: '서울 강남볼링센터',
    hostClubId: 'c_seoul', status: 'live', numGames: 3, handicap, divisions, clubScoring: { topN: 4 },
    entries: entriesFor(r2, all.filter((_, i) => i % 5 !== 2), 3, 2).map((e, i) => ({ ...e, lane: lanes[i % lanes.length] })), note: '2게임까지 입력 완료'
  };

  const t3 = {
    id: 't_2026_final', name: '2026 왕중왕전', date: '2026-12-05', venue: '대전 유성볼링장',
    hostClubId: 'c_daejeon', status: 'upcoming', numGames: 4, handicap: { ...handicap, cap: 40 }, divisions: [], clubScoring: { topN: 3 },
    entries: entriesFor(rng(1), all.slice(0, 10), 4, 0), note: '참가 신청 접수 중'
  };

  const settings = {
    orgName: '전국 볼링 클럽 연합',
    adminPin: '0000',
    defaultPin: '1234',
    pointsTable: [10, 8, 6, 5, 4, 3, 2, 1],
    defaultHandicap: handicap
  };

  function build() {
    const data = { clubs, members, tournaments: [t1, t2, t3], settings };
    // 확정 대회는 결과 스냅샷 보관
    if (typeof Ranking !== 'undefined') t1.results = Ranking.computeResults(t1, members, clubs);
    return JSON.parse(JSON.stringify(data));
  }

  return { build };
})();
if (typeof module === 'object' && module.exports) module.exports = SampleData;
