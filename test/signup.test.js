const test = require('node:test');
const assert = require('node:assert/strict');
const Signup = require('../js/signup.js');
const fixture = require('./fixtures/signup-sample.json');

test('parses the real signup form: club, players, groups, handicaps, side', () => {
  const r = Signup.parse(fixture.rows);
  assert.equal(r.clubName, '드림존');
  assert.equal(r.players.length, 14);
  const by = Object.fromEntries(r.players.map(p => [p.name, p]));
  assert.equal(by['이진엽'].gender, 'M'); assert.equal(by['이진엽'].group, '1조'); assert.equal(by['이진엽'].handicap, 0); assert.equal(by['이진엽'].side, true);
  assert.equal(by['신희남'].gender, 'F'); assert.equal(by['신희남'].handicap, 15); assert.equal(by['신희남'].side, false);
  assert.equal(by['이충성'].group, '2조'); assert.equal(by['김미애'].group, '2조'); assert.equal(by['김미애'].handicap, 15);
  assert.equal(r.players.filter(p => p.group === '1조').length, 8);
  assert.equal(r.players.filter(p => p.group === '2조').length, 6);
  assert.equal(r.players.filter(p => p.side).length, 10);
});

test('parses reps, scotch and baker teams', () => {
  const r = Signup.parse(fixture.rows);
  assert.deepEqual(r.reps, ['김영균', '이충성', '최문기']);
  assert.deepEqual(r.scotch.map(t => t.map(m => m.name)), [['신희남', '윤상혁'], ['김미애', '최문기'], ['박은숙', '이두형'], ['강상희', '민현기']]);
  assert.deepEqual(r.baker.map(t => t.map(m => m.name)), [['이충성', '김성배', '김영균'], ['이진엽', '최수민', '이희태']]);
  assert.deepEqual(r.warnings, []);
});

test('senior handicap is added and warnings are produced for inconsistencies', () => {
  const rows = JSON.parse(JSON.stringify(fixture.rows));
  rows[5][6] = 3;            // 이진엽 시니어핸디 3
  rows[30][3] = '없는사람'; rows[30][4] = '여';   // 스카치 1팀 두번째 → 명단에 없는 이름, 여+여 구성
  const r = Signup.parse(rows);
  assert.equal(r.players.find(p => p.name === '이진엽').handicap, 3);
  assert.equal(r.players.find(p => p.name === '이진엽').seniorHandicap, 3);
  assert.ok(r.warnings.some(w => w.includes('없는사람')));
  assert.ok(r.warnings.some(w => w.includes('남 1명 + 여 1명')));
});

test('handles a form with three group blocks and empty sections', () => {
  const rows = [];
  rows[2] = ['', '클럽명', '', '부산'];
  rows[3] = ['', '개인전', '순번', '1조', '', '', '', '', '순번', '2조', '', '', '', '', '순번', '3조'];
  rows[4] = ['', '', '', '성명', '성별', '일반 핸디', '시니어핸디', '사이드', '', '성명', '성별', '일반 핸디', '시니어핸디', '사이드', '', '성명', '성별', '일반 핸디', '시니어핸디', '사이드'];
  rows[5] = ['', '', 1, '가나다', '남', null, null, 'O', 1, '라마바', '여', 15, null, 'X', 1, '사아자', '남', null, 2, 'O'];
  rows[6] = ['', '3인조', 1, '가나다', '남'];
  rows[7] = ['', '스카치'];
  rows[8] = ['', '베이커'];
  const r = Signup.parse(rows);
  assert.equal(r.clubName, '부산');
  assert.deepEqual(r.players.map(p => [p.name, p.group, p.handicap]), [['가나다', '1조', 0], ['라마바', '2조', 15], ['사아자', '3조', 2]]);
  assert.deepEqual(r.reps, ['가나다']);
  assert.deepEqual(r.scotch, []); assert.deepEqual(r.baker, []);
});
