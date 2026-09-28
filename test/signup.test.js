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

const f45 = require('./fixtures/signup-45.json');
test('parses the 45th-tournament form: stacked 3조 block, side tables ignored, typo resolved', () => {
  const r = Signup.parse(f45.rows);
  assert.equal(r.clubName, '천안 레인보우존');
  assert.equal(r.players.length, 10, '참가비 표·차량 표의 이름은 세지 않음');
  const by = Object.fromEntries(r.players.map(p => [p.name, p]));
  assert.equal(by['이세훈'].group, '1조'); assert.equal(by['이세훈'].side, true); assert.equal(by['이세훈'].champ, true);
  assert.equal(r.players.filter(p => p.group === '2조').map(p => p.name).join(','), '이형민,기현철,이용철,박미영,이종훈,황선희');
  assert.equal(r.players.filter(p => p.group === '3조').map(p => p.name).join(','), '강미정,안진환,김영식');
  assert.equal(by['박미영'].gender, 'F'); assert.equal(by['박미영'].handicap, 15); assert.equal(by['강미정'].handicap, 15);
  assert.deepEqual(r.reps, ['이형민', '강미정', '김영식']);
  assert.deepEqual(r.scotch.map(t => t.map(m => m.name)), [['강미정', '김영식'], ['황선희', '이용철'], ['박미영', '이형민']]);
  assert.deepEqual(r.baker.map(t => t.map(m => m.name)), [['이종훈', '기현철', '안진환']]);
  assert.equal(r.warnings.length, 1); assert.ok(r.warnings[0].includes('감미정') && r.warnings[0].includes('강미정'));
});

const ftpl = require('./fixtures/signup-template.json');
test('parses the recommended template: 3 group blocks, 챔프전, 지역명, fee block', () => {
  const r = Signup.parse(ftpl.rows);
  assert.equal(r.clubName, '드림존'); assert.equal(r.regionName, '청주');
  assert.deepEqual(r.players.map(p => [p.name, p.group, p.gender, p.handicap, p.side, p.champ]), [
    ['홍길동', '1조', 'M', 0, true, true], ['김영희', '1조', 'F', 15, false, false], ['박철수', '1조', 'M', 3, true, true],
    ['이순자', '2조', 'F', 20, true, false], ['최민수', '2조', 'M', 0, false, false], ['정미라', '3조', 'F', 15, true, false], ['강동원', '3조', 'M', 0, true, false]]);
  assert.deepEqual(r.reps, ['홍길동', '박철수', '최민수']);
  assert.deepEqual(r.scotch.map(t => t.map(m => m.name)), [['홍길동', '김영희'], ['박철수', '이순자'], ['최민수', '정미라']]);
  assert.deepEqual(r.baker.map(t => t.map(m => m.name)), [['홍길동', '박철수', '최민수'], ['김영희', '이순자', '정미라']]);
  assert.deepEqual(r.fees, { items: { individual: { unit: 35000, qty: 7, amount: 245000 }, champ: { unit: 10000, qty: 2, amount: 20000 }, side: { unit: 10000, qty: 5, amount: 50000 },
    club: { unit: 110000, qty: 1, amount: 110000 }, clubDonation: { unit: 50000, qty: 1, amount: 50000 }, personalDonation: { unit: 0, qty: 0, amount: 30000 } }, total: 505000 });
  assert.deepEqual(r.warnings, []);
});

test('fee lines are read from the older forms too', () => {
  const a = Signup.parse(fixture.rows).fees;
  assert.equal(a.total, 760000); assert.equal(a.items.individual.qty, 14); assert.equal(a.items.individual.amount, 490000); assert.equal(a.items.side.qty, 10); assert.equal(a.items.club.amount, 110000);
  const b = Signup.parse(f45.rows).fees;
  assert.equal(b.total, 530000); assert.deepEqual(b.items.individual, { unit: 35000, qty: 10, amount: 350000 }); assert.deepEqual(b.items.champ, { unit: 10000, qty: 1, amount: 10000 });
  assert.ok(!b.items.side, '헤더의 사이드 옆 순번은 금액이 아님');
});

test('template: typo in a team is resolved, missing member warned', () => {
  const rows = JSON.parse(JSON.stringify(ftpl.rows));
  rows[30][1] = '김영히';        // 스카치 1팀 두번째
  rows[42][1] = null;           // 베이커 1팀 두번째 비움
  const r = Signup.parse(rows);
  assert.deepEqual(r.scotch[0].map(m => m.name), ['홍길동', '김영희']);
  assert.ok(r.warnings.some(w => w.includes('김영히') && w.includes('김영희')));
  assert.ok(r.warnings.some(w => w.includes('3인 팀 인원')));
});
