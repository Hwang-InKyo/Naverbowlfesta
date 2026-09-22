# 🎳 Naverbowlfesta — 전국대회 운영 시스템

이번 전국대회 **한 대회 전용** 운영 웹앱입니다. 로그인 없이 누구나 참가 선수·조/레인 배정·실시간 순위·지역 종합을 볼 수 있고, 관리자는 PIN으로 로그인해 선수 등록, 배정, 점수 입력, 결과 확정을 합니다.

정적 HTML/JS만으로 동작하며(Netlify, Cloudflare Pages, GitHub Pages 어디든 무료 호스팅 가능) 데이터는 Google Sheets(Apps Script)에 저장합니다.

## 대회 진행 방식과 화면

| 종목 | 형식 | 게임 | 화면 |
|---|---|---|---|
| 개인전 | 전원, 3개조(2일) | 3 | 남자/여자/전체/조별 순위, 점수 입력 |
| 스카치 더블 | 남1 + 여1 | 2 | 팀 순위, 점수 입력 |
| 베이커 | 3인 팀 | 2 | 팀 순위, 점수 입력 |

**지역 종합 포인트** (기본 배점, 설정에서 변경 가능)

| 구분 | 1위 | 2위 | 3위 | 4위 | 5위 |
|---|---|---|---|---|---|
| 개인전 남자 | 5 | 4 | 3 | 2 | 1 |
| 개인전 여자 | 3 | 2 | 1 | | |
| 3인조 (지역 대표 3명 개인전 합계) | 3 | 2 | 1 | | |
| 스카치 | 3 | 2 | 1 | | |
| 베이커 | 3 | 2 | 1 | | |

합계가 가장 많은 지역이 우승기. 5인조 베이커는 폐지되어 앱에서 제외.

| 탭 | 내용 |
|---|---|
| 홈 | 대회 정보, 일정, 경기 규정 안내, 종목별 입력 진행률, 지역 종합·개인전 현재 순위 |
| 선수 | 참가 선수 명단(지역/성별/검색), 생년, 핸디, 가감, 조·레인, 출전 종목. 관리자: 지역 관리, 선수 등록/수정(핸디 직접 입력), 신청서 일괄 등록 |
| 배정 | 개인전 조별 레인표, 스카치/베이커 팀. 관리자: 조 자동 편성(지역별 균등), 레인 자동 배정(같은 지역 분산), 팀 만들기(팀 핸디·가감 입력), 직접 수정 |
| 개인전 | 남/여/전체/조별 순위. 관리자: 조별 점수 입력(자동 저장) |
| 스카치 · 베이커 | 팀 순위. 관리자: 점수 입력 |
| 지역종합 | 지역 종합 순위(포인트 상세), 3인조(지역 대표 합계) 순위. 관리자: 대회 시작/최종 확정/확정 해제 |
| 설정 | 대회 정보, 조 구성(조별 핸디 보너스), 경기 규정 안내문, 순위 기준, 게임 수, 배점표, 관리자 PIN, 서버 연결, 백업 |

### 핸디와 순위 규정
- **핸디는 관리자가 직접 입력**합니다 (선수별 게임당 핸디, 팀별 게임당 핸디). 규정(여성 15, 시니어 1~5, 최고 20, 장애 7, 베이커 여성 +3/+5 등)은 홈 화면 안내문으로 표시되고 계산은 입력값 기준입니다.
- **조별 핸디 보너스**: 설정의 조 표에서 아침 조 등 원하는 조에만 게임당 보너스(예: 10)를 지정하면 자동 가산됩니다.
- **총점 가감**: 프로 -21 같은 총점 단위 가감은 선수/팀의 "가감"에 입력. 게임당 감점(클럽티 -10 등)은 핸디에 음수로 입력.
- 개인전 순위 기준: 핸디 포함 총점(기본) 또는 스크래치. 동점은 비핸디(스크래치) → 하이게임 → 로우게임 → 연장자(생년) 순, 그래도 같으면 공동 순위
- 확정 시 순위·포인트를 스냅샷으로 저장

## 빠른 시작 (로컬 데모)

`index.html`을 브라우저로 열거나 정적 서버로 띄우면 됩니다. 서버 URL을 설정하지 않으면 데모 모드로 동작하며 샘플 데이터(5개 지역, 60명, 팀 22개)가 자동 생성됩니다. 관리자 PIN은 `0000`.

```bash
python3 -m http.server 8080   # http://localhost:8080
```

## 실제 운영 (Google Sheets 연동)

1. Google Sheets 새 스프레드시트 생성 → URL 중 `/d/…/edit` 의 `…` 부분이 스프레드시트 ID
2. 확장 프로그램 → Apps Script → `gas/Code.gs` 내용 붙여넣기, `SPREADSHEET_ID` 교체
3. 프로젝트 설정 → 스크립트 속성에 `ADMIN_PIN` 추가
4. 배포 → 새 배포 → 웹 앱 (실행 사용자: 본인 / 액세스: 모든 사용자) → 웹앱 URL 복사
5. 관리자 로그인 창의 **⚙ 서버 연결 설정** 또는 설정 탭 → 서버 연결에 URL 입력 (모든 기기 기본값으로 쓰려면 `js/store.js`의 `DEFAULT_API_URL`)

시트(`설정`, `지역`, `선수`, `팀`, `결과`)는 첫 호출 시 자동 생성됩니다. 조회는 누구나, 수정은 관리자 토큰(12시간)이 있어야 합니다.

## 신청서 일괄 등록 형식 (임시)

선수 탭 → 신청서 일괄 등록에 한 줄에 한 명씩 붙여넣기:
```
이름,지역,성별(남/여),에버,종목,대표,생년,핸디
홍길동,서울,남,185,개인 스카치,대표,1975,0
김영희,서울,여,160,개인 베이커,,1980,15
```
엑셀 신청서 양식이 확정되면 파일 업로드로 교체 예정.

## 구조

```
index.html          화면 골격
css/style.css       스타일 (모바일 우선)
js/ranking.js       순위·포인트 집계 엔진 (순수 함수)
js/lanes.js         조 편성 / 레인 배정 엔진 (순수 함수)
js/store.js         데이터 계층 (로컬 localStorage / Apps Script 서버)
js/sample-data.js   데모 데이터
js/app.js           UI
gas/Code.gs         Google Apps Script 백엔드
test/               node --test test/ranking.test.js test/lanes.test.js
```

### 데이터 모델
```js
settings { name, venue, dates[2], hostRegionId, status:'ready'|'live'|'final', lanes, laneFrom, perLane,
           groups:[{id,name,day,time,bonus}], basis, games:{individual,scotch,baker},
           repCount, points:{individualM,individualF,reps,scotch,baker}, schedule, rulesNote }
region   { id, name, leader, note }
player   { id, name, regionId, gender, birthYear, avg, handicap, adjust, isRep, group, lane, pos, games[], events:{individual,scotch,baker}, note }
team     { id, event:'scotch'|'baker', regionId, name, members:[playerId], lane, handicap, adjust, games[] }
results  확정 스냅샷 (Ranking.regionStandings 결과)
```
