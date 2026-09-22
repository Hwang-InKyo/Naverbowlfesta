/**
 * signup.js - 엑셀 참가 신청서 파서 (순수 함수, 브라우저/Node 공용)
 *
 * 입력: 시트를 2차원 배열로 변환한 rows (rows[r][c], 0-based, 빈 칸은 null/'' )
 * 출력: { clubName, players:[{name, gender, handicap, seniorHandicap, side, group}], reps:[name], scotch:[[name..]], baker:[[name..]], warnings:[] }
 *
 * 신청서 양식 (제46회 서울 전국대회 기준)
 *  - '클럽명' 오른쪽 칸: 클럽(지역) 이름
 *  - 개인전: 헤더 행에 '성명 | 성별 | 일반 핸디 | 시니어핸디 | 사이드' 블록이 조별로 가로 반복, 윗 행에 '1조', '2조' 라벨
 *  - '3인조' 행부터 '스카치' 행 전까지: 대표 3명 (성명 열)
 *  - '스카치' 행부터 '베이커' 행 전까지: 순번 칸이 있는 행이 새 팀 시작, 이어지는 이름이 같은 팀
 *  - '베이커' 행부터: 같은 방식으로 3명 팀
 *  각 블록의 (순번, 성명, 성별) 열 위치는 개인전 헤더에서 찾은 위치를 그대로 사용한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Signup = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const str = v => (v == null ? '' : String(v)).trim();
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const cell = (rows, r, c) => (rows[r] && c >= 0 && c < rows[r].length) ? rows[r][c] : null;
  const has = (v, kw) => str(v).replace(/\s+/g, '').includes(kw);
  const isName = v => { const s = str(v); return s.length >= 2 && s.length <= 10 && !/^\d+$/.test(s) && !/성명|이름|순번|소계|합계|총/.test(s); };
  const genderOf = v => { const s = str(v); if (/^(여|F|f|여자)$/.test(s)) return 'F'; if (/^(남|M|m|남자)$/.test(s)) return 'M'; return ''; };
  const yes = v => /^(O|o|0|ㅇ|Y|y|예|참가|√|✓)$/.test(str(v)) || v === true;

  /** 라벨 검색: 특정 열 범위에서 키워드가 있는 첫 행 */
  function findRow(rows, kw, from = 0, cols = 4) {
    for (let r = from; r < rows.length; r++) for (let c = 0; c < Math.min(cols, (rows[r] || []).length); c++) if (has(cell(rows, r, c), kw)) return r;
    return -1;
  }

  function parse(rows) {
    rows = Array.from(rows || [], r => Array.isArray(r) ? r : []);
    const out = { clubName: '', players: [], reps: [], scotch: [], baker: [], warnings: [] };
    if (!rows.length) { out.warnings.push('빈 시트입니다.'); return out; }

    // 클럽명
    outer: for (let r = 0; r < Math.min(rows.length, 15); r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (has(cell(rows, r, c), '클럽명') || has(cell(rows, r, c), '지역명')) {
          for (let k = c + 1; k < rows[r].length; k++) { const v = str(cell(rows, r, k)); if (v) { out.clubName = v; break outer; } }
        }
      }
    }
    if (!out.clubName) out.warnings.push('클럽명을 찾지 못했습니다.');

    // 개인전 헤더 (성명 열들)
    let headerRow = -1; const blocks = [];
    for (let r = 0; r < Math.min(rows.length, 20) && headerRow < 0; r++) {
      const cols = []; rows[r].forEach((v, c) => { if (has(v, '성명') || has(v, '이름')) cols.push(c); });
      if (cols.length) { headerRow = r; cols.forEach(c => blocks.push({ nameCol: c })); }
    }
    if (headerRow < 0) { out.warnings.push('개인전 명단 헤더(성명)를 찾지 못했습니다.'); return out; }
    blocks.forEach((b, i) => {
      const hdr = rows[headerRow];
      const find = kw => { for (let c = b.nameCol + 1; c < Math.min(hdr.length, b.nameCol + 8); c++) if (has(hdr[c], kw)) return c; return -1; };
      b.genderCol = find('성별'); b.handiCol = find('일반'); b.seniorCol = find('시니어'); b.sideCol = find('사이드');
      if (b.handiCol < 0) b.handiCol = find('핸디');
      b.numCol = b.nameCol - 1;
      // 조 라벨: 헤더 위 행에서 블록 범위 안의 'N조'
      b.group = '';
      for (let r = headerRow - 1; r >= Math.max(0, headerRow - 3) && !b.group; r--) {
        for (let c = b.nameCol - 1; c <= b.nameCol + 5; c++) { const v = str(cell(rows, r, c)); if (/^\d+\s*조$/.test(v.replace(/\s+/g, ''))) { b.group = v.replace(/\s+/g, ''); break; } }
      }
      if (!b.group) b.group = (i + 1) + '조';
    });

    // 섹션 경계
    const repsRow = findRow(rows, '3인조', headerRow + 1);
    const scotchRow = findRow(rows, '스카치', headerRow + 1);
    const bakerRow = findRow(rows, '베이커', headerRow + 1);
    const endRow = (() => { const r1 = findRow(rows, '입금계좌', headerRow + 1), r2 = findRow(rows, '위와같이', headerRow + 1); const cands = [r1, r2].filter(x => x >= 0); return cands.length ? Math.min(...cands) : rows.length; })();
    const indEnd = [repsRow, scotchRow, bakerRow, endRow].filter(x => x >= 0).reduce((a, b) => Math.min(a, b), rows.length);

    // 개인전 선수
    const seen = new Set();
    for (let r = headerRow + 1; r < indEnd; r++) {
      if (has(cell(rows, r, 1), '총인원') || has(cell(rows, r, 2), '총인원')) break;
      blocks.forEach(b => {
        const name = str(cell(rows, r, b.nameCol));
        if (!isName(name)) return;
        if (seen.has(name)) { out.warnings.push(`개인전 명단에 "${name}" 이(가) 중복됩니다.`); return; }
        seen.add(name);
        const gender = genderOf(cell(rows, r, b.genderCol));
        const base = b.handiCol >= 0 ? num(cell(rows, r, b.handiCol)) : 0;
        const senior = b.seniorCol >= 0 ? num(cell(rows, r, b.seniorCol)) : 0;
        if (!gender) out.warnings.push(`"${name}" 성별이 비어 있어 남자로 처리합니다.`);
        out.players.push({ name, gender: gender || 'M', handicap: base + senior, baseHandicap: base, seniorHandicap: senior, side: b.sideCol >= 0 ? yes(cell(rows, r, b.sideCol)) : false, group: b.group });
      });
    }
    if (!out.players.length) out.warnings.push('개인전 선수를 찾지 못했습니다.');

    // 섹션 파싱 헬퍼: 블록별 (순번, 성명, 성별) 열을 사용
    const sectionTeams = (from, to, size) => {
      const teams = [];
      if (from < 0) return teams;
      blocks.forEach(b => {
        let cur = null;
        for (let r = from; r < to; r++) {
          const name = str(cell(rows, r, b.nameCol));
          const numv = cell(rows, r, b.numCol);
          const startsTeam = numv !== null && numv !== '' && Number.isFinite(Number(numv));
          if (has(numv, '소계')) break;
          if (startsTeam) { cur = { members: [] }; teams.push(cur); }
          if (isName(name)) { if (!cur) { cur = { members: [] }; teams.push(cur); } cur.members.push({ name, gender: genderOf(cell(rows, r, b.genderCol)) }); }
        }
      });
      return teams.filter(t => t.members.length).map(t => { if (size && t.members.length !== size) out.warnings.push(`${size}인 팀 인원이 맞지 않습니다: ${t.members.map(m => m.name).join(', ')}`); return t.members; });
    };

    // 3인조 (대표)
    if (repsRow >= 0) {
      const to = [scotchRow, bakerRow, endRow].filter(x => x > repsRow).reduce((a, b) => Math.min(a, b), rows.length);
      for (let r = repsRow; r < to; r++) { const name = str(cell(rows, r, blocks[0].nameCol)); if (isName(name)) out.reps.push(name); }
    } else out.warnings.push('3인조(대표) 명단을 찾지 못했습니다.');

    if (scotchRow >= 0) { const to = [bakerRow, endRow].filter(x => x > scotchRow).reduce((a, b) => Math.min(a, b), rows.length); out.scotch = sectionTeams(scotchRow, to, 2); }
    if (bakerRow >= 0) out.baker = sectionTeams(bakerRow, endRow, 3);

    // 검증: 팀원/대표가 개인전 명단에 있는지, 스카치 남녀 구성
    const names = new Set(out.players.map(p => p.name));
    const gMap = new Map(out.players.map(p => [p.name, p.gender]));
    out.reps.forEach(n => { if (!names.has(n)) out.warnings.push(`3인조 "${n}" 이(가) 개인전 명단에 없습니다.`); });
    out.scotch.forEach(t => {
      t.forEach(m => { if (!names.has(m.name)) out.warnings.push(`스카치 "${m.name}" 이(가) 개인전 명단에 없습니다.`); });
      const gs = t.map(m => gMap.get(m.name) || m.gender).sort().join('');
      if (t.length === 2 && gs !== 'FM') out.warnings.push(`스카치 팀 (${t.map(m => m.name).join(', ')}) 은 남 1명 + 여 1명이어야 합니다.`);
    });
    out.baker.forEach(t => t.forEach(m => { if (!names.has(m.name)) out.warnings.push(`베이커 "${m.name}" 이(가) 개인전 명단에 없습니다.`); }));
    return out;
  }

  return { parse };
});
