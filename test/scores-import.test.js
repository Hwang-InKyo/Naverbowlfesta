const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/scores-import.js');

test('parse: csv, tabs, spaces, slashes, header, lane prefix', () => {
  const text = `이름,1게임,2게임,3게임
이진엽,189,174,180
신희남\t150\t160\t170
3 김영균 201 188 195
민현기 : 177/163
김 성배, 210, 199, 188, 999
`;
  const rows = S.parse(text, 3);
  assert.deepEqual(rows.map(r => [r.name, r.lane, r.games]), [
    ['이진엽', null, [189, 174, 180]],
    ['신희남', null, [150, 160, 170]],
    ['김영균', 3, [201, 188, 195]],
    ['민현기', null, [177, 163]],
    ['김성배', null, [210, 199, 188]]
  ]);
});

test('parse: lane after name when there are more numbers than games', () => {
  const rows = S.parse('이진엽 5 189 174 180', 3);
  assert.deepEqual(rows[0], { name: '이진엽', lane: 5, games: [189, 174, 180] });
  assert.equal(S.parse('점수 없음', 3).length, 0);
  assert.equal(S.parse('300 250', 3).length, 0);
});

test('similarity and matching prefer exact, then close names, one candidate per row', () => {
  const cands = [{ id: 'a', names: ['이진엽'], lane: 1 }, { id: 'b', names: ['이진영'], lane: 2 }, { id: 'c', names: ['김영균'], lane: 3 }];
  const rows = S.parse('이진엽 180 180 180\n이진영 170 170 170\n김영균 160 160 160\n홍길동 100 100 100', 3);
  const m = S.match(rows, cands);
  assert.deepEqual(m.map(r => r.candidateId), ['a', 'b', 'c', null]);
  assert.equal(m[0].confidence, 1);
  // OCR 오탈자: '이진염' → 이진엽 (거리 1)
  const m2 = S.match(S.parse('이진염 1 1 1', 3), cands);
  assert.equal(m2[0].candidateId, 'a');
  assert.ok(m2[0].confidence < 1 && m2[0].confidence >= 0.6);
});

test('lane agreement breaks ties', () => {
  const cands = [{ id: 'x', names: ['김민수'], lane: 4 }, { id: 'y', names: ['김민수'], lane: 9 }];
  const m = S.match(S.parse('9 김민수 200 200 200', 3), cands);
  assert.equal(m[0].candidateId, 'y');
});

test('team candidates match by any member name', () => {
  const cands = [{ id: 't1', names: ['신희남 · 윤상혁', '신희남', '윤상혁'] }, { id: 't2', names: ['김미애 · 최문기', '김미애', '최문기'] }];
  const m = S.match(S.parse('윤상혁 180 190\n김미애/최문기 170 160', 2), cands);
  assert.deepEqual(m.map(r => r.candidateId), ['t1', 't2']);
});
