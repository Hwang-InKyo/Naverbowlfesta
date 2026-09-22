/**
 * scores-import.js - 점수표 텍스트/CSV 붙여넣기 → 선수/팀 매칭 (순수 함수)
 *
 * 입력 예 (구분자: 쉼표, 탭, 공백, 슬래시 모두 허용, 머리글 행 자동 무시)
 *   이름,1게임,2게임,3게임
 *   이진엽,189,174,180
 *   3 신희남 150 160 170        ← 앞의 숫자는 레인으로 해석
 *   김영균 : 201/188/195
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScoresImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const norm = s => String(s == null ? '' : s).replace(/[\s\-_.()·]/g, '').toLowerCase();
  const isNum = t => /^\d{1,3}$/.test(t);

  /** 텍스트 → [{ name, lane, games:[..] }] */
  function parse(text, maxGames) {
    maxGames = maxGames || 3;
    const rows = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      const raw = line.trim();
      if (!raw) return;
      const tokens = raw.split(/[,\t;:/|]+|\s+/).map(t => t.trim()).filter(Boolean);
      if (!tokens.length) return;
      // 머리글: 숫자가 하나도 없거나 '이름/성명/게임' 포함
      const nums = tokens.filter(isNum);
      if (!nums.length || /이름|성명|게임|G1|합계|점수|순위|레인/i.test(tokens.filter(t => !isNum(t)).join(' ')) && nums.length < 1) return;
      const nameIdx = tokens.findIndex(t => !isNum(t));
      if (nameIdx < 0) return;
      const before = tokens.slice(0, nameIdx).filter(isNum);
      const after = tokens.slice(nameIdx + 1).filter(isNum).map(Number);
      // 이름 뒤에 숫자가 없으면 (예: "이름 189 174 180"이 아니라 "3 이름") 건너뜀
      const games = after.slice(0, maxGames).map(g => Math.max(0, Math.min(300, g)));
      if (!games.length) return;
      const lane = before.length ? Number(before[0]) : null;
      // 이름 뒤 첫 숫자가 레인일 수도 있음: 숫자가 maxGames+1개이고 첫 값이 작으면 레인으로 간주
      let name = tokens.slice(nameIdx, nameIdx + 1)[0];
      // 이름이 두 토큰으로 갈라진 경우 (예: "김 영균") 다음 토큰이 비숫자면 합침
      let k = nameIdx + 1; while (k < tokens.length && !isNum(tokens[k])) { name += tokens[k]; k++; }
      const afterAll = tokens.slice(k).filter(isNum).map(Number);
      let gs = afterAll, ln = lane;
      if (afterAll.length > maxGames && ln == null && afterAll[0] <= 60) { ln = afterAll[0]; gs = afterAll.slice(1); }
      rows.push({ name, lane: ln, games: gs.slice(0, maxGames).map(g => Math.max(0, Math.min(300, g))) });
    });
    return rows;
  }

  /** 편집 거리 기반 유사도 0~1 */
  function similarity(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.85;
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return 1 - d[m][n] / Math.max(m, n);
  }

  /**
   * 행을 후보에 매칭. candidates: [{ id, names:[..], lane }]
   * 반환: rows에 { candidateId, confidence, exact } 추가. 한 후보는 한 행에만 배정(점수 높은 순).
   */
  function match(rows, candidates, threshold) {
    threshold = threshold == null ? 0.6 : threshold;
    const pairs = [];
    rows.forEach((r, ri) => candidates.forEach(c => {
      let best = 0;
      (c.names || []).forEach(nm => { best = Math.max(best, similarity(r.name, nm)); });
      if (best >= threshold) pairs.push({ ri, cid: c.id, score: best + (r.lane != null && c.lane != null && Number(r.lane) === Number(c.lane) ? 0.05 : 0) });
    }));
    pairs.sort((a, b) => b.score - a.score);
    const usedR = new Set(), usedC = new Set();
    const out = rows.map(r => ({ ...r, candidateId: null, confidence: 0 }));
    pairs.forEach(p => {
      if (usedR.has(p.ri) || usedC.has(p.cid)) return;
      usedR.add(p.ri); usedC.add(p.cid);
      out[p.ri].candidateId = p.cid; out[p.ri].confidence = Math.min(1, p.score);
    });
    return out;
  }

  return { parse, similarity, match, norm };
});
