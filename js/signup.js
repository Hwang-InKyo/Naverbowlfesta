/**
 * signup.js - 엑셀 참가 신청서 파서 (순수 함수, 브라우저/Node 공용)
 *
 * 입력: 시트를 2차원 배열로 변환한 rows (rows[r][c], 0-based, 빈 칸은 null/'' )
 * 출력: { clubName, players:[{name, gender, handicap, seniorHandicap, side, group}], reps:[name], scotch:[[name..]], baker:[[name..]], warnings:[] }
 *
 * 지원하는 신청서 양식 (제45회 대전 / 제46회 서울 양식 모두)
 *  - '클럽명' 오른쪽 칸: 클럽 이름
 *  - 개인전: 'N조' 라벨 아래 '성명 | (닉네임 | 앞풀이) | 성별 | (일반) 핸디 | (시니어핸디) | (챔프전) | 사이드' 헤더.
 *    조 블록은 가로로 나란히(1조·2조) 있거나, 헤더 없이 아래에 이어질 수 있다(1조 아래 '3조' 라벨만 있는 경우 → 위 블록의 열 배치 사용).
 *    오른쪽의 참가비 표·차량 표처럼 'N조' 라벨이 없는 '성명' 열은 무시한다. 이름이 아닌 안내문(금액 등)도 무시.
 *  - '3인조' 행부터 '스카치' 행 전까지: 대표 3명 (가장 왼쪽 블록의 성명 열)
 *  - '스카치' 행부터 '베이커' 행 전까지: 순번 칸이 있는 행이 새 팀 시작, 이어지는 이름이 같은 팀
 *  - '베이커' 행부터 '소계'/'입금계좌' 전까지: 같은 방식으로 3명 팀
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Signup = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const str = v => (v == null ? '' : String(v)).trim();
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const cell = (rows, r, c) => (rows[r] && c >= 0 && c < rows[r].length) ? rows[r][c] : null;
  const has = (v, kw) => str(v).replace(/\s+/g, '').includes(kw);
  const isEmpty = v => str(v) === '';
  // 사람 이름: 한글 2~6자 또는 영문 (공백·숫자·기호가 섞인 안내문/금액 줄은 제외)
  const isName = v => { const s = str(v); return (/^[가-힣]{2,6}$/.test(s) || /^[A-Za-z][A-Za-z.\-']{1,20}$/.test(s)) && !/성명|이름|순번|소계|합계|총원|총인원/.test(s); };
  const genderOf = v => { const s = str(v); if (/^(여|F|f|여자)$/.test(s)) return 'F'; if (/^(남|M|m|남자)$/.test(s)) return 'M'; return ''; };
  const yes = v => /^(O|o|0|ㅇ|Y|y|예|참가|√|✓)$/.test(str(v)) || v === true;
  const groupLabel = v => { const s = str(v).replace(/\s+/g, ''); return /^\d+조$/.test(s) ? s : ''; };
  const distance = (a, b) => { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };

  /** 라벨 검색: 특정 열 범위에서 키워드가 있는 첫 행 */
  function findRow(rows, kw, from = 0, cols = 4) {
    for (let r = from; r < rows.length; r++) for (let c = 0; c < Math.min(cols, (rows[r] || []).length); c++) if (has(cell(rows, r, c), kw)) return r;
    return -1;
  }
  /** 헤더 행에서 블록의 열 위치를 읽는다. nameCol 부터 오른쪽으로, 빈 헤더 칸이나 limit 전까지 */
  function readHeader(hdr, nameCol, limit) {
    const b = { nameCol, numCol: nameCol - 1, genderCol: -1, handiCol: -1, seniorCol: -1, sideCol: -1, champCol: -1, nickCol: -1 };
    for (let c = nameCol + 1; c < Math.min(hdr.length, limit); c++) {
      const v = str(hdr[c]); if (!v) break;
      if (has(v, '성별')) b.genderCol = c;
      else if (has(v, '시니어')) b.seniorCol = c;
      else if (has(v, '일반') || (has(v, '핸디') && b.handiCol < 0)) b.handiCol = c;
      else if (has(v, '사이드')) b.sideCol = c;
      else if (has(v, '챔프')) b.champCol = c;
      else if (has(v, '닉네임')) b.nickCol = c;
    }
    return b;
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

    // 섹션 경계 (왼쪽 4열 안의 라벨)
    const repsRow = findRow(rows, '3인조');
    const scotchRow = findRow(rows, '스카치');
    const bakerRow = findRow(rows, '베이커');
    const endRow = (() => { const r1 = findRow(rows, '입금계좌'), r2 = findRow(rows, '위와같이'); const cands = [r1, r2].filter(x => x >= 0); return cands.length ? Math.min(...cands) : rows.length; })();
    const indEnd = [repsRow, scotchRow, bakerRow, endRow].filter(x => x >= 0).reduce((a, b) => Math.min(a, b), rows.length);

    // 개인전 블록: 'N조' 라벨을 모두 찾는다. 라벨 아래 1~2행에 '성명' 헤더가 있으면 그 헤더로,
    // 없으면(3조가 1조 아래에 이어지는 양식) 같은 열의 앞선 블록 열 배치를 물려받는다.
    const labels = [];
    for (let r = 0; r < indEnd; r++) for (let c = 0; c < rows[r].length; c++) { const g = groupLabel(rows[r][c]); if (g) labels.push({ r, c, group: g }); }
    labels.sort((a, b) => a.r - b.r || a.c - b.c);
    const blocks = [];
    labels.forEach(l => {
      let hdrRow = -1, nameCol = -1;
      for (let r = l.r + 1; r <= l.r + 2 && hdrRow < 0; r++) for (let c = Math.max(0, l.c - 1); c <= l.c + 8; c++) if (has(cell(rows, r, c), '성명') || has(cell(rows, r, c), '이름')) { hdrRow = r; nameCol = c; break; }
      let b;
      if (hdrRow >= 0) {
        const next = labels.find(x => x.r === l.r && x.c > l.c);
        b = { ...readHeader(rows[hdrRow], nameCol, next ? next.c : Infinity), group: l.group, from: hdrRow + 1 };
      } else {
        const prev = blocks.filter(x => Math.abs(x.nameCol - l.c) <= 2).sort((x, y) => Math.abs(x.nameCol - l.c) - Math.abs(y.nameCol - l.c))[0];
        if (!prev) return;
        b = { ...prev, group: l.group, from: l.r + 1 };
      }
      blocks.push(b);
    });
    // 라벨 없는 양식: 첫 '성명' 헤더 행의 블록들을 순서대로 1조, 2조…
    if (!blocks.length) {
      for (let r = 0; r < Math.min(rows.length, 20) && !blocks.length; r++) {
        const cols = []; rows[r].forEach((v, c) => { if (has(v, '성명') || has(v, '이름')) cols.push(c); });
        cols.forEach((c, i) => blocks.push({ ...readHeader(rows[r], c, cols[i + 1] || Infinity), group: (i + 1) + '조', from: r + 1 }));
      }
    }
    if (!blocks.length) { out.warnings.push('개인전 명단(N조 / 성명 헤더)을 찾지 못했습니다.'); return out; }
    // 각 블록의 끝: 같은 열 범위에 나오는 다음 조 라벨 행, 또는 개인전 끝
    const totalRow = (() => { for (let r = 0; r < indEnd; r++) for (let c = 0; c < Math.min(4, rows[r].length); c++) if (has(rows[r][c], '총인원')) return r; return -1; })();
    blocks.forEach(b => {
      let to = totalRow > b.from ? Math.min(totalRow, indEnd) : indEnd;
      labels.forEach(l => { if (l.r >= b.from && l.r < to && Math.abs(l.c - b.nameCol) <= 2) to = l.r; });
      b.to = to;
    });

    // 개인전 선수
    const seen = new Set();
    blocks.forEach(b => {
      for (let r = b.from; r < b.to; r++) {
        const name = str(cell(rows, r, b.nameCol));
        if (!isName(name)) continue;
        if (seen.has(name)) { out.warnings.push(`개인전 명단에 "${name}" 이(가) 중복됩니다.`); continue; }
        seen.add(name);
        const gender = genderOf(cell(rows, r, b.genderCol));
        const base = b.handiCol >= 0 ? num(cell(rows, r, b.handiCol)) : 0;
        const senior = b.seniorCol >= 0 ? num(cell(rows, r, b.seniorCol)) : 0;
        if (!gender) out.warnings.push(`"${name}" 성별이 비어 있어 남자로 처리합니다.`);
        out.players.push({ name, gender: gender || 'M', handicap: base + senior, baseHandicap: base, seniorHandicap: senior,
          side: b.sideCol >= 0 ? yes(cell(rows, r, b.sideCol)) : false, champ: b.champCol >= 0 ? yes(cell(rows, r, b.champCol)) : false,
          nickname: b.nickCol >= 0 ? str(cell(rows, r, b.nickCol)) : '', group: b.group });
      }
    });
    if (!out.players.length) out.warnings.push('개인전 선수를 찾지 못했습니다.');

    // 3인조/스카치/베이커: 가장 왼쪽 블록의 (순번, 성명, 성별) 열을 사용
    const left = blocks.reduce((a, b) => (b.nameCol < a.nameCol ? b : a), blocks[0]);
    const sectionTeams = (from, to, size) => {
      const teams = []; let cur = null;
      for (let r = from; r < to; r++) {
        const name = str(cell(rows, r, left.nameCol));
        const numv = cell(rows, r, left.numCol);
        if (has(numv, '소계') || has(name, '소계')) break;
        const startsTeam = !isEmpty(numv) && Number.isFinite(Number(numv));
        if (startsTeam) { cur = { members: [] }; teams.push(cur); }
        if (isName(name)) { if (!cur) { cur = { members: [] }; teams.push(cur); } cur.members.push({ name, gender: genderOf(cell(rows, r, left.genderCol)) }); }
      }
      return teams.filter(t => t.members.length).map(t => { if (size && t.members.length !== size) out.warnings.push(`${size}인 팀 인원이 맞지 않습니다: ${t.members.map(m => m.name).join(', ')}`); return t.members; });
    };
    if (repsRow >= 0) {
      const to = [scotchRow, bakerRow, endRow].filter(x => x > repsRow).reduce((a, b) => Math.min(a, b), rows.length);
      for (let r = repsRow; r < to; r++) { const name = str(cell(rows, r, left.nameCol)); if (isName(name)) out.reps.push(name); }
    } else out.warnings.push('3인조(대표) 명단을 찾지 못했습니다.');
    if (scotchRow >= 0) { const to = [bakerRow, endRow].filter(x => x > scotchRow).reduce((a, b) => Math.min(a, b), rows.length); out.scotch = sectionTeams(scotchRow, to, 2); }
    if (bakerRow >= 0) out.baker = sectionTeams(bakerRow, endRow, 3);

    // 검증: 팀원/대표가 개인전 명단에 있는지 (오타면 비슷한 이름 제안), 스카치 남녀 구성
    const names = new Set(out.players.map(p => p.name));
    const gMap = new Map(out.players.map(p => [p.name, p.gender]));
    // 명단에 없는 이름: 한 글자만 다른 이름이 정확히 하나면 오타로 보고 그 이름으로 처리(경고 표시), 아니면 경고만
    const resolve = (label, n) => {
      if (names.has(n)) return n;
      const near = out.players.map(p => p.name).filter(x => x.length === n.length && distance(x, n) === 1);
      if (near.length === 1) { out.warnings.push(`${label} "${n}" 은(는) 명단에 없어 "${near[0]}" 으로 처리합니다. (오타 확인)`); return near[0]; }
      out.warnings.push(`${label} "${n}" 이(가) 개인전 명단에 없습니다.${near.length ? ` (혹시 ${near.join(', ')}?)` : ''}`);
      return n;
    };
    out.reps = out.reps.map(n => resolve('3인조', n));
    out.scotch.forEach(t => {
      t.forEach(m => { m.name = resolve('스카치', m.name); });
      const gs = t.map(m => gMap.get(m.name) || m.gender).sort().join('');
      if (t.length === 2 && gs !== 'FM') out.warnings.push(`스카치 팀 (${t.map(m => m.name).join(', ')}) 은 남 1명 + 여 1명이어야 합니다.`);
    });
    out.baker.forEach(t => t.forEach(m => { m.name = resolve('베이커', m.name); }));
    return out;
  }

  return { parse };
});
