/**
 * app.js - 전국대회 관리 UI
 */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const state = {
    data: null, auth: null, tab: 'home',
    tId: null, tSub: 'overview', rankView: 'individual', scoreSort: 'lane',
    memberClub: '', memberQ: '', editMember: null, editClub: null, editT: false,
    seasonYear: String(new Date().getFullYear()), dirtyTimer: null
  };

  // ===== 유틸 =====
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const STATUS = { upcoming: '예정', live: '진행중', final: '확정' };
  const statusBadge = s => `<span class="badge ${esc(s)}">${STATUS[s] || s}</span>`;
  const genderBadge = g => `<span class="badge gender-${g === 'F' ? 'F' : 'M'}">${g === 'F' ? '여' : '남'}</span>`;
  const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r;
  const isAdmin = () => state.auth && state.auth.role === 'admin';
  const myId = () => state.auth && state.auth.memberId;
  const clubById = id => (state.data.clubs || []).find(c => c.id === id);
  const clubName = id => { const c = clubById(id); return c ? c.name : '(무소속)'; };
  const memberById = id => (state.data.members || []).find(m => m.id === id);
  const tournamentById = id => (state.data.tournaments || []).find(t => t.id === id);
  const sortedTournaments = () => [...(state.data.tournaments || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  let toastTimer;
  function toast(msg, isErr) {
    const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (isErr ? ' error' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = 'toast', 2500);
  }
  function loading(on) { $('#loading').style.display = on ? 'flex' : 'none'; }
  async function run(fn, okMsg) {
    loading(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { console.error(e); toast(e.message || String(e), true); return undefined; }
    finally { loading(false); }
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function csv(rows) { return '﻿' + rows.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n'); }
  const clubOptions = (sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + (state.data.clubs || []).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  // ===== 초기화 =====
  async function init() {
    bindLogin();
    bindGlobal();
    await reload(true);
    const saved = Store.session();
    if (saved) { state.auth = saved; enterApp(); }
    else showLogin();
  }

  async function reload(silent) {
    const fn = async () => { state.data = await Store.loadAll(); };
    if (silent) { try { await fn(); } catch (e) { state.data = { clubs: [], members: [], tournaments: [], settings: {} }; toast('데이터 로드 실패: ' + e.message, true); } }
    else await run(fn);
  }

  // ===== 로그인 =====
  function showLogin() {
    const s = state.data.settings || {};
    $('#login-org').textContent = s.orgName || '전국 볼링 클럽 연합';
    const mode = $('#login-mode');
    mode.textContent = Store.mode() === 'remote' ? '서버 연결됨' : '로컬 데모 모드';
    mode.className = 'mode-badge ' + Store.mode();
    $('#login-club').innerHTML = clubOptions('', '클럽 선택');
    $('#login-demo-hint').innerHTML = Store.mode() === 'local'
      ? '데모 계정 — 관리자 PIN <b>0000</b> · 회원 PIN <b>1234</b><br>데이터는 이 브라우저에만 저장됩니다.'
      : '회원 PIN을 모르면 클럽 관리자에게 문의하세요.';
    $('#login-error').textContent = '';
    $('#login-screen').style.display = 'flex';
    $('#app-wrap').style.display = 'none';
  }

  function bindLogin() {
    $$('.login-tab').forEach(b => b.addEventListener('click', () => {
      $$('.login-tab').forEach(x => x.classList.toggle('active', x === b));
      $$('.login-panel').forEach(p => p.classList.toggle('active', p.id === 'login-' + b.dataset.loginTab));
      $('#login-error').textContent = '';
    }));
    $('#login-member').addEventListener('submit', async e => {
      e.preventDefault();
      await doLogin({ type: 'member', clubId: $('#login-club').value, name: $('#login-name').value.trim(), pin: $('#login-pin').value });
    });
    $('#login-admin').addEventListener('submit', async e => {
      e.preventDefault();
      await doLogin({ type: 'admin', pin: $('#login-admin-pin').value });
    });
    $('#btn-guest').addEventListener('click', () => doLogin({ type: 'guest' }));
    $('#btn-login-server').addEventListener('click', () => {
      const url = prompt('Apps Script 웹앱 URL을 입력하세요.\n비워두면 로컬 데모 모드로 동작합니다.', Store.getApiUrl());
      if (url === null) return;
      Store.setApiUrl(url);
      location.reload();
    });
  }

  async function doLogin(req) {
    $('#login-error').textContent = '';
    loading(true);
    try {
      state.auth = await Store.login(req);
      $('#login-pin').value = ''; $('#login-admin-pin').value = '';
      await reload(true);
      enterApp();
    } catch (e) { $('#login-error').textContent = e.message; }
    finally { loading(false); }
  }

  function enterApp() {
    $('#login-screen').style.display = 'none';
    $('#app-wrap').style.display = 'block';
    $('#header-org').textContent = '🎳 ' + ((state.data.settings || {}).orgName || '전국 볼링 클럽 연합');
    const badge = $('#user-badge');
    const a = state.auth;
    badge.textContent = a.role === 'admin' ? '관리자' + (a.name && a.name !== '관리자' ? ' · ' + a.name : '') : a.role === 'member' ? a.name + ' · ' + clubName(a.clubId) : '게스트';
    badge.className = 'user-badge ' + a.role;
    $$('.tab-btn[data-role]').forEach(b => {
      const need = b.dataset.role;
      b.style.display = (need === 'admin' && isAdmin()) || (need === 'member' && myId()) ? '' : 'none';
    });
    if (state.tab === 'settings' && !isAdmin()) state.tab = 'home';
    if (state.tab === 'me' && !myId()) state.tab = 'home';
    render();
  }

  async function logout() { await flushPending(); Store.logout(); state.auth = null; state.tab = 'home'; state.tId = null; showLogin(); }

  // ===== 렌더 =====
  function render() {
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    $$('.tab-content').forEach(s => s.classList.toggle('active', s.id === 'tab-' + state.tab));
    const el = $('#tab-' + state.tab);
    switch (state.tab) {
      case 'home': el.innerHTML = renderHome(); break;
      case 'tournaments': el.innerHTML = state.tId ? renderTournamentDetail() : renderTournamentList(); break;
      case 'me': el.innerHTML = renderMe(); break;
      case 'clubs': el.innerHTML = renderClubs(); break;
      case 'members': el.innerHTML = renderMembers(); break;
      case 'season': el.innerHTML = renderSeason(); break;
      case 'settings': el.innerHTML = renderSettings(); break;
    }
  }

  // ----- 홈 -----
  function renderHome() {
    const d = state.data;
    const ts = sortedTournaments();
    const live = ts.filter(t => t.status === 'live');
    const upcoming = ts.filter(t => t.status === 'upcoming' && t.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
    const finals = ts.filter(t => t.status === 'final');
    let html = '';

    if (live.length) {
      html += live.map(t => {
        const res = Ranking.resultsOf(t, d.members, d.clubs);
        return `<div class="card"><h2>🔴 진행 중 — ${esc(t.name)} <button class="btn btn-small btn-primary" data-action="open-t" data-id="${esc(t.id)}">실시간 순위 보기</button></h2>
          <p class="muted">${esc(t.date)} · ${esc(t.venue || '')} · 참가 ${res.individual.length}명</p>
          ${podium(res.individual)}</div>`;
      }).join('');
    }
    if (upcoming.length) {
      html += `<div class="card"><h2>📅 다가오는 대회</h2>${upcoming.map(t => tournamentItem(t)).join('')}</div>`;
    }
    if (finals.length) {
      const t = finals[0]; const res = Ranking.resultsOf(t, d.members, d.clubs);
      html += `<div class="card"><h2>🏅 최근 대회 결과 — ${esc(t.name)} <button class="btn btn-small btn-outline" data-action="open-t" data-id="${esc(t.id)}">자세히</button></h2>
        <p class="muted">${esc(t.date)} · ${esc(t.venue || '')}</p>
        <h3>개인 종합</h3>${podium(res.individual)}
        <h3>클럽 대항</h3>${podium(res.club, true)}</div>`;
    }
    if (myId()) {
      const h = Ranking.memberHistory(myId(), d.tournaments, d.members, d.clubs);
      const s = Ranking.memberStats(h);
      html += `<div class="card"><h2>👤 내 요약 <button class="btn btn-small btn-outline" data-action="tab" data-tab="me">내 정보</button></h2>
        <div class="stat-grid">${stat(s.tournaments, '대회 참가')}${stat(s.avgGame || '-', '대회 에버')}${stat(s.high || '-', '하이게임')}${stat(s.bestRank ? s.bestRank + '위' : '-', '최고 순위')}${stat(s.points, '시즌 포인트')}</div></div>`;
    }
    html += `<div class="card"><h2>📊 연합 현황</h2><div class="stat-grid">
      ${stat(d.clubs.length, '클럽')}${stat(d.members.length, '회원')}${stat(d.tournaments.length, '대회')}${stat(finals.length, '확정 대회')}
    </div></div>`;
    if (!html) html = '<div class="card"><p class="empty">등록된 대회가 없습니다.</p></div>';
    return html;
  }
  const stat = (v, l) => `<div class="stat"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;
  function podium(rows, isClub) {
    if (!rows || !rows.length) return '<p class="empty">아직 점수가 없습니다.</p>';
    const top = rows.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean);
    const cls = r => r.rank === 1 ? 'first' : r.rank === 2 ? 'second' : 'third';
    return `<div class="podium">${order.map(r => `<div class="p ${cls(r)}"><div>${medal(r.rank)}</div><div class="n">${esc(isClub ? r.clubName : r.name)}</div><div class="c">${esc(isClub ? r.counted + '명 합산' : r.clubName)}</div><div class="s">${r.total}</div></div>`).join('')}</div>`;
  }
  function tournamentItem(t) {
    return `<div class="list-item" data-action="open-t" data-id="${esc(t.id)}"><div><div class="title">${esc(t.name)}</div><div class="sub">${esc(t.date)} · ${esc(t.venue || '장소 미정')} · 주최 ${esc(clubName(t.hostClubId))} · ${(t.entries || []).length}명</div></div>${statusBadge(t.status)}</div>`;
  }

  // ----- 대회 목록 -----
  function renderTournamentList() {
    const ts = sortedTournaments();
    let html = `<div class="card"><h2>🏆 대회 목록 ${isAdmin() ? '<button class="btn btn-small btn-primary" data-action="new-t">＋ 새 대회</button>' : ''}</h2>`;
    html += ts.length ? ts.map(tournamentItem).join('') : '<p class="empty">등록된 대회가 없습니다.</p>';
    html += '</div>';
    if (state.editT && isAdmin()) html = tournamentForm(null) + html;
    return html;
  }

  function tournamentForm(t) {
    const s = state.data.settings || {};
    const h = (t && t.handicap) || s.defaultHandicap || Ranking.DEFAULT_HANDICAP;
    const divs = (t && t.divisions || []).map(d => `${d.name}:${d.min}`).join(', ');
    return `<div class="card"><h2>${t ? '✏️ 대회 정보 수정' : '＋ 새 대회 만들기'}</h2>
    <form data-form="save-t" data-id="${esc(t ? t.id : '')}">
      <div class="form-row">
        <div class="form-group" style="flex:2"><label>대회명</label><input type="text" name="name" required value="${esc(t ? t.name : '')}" placeholder="예: 2026 추계 전국대회"></div>
        <div class="form-group"><label>날짜</label><input type="date" name="date" required value="${esc(t ? t.date : today())}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>장소</label><input type="text" name="venue" value="${esc(t ? t.venue : '')}"></div>
        <div class="form-group"><label>주최 클럽</label><select name="hostClubId">${clubOptions(t ? t.hostClubId : '', '선택 안함')}</select></div>
        <div class="form-group"><label>게임 수</label><input type="number" name="numGames" min="1" max="10" value="${t ? t.numGames : 3}"></div>
      </div>
      <h3>핸디캡 규정</h3>
      <div class="form-row">
        <div class="form-group"><label>방식</label><select name="hType"><option value="diff" ${h.type !== 'none' ? 'selected' : ''}>(기준 − 에버) × 비율</option><option value="none" ${h.type === 'none' ? 'selected' : ''}>핸디 없음</option></select></div>
        <div class="form-group"><label>기준 점수</label><input type="number" name="hBase" value="${esc(h.base != null ? h.base : 200)}"></div>
        <div class="form-group"><label>비율</label><input type="number" name="hRate" step="0.05" value="${esc(h.rate != null ? h.rate : 0.8)}"></div>
        <div class="form-group"><label>최대 핸디</label><input type="number" name="hCap" value="${esc(h.cap != null ? h.cap : '')}" placeholder="없음"></div>
        <div class="form-group"><label>여성 추가</label><input type="number" name="hFemale" value="${esc(h.femaleBonus != null ? h.femaleBonus : 0)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2"><label>부(조) 편성 (에버 하한, 예: A조:180, B조:160, C조:0 / 비우면 없음)</label><input type="text" name="divisions" value="${esc(divs)}"></div>
        <div class="form-group"><label>클럽 대항 합산 인원 (0=전원)</label><input type="number" name="topN" min="0" value="${t && t.clubScoring ? t.clubScoring.topN : 5}"></div>
      </div>
      <div class="form-group"><label>메모</label><input type="text" name="note" value="${esc(t ? t.note : '')}"></div>
      <div class="row"><button class="btn btn-primary" type="submit">저장</button><button class="btn btn-outline" type="button" data-action="cancel-t">취소</button></div>
    </form></div>`;
  }

  // ----- 대회 상세 -----
  function renderTournamentDetail() {
    const t = tournamentById(state.tId);
    if (!t) { state.tId = null; return renderTournamentList(); }
    const subs = [['overview', '📋 개요'], ['ranking', '🏅 순위']];
    if (isAdmin()) subs.splice(1, 0, ['entries', '👥 참가자'], ['scores', '✏️ 점수입력']);
    if (isAdmin()) subs.push(['manage', '⚙️ 관리']);
    let html = `<div class="row between mb"><button class="btn btn-small btn-outline" data-action="back-t">← 목록</button>${statusBadge(t.status)}</div>
      <div class="card"><h2>${esc(t.name)}</h2><p class="muted">${esc(t.date)} · ${esc(t.venue || '장소 미정')} · 주최 ${esc(clubName(t.hostClubId))} · ${t.numGames}게임 · 참가 ${(t.entries || []).length}명</p>
      ${t.note ? `<p class="small mt">${esc(t.note)}</p>` : ''}</div>
      <div class="subtabs">${subs.map(([k, l]) => `<button class="subtab ${state.tSub === k ? 'active' : ''}" data-action="tsub" data-sub="${k}">${l}</button>`).join('')}</div>`;
    switch (state.tSub) {
      case 'entries': html += renderEntries(t); break;
      case 'scores': html += renderScores(t); break;
      case 'ranking': html += renderRanking(t); break;
      case 'manage': html += renderManage(t); break;
      default: html += renderOverview(t);
    }
    return html;
  }

  function handicapText(h) {
    if (!h || h.type === 'none') return '핸디 없음';
    let s = `(${h.base} − 에버) × ${h.rate == null || h.rate === '' ? 1 : h.rate}`;
    if (h.cap !== '' && h.cap != null) s += `, 최대 ${h.cap}`;
    if (h.femaleBonus) s += `, 여성 +${h.femaleBonus}`;
    return s;
  }

  function renderOverview(t) {
    const d = state.data;
    const res = Ranking.resultsOf(t, d.members, d.clubs);
    const byClub = {};
    (t.entries || []).forEach(e => { const m = memberById(e.memberId); const c = clubName(e.clubId || (m && m.clubId)); byClub[c] = (byClub[c] || 0) + 1; });
    let html = `<div class="card"><h2>대회 규정</h2>
      <div class="stat-grid">${stat(t.numGames, '게임 수')}${stat((t.entries || []).length, '참가자')}${stat(Object.keys(byClub).length, '참가 클럽')}${stat(t.clubScoring && t.clubScoring.topN ? t.clubScoring.topN + '명' : '전원', '클럽 합산')}</div>
      <p class="small mt"><b>핸디캡:</b> ${esc(handicapText(t.handicap))}</p>
      ${(t.divisions || []).length ? `<p class="small"><b>부 편성:</b> ${t.divisions.map(x => esc(x.name) + ' (' + x.min + '↑)').join(', ')}</p>` : ''}
      </div>`;
    if (res.individual.some(r => r.gamesPlayed > 0)) {
      html += `<div class="card"><h2>개인 종합 TOP 3</h2>${podium(res.individual)}</div><div class="card"><h2>클럽 대항 TOP 3</h2>${podium(res.club, true)}</div>`;
    }
    html += `<div class="card"><h2>클럽별 참가 인원</h2>${Object.keys(byClub).length ? `<div class="row">${Object.entries(byClub).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<span class="chip">${esc(c)} <b>${n}</b></span>`).join('')}</div>` : '<p class="empty">참가자가 없습니다.</p>'}</div>`;
    if (myId() && (t.entries || []).some(e => e.memberId === myId())) {
      const r = res.individual.find(x => x.memberId === myId());
      html += `<div class="card"><h2>내 성적</h2><div class="stat-grid">${stat(r.rank + '위', '개인 순위')}${stat(r.total, '총점')}${stat(r.scratch, '스크래치')}${stat(r.handicap, '핸디/게임')}${stat(r.high || '-', '하이게임')}</div><p class="small mt">게임: ${r.games.map(g => g == null ? '-' : g).join(' / ')}</p></div>`;
    }
    return html;
  }

  function renderEntries(t) {
    const d = state.data;
    const entered = new Set((t.entries || []).map(e => e.memberId));
    const club = state.entryClub || (d.clubs[0] && d.clubs[0].id) || '';
    const candidates = d.members.filter(m => m.clubId === club && !entered.has(m.id)).sort((a, b) => b.avg - a.avg);
    let html = `<div class="card"><h2>참가자 추가</h2>
      <div class="form-row"><div class="form-group"><label>클럽</label><select data-change="entry-club">${clubOptions(club)}</select></div></div>
      ${candidates.length ? `<label class="checkbox-item"><input type="checkbox" data-change="entry-all"> <b>전체 선택</b></label>
      <div class="checkbox-grid" id="entry-grid">${candidates.map(m => `<label class="checkbox-item"><input type="checkbox" class="entry-cb" value="${esc(m.id)}"> ${esc(m.name)} <small>${m.gender === 'F' ? '여' : '남'} · ${m.avg}</small></label>`).join('')}</div>
      <button class="btn btn-primary btn-small mt" data-action="add-entries">선택 회원 참가 등록</button>` : '<p class="empty">추가할 수 있는 회원이 없습니다.</p>'}
    </div>`;
    const rows = Ranking.buildRows(t, d.members, d.clubs).sort((a, b) => a.clubName.localeCompare(b.clubName, 'ko') || b.avg - a.avg);
    html += `<div class="card"><h2>참가자 명단 (${rows.length}명)</h2>
      <p class="muted small mb">에버는 등록 시점 값이 저장됩니다. 필요 시 직접 수정하세요. 핸디 칸을 비우면 규정에 따라 자동 계산됩니다.</p>
      <div class="table-scroll"><table class="tbl"><thead><tr><th class="left">이름</th><th class="left">클럽</th><th>성별</th><th>에버</th><th>핸디</th><th>레인</th><th></th></tr></thead><tbody>
      ${rows.map(r => { const e = t.entries.find(x => x.memberId === r.memberId); return `<tr>
        <td class="left"><b>${esc(r.name)}</b></td><td class="left">${esc(r.clubName)}</td><td>${genderBadge(r.gender)}</td>
        <td><input type="number" data-entry="${esc(r.memberId)}" data-field="avg" value="${esc(e.avg != null ? e.avg : '')}" placeholder="${esc(r.avg)}"></td>
        <td><input type="number" data-entry="${esc(r.memberId)}" data-field="handicapOverride" value="${esc(e.handicapOverride != null ? e.handicapOverride : '')}" placeholder="${r.handicap}"></td>
        <td><input type="text" class="lane" data-entry="${esc(r.memberId)}" data-field="lane" value="${esc(e.lane || '')}"></td>
        <td><button class="btn btn-xs btn-danger" data-action="rm-entry" data-id="${esc(r.memberId)}">삭제</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">참가자가 없습니다.</td></tr>'}
      </tbody></table></div>
      <div class="row between mt"><span class="save-state" id="save-state"></span></div></div>`;
    return html;
  }

  function renderScores(t) {
    const d = state.data;
    let rows = Ranking.buildRows(t, d.members, d.clubs);
    const sorters = { lane: (a, b) => (num(a.lane, 999) - num(b.lane, 999)) || a.name.localeCompare(b.name, 'ko'), name: (a, b) => a.name.localeCompare(b.name, 'ko'), club: (a, b) => a.clubName.localeCompare(b.clubName, 'ko') || a.name.localeCompare(b.name, 'ko') };
    rows.sort(sorters[state.scoreSort] || sorters.lane);
    const n = t.numGames;
    const done = rows.filter(r => r.gamesPlayed === n).length;
    return `<div class="card"><h2>점수 입력 <span class="row"><select class="btn-small" data-change="score-sort" style="width:auto">${[['lane', '레인순'], ['name', '이름순'], ['club', '클럽순']].map(([k, l]) => `<option value="${k}" ${state.scoreSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></span></h2>
      <p class="muted small mb">입력하면 자동 저장됩니다. 완료 ${done}/${rows.length}명 · 총점 = 스크래치 + 핸디 × 게임수 <span class="save-state" id="save-state"></span></p>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>레인</th><th class="left">이름</th><th class="left">클럽</th><th>핸디</th>${Array.from({ length: n }, (_, i) => `<th>G${i + 1}</th>`).join('')}<th>합계</th><th>총점</th></tr></thead><tbody>
      ${rows.map(r => `<tr data-row="${esc(r.memberId)}"><td>${esc(r.lane || '-')}</td><td class="left"><b>${esc(r.name)}</b></td><td class="left small">${esc(r.clubName)}</td><td>${r.handicap}</td>
        ${r.games.map((g, i) => `<td><input type="number" min="0" max="300" inputmode="numeric" data-score="${esc(r.memberId)}" data-g="${i}" value="${g == null ? '' : g}"></td>`).join('')}
        <td class="c-scratch">${r.scratch}</td><td class="c-total strong">${r.total}</td></tr>`).join('') || `<tr><td colspan="${n + 6}" class="empty">참가자를 먼저 등록하세요.</td></tr>`}
      </tbody></table></div></div>`;
  }

  function renderRanking(t) {
    const d = state.data;
    const res = Ranking.resultsOf(t, d.members, d.clubs);
    const views = [['individual', '개인 종합'], ['male', '남자부'], ['female', '여자부']];
    Object.keys(res.divisions || {}).forEach(k => views.push(['div:' + k, k]));
    views.push(['club', '클럽 대항'], ['high', '하이게임']);
    const v = state.rankView;
    let html = `<div class="subtabs">${views.map(([k, l]) => `<button class="subtab ${v === k ? 'active' : ''}" data-action="rank-view" data-view="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;
    const title = (views.find(x => x[0] === v) || views[0])[1];
    const actions = `<span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="export-csv">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span>`;
    if (t.status === 'final' && t.results) html += `<p class="muted small mb">✅ ${esc((t.finalizedAt || '').slice(0, 16).replace('T', ' '))} 확정된 결과입니다.</p>`;
    else if (t.status !== 'final') html += `<p class="muted small mb">⏱ 실시간 집계 중 — 입력된 게임 기준 순위입니다.</p>`;

    if (v === 'club') {
      html += `<div class="card"><h2>${title} ${actions}</h2><div class="table-scroll"><table class="tbl" id="rank-table"><thead><tr><th>순위</th><th class="left">클럽</th><th>참가</th><th>합산</th><th>총점</th><th>스크래치</th><th>게임에버</th><th class="left">합산 선수</th></tr></thead><tbody>
        ${res.club.map(c => `<tr class="rank-${c.rank}"><td>${medal(c.rank)}</td><td class="left"><b>${esc(c.clubName)}</b></td><td>${c.entries}</td><td>${c.counted}${c.short ? ' ⚠' : ''}</td><td class="strong">${c.total}</td><td>${c.scratch}</td><td>${c.avgGame}</td><td class="left small">${c.top.map(p => esc(p.name) + '(' + p.total + ')').join(', ')}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">데이터 없음</td></tr>'}
        </tbody></table></div><p class="muted small mt">⚠ 합산 인원 미달 클럽</p></div>`;
      return html;
    }
    if (v === 'high') {
      html += `<div class="card"><h2>${title} ${actions}</h2><div class="table-scroll"><table class="tbl" id="rank-table"><thead><tr><th>순위</th><th class="left">이름</th><th class="left">클럽</th><th>하이게임</th><th>스크래치</th></tr></thead><tbody>
        ${res.highGame.map(r => `<tr class="rank-${r.rank} ${r.memberId === myId() ? 'me' : ''}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.name)}</b></td><td class="left">${esc(r.clubName)}</td><td class="strong">${r.high}</td><td>${r.scratch}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">데이터 없음</td></tr>'}
        </tbody></table></div></div>`;
      return html;
    }
    const rows = v === 'male' ? res.male : v === 'female' ? res.female : v.startsWith('div:') ? (res.divisions[v.slice(4)] || []) : res.individual;
    const n = t.numGames;
    const showDiv = v === 'individual' && (t.divisions || []).length > 0;
    html += `<div class="card"><h2>${title} <span class="muted small">${rows.length}명</span> ${actions}</h2><div class="table-scroll"><table class="tbl" id="rank-table"><thead><tr><th>순위</th><th class="left">이름</th><th class="left">클럽</th>${showDiv ? '<th>부</th>' : ''}<th>에버</th><th>핸디</th>${Array.from({ length: n }, (_, i) => `<th>G${i + 1}</th>`).join('')}<th>스크래치</th><th>총점</th><th>하이</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="rank-${r.rank} ${r.memberId === myId() ? 'me' : ''}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.name)}</b> ${r.gender === 'F' ? '<span class="badge gender-F">여</span>' : ''}</td><td class="left">${esc(r.clubName)}</td>${showDiv ? `<td>${esc(r.division)}</td>` : ''}<td>${r.avg}</td><td>${r.handicap}</td>${r.games.map(g => `<td>${g == null ? '-' : g}</td>`).join('')}<td>${r.scratch}</td><td class="strong">${r.total}</td><td>${r.high || '-'}</td></tr>`).join('') || `<tr><td colspan="${n + 9}" class="empty">데이터 없음</td></tr>`}
      </tbody></table></div></div>`;
    return html;
  }

  function renderManage(t) {
    const total = (t.entries || []).length;
    const complete = Ranking.buildRows(t, state.data.members, state.data.clubs).filter(r => r.gamesPlayed === t.numGames).length;
    let html = `<div class="card"><h2>대회 상태</h2><p class="small mb">현재: ${statusBadge(t.status)} · 점수 입력 완료 ${complete}/${total}명</p>
      <div class="row">
        ${t.status !== 'upcoming' ? '<button class="btn btn-small btn-outline" data-action="set-status" data-status="upcoming">예정으로</button>' : ''}
        ${t.status !== 'live' ? '<button class="btn btn-small btn-secondary" data-action="set-status" data-status="live">진행중으로</button>' : ''}
        ${t.status !== 'final' ? '<button class="btn btn-small btn-success" data-action="finalize">🏁 최종 순위 확정</button>' : ''}
      </div>
      <p class="muted small mt">확정하면 순위가 스냅샷으로 저장되어 이후 회원 에버가 바뀌어도 결과가 유지되며, 시즌 랭킹에 반영됩니다.</p></div>`;
    html += state.editT ? tournamentForm(t) : `<div class="card"><h2>대회 정보</h2><div class="row"><button class="btn btn-small btn-outline" data-action="edit-t">✏️ 정보/규정 수정</button><button class="btn btn-small btn-danger" data-action="del-t">🗑 대회 삭제</button></div></div>`;
    return html;
  }

  // ----- 내 정보 -----
  function renderMe() {
    const m = memberById(myId());
    if (!m) return '<div class="card"><p class="empty">회원 계정으로 로그인하면 내 정보를 볼 수 있습니다.</p></div>';
    const d = state.data;
    const h = Ranking.memberHistory(m.id, d.tournaments, d.members, d.clubs);
    const s = Ranking.memberStats(h);
    return `<div class="card"><h2>👤 ${esc(m.name)} ${genderBadge(m.gender)} ${m.role === 'admin' ? '<span class="badge admin">관리자</span>' : ''}</h2>
      <div class="stat-grid">${stat(clubName(m.clubId), '소속 클럽')}${stat(m.avg, '기준 에버')}${stat(m.joinDate || '-', '가입일')}</div>
      <form data-form="save-profile" class="mt"><div class="form-row"><div class="form-group"><label>연락처</label><input type="tel" name="phone" value="${esc(m.phone || '')}" placeholder="010-0000-0000"></div><div class="form-group" style="flex:0;align-self:flex-end"><button class="btn btn-small btn-outline" type="submit">저장</button></div></div></form>
    </div>
    <div class="card"><h2>📊 대회 통계</h2><div class="stat-grid">${stat(s.tournaments, '참가 대회')}${stat(s.games, '총 게임')}${stat(s.avgGame || '-', '대회 에버')}${stat(s.high || '-', '하이게임')}${stat(s.bestRank ? s.bestRank + '위' : '-', '최고 순위')}${stat(s.wins, '우승')}${stat(s.podiums, '입상(3위 내)')}${stat(s.points, '시즌 포인트')}</div></div>
    <div class="card"><h2>🏆 대회 이력</h2>${h.length ? `<div class="table-scroll"><table class="tbl"><thead><tr><th class="left">대회</th><th>날짜</th><th>상태</th><th>게임</th><th>스크래치</th><th>핸디</th><th>총점</th><th>순위</th><th>${m.gender === 'F' ? '여자부' : '남자부'}</th><th>클럽순위</th><th>포인트</th></tr></thead><tbody>
      ${h.map(x => `<tr data-action="open-t" data-id="${esc(x.tournamentId)}" style="cursor:pointer"><td class="left"><b>${esc(x.name)}</b></td><td>${esc(x.date)}</td><td>${statusBadge(x.status)}</td><td>${x.games.map(g => g == null ? '-' : g).join('/')}</td><td>${x.scratch}</td><td>${x.handicap}</td><td class="strong">${x.total}</td><td class="rank-${x.rank}">${medal(x.rank)} <span class="muted">/${x.entries}</span></td><td>${x.genderRank ? x.genderRank + '/' + x.genderEntries : '-'}</td><td>${x.clubRank ? x.clubRank + '/' + x.clubCount : '-'}</td><td>${x.points || '-'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">참가한 대회가 없습니다.</p>'}</div>
    <div class="card"><h2>🔐 PIN 변경</h2><form data-form="change-pin"><div class="form-row"><div class="form-group"><label>현재 PIN</label><input type="password" name="oldPin" inputmode="numeric" maxlength="6" required></div><div class="form-group"><label>새 PIN (숫자 4~6자리)</label><input type="password" name="newPin" inputmode="numeric" maxlength="6" required></div><div class="form-group"><label>새 PIN 확인</label><input type="password" name="newPin2" inputmode="numeric" maxlength="6" required></div></div><button class="btn btn-small btn-primary" type="submit">변경</button></form></div>`;
  }

  // ----- 클럽 -----
  function renderClubs() {
    const d = state.data;
    const ec = state.editClub;
    let html = '';
    if (isAdmin()) {
      html += `<div class="card"><h2>${ec && ec.id ? '✏️ 클럽 수정' : '＋ 클럽 등록'}</h2><form data-form="save-club" data-id="${esc(ec ? ec.id || '' : '')}">
        <div class="form-row"><div class="form-group"><label>클럽명</label><input type="text" name="name" required value="${esc(ec ? ec.name : '')}"></div><div class="form-group"><label>지역</label><input type="text" name="region" value="${esc(ec ? ec.region : '')}"></div><div class="form-group"><label>회장</label><input type="text" name="leader" value="${esc(ec ? ec.leader : '')}"></div></div>
        <div class="form-group"><label>비고</label><input type="text" name="note" value="${esc(ec ? ec.note : '')}"></div>
        <div class="row"><button class="btn btn-small btn-primary" type="submit">저장</button>${ec ? '<button class="btn btn-small btn-outline" type="button" data-action="cancel-club">취소</button>' : ''}</div></form></div>`;
    }
    const finals = d.tournaments.filter(t => t.status === 'final');
    html += `<div class="card"><h2>🏢 클럽 (${d.clubs.length})</h2><div class="club-grid">${d.clubs.map(c => {
      const ms = d.members.filter(m => m.clubId === c.id);
      const avg = ms.length ? Math.round(ms.reduce((s, m) => s + num(m.avg), 0) / ms.length) : 0;
      const wins = finals.filter(t => { const r = Ranking.resultsOf(t, d.members, d.clubs); return r.club[0] && r.club[0].clubId === c.id && r.club[0].rank === 1; }).length;
      return `<div class="club-card"><div class="row between"><span class="name">${esc(c.name)}</span><span class="badge">${esc(c.region || '')}</span></div>
        <div class="meta">회장 ${esc(c.leader || '-')}<br>회원 ${ms.length}명 · 평균 에버 ${avg}<br>클럽 대항 우승 ${wins}회${c.note ? '<br>' + esc(c.note) : ''}</div>
        <div class="row mt"><button class="btn btn-xs btn-outline" data-action="club-members" data-id="${esc(c.id)}">회원 보기</button>${isAdmin() ? `<button class="btn btn-xs btn-outline" data-action="edit-club" data-id="${esc(c.id)}">수정</button><button class="btn btn-xs btn-danger" data-action="del-club" data-id="${esc(c.id)}">삭제</button>` : ''}</div></div>`;
    }).join('') || '<p class="empty">등록된 클럽이 없습니다.</p>'}</div></div>`;
    return html;
  }

  // ----- 회원 -----
  function renderMembers() {
    const d = state.data;
    const em = state.editMember;
    let html = '';
    if (isAdmin()) {
      html += `<div class="card"><h2>${em && em.id ? '✏️ 회원 수정' : '＋ 회원 등록'}</h2><form data-form="save-member" data-id="${esc(em ? em.id || '' : '')}">
        <div class="form-row"><div class="form-group"><label>이름</label><input type="text" name="name" required value="${esc(em ? em.name : '')}"></div><div class="form-group"><label>클럽</label><select name="clubId" required>${clubOptions(em ? em.clubId : state.memberClub, '선택')}</select></div><div class="form-group"><label>성별</label><select name="gender"><option value="M" ${em && em.gender === 'F' ? '' : 'selected'}>남</option><option value="F" ${em && em.gender === 'F' ? 'selected' : ''}>여</option></select></div></div>
        <div class="form-row"><div class="form-group"><label>기준 에버</label><input type="number" name="avg" required value="${esc(em ? em.avg : '')}"></div><div class="form-group"><label>가입일</label><input type="date" name="joinDate" value="${esc(em ? em.joinDate : '')}"></div><div class="form-group"><label>연락처</label><input type="tel" name="phone" value="${esc(em ? em.phone : '')}"></div></div>
        <div class="form-row"><div class="form-group"><label>역할</label><select name="role"><option value="member" ${em && em.role === 'admin' ? '' : 'selected'}>회원</option><option value="admin" ${em && em.role === 'admin' ? 'selected' : ''}>관리자</option></select></div><div class="form-group"><label>PIN ${em && em.id ? '(비우면 유지, 입력하면 초기화)' : '(비우면 기본 PIN)'}</label><input type="text" name="pin" inputmode="numeric" maxlength="6" placeholder="숫자 4~6자리"></div><div class="form-group"><label>비고</label><input type="text" name="note" value="${esc(em ? em.note : '')}"></div></div>
        <div class="row"><button class="btn btn-small btn-primary" type="submit">저장</button>${em ? '<button class="btn btn-small btn-outline" type="button" data-action="cancel-member">취소</button>' : ''}</div></form></div>`;
      html += `<div class="card"><h2>📥 회원 일괄 등록 (CSV)</h2><p class="muted small mb">한 줄에 한 명: <code>이름,클럽명,성별(남/여),에버,연락처</code> · 같은 클럽의 동명 회원은 에버/성별이 갱신됩니다.</p>
        <form data-form="import-members"><textarea name="csv" placeholder="홍길동,아르케 존,남,185,010-1234-5678"></textarea><button class="btn btn-small btn-primary mt" type="submit">가져오기</button></form></div>`;
    }
    const q = state.memberQ.trim();
    let list = d.members.filter(m => (!state.memberClub || m.clubId === state.memberClub) && (!q || m.name.includes(q)));
    list.sort((a, b) => clubName(a.clubId).localeCompare(clubName(b.clubId), 'ko') || b.avg - a.avg || a.name.localeCompare(b.name, 'ko'));
    const finals = d.tournaments.filter(t => t.status === 'final');
    html += `<div class="card"><h2>👥 회원 (${list.length}/${d.members.length})</h2>
      <div class="form-row mb"><div class="form-group"><select data-change="member-club">${clubOptions(state.memberClub, '전체 클럽')}</select></div><div class="form-group"><input type="text" data-input="member-q" placeholder="이름 검색" value="${esc(state.memberQ)}"></div></div>
      <div class="table-scroll"><table class="tbl"><thead><tr><th class="left">이름</th><th class="left">클럽</th><th>성별</th><th>에버</th><th>대회</th><th>우승</th>${isAdmin() ? '<th>PIN</th><th></th>' : ''}</tr></thead><tbody>
      ${list.map(m => {
        const hist = Ranking.memberHistory(m.id, finals, d.members, d.clubs);
        return `<tr class="${m.id === myId() ? 'me' : ''}"><td class="left"><b>${esc(m.name)}</b> ${m.role === 'admin' ? '<span class="badge admin">관리자</span>' : ''}</td><td class="left">${esc(clubName(m.clubId))}</td><td>${genderBadge(m.gender)}</td><td>${m.avg}</td><td>${hist.length}</td><td>${hist.filter(h => h.rank === 1).length || '-'}</td>
        ${isAdmin() ? `<td>${m.hasPin ? '설정됨' : '<span class="muted">기본</span>'}</td><td class="nowrap"><button class="btn btn-xs btn-outline" data-action="edit-member" data-id="${esc(m.id)}">수정</button> <button class="btn btn-xs btn-danger" data-action="del-member" data-id="${esc(m.id)}">삭제</button></td>` : ''}</tr>`;
      }).join('') || `<tr><td colspan="8" class="empty">회원이 없습니다.</td></tr>`}
      </tbody></table></div></div>`;
    return html;
  }

  // ----- 시즌 랭킹 -----
  function renderSeason() {
    const d = state.data;
    const years = [...new Set(d.tournaments.map(t => String(t.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    if (!years.includes(state.seasonYear)) state.seasonYear = years[0] || state.seasonYear;
    const pts = d.settings.pointsTable || Ranking.DEFAULT_POINTS;
    const ind = Ranking.seasonRanking(d.tournaments, d.members, d.clubs, state.seasonYear, pts);
    const club = Ranking.seasonClubRanking(d.tournaments, d.members, d.clubs, state.seasonYear, pts);
    const cnt = d.tournaments.filter(t => t.status === 'final' && String(t.date).startsWith(state.seasonYear)).length;
    const avgRank = [...d.members].sort((a, b) => b.avg - a.avg).slice(0, 20);
    return `<div class="card"><h2>📈 시즌 랭킹 <select data-change="season-year" style="width:auto">${years.map(y => `<option value="${y}" ${y === state.seasonYear ? 'selected' : ''}>${y}년</option>`).join('') || `<option>${state.seasonYear}</option>`}</select></h2>
      <p class="muted small">확정 대회 ${cnt}개 기준 · 순위 포인트: ${pts.map((p, i) => (i + 1) + '위 ' + p).join(', ')}, 이하 참가 ${Ranking.PARTICIPATION_POINT}점</p></div>
    <div class="card"><h2>개인 시즌 랭킹</h2><div class="table-scroll"><table class="tbl"><thead><tr><th>순위</th><th class="left">이름</th><th class="left">클럽</th><th>포인트</th><th>대회</th><th>우승</th><th>최고</th><th>게임에버</th><th>하이</th></tr></thead><tbody>
      ${ind.map(r => `<tr class="rank-${r.rank} ${r.memberId === myId() ? 'me' : ''}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.name)}</b></td><td class="left">${esc(r.clubName)}</td><td class="strong">${r.points}</td><td>${r.tournaments}</td><td>${r.wins || '-'}</td><td>${r.best}위</td><td>${r.avgGame}</td><td>${r.high}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">확정된 대회가 없습니다.</td></tr>'}
      </tbody></table></div></div>
    <div class="card"><h2>클럽 시즌 랭킹</h2><div class="table-scroll"><table class="tbl"><thead><tr><th>순위</th><th class="left">클럽</th><th>포인트</th><th>대회</th><th>우승</th><th>누적 총점</th></tr></thead><tbody>
      ${club.map(c => `<tr class="rank-${c.rank}"><td>${medal(c.rank)}</td><td class="left"><b>${esc(c.clubName)}</b></td><td class="strong">${c.points}</td><td>${c.tournaments}</td><td>${c.wins || '-'}</td><td>${c.total}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">확정된 대회가 없습니다.</td></tr>'}
      </tbody></table></div></div>
    <div class="card"><h2>기준 에버 TOP 20</h2><div class="table-scroll"><table class="tbl"><thead><tr><th>#</th><th class="left">이름</th><th class="left">클럽</th><th>성별</th><th>에버</th></tr></thead><tbody>
      ${avgRank.map((m, i) => `<tr class="${m.id === myId() ? 'me' : ''}"><td>${i + 1}</td><td class="left"><b>${esc(m.name)}</b></td><td class="left">${esc(clubName(m.clubId))}</td><td>${genderBadge(m.gender)}</td><td class="strong">${m.avg}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  // ----- 설정 -----
  function renderSettings() {
    const s = state.data.settings || {};
    const h = s.defaultHandicap || Ranking.DEFAULT_HANDICAP;
    return `<div class="card"><h2>⚙️ 기본 설정</h2><form data-form="save-settings">
      <div class="form-group"><label>연합/단체명</label><input type="text" name="orgName" value="${esc(s.orgName || '')}"></div>
      <div class="form-group"><label>시즌 순위 포인트 (1위부터, 쉼표 구분)</label><input type="text" name="pointsTable" value="${esc((s.pointsTable || Ranking.DEFAULT_POINTS).join(', '))}"></div>
      <h3>새 대회 기본 핸디캡</h3>
      <div class="form-row"><div class="form-group"><label>방식</label><select name="hType"><option value="diff" ${h.type !== 'none' ? 'selected' : ''}>(기준 − 에버) × 비율</option><option value="none" ${h.type === 'none' ? 'selected' : ''}>없음</option></select></div><div class="form-group"><label>기준</label><input type="number" name="hBase" value="${esc(h.base)}"></div><div class="form-group"><label>비율</label><input type="number" step="0.05" name="hRate" value="${esc(h.rate)}"></div><div class="form-group"><label>최대</label><input type="number" name="hCap" value="${esc(h.cap != null ? h.cap : '')}"></div><div class="form-group"><label>여성 추가</label><input type="number" name="hFemale" value="${esc(h.femaleBonus || 0)}"></div></div>
      <button class="btn btn-small btn-primary" type="submit">저장</button></form></div>
    <div class="card"><h2>🔐 관리자 PIN 변경</h2><form data-form="save-admin-pin"><div class="form-row"><div class="form-group"><label>새 관리자 PIN (숫자 4~6자리)</label><input type="password" name="adminPin" inputmode="numeric" maxlength="6" required></div><div class="form-group" style="flex:0;align-self:flex-end"><button class="btn btn-small btn-primary" type="submit">변경</button></div></div></form></div>
    <div class="card"><h2>☁️ 서버 연결</h2><p class="muted small mb">현재: <b>${Store.mode() === 'remote' ? '서버 모드 (Google Sheets)' : '로컬 데모 모드 (이 브라우저에만 저장)'}</b><br>Google Apps Script 웹앱 URL을 입력하면 모든 기기에서 같은 데이터를 공유합니다. 설치 방법은 gas/Code.gs 상단 주석과 README를 참고하세요.</p>
      <form data-form="set-api"><div class="form-group"><input type="url" name="url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(Store.getApiUrl())}"></div><div class="row"><button class="btn btn-small btn-primary" type="submit">연결 (다시 로그인)</button>${Store.mode() === 'remote' ? '<button class="btn btn-small btn-outline" type="button" data-action="test-api">연결 테스트</button>' : ''}</div></form></div>
    <div class="card"><h2>💾 백업 / 복원</h2><div class="row"><button class="btn btn-small btn-outline" data-action="export-json">JSON 내보내기</button><label class="btn btn-small btn-outline" style="cursor:pointer">JSON 가져오기 <input type="file" accept=".json,application/json" data-change="import-json" style="display:none"></label></div>
      ${Store.mode() === 'local' ? `<h3 class="mt">로컬 데모 데이터</h3><div class="row"><button class="btn btn-small btn-outline" data-action="reset-demo">데모 데이터로 초기화</button><button class="btn btn-small btn-danger" data-action="reset-empty">모든 데이터 삭제 (빈 상태)</button></div>` : ''}</div>`;
  }

  // ===== 이벤트 =====
  function bindGlobal() {
    $('#btn-logout').addEventListener('click', logout);
    $('#main-tabs').addEventListener('click', async e => { const b = e.target.closest('.tab-btn'); if (b) { await flushPending(); state.tab = b.dataset.tab; render(); } });
    window.addEventListener('beforeunload', () => { if (state.pendingId) flushPending(); });
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
  }

  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || e.target.closest('input,select,textarea,a')) return;
    const a = el.dataset.action, id = el.dataset.id;
    const t = state.tId ? tournamentById(state.tId) : null;
    switch (a) {
      case 'tab': state.tab = el.dataset.tab; return render();
      case 'open-t': await flushPending(); state.tab = 'tournaments'; state.tId = id; state.tSub = 'overview'; state.editT = false; return render();
      case 'back-t': await flushPending(); state.tId = null; state.editT = false; return render();
      case 'tsub': await flushPending(); state.tSub = el.dataset.sub; state.editT = false; return render();
      case 'rank-view': state.rankView = el.dataset.view; return render();
      case 'new-t': state.editT = true; return render();
      case 'edit-t': state.editT = true; return render();
      case 'cancel-t': state.editT = false; return render();
      case 'del-t':
        if (!confirm(`"${t.name}" 대회를 삭제할까요? 되돌릴 수 없습니다.`)) return;
        await run(async () => { state.data.tournaments = await Store.deleteTournament(t.id); state.tId = null; }, '삭제되었습니다.'); return render();
      case 'set-status':
        if (el.dataset.status !== 'final' && t.status === 'final' && !confirm('확정을 해제하면 저장된 결과 스냅샷이 삭제되고 실시간 집계로 돌아갑니다. 계속할까요?')) return;
        t.status = el.dataset.status; if (t.status !== 'final') { delete t.results; delete t.finalizedAt; }
        await saveT(t, '상태가 변경되었습니다.'); return render();
      case 'finalize': return finalize(t);
      case 'add-entries': {
        const ids = $$('.entry-cb:checked').map(c => c.value);
        if (!ids.length) return toast('회원을 선택하세요.', true);
        ids.forEach(mid => { const m = memberById(mid); t.entries.push({ memberId: mid, clubId: m.clubId, avg: m.avg, gender: m.gender, lane: '', games: Array(t.numGames).fill(null) }); });
        await saveT(t, ids.length + '명 등록되었습니다.'); return render();
      }
      case 'rm-entry': {
        const e2 = t.entries.find(x => x.memberId === id);
        if (e2 && (e2.games || []).some(g => g != null && g !== '') && !confirm('이미 점수가 입력된 참가자입니다. 삭제할까요?')) return;
        t.entries = t.entries.filter(x => x.memberId !== id); await saveT(t, '삭제되었습니다.'); return render();
      }
      case 'export-csv': return exportRankCsv(t);
      case 'print': return window.print();
      case 'club-members': state.tab = 'members'; state.memberClub = id; return render();
      case 'edit-club': state.editClub = { ...clubById(id) }; render(); return window.scrollTo(0, 0);
      case 'cancel-club': state.editClub = null; return render();
      case 'del-club':
        if (!confirm(`"${clubName(id)}" 클럽을 삭제할까요?`)) return;
        await run(async () => { state.data.clubs = await Store.deleteClub(id); }, '삭제되었습니다.'); return render();
      case 'edit-member': state.editMember = { ...memberById(id) }; render(); return window.scrollTo(0, 0);
      case 'cancel-member': state.editMember = null; return render();
      case 'del-member': {
        const m = memberById(id);
        if (!confirm(`"${m.name}" 회원을 삭제할까요? 대회 기록의 이름은 유지됩니다.`)) return;
        await run(async () => { state.data.members = await Store.deleteMember(id); }, '삭제되었습니다.'); return render();
      }
      case 'export-json': {
        const json = await run(() => Store.exportAll());
        if (json) download(`bowling-backup-${today()}.json`, json, 'application/json'); return;
      }
      case 'reset-demo': if (confirm('현재 로컬 데이터를 지우고 데모 데이터로 초기화할까요?')) { Store.resetLocal(false); location.reload(); } return;
      case 'reset-empty': if (confirm('모든 클럽/회원/대회 데이터를 삭제할까요? (관리자 PIN은 0000으로 초기화)')) { Store.resetLocal(true); location.reload(); } return;
      case 'test-api': {
        await run(async () => { const r = await fetch(Store.getApiUrl() + '?action=ping'); const j = await r.json(); if (!j.ok) throw new Error(j.error || '응답 오류'); }, '서버 연결 정상'); return;
      }
    }
  }

  async function onSubmit(e) {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const fd = new FormData(f); const v = k => (fd.get(k) == null ? '' : String(fd.get(k)).trim());
    const t = state.tId ? tournamentById(state.tId) : null;
    switch (f.dataset.form) {
      case 'save-t': {
        const existing = f.dataset.id ? tournamentById(f.dataset.id) : null;
        const divisions = v('divisions').split(',').map(s => s.trim()).filter(Boolean).map(s => { const [name, min] = s.split(':'); return { name: name.trim(), min: num(min) }; });
        const obj = Object.assign(existing || { entries: [], status: 'upcoming' }, {
          name: v('name'), date: v('date'), venue: v('venue'), hostClubId: v('hostClubId'), numGames: Math.max(1, num(v('numGames'), 3)),
          handicap: { type: v('hType'), base: num(v('hBase'), 200), rate: v('hRate') === '' ? 1 : num(v('hRate'), 1), cap: v('hCap') === '' ? '' : num(v('hCap')), femaleBonus: num(v('hFemale')) },
          divisions, clubScoring: { topN: num(v('topN'), 5) }, note: v('note')
        });
        obj.entries.forEach(en => { const g = en.games || []; en.games = Array.from({ length: obj.numGames }, (_, i) => g[i] == null ? null : g[i]); });
        const r = await run(async () => { state.data.tournaments = await Store.saveTournament(obj); return true; }, '저장되었습니다.');
        if (r) { state.editT = false; state.tId = obj.id; state.tSub = existing ? 'manage' : 'entries'; render(); }
        return;
      }
      case 'save-club': {
        const obj = { id: f.dataset.id || '', name: v('name'), region: v('region'), leader: v('leader'), note: v('note') };
        const r = await run(async () => { state.data.clubs = await Store.saveClub(obj); return true; }, '저장되었습니다.');
        if (r) { state.editClub = null; render(); } return;
      }
      case 'save-member': {
        const obj = { id: f.dataset.id || '', name: v('name'), clubId: v('clubId'), gender: v('gender'), avg: num(v('avg')), joinDate: v('joinDate'), phone: v('phone'), role: v('role'), note: v('note') };
        if (v('pin')) { if (!/^\d{4,6}$/.test(v('pin'))) return toast('PIN은 숫자 4~6자리여야 합니다.', true); obj.pin = v('pin'); }
        if (!obj.clubId) return toast('클럽을 선택하세요.', true);
        const r = await run(async () => { state.data.members = await Store.saveMember(obj); return true; }, '저장되었습니다.');
        if (r) { state.editMember = null; render(); } return;
      }
      case 'import-members': {
        const lines = v('csv').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const list = []; const errors = [];
        lines.forEach((l, i) => {
          const [name, cname, g, avg, phone] = l.split(',').map(s => (s || '').trim());
          const club = state.data.clubs.find(c => c.name === cname);
          if (!name || !club) { errors.push(`${i + 1}행: ${!name ? '이름 없음' : '클럽 "' + cname + '" 없음'}`); return; }
          list.push({ name, clubId: club.id, gender: /^(F|여|여자)$/i.test(g) ? 'F' : 'M', avg: num(avg), phone: phone || '' });
        });
        if (errors.length && !confirm(`오류 ${errors.length}건은 건너뜁니다:\n${errors.slice(0, 5).join('\n')}\n\n${list.length}명을 가져올까요?`)) return;
        if (!list.length) return toast('가져올 회원이 없습니다.', true);
        const r = await run(async () => { state.data.members = await Store.saveMembersBulk(list); return true; }, list.length + '명 처리되었습니다.');
        if (r) render(); return;
      }
      case 'save-profile': {
        const r = await run(async () => { state.data.members = await Store.updateProfile(myId(), { phone: v('phone') }); return true; }, '저장되었습니다.');
        if (r) render(); return;
      }
      case 'change-pin': {
        if (v('newPin') !== v('newPin2')) return toast('새 PIN이 일치하지 않습니다.', true);
        const r = await run(() => Store.changePin(myId(), v('oldPin'), v('newPin')), 'PIN이 변경되었습니다.');
        if (r) f.reset(); return;
      }
      case 'save-settings': {
        const pointsTable = v('pointsTable').split(',').map(s => num(s.trim())).filter(n => n > 0);
        const s = { orgName: v('orgName'), pointsTable: pointsTable.length ? pointsTable : Ranking.DEFAULT_POINTS, defaultHandicap: { type: v('hType'), base: num(v('hBase'), 200), rate: v('hRate') === '' ? 1 : num(v('hRate'), 1), cap: v('hCap') === '' ? '' : num(v('hCap')), femaleBonus: num(v('hFemale')) } };
        const r = await run(async () => { state.data.settings = { ...state.data.settings, ...(await Store.saveSettings(s)) }; return true; }, '저장되었습니다.');
        if (r) { $('#header-org').textContent = '🎳 ' + state.data.settings.orgName; render(); } return;
      }
      case 'save-admin-pin': {
        if (!/^\d{4,6}$/.test(v('adminPin'))) return toast('PIN은 숫자 4~6자리여야 합니다.', true);
        const r = await run(() => Store.saveSettings({ adminPin: v('adminPin') }), '관리자 PIN이 변경되었습니다.');
        if (r) f.reset(); return;
      }
      case 'set-api': Store.setApiUrl(v('url')); location.reload(); return;
    }
  }

  function onChange(e) {
    const el = e.target; const k = el.dataset.change;
    const t = state.tId ? tournamentById(state.tId) : null;
    if (k === 'entry-club') { state.entryClub = el.value; return render(); }
    if (k === 'entry-all') { $$('.entry-cb').forEach(c => c.checked = el.checked); return; }
    if (k === 'score-sort') { state.scoreSort = el.value; return render(); }
    if (k === 'member-club') { state.memberClub = el.value; return render(); }
    if (k === 'season-year') { state.seasonYear = el.value; return render(); }
    if (k === 'import-json') {
      const file = el.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        if (!confirm('현재 데이터를 백업 파일 내용으로 덮어씁니다. 계속할까요?')) return;
        const r = await run(() => Store.importAll(String(reader.result)), '복원되었습니다.');
        if (r) { await reload(true); render(); }
      };
      reader.readAsText(file); return;
    }
    if (el.dataset.entry && t) {
      const en = t.entries.find(x => x.memberId === el.dataset.entry); if (!en) return;
      const f = el.dataset.field;
      en[f] = el.value === '' ? (f === 'lane' ? '' : null) : (f === 'lane' ? el.value : num(el.value));
      if (en[f] === null) delete en[f];
      return scheduleSave(t);
    }
    if (el.dataset.score != null && t) {
      const en = t.entries.find(x => x.memberId === el.dataset.score); if (!en) return;
      const g = num(el.dataset.g);
      let val = el.value === '' ? null : Math.max(0, Math.min(300, num(el.value)));
      if (val != null) el.value = val;
      en.games = en.games || []; while (en.games.length < t.numGames) en.games.push(null);
      en.games[g] = val;
      updateScoreRow(t, en.memberId);
      return scheduleSave(t);
    }
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.input === 'member-q') {
      state.memberQ = el.value;
      clearTimeout(state.qTimer);
      state.qTimer = setTimeout(() => { render(); const i = $('[data-input="member-q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300);
    }
  }

  function updateScoreRow(t, memberId) {
    const row = Ranking.buildRows({ ...t, entries: t.entries.filter(e => e.memberId === memberId) }, state.data.members, state.data.clubs)[0];
    const tr = $(`tr[data-row="${CSS.escape(memberId)}"]`);
    if (!tr || !row) return;
    tr.querySelector('.c-scratch').textContent = row.scratch;
    tr.querySelector('.c-total').textContent = row.total;
  }

  /** 점수/참가자 입력 자동 저장 (디바운스). 저장 시점에 최신 객체를 다시 조회해 오래된 참조로 덮어쓰지 않는다. */
  function scheduleSave(t) {
    const st = $('#save-state'); if (st) { st.textContent = '저장 대기…'; st.className = 'save-state dirty'; }
    clearTimeout(state.dirtyTimer);
    state.pendingId = t.id;
    state.dirtyTimer = setTimeout(() => flushPending(), 900);
  }

  async function flushPending() {
    clearTimeout(state.dirtyTimer); state.dirtyTimer = null;
    const id = state.pendingId; if (!id) return;
    state.pendingId = null;
    const cur = tournamentById(id); if (!cur) return;
    try {
      state.data.tournaments = await Store.saveTournament(cur);
      const s2 = $('#save-state'); if (s2) { s2.textContent = '✓ 저장됨'; s2.className = 'save-state saved'; }
    } catch (e) { toast('저장 실패: ' + e.message, true); const s2 = $('#save-state'); if (s2) { s2.textContent = '저장 실패'; s2.className = 'save-state dirty'; } }
  }

  async function saveT(t, msg) {
    // 명시적 저장은 현재 객체의 모든 변경(대기 중인 자동 저장 포함)을 담고 있으므로 대기 타이머를 취소한다.
    clearTimeout(state.dirtyTimer); state.dirtyTimer = null; state.pendingId = null;
    await run(async () => { state.data.tournaments = await Store.saveTournament(t); }, msg);
  }

  async function finalize(t) {
    const rows = Ranking.buildRows(t, state.data.members, state.data.clubs);
    const incomplete = rows.filter(r => r.gamesPlayed < t.numGames);
    if (!rows.length) return toast('참가자가 없습니다.', true);
    if (incomplete.length && !confirm(`${incomplete.length}명의 점수가 아직 모두 입력되지 않았습니다.\n(${incomplete.slice(0, 5).map(r => r.name).join(', ')}${incomplete.length > 5 ? ' 외' : ''})\n\n그래도 확정할까요?`)) return;
    if (!confirm(`"${t.name}" 최종 순위를 확정할까요?`)) return;
    t.results = Ranking.computeResults(t, state.data.members, state.data.clubs);
    t.status = 'final'; t.finalizedAt = new Date().toISOString();
    await saveT(t, '최종 순위가 확정되었습니다.');
    state.tSub = 'ranking'; render();
  }

  function exportRankCsv(t) {
    const table = $('#rank-table'); if (!table) return;
    const rows = [...table.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
    download(`${t.name}-${state.rankView}.csv`, csv(rows), 'text/csv;charset=utf-8');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
