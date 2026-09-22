/**
 * app.js - 이번 대회 전용 관리/조회 UI
 */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const EV = Ranking.EVENTS;

  const state = {
    data: null, tab: 'home',
    playersRegion: '', playersGender: '', playersQ: '', editPlayer: null, editRegion: null,
    assignSub: 'A', indSub: 'M', teamSub: { scotch: 'rank', baker: 'rank' }, scoreGroup: '',
    dirtyPlayers: new Map(), dirtyTeams: new Map(), dirtyTimer: null, openRegion: '', uploads: [], scoreImport: null,
    previewPublic: false, q: '', searchId: '', pubAssignSub: '', pubAssignQ: '', rankTab: 'individual', rankGender: 'M', rankGroup: '', rankQ: '', pubAssignId: ''
  };

  // ===== 유틸 =====
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const medal = r => r <= 3 ? `<span class="rk rk-${r}">${r}</span>` : r;
  const genderBadge = g => `<span class="badge gender-${g === 'F' ? 'F' : 'M'}">${g === 'F' ? '여' : '남'}</span>`;
  const isAdmin = () => Store.isAdmin();
  const S = () => Ranking.mergeSettings(state.data.settings);
  const regionById = id => (state.data.regions || []).find(r => r.id === id);
  const regionName = id => { const r = regionById(id); return r ? r.name : '(미정)'; };
  const playerById = id => (state.data.players || []).find(p => p.id === id);
  const teamById = id => (state.data.teams || []).find(t => t.id === id);
  const groupName = id => { const g = S().groups.find(x => x.id === id); return g ? g.name : (id || '미편성'); };
  const regionOptions = (sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + (state.data.regions || []).map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  const groupOptions = (sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + S().groups.map(g => `<option value="${esc(g.id)}" ${g.id === sel ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  const stat = (v, l, d, hi) => `<div class="stat"><div class="l">${esc(l)}</div><div class="v ${hi ? 'hi' : ''}">${v}</div>${d ? `<div class="d">${esc(d)}</div>` : ''}</div>`;
  const ICON = {
    search: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    lanes: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>',
    rank: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="4" y="12" width="4" height="8"/><rect x="10" y="7" width="4" height="13"/><rect x="16" y="3" width="4" height="17"/></svg>',
    user: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    arrow: '<svg class="arr" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    check: '<svg class="ok" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5 11-11"/></svg>'
  };
  const searchBox = (attr, value, placeholder, light) => `<label class="search-box ${light ? 'light' : ''}">${ICON.search.replace('width="21" height="21"', 'width="17" height="17"')}<input type="text" data-input="${attr}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" aria-label="${esc(placeholder)}"></label>`;
  const view = () => (isAdmin() && !state.previewPublic) ? 'admin' : 'public';
  const tableLanes = t => t ? `${2 * num(t) - 1}·${2 * num(t)}레인` : '';
  const tablePos = r => r.lane ? `${r.lane}-${r.pos || '?'}` : '-';
  const dirtyCount = () => state.dirtyPlayers.size + state.dirtyTeams.size;
  const PUBLIC_TABS = ['home', 'search', 'assign', 'rank'];
  const ADMIN_TABS = ['home', 'players', 'assign', 'individual', 'scotch', 'baker', 'standings', 'settings'];
  const ADMIN_TITLES = { home: '대시보드', players: '선수 관리', assign: '조 편성 · 레인 배정', individual: '개인전 점수 · 집계', scotch: '스카치 더블', baker: '베이커', standings: '지역 종합', settings: '설정' };
  const STATUS_LABEL = { ready: '준비중', live: '진행중', final: '확정' };
  const dayLabel = () => { const s = S(); const today = new Date().toISOString().slice(0, 10); const i = (s.dates || []).indexOf(today); return i >= 0 ? ' · ' + (i + 1) + '일차' : ''; };
  const fmtDate = d => { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); if (isNaN(dt)) return d; return `${dt.getMonth() + 1}.${dt.getDate()}(${'일월화수목금토'[dt.getDay()]})`; };
  const evChips = ev => ['individual', 'scotch', 'baker', 'side'].filter(k => ev && ev[k]).map(k => `<span class="ev ${k}">${{ individual: '개인', scotch: '스카치', baker: '베이커', side: '사이드' }[k]}</span>`).join('');
  const gamesOf = (r, n) => r.games.slice(0, n).map(g => `<td>${g == null ? '-' : g}</td>`).join('');
  const gameHeads = n => Array.from({ length: n }, (_, i) => `<th>G${i + 1}</th>`).join('');
  const results = () => Ranking.resultsOf(state.data);

  let toastTimer;
  function toast(msg, isErr) { const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (isErr ? ' error' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = 'toast', 2500); }
  function loading(on) { $('#loading').style.display = on ? 'flex' : 'none'; }
  async function run(fn, okMsg) {
    loading(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { console.error(e); toast(e.message || String(e), true); if (!Store.isAdmin()) { applyRole(); render(); } return undefined; }
    finally { loading(false); }
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function csv(rows) { return '﻿' + rows.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n'); }
  function tableCsv(sel, name) { const t = $(sel); if (!t) return; download(name + '.csv', csv([...t.querySelectorAll('tr')].map(tr => [...tr.children].filter(td => !td.querySelector('input,select,button')).map(td => td.textContent.trim()))), 'text/csv;charset=utf-8'); }

  // ===== 초기화 / 권한 =====
  async function init() {
    bindAdmin(); bindGlobal();
    await reload(true); applyRole(); render();
  }
  async function reload(silent) {
    const fn = async () => { state.data = await Store.loadAll(); };
    if (silent) { try { await fn(); } catch (e) { state.data = { settings: {}, regions: [], players: [], teams: [], results: null }; toast('데이터 로드 실패: ' + e.message, true); } }
    else await run(fn);
  }
  function applyRole() {
    const s = S(); const admin = view() === 'admin';
    document.body.classList.toggle('is-admin', admin);
    document.body.classList.toggle('is-public', !admin);
    $('#side-title').textContent = s.name || '볼링 전국대회';
    const st = $('#status-badge'); st.textContent = STATUS_LABEL[s.status] || s.status; st.className = 'badge ' + (s.status === 'final' ? 'final' : s.status === 'live' ? 'live' : 'upcoming');
    const mb = $('#mode-badge'); mb.textContent = Store.mode() === 'remote' ? '서버 연결' : '데모'; mb.className = 'mode-badge ' + Store.mode();
    const tabs = admin ? ADMIN_TABS : PUBLIC_TABS;
    if (!tabs.includes(state.tab)) state.tab = 'home';
    if (!isAdmin()) { state.indSub = state.indSub === 'score' ? 'M' : state.indSub; Object.keys(state.teamSub).forEach(k => { if (state.teamSub[k] === 'score') state.teamSub[k] = 'rank'; }); }
  }
  function openAdminModal() { $('#admin-error').textContent = ''; $('#admin-pin').value = ''; $('#admin-hint').textContent = Store.mode() === 'local' ? '데모 관리자 PIN: 0000' : ''; $('#admin-modal').style.display = 'flex'; $('#admin-pin').focus(); }
  function bindAdmin() {
    $('#admin-cancel').addEventListener('click', () => $('#admin-modal').style.display = 'none');
    $('#admin-modal').addEventListener('click', e => { if (e.target.id === 'admin-modal') $('#admin-modal').style.display = 'none'; });
    $('#admin-form').addEventListener('submit', async e => {
      e.preventDefault(); $('#admin-error').textContent = ''; loading(true);
      try { await Store.login($('#admin-pin').value); $('#admin-modal').style.display = 'none'; state.previewPublic = false; state.tab = 'home'; await reload(true); applyRole(); render(); toast('관리자로 로그인했습니다.'); }
      catch (err) { $('#admin-error').textContent = err.message; }
      finally { loading(false); }
    });
    $('#btn-logout').addEventListener('click', async () => { if (!(await guardDirty())) return; Store.logout(); state.editPlayer = null; state.editRegion = null; state.previewPublic = false; state.tab = 'home'; await reload(true); applyRole(); render(); toast('로그아웃했습니다.'); });
    $('#btn-preview-public').addEventListener('click', async () => { if (!(await guardDirty())) return; state.previewPublic = true; state.tab = 'home'; applyRole(); render(); });
    $('#btn-server').addEventListener('click', () => { const url = prompt('Apps Script 웹앱 URL을 입력하세요.\n비워두면 로컬 데모 모드로 동작합니다.', Store.getApiUrl()); if (url === null) return; Store.setApiUrl(url); location.reload(); });
  }
  function bindGlobal() {
    const nav = async e => { const b = e.target.closest('[data-tab]'); if (b) { if (!(await guardDirty())) return; state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); } };
    $('#admin-nav').addEventListener('click', nav);
    $('#bottom-nav').addEventListener('click', nav);
    window.addEventListener('beforeunload', e => { if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('compositionstart', () => { state.composing = true; });
    document.addEventListener('compositionend', e => { state.composing = false; const attr = e.target && e.target.dataset && e.target.dataset.input; if (attr) { onInput({ target: e.target }); } else if (state.pendingRender) { const a = state.pendingRender; state.pendingRender = null; renderKeepingInput(a); } });
  }

  // ===== 렌더 =====
  function tabHtml(tab) {
    if (view() !== 'admin') {
      switch (tab) {
        case 'home': return renderPublicHome();
        case 'search': return renderSearch();
        case 'assign': return renderPublicAssign();
        case 'rank': return renderRank();
      }
      return '';
    }
    switch (tab) {
      case 'home': return renderAdminHome();
      case 'players': return renderPlayers();
      case 'assign': return renderAssign();
      case 'individual': return renderIndividual();
      case 'scotch': case 'baker': return renderTeamEvent(tab);
      case 'standings': return renderStandings();
      case 'settings': return renderSettings();
    }
    return '';
  }
  function render() {
    const admin = view() === 'admin';
    $$('#admin-nav .side-item').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    $$('#bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    $$('.tab-content').forEach(sec => sec.classList.toggle('active', sec.id === 'tab-' + state.tab));
    if (admin) { $('#topbar-title').textContent = ADMIN_TITLES[state.tab] || ''; $('#topbar-sub').textContent = S().name || ''; }
    $('#tab-' + state.tab).innerHTML = tabHtml(state.tab);
  }
  /**
   * 검색어 입력 중 다시 그리기: 입력칸 DOM 노드는 그대로 두고 나머지만 교체한다.
   * (입력칸을 새로 만들면 한글 조합이 끊겨 "호ㅏㅇ" 처럼 입력된다)
   */
  function renderKeepingInput(attr) {
    const sec = $('#tab-' + state.tab); if (!sec) return;
    const live = sec.querySelector(`[data-input="${attr}"]`);
    const tmp = document.createElement('div'); tmp.innerHTML = tabHtml(state.tab);
    const fresh = tmp.querySelector(`[data-input="${attr}"]`);
    const wasActive = live && document.activeElement === live;
    const selStart = live ? live.selectionStart : null, selEnd = live ? live.selectionEnd : null;
    if (live && fresh) fresh.replaceWith(live);
    sec.replaceChildren(...tmp.childNodes);
    if (wasActive) { live.focus({ preventScroll: true }); try { if (selStart != null) live.setSelectionRange(selStart, selEnd); } catch (e) { /* type=number 등 */ } }
  }
  const subtabs = (items, cur, action, attr) => `<div class="subtabs">${items.map(([k, l]) => `<button class="subtab ${cur === k ? 'active' : ''}" data-action="${action}" data-${attr}="${esc(k)}">${l}</button>`).join('')}</div>`;
  const statusBadge = () => { const st = S().status; return `<span class="badge ${st === 'final' ? 'final' : st === 'live' ? 'live' : 'upcoming'}">${{ ready: '준비중', live: '진행중', final: '확정' }[st] || st}</span>`; };

  // ===== 회원용 화면 =====
  const heroBadge = () => { const st = S().status; return `<span class="pill-status ${st}">${STATUS_LABEL[st] || st}${st === 'live' ? dayLabel() : ''}</span>`; };
  const adminEntry = () => isAdmin() ? `<button class="hero-admin" data-action="back-admin">관리자 화면</button>` : `<button class="hero-admin" data-action="open-admin">관리자</button>`;
  const groupOf = id => S().groups.find(g => g.id === id);
  const groupTime = g => g ? [g.day ? g.day + '일차' : '', g.time || ''].filter(Boolean).join(' ') : '';
  const groupDate = g => { const s = S(); if (!g || !g.day || !s.dates || !s.dates[g.day - 1]) return groupTime(g); return `${fmtDate(s.dates[g.day - 1])} ${g.time || ''}`.trim(); };

  function renderPublicHome() {
    const s = S(); const d = state.data; const pr = Ranking.progress(d);
    const dates = (s.dates || []).filter(Boolean);
    const pct = pr.individual.total ? Math.round(pr.individual.done / pr.individual.total * 100) : 0;
    const rules = (s.rulesNote || '').split('\n').filter(Boolean);
    const shown = state.rulesOpen ? rules : rules.slice(0, 3);
    return `<div class="hero hero-home">
      <div class="hero-top"><div class="brand-row"><div class="brand-mark sm">볼</div><span class="hero-sub">${esc(regionName(s.hostRegionId))} 주최</span></div><div class="row" style="gap:6px">${heroBadge()}${adminEntry()}</div></div>
      <h1 class="hero-title">${esc(s.name)}</h1>
      <p class="hero-meta">${dates.map(fmtDate).join('–')}${s.venue ? ' · ' + esc(s.venue) : ''}</p>
      <div class="hero-panel"><div class="lbl"><span>개인전 진행률</span><b>${pr.individual.done} / ${pr.individual.total}명</b></div><div class="bar"><span style="width:${pct}%"></span></div></div>
    </div>
    <div class="page">
      <button class="quick" data-action="tab" data-tab="search"><div class="ic">${ICON.search}</div><div><div class="t">선수 검색 · 참가 확인</div><div class="d">이름으로 등록 종목 · 조 · 핸디 확인하기</div></div>${ICON.arrow}</button>
      <button class="quick" data-action="tab" data-tab="assign"><div class="ic">${ICON.lanes}</div><div><div class="t">레인 배정 확인</div><div class="d">내 레인 · 순번 · 시작 시간</div></div>${ICON.arrow}</button>
      <button class="quick" data-action="tab" data-tab="rank"><div class="ic">${ICON.rank}</div><div><div class="t">실시간 순위</div><div class="d">개인전 · 스카치 · 베이커 · 지역종합</div></div>${ICON.arrow}</button>
      <div class="card" style="margin:0"><h2 style="margin-bottom:8px">대회 안내</h2>
        ${s.schedule ? `<div class="schedule">${esc(s.schedule)}</div>` : ''}
        ${rules.length ? `<div class="schedule" style="margin-top:8px;border-top:1px solid var(--line-soft);padding-top:8px">${shown.map(esc).join('\n')}</div>${rules.length > 3 ? `<button class="rules-toggle" data-action="toggle-rules">${state.rulesOpen ? '접기' : `규정 전체 보기 (${rules.length - 3}줄 더)`}</button>` : ''}` : ''}
        ${!s.schedule && !rules.length ? '<p class="empty">안내 문구가 없습니다.</p>' : ''}</div>
    </div>`;
  }

  function findPlayers(q) { q = (q || '').trim(); if (!q) return []; const n = q.replace(/\s+/g, ''); return state.data.players.filter(p => p.name.replace(/\s+/g, '').includes(n)); }
  function resolvePlayer(q, chosenId) {
    const list = findPlayers(q);
    if (chosenId) { const c = list.find(p => p.id === chosenId); if (c) return { list, one: c }; }
    if (list.length === 1) return { list, one: list[0] };
    const exact = list.filter(p => p.name === q.trim()); if (exact.length === 1) return { list, one: exact[0] };
    return { list, one: null };
  }

  function renderSearch() {
    const s = S(); const d = state.data;
    let html = `<div class="hero"><div class="hero-eyebrow">${esc(s.name)}</div><h1 class="hero-title sm">선수 검색</h1>${searchBox('pub-q', state.q, '이름으로 검색')}</div><div class="page">`;
    if (!state.q.trim()) return html + `<div class="section-label">안내</div><div class="card" style="margin:0"><p class="small" style="color:var(--text-2);line-height:1.7">이름을 입력하면 참가 종목, 조, 레인, 핸디, 현재 순위를 확인할 수 있습니다.</p></div></div>`;
    const { list, one } = resolvePlayer(state.q, state.searchId);
    if (!one) {
      html += `<div class="section-label">검색 결과 ${list.length}명</div>`;
      html += list.length ? `<div class="card-list grid-tbl">${list.slice(0, 30).map(p => `<button class="gr" style="grid-template-columns:1fr auto;width:100%;background:none;border:none;border-bottom:1px solid var(--line-soft);text-align:left;font:inherit;cursor:pointer" data-action="pick-player" data-id="${esc(p.id)}"><span class="b">${esc(p.name)} <span class="dim" style="font-weight:400">· ${esc(regionName(p.regionId))} · ${p.gender === 'F' ? '여' : '남'}</span></span>${ICON.arrow}</button>`).join('')}</div>` : `<div class="card" style="margin:0"><p class="empty">"${esc(state.q)}" 이름의 선수가 없습니다.</p></div>`;
      return html + '</div>';
    }
    const p = one; const res = results(); const g = groupOf(p.group);
    const row = res.playerRows.find(r => r.playerId === p.id);
    const genderRows = p.gender === 'F' ? res.female : res.male; const gr = genderRows.find(r => r.playerId === p.id);
    const teamOf = ev => d.teams.find(t => t.event === ev && (t.members || []).includes(p.id));
    const teamRow = (ev, t) => t ? res[ev].find(r => r.teamId === t.id) : null;
    const evRow = (ev, on, title, sub) => `<div class="ev-row ${on ? '' : 'off'}"><div class="ic">${{ individual: '개인', scotch: '스카', baker: '베이' }[ev]}</div><div><div class="t">${title}</div><div class="d">${sub}</div></div>${on ? ICON.check : ''}</div>`;
    const sc = teamOf('scotch'), bk = teamOf('baker');
    const partner = t => (t.members || []).filter(id => id !== p.id).map(id => (playerById(id) || {}).name).filter(Boolean).join(', ');
    const ind = !p.events || p.events.individual !== false;
    html += `<div class="section-label">검색 결과</div>
      <div class="card id-card" style="margin:0"><div class="row between"><div class="name">${esc(p.name)}</div>${p.isRep ? '<span class="badge rep-badge" style="font-size:11.5px;padding:5px 10px">지역 대표</span>' : ''}</div>
        <div class="meta"><span>${esc(regionName(p.regionId))}</span><span>·</span><span>${p.gender === 'F' ? '여자' : '남자'}</span>${p.birthYear ? `<span>·</span><span>${p.birthYear}년생</span>` : ''}</div></div>
      <div class="card stack" style="margin:0"><h2 style="margin:0">참가 종목</h2>
        ${evRow('individual', ind, ind ? `개인전${g ? ' · ' + esc(g.name) : ''}` : '개인전', ind ? `${esc(groupDate(g)) || '조 미편성'}${row && row.lane ? ` · ${row.lane}번 테이블 ${row.pos}번` : ''}${g && g.bonus ? ` · 핸디 보너스 +${g.bonus}` : ''}` : '미신청')}
        ${evRow('scotch', !!sc, sc ? `스카치 더블 · ${esc(sc.name || partner(sc))}${sc.name ? ` (${esc(partner(sc))})` : ''}` : '스카치 더블', sc ? (sc.lane ? `${sc.lane}번 테이블 (${tableLanes(sc.lane)})` : '테이블 미배정') : '미신청')}
        ${evRow('baker', !!bk, bk ? `베이커 · ${esc(bk.name || partner(bk))}${bk.name ? ` (${esc(partner(bk))})` : ''}` : '베이커', bk ? (bk.lane ? `${bk.lane}번 테이블 (${tableLanes(bk.lane)})` : '테이블 미배정') : '미신청')}
      </div>
      <div class="card" style="margin:0"><h2 style="margin-bottom:10px">핸디 정보</h2><div class="tiles"><div class="tile"><div class="v hi">${row ? row.handicap : num(p.handicap)}</div><div class="l">핸디 (게임당)</div></div><div class="tile"><div class="v">${num(p.adjust) || 0}</div><div class="l">총점 가감</div></div></div>
        <div class="muted" style="font-size:11px;margin-top:9px;color:var(--text-3)">핸디는 규정(여성 15, 시니어 1~5, 최고 20 등)에 따라 관리자가 직접 입력합니다.${g && g.bonus ? ` ${esc(g.name)} 보너스 +${g.bonus} 포함.` : ''}</div></div>`;
    if (row && row.gamesPlayed > 0) {
      html += `<div class="card" style="margin:0"><h2 style="margin-bottom:10px">개인전 현재 성적</h2><div class="tiles"><div class="tile"><div class="v">${gr ? gr.rank : '-'}<span style="font-size:13px;font-family:var(--font-body);font-weight:700">위</span></div><div class="l">${p.gender === 'F' ? '여자' : '남자'} ${genderRows.length}명 중</div></div><div class="tile"><div class="v">${row.total}</div><div class="l">총점</div></div><div class="tile"><div class="v">${row.scratch}</div><div class="l">스크래치</div></div></div><p class="muted" style="margin-top:8px">게임: ${row.games.map(x => x == null ? '-' : x).join(' / ')}</p></div>`;
    }
    [['scotch', sc], ['baker', bk]].forEach(([ev, t]) => { const tr = teamRow(ev, t); if (tr && tr.gamesPlayed > 0) html += `<div class="card" style="margin:0"><h2 style="margin-bottom:10px">${EV[ev].name} 현재 성적</h2><div class="tiles"><div class="tile"><div class="v">${tr.rank}<span style="font-size:13px;font-family:var(--font-body);font-weight:700">위</span></div><div class="l">${res[ev].length}팀 중</div></div><div class="tile"><div class="v">${tr.total}</div><div class="l">총점</div></div></div><p class="muted" style="margin-top:8px">게임: ${tr.games.map(x => x == null ? '-' : x).join(' / ')}</p></div>`; });
    return html + '</div>';
  }

  function renderPublicAssign() {
    const s = S(); const d = state.data;
    const subs = s.groups.map(g => [g.id, `개인전 ${g.name}`]).concat([['scotch', '스카치'], ['baker', '베이커']]);
    if (!subs.some(x => x[0] === state.pubAssignSub)) state.pubAssignSub = subs[0][0];
    const q = state.pubAssignQ.trim();
    // 이름 검색 시 해당 선수의 조로 자동 전환
    let hit = null, cands = [];
    if (q) { const { one, list } = resolvePlayer(q, state.pubAssignId); cands = list; if (one) { hit = one; if (!EV[state.pubAssignSub] && one.group && s.groups.some(g => g.id === one.group) && state.pubAssignSub !== one.group) state.pubAssignSub = one.group; } }
    let html = `<div class="hero"><div><div class="hero-eyebrow">${esc(s.name)}</div><h1 class="hero-title sm">레인 배정</h1></div>
      <div class="chips">${subs.map(([k, l]) => `<button class="chip-nav ${state.pubAssignSub === k ? 'active' : ''}" data-action="pub-assign-sub" data-sub="${esc(k)}">${esc(l)}</button>`).join('')}</div>
      ${searchBox('pub-assign-q', state.pubAssignQ, '이름으로 내 레인 찾기')}</div><div class="page">`;
    const sub = state.pubAssignSub;
    if (q && !hit) html += cands.length ? `<div class="section-label">동명이인 · 선택하세요</div><div class="card-list grid-tbl">${cands.slice(0, 20).map(p => `<button class="gr" style="grid-template-columns:1fr auto;width:100%;background:none;border:none;border-bottom:1px solid var(--line-soft);text-align:left;font:inherit;cursor:pointer" data-action="pick-assign" data-id="${esc(p.id)}"><span class="b">${esc(p.name)} <span class="dim" style="font-weight:400">· ${esc(regionName(p.regionId))} · ${esc(groupName(p.group))}</span></span>${ICON.arrow}</button>`).join('')}</div>` : `<div class="card" style="margin:0"><p class="empty">"${esc(q)}" 이름의 선수가 없습니다.</p></div>`;
    if (EV[sub]) {
      const pr = Ranking.playerRows(d.players, d.regions, s);
      const rows = Ranking.teamRows(d.teams, sub, pr, d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || a.regionName.localeCompare(b.regionName, 'ko'));
      const mine = hit ? rows.find(r => r.memberIds.includes(hit.id)) : null;
      if (hit && !mine) html += `<div class="card" style="margin:0"><p class="empty">${esc(hit.name)} 선수는 ${EV[sub].name}에 등록되어 있지 않습니다.</p></div>`;
      if (mine) html += `<div class="result-card"><div class="cap">검색 결과 · ${esc(hit.name)}</div><div class="big">${mine.lane ? `<span class="n">${mine.lane}</span><span class="u">번 테이블</span>` : '<span class="u">테이블 미배정</span>'}</div><div class="facts">${mine.lane ? `<div><div class="k">레인</div><div class="v">${tableLanes(mine.lane)}</div></div>` : ''}<div><div class="k">팀</div><div class="v">${esc(mine.name)}</div></div><div><div class="k">지역</div><div class="v">${esc(mine.regionName)}</div></div><div><div class="k">팀 핸디</div><div class="v">${mine.handicap}</div></div></div></div>`;
      html += `<div class="card grid-tbl" style="margin:0"><div class="row between" style="margin-bottom:10px"><b style="font-size:13.5px">${EV[sub].name} 팀 명단</b><span class="muted" style="color:var(--text-3)">${rows.length}팀</span></div>
        <div class="gh" style="grid-template-columns:44px 1fr 44px"><span>테이블</span><span>팀 · 지역</span><span class="r">핸디</span></div>
        ${rows.map(r => `<div class="gr ${mine && r.teamId === mine.teamId ? 'hit' : ''}" style="grid-template-columns:44px 1fr 44px"><span class="b">${r.lane || '-'}</span><span>${esc(r.name)}<div class="dim" style="font-size:11px">${esc(r.regionName)} · ${r.memberNames.map(esc).join(', ')}</div></span><span class="r">${r.handicap}</span></div>`).join('') || '<p class="empty">등록된 팀이 없습니다.</p>'}</div>`;
      return html + '</div>';
    }
    const g = groupOf(sub);
    const rows = Ranking.playerRows(d.players.filter(p => p.group === sub), d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || num(a.pos, 99) - num(b.pos, 99) || a.name.localeCompare(b.name, 'ko'));
    const mine = hit ? rows.find(r => r.playerId === hit.id) : null;
    if (hit && !mine) html += `<div class="card" style="margin:0"><p class="empty">${esc(hit.name)} 선수는 ${esc(g.name)}에 편성되어 있지 않습니다${hit.group ? ` (${esc(groupName(hit.group))})` : ' (조 미편성)'}.</p></div>`;
    if (mine) html += `<div class="result-card"><div class="cap">검색 결과 · ${esc(hit.name)}</div><div class="big">${mine.lane ? `<span class="n">${mine.lane}</span><span class="u">번 테이블</span>` : '<span class="u">테이블 미배정</span>'}</div><div class="facts">${mine.lane ? `<div><div class="k">레인</div><div class="v">${tableLanes(mine.lane)}</div></div>` : ''}<div><div class="k">순번</div><div class="v">${mine.pos ? mine.pos + '번' : '-'}</div></div><div><div class="k">조</div><div class="v">${esc(g.name)}</div></div><div><div class="k">시작 시간</div><div class="v">${esc(groupDate(g) || '-')}</div></div><div><div class="k">핸디</div><div class="v">${mine.handicap}</div></div></div></div>`;
    html += `<div class="card grid-tbl" style="margin:0"><div class="row between" style="margin-bottom:10px"><b style="font-size:13.5px">${esc(g.name)} 전체 명단</b><span class="muted" style="color:var(--text-3)">${esc(groupTime(g))}${groupTime(g) ? ' · ' : ''}${rows.length}명</span></div>
      <div class="gh" style="grid-template-columns:48px 40px 1fr 44px"><span>테이블</span><span>순번</span><span>이름 · 지역</span><span class="r">핸디</span></div>
      ${rows.map(r => `<div class="gr ${mine && r.playerId === mine.playerId ? 'hit' : ''}" style="grid-template-columns:48px 40px 1fr 44px"><span class="b">${r.lane || '-'}</span><span>${r.pos || '-'}</span><span>${esc(r.name)} <span class="dim">· ${esc(r.regionName)}</span></span><span class="r">${r.handicap}</span></div>`).join('') || '<p class="empty">이 조에 편성된 선수가 없습니다.</p>'}</div>`;
    return html + '</div>';
  }

  function renderRank() {
    const s = S(); const d = state.data; const res = results();
    const tabs = [['individual', '개인전'], ['scotch', '스카치'], ['baker', '베이커'], ['standings', '지역종합']];
    const t = state.rankTab; const q = state.rankQ.trim();
    const hitIds = q ? new Set(findPlayers(q).map(p => p.id)) : new Set();
    let html = `<div class="hero has-tabs"><div class="hero-eyebrow">${s.status === 'final' ? '최종 확정 결과' : (s.basis === 'scratch' ? '스크래치 기준' : '핸디 포함 총점 기준')}</div><h1 class="hero-title sm">${s.status === 'final' ? '최종 순위' : '실시간 순위'}</h1>
      <div class="hero-tabs">${tabs.map(([k, l]) => `<button class="${t === k ? 'active' : ''}" data-action="rank-tab" data-tab2="${k}">${l}</button>`).join('')}</div></div><div class="page">`;
    const podiumList = (rows, nameFn, subFn, scoreFn, ptsFn, isHit) => rows.length ? `<div class="podium">${rows.map(r => `<div class="pod ${isHit && isHit(r) ? 'hit' : ''}"><span class="rk rk-${r.rank <= 3 ? r.rank : ''}" style="${r.rank > 3 ? 'background:var(--text-3)' : ''}">${r.rank}</span><div class="body"><div class="n">${nameFn(r)}</div><div class="c">${subFn(r)}</div></div><div><div class="s">${scoreFn(r)}</div>${ptsFn ? `<div class="p">${ptsFn(r)}</div>` : ''}</div></div>`).join('')}</div>` : '';
    const restList = (rows, nameFn, scoreFn, isHit) => rows.length ? `<div class="card-list grid-tbl rank-list">${rows.map(r => `<div class="gr ${isHit && isHit(r) ? 'hit' : ''}"><span class="no">${r.rank}</span><span>${nameFn(r)}</span><span class="sc">${scoreFn(r)}</span></div>`).join('')}</div>` : '';
    if (t === 'individual') {
      const gpts = state.rankGender === 'F' ? s.points.individualF : s.points.individualM;
      let rows = state.rankGender === 'M' ? res.male : state.rankGender === 'F' ? res.female : Ranking.individualRanking(res.playerRows);
      if (state.rankGroup) rows = Ranking.individualRanking(res.playerRows, r => (state.rankGender === 'all' || r.gender === state.rankGender) && r.group === state.rankGroup);
      rows = rows.filter(r => r.gamesPlayed > 0);
      const isHit = r => hitIds.has(r.playerId);
      html += `<div class="chips">${[['M', '남자'], ['F', '여자'], ['all', '전체']].map(([k, l]) => `<button class="subtab ${state.rankGender === k ? 'active' : ''}" data-action="rank-gender" data-g="${k}" style="margin:0">${l}</button>`).join('')}<select class="subtab" data-change="rank-group" style="margin:0;width:auto;min-width:88px;padding-right:26px"><option value="">전체 조</option>${s.groups.map(g => `<option value="${esc(g.id)}" ${state.rankGroup === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
        ${searchBox('rank-q', state.rankQ, '이름 검색으로 내 순위 찾기', true)}`;
      if (!rows.length) html += '<div class="card" style="margin:0"><p class="empty">아직 입력된 점수가 없습니다.</p></div>';
      else {
        const showPts = state.rankGender !== 'all' && !state.rankGroup;
        html += podiumList(rows.slice(0, 3), r => `${esc(r.name)}${r.isRep ? ' <span class="badge rep-badge">대표</span>' : ''}`, r => `${esc(r.regionName)} · ${esc(groupName(r.group))}${r.gamesPlayed < s.games.individual ? ` · ${r.gamesPlayed}G` : ''}`, r => r.score, showPts ? (r => `포인트 ${Ranking.pointsForRank(r.rank, gpts) || '-'}`) : null, isHit);
        html += restList(rows.slice(3), r => `${esc(r.name)} <span class="dim">· ${esc(r.regionName)}</span>${r.gamesPlayed < s.games.individual ? ` <span class="dim">${r.gamesPlayed}G</span>` : ''}`, r => r.score, isHit);
      }
    } else if (t === 'scotch' || t === 'baker') {
      const rows = res[t].filter(r => r.gamesPlayed > 0); const pts = s.points[t];
      const isHit = r => r.memberIds.some(id => hitIds.has(id));
      html += searchBox('rank-q', state.rankQ, '이름 검색으로 내 팀 찾기', true);
      if (!rows.length) html += `<div class="card" style="margin:0"><p class="empty">아직 입력된 ${EV[t].name} 점수가 없습니다.</p></div>`;
      else {
        html += podiumList(rows.slice(0, 3), r => esc(r.regionName), r => r.memberNames.map(esc).join(' · '), r => r.total, r => `포인트 ${Ranking.pointsForRank(r.rank, pts) || '-'}`, isHit);
        html += restList(rows.slice(3), r => `${esc(r.regionName)} <span class="dim">· ${r.memberNames.map(esc).join(', ')}</span>`, r => r.total, isHit);
      }
    } else {
      const rows = res.standings; const br = r => `개인 남 ${r.male} · 여 ${r.female} · 3인조 ${r.reps} · 스카치 ${r.scotch} · 베이커 ${r.baker}`;
      html += `<p class="muted" style="color:var(--text-3)">배점: 개인전 남 ${s.points.individualM.join('/')} · 여 ${s.points.individualF.join('/')} · 3인조·스카치·베이커 ${s.points.reps.join('/')}</p>`;
      if (!rows.some(r => r.total > 0)) html += '<div class="card" style="margin:0"><p class="empty">아직 포인트가 없습니다.</p></div>';
      else {
        html += podiumList(rows.slice(0, 3), r => esc(r.regionName), br, r => r.total + '점', null);
        html += restList(rows.slice(3), r => `${esc(r.regionName)}<div class="dim" style="font-size:11px">${br(r)}</div>`, r => r.total + '점');
      }
      const reps = res.reps;
      html += `<div class="card grid-tbl" style="margin:0"><div class="row between" style="margin-bottom:10px"><b style="font-size:13.5px">3인조 (지역 대표 합계)</b><span class="muted" style="color:var(--text-3)">지역당 ${s.repCount}명</span></div>
        <div class="gh" style="grid-template-columns:30px 1fr 56px"><span>순위</span><span>지역 · 대표</span><span class="r">합계</span></div>
        ${reps.map(r => `<div class="gr" style="grid-template-columns:30px 1fr 56px"><span class="b">${r.rank}</span><span>${esc(r.regionName)}${r.short ? ' <span class="badge live">대표 부족</span>' : ''}<div class="dim" style="font-size:11px">${r.reps.map(x => esc(x.name) + '(' + x.score + ')').join(', ') || '-'}</div></span><span class="r b">${r.score}</span></div>`).join('')}</div>`;
    }
    return html + '</div>';
  }

  // ===== 관리자 대시보드 =====
  function renderAdminHome() {
    const s = S(); const d = state.data; const pr = Ranking.progress(d);
    const pct = pr.individual.total ? Math.round(pr.individual.done / pr.individual.total * 100) : 0;
    const allDone = pr.individual.done === pr.individual.total && pr.scotch.done === pr.scotch.total && pr.baker.done === pr.baker.total;
    const demoNotice = Store.mode() === 'local' ? `<div class="card" style="border-color:var(--orange-input-line);background:var(--orange-input)"><b>데모 모드</b> <span class="muted">— 지금 입력하는 데이터는 이 브라우저에만 저장되어 다른 기기(핸드폰 등)에서는 보이지 않습니다. 모든 기기가 같은 데이터를 보려면 <button class="link-btn" data-action="tab" data-tab="settings" style="margin:0;color:var(--orange-text);font-weight:700">설정 → 서버 연결</button>에서 Google 스프레드시트(Apps Script)를 연결하세요.</span></div>` : '';
    return demoNotice + `<div class="stat-grid" style="margin-bottom:20px">
      ${stat(`${d.players.length}<small>명</small>`, '참가 선수', `${d.regions.length}개 지역 참가`)}
      ${stat(`${Math.floor((s.lanes || 0) / 2)}<small>테이블</small>`, '등록 레인', `${s.lanes || 0}레인 · 테이블당 ${s.perTable || 4}명 · ${d.players.filter(p => p.lane).length}명 배정됨`)}
      ${stat(`${pct}<small>%</small>`, '개인전 진행률', `${pr.individual.done}/${pr.individual.total}명 입력`, true)}
      ${stat(`${s.status === 'final' ? 1 : 0}<small>건</small>`, '확정된 결과', s.status === 'final' ? '최종 확정됨' : '최종 확정 전')}
    </div>
    <div class="card"><h2>결과 관리 ${statusBadge()}</h2>
      <div class="muted" style="margin-bottom:14px">개인전 ${pr.individual.done}/${pr.individual.total}명 · 스카치 ${pr.scotch.done}/${pr.scotch.total}팀 · 베이커 ${pr.baker.done}/${pr.baker.total}팀${allDone ? '' : ' · <span class="badge live">미입력 있음</span>'}</div>
      <div class="row">${s.status === 'final' ? '<button class="btn btn-outline" data-action="unfinalize">확정 해제</button>' : `${s.status !== 'live' ? '<button class="btn btn-secondary" data-action="set-status" data-status="live">대회 시작 (진행중)</button>' : ''}<button class="btn btn-success" data-action="finalize">최종 결과 확정</button>`}</div>
      <p class="muted" style="margin-top:12px;color:var(--text-3);font-size:11.5px">확정하면 순위와 포인트가 스냅샷으로 저장되어 이후 입력이 바뀌어도 결과가 유지됩니다.</p></div>
    <div class="quick-grid">
      <button class="quick" data-action="tab" data-tab="players"><div class="ic">${ICON.user}</div><div><div class="t">선수 등록하기</div><div class="d">참가 신청 · 핸디 입력</div></div></button>
      <button class="quick" data-action="tab" data-tab="assign"><div class="ic">${ICON.lanes}</div><div><div class="t">레인 배정하기</div><div class="d">조 편성 · 자동 배정</div></div></button>
      <button class="quick" data-action="go-score"><div class="ic">${ICON.rank}</div><div><div class="t">점수 입력하기</div><div class="d">게임 점수 · 실시간 집계</div></div></button>
    </div>`;
  }
  function podium(rows, nameFn, scoreFn, subFn) {
    if (!rows.length) return '<p class="empty">아직 결과가 없습니다.</p>';
    return `<div class="podium">${rows.map(r => `<div class="pod"><span class="rk rk-${r.rank}">${r.rank}</span><div class="body"><div class="n">${esc(nameFn(r))}</div><div class="c">${esc(subFn ? subFn(r) : '')}</div></div><div class="s">${esc(scoreFn(r))}</div></div>`).join('')}</div>`;
  }

  // ----- 선수 -----
  function renderPlayers() {
    const d = state.data; const s = S();
    let html = '';
    if (isAdmin()) {
      const er = state.editRegion;
      html += `<div class="card"><h2>지역 (${d.regions.length})</h2>
        <form data-form="save-region" data-id="${esc(er ? er.id || '' : '')}" class="form-row"><div class="form-group"><input type="text" name="name" placeholder="지역명" required value="${esc(er ? er.name : '')}"></div><div class="form-group"><input type="text" name="leader" placeholder="대표/연락 담당" value="${esc(er ? er.leader : '')}"></div><div class="form-group"><input type="text" name="note" placeholder="비고" value="${esc(er ? er.note : '')}"></div><div class="form-group" style="flex:0"><div class="row"><button class="btn btn-small btn-primary" type="submit">${er ? '수정' : '추가'}</button>${er ? '<button class="btn btn-small btn-outline" type="button" data-action="cancel-region">취소</button>': ''}</div></div></form>
        <div class="row">${d.regions.map(r => `<span class="chip">${esc(r.name)} <small>${d.players.filter(p => p.regionId === r.id).length}명</small> <span data-action="edit-region" data-id="${esc(r.id)}" style="cursor:pointer;color:var(--primary-light);font-size:0.72rem">수정</span> <span class="x" data-action="del-region" data-id="${esc(r.id)}">×</span></span>`).join('')}</div></div>`;
      const ep = state.editPlayer; const ev = (ep && ep.events) || { individual: true };
      html += `<div class="card"><h2>${ep && ep.id ? '선수 수정' : '선수 등록'}</h2><form data-form="save-player" data-id="${esc(ep ? ep.id || '' : '')}">
        <div class="form-row"><div class="form-group"><label>이름</label><input type="text" name="name" required value="${esc(ep ? ep.name : '')}"></div><div class="form-group"><label>지역</label><select name="regionId" required>${regionOptions(ep ? ep.regionId : state.playersRegion, '선택')}</select></div><div class="form-group"><label>성별</label><select name="gender"><option value="M" ${ep && ep.gender === 'F' ? '' : 'selected'}>남</option><option value="F" ${ep && ep.gender === 'F' ? 'selected' : ''}>여</option></select></div></div>
        <div class="form-row"><div class="form-group"><label>생년 (동점 시 연장자 순)</label><input type="number" name="birthYear" placeholder="예: 1975" value="${esc(ep && ep.birthYear ? ep.birthYear : '')}"></div><div class="form-group"><label>핸디 (게임당)</label><input type="number" name="handicap" value="${esc(ep && ep.handicap != null ? ep.handicap : 0)}"></div><div class="form-group"><label>총점 가감 (예: 프로 -21)</label><input type="number" name="adjust" value="${esc(ep && ep.adjust ? ep.adjust : 0)}"></div><div class="form-group"><label>조</label><select name="group">${groupOptions(ep ? ep.group : '', '미편성')}</select></div></div>
        <p class="muted small mb">핸디는 규정(여성 15, 시니어 1~5, 최고 20, 장애 7 등)에 따라 관리자가 직접 입력합니다. 조 보너스(설정의 조별 +점)는 자동으로 더해집니다. 감점(클럽티 -10/게임 등)은 핸디에 음수로, 프로 -21은 총점 가감에 입력하세요.</p>
        <div class="form-group"><label>출전 종목 / 대표</label><div class="row">
          <label class="checkbox-item"><input type="checkbox" name="ev_individual" ${ev.individual !== false ? 'checked' : ''}> 개인전</label>
          <label class="checkbox-item"><input type="checkbox" name="ev_scotch" ${ev.scotch ? 'checked' : ''}> 스카치</label>
          <label class="checkbox-item"><input type="checkbox" name="ev_baker" ${ev.baker ? 'checked' : ''}> 베이커</label>
          <label class="checkbox-item"><input type="checkbox" name="ev_side" ${ev.side ? 'checked' : ''}> 사이드</label>
          <label class="checkbox-item"><input type="checkbox" name="isRep" ${ep && ep.isRep ? 'checked' : ''}> <b>지역 대표</b></label></div></div>
        <div class="form-group"><label>비고</label><input type="text" name="note" value="${esc(ep ? ep.note : '')}"></div>
        <div class="row"><button class="btn btn-small btn-primary" type="submit">저장</button>${ep ? '<button class="btn btn-small btn-outline" type="button" data-action="cancel-player">취소</button>': ''}</div></form></div>`;
      html += renderUploadCard();
      html += `<div class="card"><h2>텍스트로 일괄 등록</h2><p class="muted small mb">한 줄에 한 명: <code>이름,지역,성별(남/여),생년,핸디,종목,대표</code><br>종목은 "개인 스카치 베이커" 중 출전하는 것을 띄어쓰기로 (비우면 개인전만). 대표는 "대표" 또는 O.<br>지역이 없으면 자동 생성됩니다. 엑셀 신청서 양식이 정해지면 파일 업로드로 바꿀 예정입니다.</p>
        <form data-form="import-players"><textarea name="csv" placeholder="홍길동,서울,남,1975,0,개인 스카치,대표&#10;김영희,서울,여,1980,15,개인 베이커"></textarea>
        <div class="row mt"><label class="checkbox-item"><input type="checkbox" name="replace"> 기존 선수·팀 전체 삭제 후 등록</label><button class="btn btn-small btn-primary" type="submit">가져오기</button></div></form></div>`;
    }
    const q = state.playersQ.trim();
    const rows = Ranking.playerRows(d.players, d.regions, s).filter(r => (!state.playersRegion || r.regionId === state.playersRegion) && (!state.playersGender || r.gender === state.playersGender) && (!q || r.name.includes(q)));
    rows.sort((a, b) => a.regionName.localeCompare(b.regionName, 'ko') || (b.isRep - a.isRep) || a.name.localeCompare(b.name, 'ko'));
    const pMap = new Map(d.players.map(p => [p.id, p]));
    html += `<div class="card"><h2>참가 선수 (${rows.length}/${d.players.length}) <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#players-table" data-name="참가선수">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="form-row mb"><div class="form-group"><select data-change="players-region">${regionOptions(state.playersRegion, '전체 지역')}</select></div><div class="form-group"><select data-change="players-gender"><option value="">남녀 전체</option><option value="M" ${state.playersGender === 'M' ? 'selected' : ''}>남자</option><option value="F" ${state.playersGender === 'F' ? 'selected' : ''}>여자</option></select></div><div class="form-group"><input type="text" data-input="players-q" placeholder="이름 검색" value="${esc(state.playersQ)}"></div></div>
      <p class="muted small mb">핸디는 게임당 점수이며 조 보너스 포함 · 가감은 총점에 한 번 적용 · <span class="badge rep-badge">대표</span> 지역 대표 (지역당 ${s.repCount}명)</p>
      <div class="table-scroll"><table class="tbl" id="players-table"><thead><tr><th class="left">이름</th><th class="left">지역</th><th>성별</th><th>생년</th><th>핸디</th><th>가감</th><th>조</th><th>테이블</th><th class="left">종목</th>${isAdmin() ? '<th></th>': ''}</tr></thead><tbody>
      ${rows.map(r => { const p = pMap.get(r.playerId); return `<tr><td class="left"><b>${esc(r.name)}</b>${r.isRep ? ' <span class="badge rep-badge">대표</span>': ''}</td><td class="left">${esc(r.regionName)}</td><td>${genderBadge(r.gender)}</td><td>${r.birthYear || '-'}</td><td>${r.handicap}${r.bonus ? `<small class="muted"> (${r.baseHandicap}+${r.bonus})</small>` : ''}</td><td>${r.adjust ? r.adjust : '-'}</td><td>${esc(groupName(r.group))}</td><td>${r.lane ? r.lane + '-' + r.pos : '-'}</td><td class="left">${evChips(p.events)}</td>${isAdmin() ? `<td class="nowrap"><button class="btn btn-xs btn-outline" data-action="edit-player" data-id="${esc(p.id)}">수정</button> <button class="btn btn-xs btn-danger" data-action="del-player" data-id="${esc(p.id)}">삭제</button></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="10" class="empty">선수가 없습니다.</td></tr>'}
      </tbody></table></div></div>`;
    return html;
  }

  // ----- 신청서 엑셀 업로드 -----
  function renderUploadCard() {
    const s = S();
    const ups = state.uploads;
    let html = `<div class="card"><h2>참가 신청서 업로드 (엑셀)</h2>
      <p class="muted small mb">클럽별 참가 신청서(.xlsx)를 선택하면 클럽명, 개인전 선수(조·성별·핸디·사이드), 3인조 대표, 스카치·베이커 팀을 읽어 미리보기를 보여줍니다. 여러 파일을 한 번에 선택할 수 있습니다.</p>
      <label class="btn btn-small btn-primary" style="cursor:pointer">파일 선택 <input type="file" accept=".xlsx,.xls" multiple data-change="signup-files" style="display:none"></label>`;
    if (typeof XLSX === 'undefined') html += `<p class="form-error mt">엑셀 읽기 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.</p>`;
    ups.forEach((u, i) => {
      const p = u.parsed;
      if (!p) { html += `<div class="lane-box mt"><b>${esc(u.fileName)}</b><p class="form-error">${esc(u.error || '읽기 실패')}</p></div>`; return; }
      const existing = state.data.regions.find(r => r.name === (u.regionName || p.clubName));
      const groups = {}; p.players.forEach(x => { groups[x.group] = (groups[x.group] || 0) + 1; });
      const unknownGroups = Object.keys(groups).filter(g => !s.groups.some(x => x.name === g));
      html += `<div class="lane-box mt"><div class="row between"><b>${esc(u.fileName)}</b>${u.done ? '<span class="badge final">등록 완료</span>' : ''}</div>
        <div class="form-row mt"><div class="form-group"><label>클럽(지역) 이름</label><input type="text" data-upload-region="${i}" value="${esc(u.regionName || p.clubName)}"></div><div class="form-group" style="align-self:flex-end"><span class="small">${existing ? `기존 지역 <b>${esc(existing.name)}</b>에 등록 (현재 ${state.data.players.filter(x => x.regionId === existing.id).length}명)` : '새 지역으로 추가'}</span></div></div>
        <p class="small">개인전 <b>${p.players.length}</b>명 (${Object.entries(groups).map(([g, n]) => esc(g) + ' ' + n + '명').join(', ') || '-'}) · 여성 ${p.players.filter(x => x.gender === 'F').length}명 · 사이드 ${p.players.filter(x => x.side).length}명 · 3인조 ${p.reps.length}명 · 스카치 ${p.scotch.length}팀 · 베이커 ${p.baker.length}팀</p>
        <p class="small muted">${p.players.map(x => esc(x.name) + (x.handicap ? '(' + x.handicap + ')' : '')).join(', ')}</p>
        ${unknownGroups.length ? `<p class="form-error">신청서의 조 이름 ${unknownGroups.map(esc).join(', ')} 이(가) 설정의 조(${s.groups.map(g => esc(g.name)).join(', ')})와 다릅니다. 순서대로 대응시켜 등록합니다.</p>` : ''}
        ${p.warnings.length ? `<div class="form-error small" style="text-align:left">${p.warnings.map(esc).join('<br>')}</div>` : ''}
        ${u.done ? '' : `<div class="row mt"><label class="checkbox-item"><input type="checkbox" data-upload-replace="${i}" ${u.replace !== false ? 'checked' : ''}> 이 클럽의 기존 선수·팀을 신청서 기준으로 교체</label><button class="btn btn-small btn-primary" data-action="signup-register" data-i="${i}">등록</button></div>`}
      </div>`;
    });
    if (ups.length) html += `<div class="row mt">${ups.some(u => u.parsed && !u.done) ? '<button class="btn btn-small btn-secondary" data-action="signup-register-all">전체 등록</button>' : ''}<button class="btn btn-small btn-outline" data-action="signup-clear">목록 지우기</button></div>`;
    return html + '</div>';
  }

  async function readSignupFiles(files) {
    if (typeof XLSX === 'undefined') return toast('엑셀 읽기 라이브러리를 불러오지 못했습니다.', true);
    for (const file of files) {
      const u = { fileName: file.name, parsed: null, error: '', regionName: '', replace: true, done: false };
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        u.parsed = Signup.parse(rows); u.regionName = u.parsed.clubName;
        if (!u.parsed.players.length) { u.error = '선수를 찾지 못했습니다. 양식을 확인하세요.'; u.parsed = null; }
      } catch (e) { u.error = '읽기 실패: ' + e.message; }
      state.uploads.push(u);
    }
    render();
  }

  /** 신청서 1건 등록 */
  async function registerSignup(i) {
    const u = state.uploads[i]; if (!u || !u.parsed || u.done) return;
    const d = state.data; const s = S(); const p = u.parsed;
    const regionName = (u.regionName || p.clubName || '').trim();
    if (!regionName) return toast('클럽(지역) 이름을 입력하세요.', true);
    let region = d.regions.find(r => r.name === regionName);
    if (!region) { region = { id: Store.uid('r'), name: regionName, leader: '', note: '' }; d.regions = await Store.saveRegion(region); region = d.regions.find(r => r.name === regionName) || region; }
    // 조 이름 매핑: 이름 일치 → 없으면 순서
    const formGroups = [...new Set(p.players.map(x => x.group))];
    const groupId = g => { const byName = s.groups.find(x => x.name === g); if (byName) return byName.id; const idx = formGroups.indexOf(g); return s.groups[idx] ? s.groups[idx].id : ''; };
    const repSet = new Set(p.reps);
    const inScotch = new Set(p.scotch.flat().map(m => m.name)), inBaker = new Set(p.baker.flat().map(m => m.name));
    const existing = d.players.filter(x => x.regionId === region.id);
    const list = p.players.map(x => {
      const ex = existing.find(e => e.name === x.name);
      const note = x.seniorHandicap ? `시니어핸디 ${x.seniorHandicap}` : '';
      return { ...(ex || { id: '', birthYear: '', adjust: 0, lane: '', pos: '', games: Array(s.games.individual).fill(null) }), name: x.name, regionId: region.id, gender: x.gender, handicap: x.handicap, group: groupId(x.group), isRep: repSet.has(x.name),
        events: { individual: true, scotch: inScotch.has(x.name), baker: inBaker.has(x.name), side: !!x.side }, note: ex && ex.note && !/시니어핸디/.test(ex.note) ? ex.note + (note ? ' ' + note : '') : note };
    });
    d.players = await Store.savePlayers(list);
    if (u.replace !== false) {
      const keep = new Set(list.map(x => x.name));
      const gone = d.players.filter(x => x.regionId === region.id && !keep.has(x.name)).map(x => x.id);
      if (gone.length) { const r = await Store.deletePlayers(gone); d.players = r.players; d.teams = r.teams; }
    }
    const idOf = name => { const m = d.players.find(x => x.regionId === region.id && x.name === name); return m ? m.id : null; };
    const mk = (ev, teams) => teams.map((t, i) => ({ event: ev, regionId: region.id, name: `${regionName}${i + 1}`, members: t.map(m => idOf(m.name)).filter(Boolean), lane: '', handicap: ev === 'baker' ? (t.filter(m => (d.players.find(x => x.id === idOf(m.name)) || {}).gender === 'F').length >= 2 ? 5 : t.some(m => (d.players.find(x => x.id === idOf(m.name)) || {}).gender === 'F') ? 3 : 0) : 0, adjust: 0, games: Array(s.games[ev]).fill(null) }));
    if (u.replace !== false || p.scotch.length) d.teams = await Store.replaceTeams(region.id, 'scotch', mk('scotch', p.scotch));
    if (u.replace !== false || p.baker.length) d.teams = await Store.replaceTeams(region.id, 'baker', mk('baker', p.baker));
    u.done = true;
    return `${regionName}: 선수 ${list.length}명, 스카치 ${p.scotch.length}팀, 베이커 ${p.baker.length}팀 등록`;
  }

  // ----- 배정 -----
  function renderAssign() {
    const s = S(); const d = state.data;
    const items = s.groups.map(g => [g.id, `개인전 ${g.name}`]).concat([['scotch', '스카치'], ['baker', '베이커']]);
    if (!items.some(i => i[0] === state.assignSub)) state.assignSub = items[0][0];
    let html = subtabs(items, state.assignSub, 'assign-sub', 'sub');
    if (EV[state.assignSub]) return html + renderTeamAssign(state.assignSub);
    const g = s.groups.find(x => x.id === state.assignSub);
    const rows = Ranking.playerRows(d.players.filter(p => p.group === g.id), d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || num(a.pos, 99) - num(b.pos, 99) || a.name.localeCompare(b.name, 'ko'));
    const unassigned = d.players.filter(p => !p.group || !s.groups.some(x => x.id === p.group)).length;
    if (isAdmin()) {
      html += `<div class="card"><h2>조 편성 / 레인 배정</h2>
        <p class="small mb">전체 ${d.players.length}명 · 미편성 ${unassigned}명 · ${s.groups.map(x => x.name + ' ' + d.players.filter(p => p.group === x.id).length + '명').join(' · ')}</p>
        <div class="row mb"><button class="btn btn-small btn-secondary" data-action="auto-groups">전체 조 자동 편성 (지역별 균등)</button></div>
        <div class="form-row"><div class="form-group"><label>시작 테이블</label><input type="number" id="lane-from" value="${s.tableFrom || 1}"></div><div class="form-group"><label>테이블당 인원</label><input type="number" id="per-lane" value="${s.perTable || 4}"></div><div class="form-group" style="flex:0;align-self:flex-end"><button class="btn btn-small btn-primary" data-action="auto-lanes" data-group="${esc(g.id)}">${esc(g.name)} 테이블 자동 배정</button></div></div>
        <p class="muted small">테이블 1개는 좌우 2레인(1번 테이블 = 1·2레인)을 씁니다. 같은 지역 선수가 같은 테이블에 겹치지 않도록 배정하며, 아래 표에서 조·테이블·순번을 직접 고친 뒤 <b>저장</b>을 누르세요.</p></div>`;
    }
    const byLane = new Map(); rows.forEach(r => { const k = r.lane || '미배정'; if (!byLane.has(k)) byLane.set(k, []); byLane.get(k).push(r); });
    html += `<div class="card"><h2>${esc(g.name)} <span class="muted small">${g.day ? g.day + '일차' : ''} ${esc(g.time || '')} · ${rows.length}명</span> <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#assign-table" data-name="${esc(g.name)}배정">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="lane-grid mb">${[...byLane.entries()].map(([lane, list]) => `<div class="lane-box"><div class="ln">${lane === '미배정' ? '미배정' : lane + '번 테이블 <small>' + tableLanes(lane) + '</small>'}</div><ol>${list.map(r => `<li>${esc(r.name)}${r.isRep ? '<span class="badge rep-badge">대표</span>': ''} <small>${esc(r.regionName)} ${r.gender === 'F' ? '여' : ''} 핸디 ${r.handicap}</small></li>`).join('')}</ol></div>`).join('') || '<p class="empty">이 조에 편성된 선수가 없습니다.</p>'}</div>
      <div class="table-scroll"><table class="tbl" id="assign-table"><thead><tr><th>테이블</th><th>순번</th><th class="left">이름</th><th class="left">지역</th><th>성별</th><th>핸디</th>${isAdmin() ? '<th>조</th>': ''}</tr></thead><tbody>
      ${rows.map(r => `<tr>${isAdmin() ? `<td><input type="number" class="sm" data-pfield="lane" data-id="${esc(r.playerId)}" value="${esc(r.lane)}"></td><td><input type="number" class="sm" data-pfield="pos" data-id="${esc(r.playerId)}" value="${esc(r.pos)}"></td>` : `<td>${r.lane || '-'}</td><td>${r.pos || '-'}</td>`}<td class="left"><b>${esc(r.name)}</b>${r.isRep ? ' <span class="badge rep-badge">대표</span>': ''}</td><td class="left">${esc(r.regionName)}</td><td>${genderBadge(r.gender)}</td><td>${r.handicap}</td>${isAdmin() ? `<td><select class="sm" data-pfield="group" data-id="${esc(r.playerId)}">${groupOptions(r.group, '미편성')}</select></td>` : ''}</tr>`).join('') || '<tr><td colspan="8" class="empty">선수가 없습니다.</td></tr>'}
      </tbody></table></div>${isAdmin() ? `<div class="mt">${saveBar()}</div>` : ''}</div>`;
    if (isAdmin() && unassigned) {
      const un = d.players.filter(p => !p.group || !s.groups.some(x => x.id === p.group));
      html += `<div class="card"><h2>미편성 선수 (${un.length})</h2><div class="table-scroll"><table class="tbl"><tbody>${un.map(p => `<tr><td class="left"><b>${esc(p.name)}</b></td><td class="left">${esc(regionName(p.regionId))}</td><td><select class="sm" data-pfield="group" data-id="${esc(p.id)}">${groupOptions('', '미편성')}</select></td></tr>`).join('')}</tbody></table></div><div class="mt">${saveBar()}</div></div>`;
    }
    return html;
  }

  function renderTeamAssign(event) {
    const s = S(); const d = state.data; const ev = EV[event];
    const pr = Ranking.playerRows(d.players, d.regions, s);
    const rows = Ranking.teamRows(d.teams, event, pr, d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || a.regionName.localeCompare(b.regionName, 'ko'));
    let html = '';
    if (isAdmin()) {
      const reg = state.teamRegion || (d.regions[0] && d.regions[0].id) || '';
      const inTeam = new Set(d.teams.filter(t => t.event === event).flatMap(t => t.members));
      const cands = d.players.filter(p => p.regionId === reg && !inTeam.has(p.id) && (!p.events || p.events[event])).sort((a, b) => a.gender.localeCompare(b.gender) || a.name.localeCompare(b.name, 'ko'));
      const hint = event === 'scotch' ? '남 1명 + 여 1명' : '3명';
      html += `<div class="card"><h2>${ev.name} 팀 만들기</h2><p class="muted small mb">팀 구성: ${hint} · 해당 종목에 출전 신청한 선수만 표시됩니다.</p>
        <div class="form-row"><div class="form-group"><label>지역</label><select data-change="team-region">${regionOptions(reg)}</select></div><div class="form-group"><label>팀명 (비우면 지역명+번호, 예: 서울1)</label><input type="text" id="team-name" placeholder="예: 서울1"></div><div class="form-group"><label>팀 핸디 (게임당)</label><input type="number" id="team-handicap" value="0"></div><div class="form-group"><label>총점 가감</label><input type="number" id="team-adjust" value="0"></div></div>
        <p class="muted small mb">규정 예: 베이커 여자 1명 +3, 2명 이상 +5 · 장애인 +3 · 프로 -3 (게임당, 핸디에 합산해 입력)</p>
        <div class="checkbox-grid">${cands.map(p => `<label class="checkbox-item"><input type="checkbox" class="team-cb" value="${esc(p.id)}" data-gender="${p.gender}"> ${esc(p.name)} <small>${p.gender === 'F' ? '여' : '남'}${p.handicap ? ' · 핸디 ' + p.handicap : ''}</small></label>`).join('') || '<span class="muted small">선택 가능한 선수가 없습니다.</span>'}</div>
        <div class="row mt"><button class="btn btn-small btn-primary" data-action="add-team" data-event="${event}">팀 등록</button>
        <button class="btn btn-small btn-secondary" data-action="auto-team-lanes" data-event="${event}">테이블 자동 배정</button>
        <input type="number" id="team-lane-from" value="${s.tableFrom || 1}" style="width:70px" title="시작 테이블"> <input type="number" id="team-per-lane" value="${event === 'scotch' ? 2 : 1}" style="width:60px" title="테이블당 팀 수"></div></div>`;
    }
    html += `<div class="card"><h2>${ev.name} 팀 (${rows.length}) <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#team-assign-table" data-name="${ev.name}배정">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="table-scroll"><table class="tbl" id="team-assign-table"><thead><tr><th>테이블</th><th class="left">지역</th><th class="left">팀 / 선수</th><th>핸디/게임</th><th>가감</th>${isAdmin() ? '<th></th>': ''}</tr></thead><tbody>
      ${rows.map(r => `<tr>${isAdmin() ? `<td><input type="number" class="sm" data-tfield="lane" data-id="${esc(r.teamId)}" value="${esc(r.lane)}"></td>` : `<td>${r.lane || '-'}</td>`}<td class="left">${esc(r.regionName)}</td><td class="left"><b>${esc(r.name)}</b>${!r.valid ? ' <span class="badge live">인원 확인</span>': ''}<br><small class="muted">${r.members.map(m => esc(m.name) + '(' + (m.gender === 'F' ? '여' : '남') + ')').join(', ')}</small></td>${isAdmin() ? `<td><input type="number" class="sm" data-tfield="handicap" data-id="${esc(r.teamId)}" value="${esc(r.handicap)}"></td><td><input type="number" class="sm" data-tfield="adjust" data-id="${esc(r.teamId)}" value="${esc(r.adjust || 0)}"></td>` : `<td>${r.handicap}</td><td>${r.adjust || '-'}</td>`}${isAdmin() ? `<td><button class="btn btn-xs btn-danger" data-action="del-team" data-id="${esc(r.teamId)}">삭제</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="empty">등록된 팀이 없습니다.</td></tr>'}
      </tbody></table></div>${isAdmin() ? `<div class="mt">${saveBar()}</div>` : ''}</div>`;
    return html;
  }

  // ----- 개인전 -----
  function renderIndividual() {
    const s = S(); const d = state.data; const res = results(); const n = s.games.individual;
    const items = [['M', '남자'], ['F', '여자'], ['all', '전체']].concat(s.groups.map(g => ['g:' + g.id, g.name]));
    if (isAdmin()) items.push(['score', '점수 입력']);
    if (!items.some(i => i[0] === state.indSub)) state.indSub = 'M';
    let html = subtabs(items, state.indSub, 'ind-sub', 'sub');
    if (state.indSub === 'score') return html + renderIndividualScore();
    const label = items.find(i => i[0] === state.indSub)[1];
    let rows;
    if (state.indSub === 'M') rows = res.male; else if (state.indSub === 'F') rows = res.female;
    else if (state.indSub === 'all') rows = Ranking.individualRanking(res.playerRows);
    else { const gid = state.indSub.slice(2); rows = Ranking.individualRanking(res.playerRows, r => r.group === gid); }
    const isGender = state.indSub === 'M' || state.indSub === 'F';
    const gPts = state.indSub === 'F' ? s.points.individualF : s.points.individualM;
    html += `<p class="muted small mb">${s.status === 'final' ? '<span class="status-final">확정된 결과</span>': '실시간 집계'} · 순위 기준: ${s.basis === 'scratch' ? '스크래치' : '핸디 포함 총점'} · 동점: 스크래치 → 하이 → 로우 → 연장자${isGender ? ` · 상위 ${gPts.length}명 지역 포인트 (${gPts.join('/')})` : ''}</p>`;
    html += `<div class="card"><h2>개인전 ${esc(label)} <span class="muted small">${rows.length}명</span> <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#ind-table" data-name="개인전${esc(label)}">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="table-scroll"><table class="tbl" id="ind-table"><thead><tr><th>순위</th><th class="left">이름</th><th class="left">지역</th><th>조</th><th>핸디</th>${gameHeads(n)}<th>스크래치</th><th>가감</th><th>총점</th><th>하이</th>${isGender ? '<th>포인트</th>': ''}</tr></thead><tbody>
      ${rows.map(r => `<tr class="rank-${r.rank}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.name)}</b>${r.isRep ? ' <span class="badge rep-badge">대표</span>': ''}${!isGender && r.gender === 'F' ? ' <span class="badge gender-F">여</span>': ''}</td><td class="left">${esc(r.regionName)}</td><td>${esc(groupName(r.group))}</td><td>${r.handicap}</td>${gamesOf(r, n)}<td>${r.scratch}</td><td>${r.adjust ? r.adjust : '-'}</td><td class="strong">${r.total}</td><td>${r.high || '-'}</td>${isGender ? `<td class="pts">${Ranking.pointsForRank(r.rank, gPts) || ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${n + 11}" class="empty">데이터 없음</td></tr>`}
      </tbody></table></div></div>`;
    return html;
  }

  function renderIndividualScore() {
    const s = S(); const d = state.data; const n = s.games.individual; const res = results();
    const gid = state.scoreGroup || s.groups[0].id;
    const list = d.players.filter(p => p.group === gid);
    const rows = Ranking.playerRows(list, d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || num(a.pos, 99) - num(b.pos, 99) || a.name.localeCompare(b.name, 'ko'));
    const done = rows.filter(r => r.gamesPlayed === n).length;
    const mini = (title, list2, pts) => `<div class="card"><h2>실시간 집계 · ${title}</h2><div class="table-scroll"><table class="tbl"><thead><tr><th>순위</th><th class="left">이름</th><th class="left">지역</th><th>조</th><th>총점</th><th>포인트</th></tr></thead><tbody>
      ${list2.slice(0, 5).map(r => `<tr class="rank-${r.rank}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.name)}</b></td><td class="left">${esc(r.regionName)}</td><td>${esc(groupName(r.group))}</td><td class="strong">${r.score}</td><td>${Ranking.pointsForRank(r.rank, pts) || ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">아직 점수가 없습니다.</td></tr>'}</tbody></table></div></div>`;
    return `<div class="card"><h2><span class="row">${esc(groupName(gid))} 점수 입력 <span class="muted" style="color:var(--text-3);font-weight:500">완료 ${done}/${rows.length}명</span></span><span class="row"><select data-change="score-group" style="width:auto">${groupOptions(gid)}</select></span></h2>
      <p class="muted small mb">점수를 모두 입력한 뒤 <b>저장</b> 버튼을 누르세요. 저장 전에는 다른 화면으로 이동할 때 확인창이 뜹니다.</p>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>테이블</th><th class="left">이름</th><th class="left">지역</th><th>핸디</th>${gameHeads(n)}<th>합계</th><th>총점</th></tr></thead><tbody>
      ${rows.map(r => `<tr data-row="${esc(r.playerId)}"><td><b>${tablePos(r)}</b></td><td class="left"><b>${esc(r.name)}</b>${r.gender === 'F' ? ' <span class="badge gender-F">여</span>' : ''}</td><td class="left small">${esc(r.regionName)}</td><td>${r.handicap}</td>${r.games.map((g, i) => `<td><input type="number" min="0" max="300" inputmode="numeric" data-pscore="${esc(r.playerId)}" data-g="${i}" value="${g == null ? '' : g}" aria-label="${esc(r.name)} ${i + 1}게임"></td>`).join('')}<td class="c-scratch"><span>${r.scratch}</span></td><td class="c-total strong"><span>${r.total}</span></td></tr>`).join('') || `<tr><td colspan="${n + 6}" class="empty">이 조에 선수가 없습니다. 배정 탭에서 조를 편성하세요.</td></tr>`}
      </tbody></table></div><div class="mt">${saveBar()}</div></div>` + mini('개인전 남자', res.male.filter(r => r.gamesPlayed), s.points.individualM) + mini('개인전 여자', res.female.filter(r => r.gamesPlayed), s.points.individualF) + renderScoreImport('individual', gid);
  }

  // ----- 팀 종목 -----
  function renderTeamEvent(event) {
    const s = S(); const d = state.data; const ev = EV[event]; const n = s.games[event]; const res = results();
    const items = [['rank', '순위']]; if (isAdmin()) items.push(['score', '점수 입력']);
    const cur = state.teamSub[event] || 'rank';
    let html = subtabs(items, cur, 'team-sub', 'sub');
    const ranked = res[event];
    const pts = s.points[event];
    if (cur === 'score') {
      const rows = Ranking.teamRows(d.teams, event, res.playerRows, d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || a.regionName.localeCompare(b.regionName, 'ko'));
      const done = rows.filter(r => r.gamesPlayed === n).length;
      return html + `<div class="card"><h2>${ev.name} 점수 입력 <span class="muted" style="color:var(--text-3);font-weight:500">완료 ${done}/${rows.length}팀</span></h2><p class="muted small mb">팀 핸디는 배정 탭에서 팀별로 입력합니다. 점수를 모두 입력한 뒤 <b>저장</b>을 누르세요.</p>
        <div class="table-scroll"><table class="tbl"><thead><tr><th>테이블</th><th class="left">지역</th><th class="left">팀</th><th>핸디</th>${gameHeads(n)}<th>합계</th><th>총점</th></tr></thead><tbody>
        ${rows.map(r => `<tr data-row="${esc(r.teamId)}"><td>${r.lane || '-'}</td><td class="left">${esc(r.regionName)}</td><td class="left"><b>${esc(r.name)}</b></td><td>${r.handicap}</td>${r.games.map((g, i) => `<td><input type="number" min="0" max="300" inputmode="numeric" data-tscore="${esc(r.teamId)}" data-g="${i}" value="${g == null ? '' : g}"></td>`).join('')}<td class="c-scratch"><span>${r.scratch}</span></td><td class="c-total strong"><span>${r.total}</span></td></tr>`).join('') || `<tr><td colspan="${n + 6}" class="empty">팀이 없습니다. 배정 탭에서 팀을 만드세요.</td></tr>`}
        </tbody></table></div><div class="mt">${saveBar()}</div></div>` + renderScoreImport(event);
    }
    html += `<p class="muted small mb">${s.status === 'final' ? '<span class="status-final">확정된 결과</span>': '실시간 집계'} · ${ev.name} ${n}게임 · 동점: 스크래치 → 하이 → 로우${pts ? ` · 상위 ${pts.length}팀 지역 포인트 (${pts.join('/')})` : ''}</p>`;
    html += `<div class="card"><h2>${ev.name} 순위 <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#team-table" data-name="${ev.name}">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="table-scroll"><table class="tbl" id="team-table"><thead><tr><th>순위</th><th class="left">지역</th><th class="left">팀 / 선수</th><th>테이블</th><th>핸디</th>${gameHeads(n)}<th>스크래치</th><th>총점</th><th>포인트</th></tr></thead><tbody>
      ${ranked.map(r => `<tr class="rank-${r.rank}"><td>${medal(r.rank)}</td><td class="left">${esc(r.regionName)}</td><td class="left"><b>${esc(r.name)}</b><br><small class="muted">${r.memberNames.map(esc).join(', ')}</small></td><td>${r.lane || '-'}</td><td>${r.handicap}</td>${gamesOf(r, n)}<td>${r.scratch}</td><td class="strong">${r.total}</td><td class="pts">${Ranking.pointsForRank(r.rank, pts) || ''}</td></tr>`).join('') || `<tr><td colspan="${n + 9}" class="empty">등록된 팀이 없습니다.</td></tr>`}
      </tbody></table></div></div>`;
    return html;
  }

  // ----- 점수표 붙여넣기 입력 -----
  const IMPORT_PROMPT = n => `이 볼링 점수표 사진에서 선수별 이름과 게임 점수를 뽑아줘. 설명이나 표 없이 한 줄에 한 명씩 "이름,1게임,2게임${n >= 3 ? ',3게임' : ''}" 형식의 CSV로만 출력해. 레인 번호가 보이면 맨 앞에 "레인," 을 붙여줘. 합계·핸디·순위는 넣지 마.`;

  function importCandidates(event, gid) {
    const d = state.data; const s = S();
    if (event === 'individual') {
      const scope = state.scoreImport && state.scoreImport.scope === 'all' ? d.players : d.players.filter(p => p.group === gid);
      return scope.map(p => ({ id: p.id, names: [p.name], lane: p.lane || null, label: `${p.name} (${regionName(p.regionId)}${p.group ? ' · ' + groupName(p.group) : ''}${p.lane ? ' · ' + p.lane + '-' + (p.pos || '?') : ''})` }));
    }
    const pr = Ranking.playerRows(d.players, d.regions, s);
    return Ranking.teamRows(d.teams, event, pr, d.regions, s).map(t => ({ id: t.teamId, names: [t.name].concat(t.memberNames), lane: t.lane || null, label: `${t.name} (${t.regionName}${t.lane ? ' · ' + t.lane + '번 테이블' : ''})` }));
  }

  function renderScoreImport(event, gid) {
    const s = S(); const n = s.games[event]; const imp = state.scoreImport && state.scoreImport.event === event ? state.scoreImport : null;
    let html = `<div class="card"><h2>점수표 붙여넣기로 일괄 입력</h2>
      <p class="muted small mb">볼링장 출력물을 찍어 클로드 앱 등에 올리고 아래 요청문으로 CSV를 받은 뒤 여기에 붙여넣으세요. 한 줄에 한 ${event === 'individual' ? '명' : '팀'}: <code>이름,1게임,2게임${n >= 3 ? ',3게임' : ''}</code> (레인 번호가 앞에 있어도 됩니다. 탭·공백·슬래시 구분도 인식)</p>
      <div class="row mb"><button class="btn btn-xs btn-outline" data-action="copy-prompt" data-n="${n}">AI 요청문 복사</button><label class="btn btn-xs btn-outline" style="cursor:pointer">CSV/텍스트 파일 <input type="file" accept=".csv,.txt,text/plain,text/csv" data-change="score-import-file" style="display:none"></label>
        ${event === 'individual' ? `<select data-change="score-import-scope" style="width:auto"><option value="group" ${imp && imp.scope === 'all' ? '' : 'selected'}>현재 조에서 찾기</option><option value="all" ${imp && imp.scope === 'all' ? 'selected' : ''}>전체 선수에서 찾기</option></select>` : ''}</div>
      <textarea id="score-import-text" class="score-import-text" placeholder="이진엽,189,174,180&#10;신희남,150,160,170">${esc(imp ? imp.text : '')}</textarea>
      <div class="row mt"><button class="btn btn-small btn-primary" data-action="score-import-preview" data-event="${event}">미리보기</button>${imp && imp.rows ? '<button class="btn btn-small btn-outline" data-action="score-import-clear">지우기</button>' : ''}</div>`;
    if (imp && imp.rows) {
      const cands = importCandidates(event, gid);
      const matched = imp.rows.filter(r => r.candidateId).length;
      html += `<h3>미리보기 <span class="muted small">${imp.rows.length}줄 · 매칭 ${matched}${imp.rows.length - matched ? ` · 미매칭 ${imp.rows.length - matched}` : ''}</span></h3>
        <div class="table-scroll"><table class="tbl"><thead><tr><th class="left">읽은 이름</th><th class="left">적용 대상</th>${gameHeads(n)}<th>상태</th></tr></thead><tbody>
        ${imp.rows.map((r, i) => `<tr class="${r.candidateId ? (r.confidence < 1 ? 'imp-fuzzy' : '') : 'imp-none'}"><td class="left"><b>${esc(r.name)}</b>${r.lane != null ? ` <small class="muted">${r.lane}레인</small>` : ''}</td>
          <td class="left"><select class="sm" data-imp-row="${i}"><option value="">(건너뜀)</option>${cands.map(c => `<option value="${esc(c.id)}" ${c.id === r.candidateId ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></td>
          ${Array.from({ length: n }, (_, g) => `<td><input type="number" class="sm" min="0" max="300" data-imp-g="${g}" data-imp-i="${i}" value="${r.games[g] == null ? '' : r.games[g]}"></td>`).join('')}
          <td>${r.candidateId ? (r.confidence < 1 ? '<span class="badge live">확인 필요</span>' : '<span class="badge final">일치</span>') : '<span class="badge">대상 없음</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted small mt">노란 줄은 이름이 정확히 일치하지 않아 가장 비슷한 대상을 고른 것입니다. 적용 대상을 확인하거나 바꾸세요. 비어 있는 게임 칸은 기존 값을 유지합니다.</p>
        <div class="row mt"><button class="btn btn-small btn-success" data-action="score-import-apply" data-event="${event}">${matched}${event === 'individual' ? '명' : '팀'} 점수 적용</button></div>`;
    }
    return html + '</div>';
  }

  function previewScoreImport(event, gid) {
    const s = S(); const n = s.games[event];
    const text = ($('.tab-content.active #score-import-text') || {}).value || '';
    const scope = state.scoreImport && state.scoreImport.scope || 'group';
    state.scoreImport = { event, text, scope, rows: null };
    const rows = ScoresImport.parse(text, n);
    if (!rows.length) { toast('읽을 수 있는 줄이 없습니다. "이름,점수,점수" 형식인지 확인하세요.', true); return render(); }
    state.scoreImport.rows = ScoresImport.match(rows, importCandidates(event, gid));
    render();
  }

  async function applyScoreImport(event) {
    const imp = state.scoreImport; if (!imp || !imp.rows) return;
    const s = S(); const n = s.games[event]; let count = 0;
    const used = new Set();
    imp.rows.forEach(r => {
      if (!r.candidateId || used.has(r.candidateId)) return;
      const target = event === 'individual' ? playerById(r.candidateId) : teamById(r.candidateId);
      if (!target) return;
      used.add(r.candidateId);
      target.games = target.games || []; while (target.games.length < n) target.games.push(null);
      for (let g = 0; g < n; g++) if (r.games[g] != null && r.games[g] !== '') target.games[g] = num(r.games[g]);
      markDirty(event === 'individual' ? 'player' : 'team', target.id); count++;
    });
    const ok = await run(() => flush());
    state.scoreImport = null;
    if (ok) toast(`${count}${event === 'individual' ? '명' : '팀'}의 점수를 적용하고 저장했습니다.`);
    render();
  }

  // ----- 지역 종합 -----
  function renderStandings() {
    const s = S(); const res = results(); const pr = Ranking.progress(state.data);
    const allDone = pr.individual.done === pr.individual.total && pr.scotch.done === pr.scotch.total && pr.baker.done === pr.baker.total;
    let html = '';
    if (isAdmin()) {
      html += `<div class="card"><h2>결과 관리</h2><p class="small mb">현재 ${statusBadge()} · 개인전 ${pr.individual.done}/${pr.individual.total} · 스카치 ${pr.scotch.done}/${pr.scotch.total} · 베이커 ${pr.baker.done}/${pr.baker.total}${allDone ? '' : ' · <span class="badge live">미입력 있음</span>'}</p>
        <div class="row">${s.status === 'final' ? '<button class="btn btn-small btn-outline" data-action="unfinalize">확정 해제</button>': `${s.status !== 'live' ? '<button class="btn btn-small btn-secondary" data-action="set-status" data-status="live">대회 시작 (진행중)</button>': ''}<button class="btn btn-small btn-success" data-action="finalize">최종 결과 확정</button>`}</div>
        <p class="muted small mt">확정하면 순위와 포인트가 스냅샷으로 저장되어 이후 입력이 바뀌어도 결과가 유지됩니다.</p></div>`;
    }
    html += `<p class="muted small mb">${s.status === 'final' ? '<span class="status-final">확정된 결과</span>': '실시간 집계'} · 배점: 개인전 남자 ${s.points.individualM.join('/')} · 여자 ${s.points.individualF.join('/')} · 3인조 ${s.points.reps.join('/')} · 스카치 ${s.points.scotch.join('/')} · 베이커 ${s.points.baker.join('/')}</p>`;
    html += `<div class="card"><h2>지역 종합 순위 <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#stand-table" data-name="지역종합">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      ${podium(res.standings.slice(0, 3), r => r.regionName, r => r.total + '점')}
      <div class="table-scroll"><table class="tbl" id="stand-table"><thead><tr><th>순위</th><th class="left">지역</th><th>개인 남</th><th>개인 여</th><th>대표</th><th>스카치</th><th>베이커</th>${s.countTeam5 ? '<th>5인조</th>': ''}<th>합계</th></tr></thead><tbody>
      ${res.standings.map(r => `<tr class="rank-${r.rank}" data-action="toggle-region" data-id="${esc(r.regionId)}" style="cursor:pointer"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.regionName)}</b> ${state.openRegion === r.regionId ? '▾' : '▸'}</td><td>${r.male}</td><td>${r.female}</td><td>${r.reps}</td><td>${r.scotch}</td><td>${r.baker}</td><td class="pts">${r.total}</td></tr>${state.openRegion === r.regionId ? `<tr><td colspan="8" class="left detail-list">${r.details.length ? r.details.map(x => `${esc(x.event)} ${x.rank}위 ${esc(x.who)} → <b>${x.pts}</b>점`).join('<br>') : '획득 포인트 없음'}</td></tr>` : ''}`).join('') || '<tr><td colspan="9" class="empty">지역이 없습니다.</td></tr>'}
      </tbody></table></div><p class="muted small mt">지역을 누르면 포인트 상세가 표시됩니다.</p></div>`;
    html += `<div class="card"><h2>3인조 (지역 대표 개인전 합계) <span class="muted small">지역당 ${s.repCount}명</span></h2><div class="table-scroll"><table class="tbl"><thead><tr><th>순위</th><th class="left">지역</th><th class="left">대표 선수 (점수)</th><th>합계</th><th>포인트</th></tr></thead><tbody>
      ${res.reps.map(r => `<tr class="rank-${r.rank}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.regionName)}</b>${r.short ? ' <span class="badge live">대표 부족</span>': ''}${r.over ? ' <span class="badge live">대표 초과</span>': ''}</td><td class="left small">${r.reps.map(x => esc(x.name) + '(' + x.score + ')').join(', ') || '-'}</td><td class="strong">${r.score}</td><td class="pts">${Ranking.pointsForRank(r.rank, s.points.reps) || ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    return html;
  }

  // ----- 설정 -----
  function renderSettings() {
    const s = S();
    const sel = (name, cur, opts) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<div class="card"><h2>대회 정보</h2><form data-form="save-info">
      <div class="form-row"><div class="form-group" style="flex:2"><label>대회명</label><input type="text" name="name" value="${esc(s.name)}"></div><div class="form-group"><label>주최 지역</label><select name="hostRegionId">${regionOptions(s.hostRegionId, '선택')}</select></div></div>
      <div class="form-row"><div class="form-group"><label>1일차</label><input type="date" name="d1" value="${esc(s.dates[0] || '')}"></div><div class="form-group"><label>2일차</label><input type="date" name="d2" value="${esc(s.dates[1] || '')}"></div><div class="form-group" style="flex:2"><label>장소</label><input type="text" name="venue" value="${esc(s.venue || '')}"></div></div>
      <div class="form-row"><div class="form-group"><label>레인 수 (테이블 = 레인 ÷ 2)</label><input type="number" name="lanes" value="${s.lanes || 20}"></div><div class="form-group"><label>시작 테이블</label><input type="number" name="tableFrom" value="${s.tableFrom || 1}"></div><div class="form-group"><label>테이블당 인원(개인전)</label><input type="number" name="perTable" value="${s.perTable || 4}"></div></div>
      <div class="form-group"><label>개인전 조 편성 · 핸디 보너스는 아침 일찍 시작하는 조 등 해당 조에만 게임당 점수로 입력 (예: 10)</label>
        <div class="table-scroll"><table class="tbl" id="groups-table"><thead><tr><th>조 이름</th><th>일차</th><th>시작 시간</th><th>핸디 보너스</th><th>선수</th></tr></thead><tbody>
        ${s.groups.concat([{ id: '', name: '', day: '', time: '', bonus: 0 }]).map((g, i) => `<tr><td><input type="hidden" name="g_id" value="${esc(g.id)}"><input type="text" name="g_name" value="${esc(g.name)}" placeholder="${g.id ? '' : '새 조 (비우면 추가 안함)'}" style="width:110px"></td><td><input type="number" name="g_day" value="${esc(g.day || '')}" style="width:60px"></td><td><input type="text" name="g_time" value="${esc(g.time || '')}" placeholder="10:00" style="width:80px"></td><td><input type="number" name="g_bonus" value="${esc(g.bonus || 0)}" style="width:70px"></td><td>${g.id ? state.data.players.filter(p => p.group === g.id).length + '명' : ''}</td></tr>`).join('')}
        </tbody></table></div><p class="muted small">조 이름을 비우면 그 조는 삭제되고 소속 선수는 미편성이 됩니다.</p></div>
      <div class="form-group"><label>일정 안내 (홈 화면 표시)</label><textarea name="schedule">${esc(s.schedule || '')}</textarea></div>
      <div class="form-group"><label>경기 규정 안내 (홈 화면 표시)</label><textarea name="rulesNote" style="min-height:150px">${esc(s.rulesNote || '')}</textarea></div>
      <button class="btn btn-small btn-primary" type="submit">저장</button></form></div>
    <div class="card"><h2>경기 규정</h2><form data-form="save-rules">
      <p class="muted small mb">핸디는 선수별·팀별로 관리자가 직접 입력합니다 (선수 탭 / 배정 탭). 조별 보너스는 위 대회 정보의 조 설정에서 지정합니다.</p>
      <h3>개인전</h3><div class="form-row"><div class="form-group"><label>게임 수</label><input type="number" name="gInd" value="${s.games.individual}"></div><div class="form-group"><label>순위 기준</label>${sel('basis', s.basis, [['total', '핸디 포함 총점'], ['scratch', '스크래치']])}</div><div class="form-group"><label>지역 대표 인원</label><input type="number" name="repCount" value="${s.repCount}"></div></div>
      <h3>팀 종목</h3><div class="form-row"><div class="form-group"><label>스카치 게임</label><input type="number" name="gScotch" value="${s.games.scotch}"></div><div class="form-group"><label>베이커 게임</label><input type="number" name="gBaker" value="${s.games.baker}"></div></div>
      <h3>지역 포인트 배점 (1위부터, 쉼표 구분)</h3>
      <div class="form-row"><div class="form-group"><label>개인전 남자</label><input type="text" name="pIndM" value="${esc(s.points.individualM.join(', '))}"></div><div class="form-group"><label>개인전 여자</label><input type="text" name="pIndF" value="${esc(s.points.individualF.join(', '))}"></div><div class="form-group"><label>3인조 (지역 대표 합계)</label><input type="text" name="pReps" value="${esc(s.points.reps.join(', '))}"></div></div>
      <div class="form-row"><div class="form-group"><label>스카치 상위 팀</label><input type="text" name="pScotch" value="${esc(s.points.scotch.join(', '))}"></div><div class="form-group"><label>베이커 상위 팀</label><input type="text" name="pBaker" value="${esc(s.points.baker.join(', '))}"></div></div>
      <button class="btn btn-small btn-primary" type="submit">저장</button></form></div>
    <div class="card"><h2>관리자 PIN 변경</h2><form data-form="save-admin-pin"><div class="form-row"><div class="form-group"><input type="password" name="adminPin" inputmode="numeric" maxlength="6" placeholder="새 PIN (숫자 4~6자리)" required></div><div class="form-group" style="flex:0"><button class="btn btn-small btn-primary" type="submit">변경</button></div></div></form></div>
    <div class="card"><h2>서버 연결</h2><p class="muted small mb">현재: <b>${Store.mode() === 'remote' ? '서버 모드 (Google Sheets)' : '로컬 데모 모드 (이 브라우저에만 저장)'}</b>. Apps Script 웹앱 URL을 넣으면 모든 기기가 같은 데이터를 봅니다. 설치 방법은 gas/Code.gs 주석 참고.</p>
      <form data-form="set-api"><div class="form-group"><input type="url" name="url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(Store.getApiUrl())}"></div><div class="row"><button class="btn btn-small btn-primary" type="submit">연결 (다시 로그인)</button>${Store.mode() === 'remote' ? '<button class="btn btn-small btn-outline" type="button" data-action="test-api">연결 테스트</button>': ''}</div></form></div>
    <div class="card"><h2>백업 / 복원</h2><div class="row"><button class="btn btn-small btn-outline" data-action="export-json">JSON 내보내기</button><label class="btn btn-small btn-outline" style="cursor:pointer">JSON 가져오기 <input type="file" accept=".json,application/json" data-change="import-json" style="display:none"></label></div>
      ${Store.mode() === 'local' ? `<h3 class="mt">로컬 데모 데이터</h3><div class="row"><button class="btn btn-small btn-outline" data-action="reset-demo">데모 데이터로 초기화</button><button class="btn btn-small btn-danger" data-action="reset-empty">모든 데이터 삭제 (빈 상태)</button></div>` : ''}</div>`;
  }

  // ===== 저장 (자동 저장 큐) =====
  /** 입력 변경 표시 — 자동 저장하지 않고 '저장' 버튼을 눌러야 저장된다 */
  function markDirty(kind, id) {
    (kind === 'player' ? state.dirtyPlayers : state.dirtyTeams).set(id, true);
    updateSaveUI();
  }
  function updateSaveUI() {
    const n = dirtyCount();
    $$('.save-state').forEach(st => { st.textContent = n ? `저장 안 됨 · ${n}건` : '저장됨'; st.className = 'save-state ' + (n ? 'dirty' : 'saved'); });
    $$('[data-action="save-dirty"]').forEach(b => { b.disabled = !n; b.textContent = n ? `저장 (${n}건)` : '저장'; });
  }
  const saveBar = () => `<div class="row" style="justify-content:flex-end;gap:10px"><span class="save-state ${dirtyCount() ? 'dirty' : 'saved'}">${dirtyCount() ? `저장 안 됨 · ${dirtyCount()}건` : '저장됨'}</span><button class="btn btn-small btn-primary" data-action="save-dirty" ${dirtyCount() ? '' : 'disabled'}>${dirtyCount() ? `저장 (${dirtyCount()}건)` : '저장'}</button></div>`;
  async function flush() {
    const pids = [...state.dirtyPlayers.keys()], tids = [...state.dirtyTeams.keys()];
    if (!pids.length && !tids.length) return true;
    try {
      if (pids.length) { const list = pids.map(playerById).filter(Boolean); if (list.length) state.data.players = await Store.savePlayers(list); }
      if (tids.length) { const list = tids.map(teamById).filter(Boolean); if (list.length) state.data.teams = await Store.saveTeams(list); }
      state.dirtyPlayers.clear(); state.dirtyTeams.clear();
      updateSaveUI();
      return true;
    } catch (e) {
      toast('저장 실패: ' + e.message, true);
      if (!Store.isAdmin()) { applyRole(); render(); }
      return false;
    }
  }
  /** 화면 이동 전 확인: 저장 / 취소(이동 안 함) */
  async function guardDirty() {
    if (!dirtyCount()) return true;
    if (confirm(`저장하지 않은 입력이 ${dirtyCount()}건 있습니다. 저장할까요?\n(취소를 누르면 현재 화면에 머뭅니다)`)) { const ok = await flush(); if (ok) toast('저장되었습니다.'); return ok; }
    return false;
  }
  function updateRow(kind, id) {
    const s = S(); let row;
    if (kind === 'player') row = Ranking.playerRows([playerById(id)], state.data.regions, s)[0];
    else { const pr = Ranking.playerRows(state.data.players, state.data.regions, s); const t = teamById(id); row = Ranking.teamRows([t], t.event, pr, state.data.regions, s)[0]; }
    const tr = $(`tr[data-row="${CSS.escape(id)}"]`); if (!tr || !row) return;
    const sc = tr.querySelector('.c-scratch span') || tr.querySelector('.c-scratch'); const tt = tr.querySelector('.c-total span') || tr.querySelector('.c-total');
    sc.textContent = row.scratch; tt.textContent = row.total;
  }

  // ===== 이벤트 =====
  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || e.target.closest('input,select,textarea,a,label')) return;
    const a = el.dataset.action, id = el.dataset.id; const d = state.data; const s = S();
    switch (a) {
      case 'tab': if (!(await guardDirty())) return; state.tab = el.dataset.tab; render(); return window.scrollTo(0, 0);
      case 'save-dirty': { const n = dirtyCount(); if (!n) return; const ok = await run(() => flush()); if (ok) toast(`${n}건 저장되었습니다.`); return render(); }
      case 'open-admin': return openAdminModal();
      case 'toggle-rules': state.rulesOpen = !state.rulesOpen; return render();
      case 'back-admin': state.previewPublic = false; state.tab = 'home'; applyRole(); return render();
      case 'go-score': state.tab = 'individual'; state.indSub = 'score'; render(); return window.scrollTo(0, 0);
      case 'pick-player': { const p = playerById(id); if (p) { state.searchId = p.id; state.q = p.name; } return render(); }
      case 'pub-assign-sub': state.pubAssignSub = el.dataset.sub; return render();
      case 'pick-assign': { const p = playerById(id); if (p) { state.pubAssignId = p.id; state.pubAssignQ = p.name; } return render(); }
      case 'rank-tab': state.rankTab = el.dataset.tab2; return render();
      case 'rank-gender': state.rankGender = el.dataset.g; return render();
      case 'assign-sub': if (!(await guardDirty())) return; state.assignSub = el.dataset.sub; return render();
      case 'ind-sub': if (!(await guardDirty())) return; state.indSub = el.dataset.sub; return render();
      case 'team-sub': if (!(await guardDirty())) return; state.teamSub[state.tab] = el.dataset.sub; return render();
      case 'toggle-region': state.openRegion = state.openRegion === id ? '' : id; return render();
      case 'csv': return tableCsv(el.dataset.sel, el.dataset.name);
      case 'print': return window.print();
      case 'signup-register': { const msg = await run(() => registerSignup(num(el.dataset.i))); if (msg) toast(msg); return render(); }
      case 'signup-register-all': { const msgs = []; await run(async () => { for (let i = 0; i < state.uploads.length; i++) { const m = await registerSignup(i); if (m) msgs.push(m); } }); toast(msgs.length + '개 클럽 등록 완료'); return render(); }
      case 'signup-clear': state.uploads = []; return render();
      case 'copy-prompt': { const t = IMPORT_PROMPT(num(el.dataset.n)); try { await navigator.clipboard.writeText(t); toast('요청문을 복사했습니다. AI 앱에 사진과 함께 붙여넣으세요.'); } catch (e) { prompt('아래 요청문을 복사하세요.', t); } return; }
      case 'score-import-preview': return previewScoreImport(el.dataset.event, state.scoreGroup || S().groups[0].id);
      case 'score-import-apply': return applyScoreImport(el.dataset.event);
      case 'score-import-clear': state.scoreImport = null; return render();
      case 'edit-region': state.editRegion = { ...regionById(id) }; return render();
      case 'cancel-region': state.editRegion = null; return render();
      case 'del-region': if (!confirm(`"${regionName(id)}" 지역을 삭제할까요?`)) return; await run(async () => { d.regions = await Store.deleteRegion(id); }, '삭제되었습니다.'); return render();
      case 'edit-player': state.editPlayer = { ...playerById(id) }; render(); return window.scrollTo(0, 0);
      case 'cancel-player': state.editPlayer = null; return render();
      case 'del-player': { const p = playerById(id); if (!confirm(`"${p.name}" 선수를 삭제할까요? 소속 팀에서도 제외됩니다.`)) return; await run(async () => { const r = await Store.deletePlayer(id); d.players = r.players; d.teams = r.teams; }, '삭제되었습니다.'); return render(); }
      case 'auto-groups': {
        if (d.players.some(p => p.group) && !confirm('기존 조 편성을 모두 새로 배정합니다. 레인 배정도 초기화됩니다. 계속할까요?')) return;
        const g = Lanes.assignGroups(d.players.filter(p => !p.events || p.events.individual !== false), s.groups);
        const list = d.players.map(p => ({ ...p, group: g[p.id] || '', lane: '', pos: '' }));
        await run(async () => { d.players = await Store.savePlayers(list); }, '조 편성이 완료되었습니다.'); return render();
      }
      case 'auto-lanes': {
        const gid = el.dataset.group; const from = num($('#lane-from').value, 1), per = num($('#per-lane').value, 4);
        const list = d.players.filter(p => p.group === gid);
        if (!list.length) return toast('이 조에 선수가 없습니다.', true);
        const tables = Lanes.laneRange(from, Lanes.lanesNeeded(list.length, per));
        const a2 = Lanes.assignLanes(list, tables, per);
        const upd = list.map(p => ({ ...p, lane: a2[p.id].lane, pos: a2[p.id].pos }));
        await run(async () => { d.players = await Store.savePlayers(upd); await Store.saveSettings({ tableFrom: from, perTable: per }); d.settings.tableFrom = from; d.settings.perTable = per; }, `${tables[0]}~${tables[tables.length - 1]}번 테이블(${tableLanes(tables[0]).split('·')[0]}~${2 * tables[tables.length - 1]}레인)에 배정했습니다.`); return render();
      }
      case 'add-team': {
        const ev = el.dataset.event; const ids = $$('.team-cb:checked').map(c => c.value);
        const size = EV[ev].size;
        if (ids.length !== size) return toast(`${EV[ev].name}은(는) ${size}명을 선택해야 합니다.`, true);
        if (ev === 'scotch') { const gs = $$('.team-cb:checked').map(c => c.dataset.gender).sort().join(''); if (gs !== 'FM') return toast('스카치는 남 1명 + 여 1명으로 구성합니다.', true); }
        const reg = $('[data-change="team-region"]').value;
        const autoName = `${regionName(reg)}${d.teams.filter(x => x.event === ev && x.regionId === reg).length + 1}`;
        const t = { event: ev, regionId: reg, name: $('#team-name').value.trim() || autoName, members: ids, lane: '', handicap: num($('#team-handicap').value), adjust: num($('#team-adjust').value), games: Array(s.games[ev]).fill(null) };
        await run(async () => { d.teams = await Store.saveTeams([t]); }, '팀이 등록되었습니다.'); return render();
      }
      case 'del-team': { const t = teamById(id); if ((t.games || []).some(g => g != null) && !confirm('점수가 입력된 팀입니다. 삭제할까요?')) return; await run(async () => { d.teams = await Store.deleteTeam(id); }, '삭제되었습니다.'); return render(); }
      case 'auto-team-lanes': {
        const ev = el.dataset.event; const from = num($('#team-lane-from').value, 1), per = num($('#team-per-lane').value, 1);
        const ts = d.teams.filter(t => t.event === ev); if (!ts.length) return toast('팀이 없습니다.', true);
        const lanes = Lanes.laneRange(from, Math.ceil(ts.length / per));
        const a2 = Lanes.assignTeamLanes(ts, lanes, per);
        await run(async () => { d.teams = await Store.saveTeams(ts.map(t => ({ ...t, lane: a2[t.id] }))); }, '테이블을 배정했습니다.'); return render();
      }
      case 'set-status': await run(async () => { d.settings = { ...d.settings, ...(await Store.saveSettings({ status: el.dataset.status })) }; applyRole(); }, '상태가 변경되었습니다.'); return render();
      case 'finalize': {
        const pr = Ranking.progress(d);
        const miss = ['individual', 'scotch', 'baker'].filter(k => pr[k].done < pr[k].total).map(k => `${EV[k].name} ${pr[k].total - pr[k].done}`);
        if (miss.length && !confirm(`아직 미입력이 있습니다: ${miss.join(', ')}\n그래도 확정할까요?`)) return;
        if (!confirm('최종 결과를 확정할까요?')) return;
        const snap = Ranking.regionStandings(d);
        await run(async () => { await Store.finalize(snap); d.results = snap; d.settings.status = 'final'; applyRole(); }, '최종 결과가 확정되었습니다.'); return render();
      }
      case 'unfinalize': if (!confirm('확정을 해제하면 실시간 집계로 돌아갑니다. 계속할까요?')) return; await run(async () => { await Store.unfinalize(); d.results = null; d.settings.status = 'live'; applyRole(); }, '확정이 해제되었습니다.'); return render();
      case 'export-json': { const json = await run(() => Store.exportAll()); if (json) download(`bowlfesta-backup-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json'); return; }
      case 'reset-demo': if (confirm('현재 로컬 데이터를 지우고 데모 데이터로 초기화할까요?')) { Store.resetLocal(false); location.reload(); } return;
      case 'reset-empty': if (confirm('모든 지역/선수/팀 데이터를 삭제할까요? (관리자 PIN은 0000으로 초기화)')) { Store.resetLocal(true); location.reload(); } return;
      case 'test-api': await run(async () => { const r = await fetch(Store.getApiUrl() + '?action=ping'); const j = await r.json(); if (!j.ok) throw new Error(j.error || '응답 오류'); }, '서버 연결 정상'); return;
    }
  }

  async function onSubmit(e) {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const fd = new FormData(f); const v = k => (fd.get(k) == null ? '' : String(fd.get(k)).trim()); const chk = k => fd.get(k) != null;
    const d = state.data; const s = S();
    const nums = k => v(k).split(',').map(x => num(x.trim())).filter(x => x > 0);
    switch (f.dataset.form) {
      case 'save-region': { const r = await run(async () => { d.regions = await Store.saveRegion({ id: f.dataset.id || '', name: v('name'), leader: v('leader'), note: v('note') }); return true; }, '저장되었습니다.'); if (r) { state.editRegion = null; render(); } return; }
      case 'save-player': {
        if (!v('regionId')) return toast('지역을 선택하세요.', true);
        const ex = f.dataset.id ? playerById(f.dataset.id) : null;
        const p = { ...(ex || { games: Array(s.games.individual).fill(null), lane: '', pos: '' }), id: f.dataset.id || '', name: v('name'), regionId: v('regionId'), gender: v('gender'), birthYear: v('birthYear') ? num(v('birthYear')) : '', handicap: num(v('handicap')), adjust: num(v('adjust')), group: v('group'), isRep: chk('isRep'), note: v('note'), events: { individual: chk('ev_individual'), scotch: chk('ev_scotch'), baker: chk('ev_baker'), side: chk('ev_side') } };
        if (d.players.some(x => x.id !== p.id && x.regionId === p.regionId && x.name === p.name)) return toast('같은 지역에 동명 선수가 있습니다.', true);
        const r = await run(async () => { d.players = await Store.savePlayers([p]); return true; }, '저장되었습니다.'); if (r) { state.editPlayer = null; render(); } return;
      }
      case 'import-players': {
        const lines = v('csv').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const errors = [], list = [], newRegions = []; const hcGiven = p => p._hcGiven;
        const regionByName = name => d.regions.find(r => r.name === name) || newRegions.find(r => r.name === name);
        lines.forEach((l, i) => {
          const [name, rname, g, by, hc, evs, rep] = l.split(',').map(x => (x || '').trim());
          if (!name || !rname) { errors.push(`${i + 1}행: 이름/지역 없음`); return; }
          let region = regionByName(rname);
          if (!region) { region = { id: Store.uid('r'), name: rname, leader: '', note: '' }; newRegions.push(region); }
          const evText = evs || '개인';
          list.push({ name, regionId: region.id, gender: /^(F|여|여자)$/i.test(g) ? 'F' : 'M', birthYear: by ? num(by) : '', handicap: num(hc), _hcGiven: hc !== '' && hc != null, adjust: 0, isRep: /대표|O|o|Y|1/.test(rep || ''), group: '', lane: '', pos: '', games: Array(s.games.individual).fill(null), note: '',
            events: { individual: /개인/.test(evText) || !/스카치|베이커/.test(evText), scotch: /스카치/.test(evText), baker: /베이커/.test(evText) } });
        });
        if (errors.length && !confirm(`오류 ${errors.length}건은 건너뜁니다:\n${errors.slice(0, 5).join('\n')}\n\n${list.length}명을 가져올까요?`)) return;
        if (!list.length) return toast('가져올 선수가 없습니다.', true);
        const replace = chk('replace');
        if (replace && !confirm('기존 선수와 팀을 모두 삭제하고 새로 등록합니다. 계속할까요?')) return;
        const r = await run(async () => {
          for (const nr of newRegions) d.regions = await Store.saveRegion(nr);
          if (replace) { const res = await Store.replacePlayers(list); d.players = res.players; d.teams = res.teams; }
          else {
            const merged = list.map(p => { const ex = d.players.find(x => x.regionId === p.regionId && x.name === p.name); return ex ? { ...ex, gender: p.gender, birthYear: p.birthYear || ex.birthYear, handicap: hcGiven(p) ? p.handicap : ex.handicap, isRep: p.isRep, events: p.events } : p; });
            d.players = await Store.savePlayers(merged);
          }
          return true;
        }, `${list.length}명 처리되었습니다.` + (newRegions.length ? ` (지역 ${newRegions.length}개 추가)` : ''));
        if (r) render(); return;
      }
      case 'save-info': {
        const gIds = fd.getAll('g_id'), gNames = fd.getAll('g_name'), gDays = fd.getAll('g_day'), gTimes = fd.getAll('g_time'), gBonus = fd.getAll('g_bonus');
        const groups = gNames.map((name, i) => ({ id: String(gIds[i] || '').trim() || Store.uid('g'), name: String(name).trim(), day: num(gDays[i]) || '', time: String(gTimes[i] || '').trim(), bonus: num(gBonus[i]) })).filter(g => g.name);
        if (!groups.length) return toast('조를 1개 이상 입력하세요.', true);
        const patch = { name: v('name'), hostRegionId: v('hostRegionId'), dates: [v('d1'), v('d2')], venue: v('venue'), tableFrom: num(v('tableFrom'), 1), lanes: num(v('lanes'), 20), perTable: num(v('perTable'), 4), groups, schedule: v('schedule'), rulesNote: v('rulesNote') };
        const r = await run(async () => { d.settings = { ...d.settings, ...(await Store.saveSettings(patch)) }; applyRole(); return true; }, '저장되었습니다.'); if (r) render(); return;
      }
      case 'save-rules': {
        const patch = {
          games: { individual: Math.max(1, num(v('gInd'), 3)), scotch: Math.max(1, num(v('gScotch'), 2)), baker: Math.max(1, num(v('gBaker'), 2)) },
          basis: v('basis'), repCount: Math.max(1, num(v('repCount'), 3)),
          points: { individualM: nums('pIndM'), individualF: nums('pIndF'), reps: nums('pReps'), scotch: nums('pScotch'), baker: nums('pBaker') }
        };
        const r = await run(async () => { d.settings = { ...d.settings, ...(await Store.saveSettings(patch)) }; return true; }, '저장되었습니다.'); if (r) render(); return;
      }
      case 'save-admin-pin': { if (!/^\d{4,6}$/.test(v('adminPin'))) return toast('PIN은 숫자 4~6자리여야 합니다.', true); const r = await run(() => Store.saveSettings({ adminPin: v('adminPin') }), '관리자 PIN이 변경되었습니다.'); if (r) f.reset(); return; }
      case 'set-api': Store.setApiUrl(v('url')); location.reload(); return;
    }
  }

  function onChange(e) {
    const el = e.target; const k = el.dataset.change; const d = state.data; const s = S();
    if (k === 'rank-group') { state.rankGroup = el.value; return render(); }
    if (k === 'players-region') { state.playersRegion = el.value; return render(); }
    if (k === 'players-gender') { state.playersGender = el.value; return render(); }
    if (k === 'team-region') { state.teamRegion = el.value; return render(); }
    if (k === 'score-group') { guardDirty().then(ok => { if (!ok) { el.value = state.scoreGroup || S().groups[0].id; return; } state.scoreGroup = el.value; if (state.scoreImport) state.scoreImport.rows = null; render(); }); return; }
    if (k === 'score-import-file') { const file = el.files[0]; el.value = ''; if (!file) return; const rd = new FileReader(); rd.onload = () => { const ta = $('.tab-content.active #score-import-text'); if (ta) ta.value = String(rd.result); }; rd.readAsText(file); return; }
    if (k === 'score-import-scope') { if (!state.scoreImport) state.scoreImport = { event: state.tab === 'individual' ? 'individual' : state.tab, text: ($('.tab-content.active #score-import-text') || {}).value || '', rows: null }; state.scoreImport.scope = el.value; if (state.scoreImport.rows) return previewScoreImport(state.scoreImport.event, state.scoreGroup || S().groups[0].id); return; }
    if (el.dataset.impRow != null) { const r = state.scoreImport && state.scoreImport.rows[num(el.dataset.impRow)]; if (r) { r.candidateId = el.value || null; r.confidence = 1; } return render(); }
    if (el.dataset.impI != null) { const r = state.scoreImport && state.scoreImport.rows[num(el.dataset.impI)]; if (r) r.games[num(el.dataset.impG)] = el.value === '' ? null : Math.max(0, Math.min(300, num(el.value))); return; }
    if (k === 'signup-files') { const files = [...el.files]; el.value = ''; return readSignupFiles(files); }
    if (el.dataset.uploadRegion != null) { const u = state.uploads[num(el.dataset.uploadRegion)]; if (u) u.regionName = el.value.trim(); return render(); }
    if (el.dataset.uploadReplace != null) { const u = state.uploads[num(el.dataset.uploadReplace)]; if (u) u.replace = el.checked; return; }
    if (k === 'import-json') {
      const file = el.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => { if (!confirm('현재 데이터를 백업 파일 내용으로 덮어씁니다. 계속할까요?')) return; const r = await run(() => Store.importAll(String(reader.result)), '복원되었습니다.'); if (r) { await reload(true); applyRole(); render(); } };
      reader.readAsText(file); return;
    }
    if (el.dataset.pfield) {
      const p = playerById(el.dataset.id); if (!p) return;
      const f = el.dataset.pfield;
      p[f] = el.value === '' ? '' : (f === 'group' ? el.value : num(el.value));
      if (f === 'group') { p.lane = ''; p.pos = ''; }
      return markDirty('player', p.id);
    }
    if (el.dataset.tfield) { const t = teamById(el.dataset.id); if (!t) return; t[el.dataset.tfield] = el.value === '' ? '' : num(el.value); return markDirty('team', t.id); }
    if (el.dataset.pscore != null) {
      const p = playerById(el.dataset.pscore); if (!p) return;
      const g = num(el.dataset.g); let val = el.value === '' ? null : Math.max(0, Math.min(300, num(el.value))); if (val != null) el.value = val;
      p.games = p.games || []; while (p.games.length < s.games.individual) p.games.push(null); p.games[g] = val;
      updateRow('player', p.id); return markDirty('player', p.id);
    }
    if (el.dataset.tscore != null) {
      const t = teamById(el.dataset.tscore); if (!t) return;
      const g = num(el.dataset.g); let val = el.value === '' ? null : Math.max(0, Math.min(300, num(el.value))); if (val != null) el.value = val;
      t.games = t.games || []; while (t.games.length < s.games[t.event]) t.games.push(null); t.games[g] = val;
      updateRow('team', t.id); return markDirty('team', t.id);
    }
  }
  function debouncedRender(attr) {
    clearTimeout(state.qTimer);
    state.qTimer = setTimeout(() => { if (state.composing) { state.pendingRender = attr; return; } renderKeepingInput(attr); }, 200);
  }
  function onInput(e) {
    const el = e.target;
    if (el.dataset.input === 'pub-q') { state.q = el.value; state.searchId = ''; return debouncedRender('pub-q'); }
    if (el.dataset.input === 'pub-assign-q') { state.pubAssignQ = el.value; state.pubAssignId = ''; return debouncedRender('pub-assign-q'); }
    if (el.dataset.input === 'rank-q') { state.rankQ = el.value; return debouncedRender('rank-q'); }
    if (el.dataset.input === 'players-q') { state.playersQ = el.value; return debouncedRender('players-q'); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
