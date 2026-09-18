# 🎳 전국대회 관리 시스템 (tournament)

전국에 흩어진 볼링 클럽들이 모여 여는 **전국대회를 관리**하고, **각 회원이 자기 성적을 확인**하며, **대회 최종 순위를 집계**하는 웹 앱입니다.
서버 없이 정적 파일만으로 동작하며(GitHub Pages 가능), 데이터 저장소로 Google Sheets(Apps Script)를 사용합니다.

## 주요 기능

| 구분 | 기능 |
|---|---|
| 🏆 대회 | 대회 생성(날짜/장소/게임수/핸디캡 규정/부 편성), 참가자 등록(클럽별), 레인 배정, 점수 입력(자동 저장), 실시간 순위, 최종 순위 확정 |
| 🏅 순위 | 개인 종합 / 남자부 / 여자부 / 부별(A·B·C조) / 클럽 대항(상위 N명 합산) / 하이게임, CSV 내보내기·인쇄 |
| 👤 선수 조회 | 클럽·이름을 고르면 누구나 그 선수의 에버·대회 이력(순위, 게임 점수, 클럽 순위, 포인트)·통계 확인 |
| 🏢 클럽 | 클럽 등록/수정, 회원 수·평균 에버·클럽 대항 우승 횟수 |
| 👥 회원 | 회원 등록/수정/삭제, CSV 일괄 등록, 클럽별 필터·검색 |
| 📈 시즌 랭킹 | 연도별 개인·클럽 포인트 랭킹(확정 대회 기준), 기준 에버 TOP 20 |
| ⚙️ 설정 | 단체명, 순위 포인트표, 기본 핸디캡 규정, 관리자 PIN, 서버 연결, JSON 백업/복원 |

### 권한
- **일반 사용자**: 로그인 없이 모든 조회 기능 사용 (대회 일정·순위·선수 조회·클럽·회원·시즌 랭킹).
- **관리자**: 우측 상단 **관리자** 버튼 → PIN 입력. 대회 운영, 점수 입력, 클럽·회원·설정 편집. 회원 연락처는 관리자에게만 표시.

### 순위 집계 규칙 (`js/ranking.js`)
- **핸디캡(게임당)** = ⌊(기준점수 − 에버) × 비율⌋, 최대치 제한, 여성 추가 핀 (대회별 설정, 개인별 수동 지정 가능)
- **총점** = 스크래치 합계 + 핸디 × 친 게임 수
- **동점 처리**: 총점 → 스크래치 → 하이게임 → 마지막 게임 순. 모두 같으면 공동 순위(다음 순위 건너뜀)
- **클럽 대항**: 클럽별 총점 상위 N명 합산 (N은 대회별 설정, 0이면 전원)
- **시즌 포인트**: 확정 대회 순위별 포인트(기본 1위 10 · 2위 8 · 6 · 5 · 4 · 3 · 2 · 1, 그 외 참가 1점)
- 대회를 **확정**하면 결과가 스냅샷으로 저장되어 이후 회원 에버가 바뀌어도 기록이 유지됩니다.

## 빠른 시작 (로컬 데모)

`tournament/index.html`을 브라우저로 열거나 정적 서버로 띄우면 됩니다.

```bash
cd tournament
python3 -m http.server 8080   # http://localhost:8080
```

서버 URL을 설정하지 않으면 **로컬 데모 모드**로 동작하며 샘플 데이터(6개 클럽, 29명, 대회 3개)가 자동 생성됩니다.
- 관리자 PIN: `0000`
- 데이터는 해당 브라우저의 localStorage 에만 저장됩니다.

## 실제 운영 (Google Sheets 연동)

1. Google Sheets 새 스프레드시트 생성 → URL 중 `/d/…/edit` 의 `…` 부분이 스프레드시트 ID
2. 확장 프로그램 → Apps Script → `gas/Code.gs` 내용 붙여넣기, `SPREADSHEET_ID` 교체
3. 프로젝트 설정 → 스크립트 속성에 `ADMIN_PIN` 추가 (관리자 PIN)
4. 배포 → 새 배포 → 웹 앱 (실행 사용자: 본인 / 액세스: 모든 사용자) → 웹앱 URL 복사
5. 관리자 로그인 창의 **⚙ 서버 연결 설정** 또는 설정 탭 → 서버 연결에 URL 입력
   (모든 기기에서 기본으로 쓰려면 `js/store.js` 의 `DEFAULT_API_URL` 에 넣고 배포)

시트(`클럽`, `회원`, `대회`, `설정`)는 첫 호출 시 자동 생성됩니다. 조회는 누구나 가능하고, 수정은 관리자 PIN으로 받은 토큰(6시간 유효)이 있어야 합니다.

### GitHub Pages 배포
저장소 Settings → Pages → 브랜치 선택 후 `https://<계정>.github.io/<저장소>/tournament/` 로 접속합니다.

## 구조

```
tournament/
├── index.html          # 화면 골격
├── css/style.css       # 스타일 (모바일 우선)
├── js/ranking.js       # 순위 집계 엔진 (순수 함수, Node/브라우저 공용)
├── js/store.js         # 데이터 계층 (로컬 localStorage / Apps Script 서버)
├── js/sample-data.js   # 데모 데이터
├── js/app.js           # UI
├── gas/Code.gs         # Google Apps Script 백엔드
└── test/ranking.test.js
```

### 데이터 모델 (요약)
```js
club       { id, name, region, leader, note }
member     { id, name, clubId, gender:'M'|'F', avg, phone(관리자만), joinDate, note }
tournament { id, name, date, venue, hostClubId, status:'upcoming'|'live'|'final', numGames,
             handicap:{ type:'diff'|'none', base, rate, cap, femaleBonus },
             divisions:[{ name, min }], clubScoring:{ topN },
             entries:[{ memberId, clubId, avg, gender, lane, games:[...], handicapOverride? }],
             results? (확정 시 스냅샷), finalizedAt? }
```

## 테스트

```bash
cd tournament
node --test test/ranking.test.js
```
