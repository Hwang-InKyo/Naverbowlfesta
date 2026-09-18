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
    assignSub: 'A', indSub: 'M', teamSub: { scotch: 'rank', baker: 'rank', team5: 'rank' }, scoreGroup: '',
    dirtyPlayers: new Map(), dirtyTeams: new Map(), dirtyTimer: null, openRegion: ''
  };

  // ===== 유틸 =====
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r;
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
  const stat = (v, l) => `<div class="stat"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;
  const evChips = ev => ['individual', 'scotch', 'baker', 'team5'].filter(k => ev && ev[k]).map(k => `<span class="ev ${k}">${{ individual: '개인', scotch: '스카치', baker: '베이커', team5: '5인조' }[k]}</span>`).join('');
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
    const s = S();
    $('#header-title').textContent = '🎳 ' + (s.name || '전국대회');
    $('#header-sub').textContent = [s.dates && s.dates[0], s.venue].filter(Boolean).join(' · ');
    const badge = $('#mode-badge');
    if (isAdmin()) { badge.textContent = '관리자'; badge.className = 'mode-badge admin'; }
    else { badge.textContent = Store.mode() === 'remote' ? '서버' : '데모'; badge.className = 'mode-badge ' + Store.mode(); }
    $('#btn-admin').style.display = isAdmin() ? 'none' : '';
    $('#btn-logout').style.display = isAdmin() ? '' : 'none';
    $$('.tab-btn[data-role="admin"]').forEach(b => b.style.display = isAdmin() ? '' : 'none');
    if (state.tab === 'settings' && !isAdmin()) state.tab = 'home';
    if (!isAdmin()) { state.indSub = state.indSub === 'score' ? 'M' : state.indSub; Object.keys(state.teamSub).forEach(k => { if (state.teamSub[k] === 'score') state.teamSub[k] = 'rank'; }); }
  }
  function bindAdmin() {
    $('#btn-admin').addEventListener('click', () => { $('#admin-error').textContent = ''; $('#admin-pin').value = ''; $('#admin-hint').textContent = Store.mode() === 'local' ? '데모 관리자 PIN: 0000' : ''; $('#admin-modal').style.display = 'flex'; $('#admin-pin').focus(); });
    $('#admin-cancel').addEventListener('click', () => $('#admin-modal').style.display = 'none');
    $('#admin-modal').addEventListener('click', e => { if (e.target.id === 'admin-modal') $('#admin-modal').style.display = 'none'; });
    $('#admin-form').addEventListener('submit', async e => {
      e.preventDefault(); $('#admin-error').textContent = ''; loading(true);
      try { await Store.login($('#admin-pin').value); $('#admin-modal').style.display = 'none'; await reload(true); applyRole(); render(); toast('관리자로 로그인했습니다.'); }
      catch (err) { $('#admin-error').textContent = err.message; }
      finally { loading(false); }
    });
    $('#btn-logout').addEventListener('click', async () => { await flush(); Store.logout(); state.editPlayer = null; state.editRegion = null; await reload(true); applyRole(); render(); toast('로그아웃했습니다.'); });
    $('#btn-server').addEventListener('click', () => { const url = prompt('Apps Script 웹앱 URL을 입력하세요.\n비워두면 로컬 데모 모드로 동작합니다.', Store.getApiUrl()); if (url === null) return; Store.setApiUrl(url); location.reload(); });
  }
  function bindGlobal() {
    $('#main-tabs').addEventListener('click', async e => { const b = e.target.closest('.tab-btn'); if (b) { await flush(); state.tab = b.dataset.tab; render(); } });
    window.addEventListener('beforeunload', () => { if (state.dirtyPlayers.size || state.dirtyTeams.size) flush(); });
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
  }

  // ===== 렌더 =====
  function render() {
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    $$('.tab-content').forEach(s => s.classList.toggle('active', s.id === 'tab-' + state.tab));
    const el = $('#tab-' + state.tab);
    switch (state.tab) {
      case 'home': el.innerHTML = renderHome(); break;
      case 'players': el.innerHTML = renderPlayers(); break;
      case 'assign': el.innerHTML = renderAssign(); break;
      case 'individual': el.innerHTML = renderIndividual(); break;
      case 'scotch': case 'baker': case 'team5': el.innerHTML = renderTeamEvent(state.tab); break;
      case 'standings': el.innerHTML = renderStandings(); break;
      case 'settings': el.innerHTML = renderSettings(); break;
    }
  }
  const subtabs = (items, cur, action, attr) => `<div class="subtabs">${items.map(([k, l]) => `<button class="subtab ${cur === k ? 'active' : ''}" data-action="${action}" data-${attr}="${esc(k)}">${l}</button>`).join('')}</div>`;
  const statusBadge = () => { const st = S().status; return `<span class="badge ${st === 'final' ? 'final' : st === 'live' ? 'live' : 'upcoming'}">${{ ready: '준비중', live: '진행중', final: '확정' }[st] || st}</span>`; };

  // ----- 홈 -----
  function renderHome() {
    const s = S(); const d = state.data; const res = results(); const pr = Ranking.progress(d);
    const bar = (l, p) => `<div class="progress-row"><span>${l}</span><div class="progress"><span style="width:${p.total ? Math.round(p.done / p.total * 100) : 0}%"></span></div><span class="right small">${p.done}/${p.total}</span></div>`;
    const byRegion = d.regions.map(r => ({ name: r.name, n: d.players.filter(p => p.regionId === r.id).length }));
    let html = `<div class="card"><h2>${esc(s.name)} ${statusBadge()}</h2>
      <div class="stat-grid">${stat(d.regions.length, '참가 지역')}${stat(d.players.length, '참가 선수')}${stat(d.players.filter(p => p.gender === 'F').length, '여성 선수')}${stat(d.teams.filter(t => t.event === 'scotch').length + '/' + d.teams.filter(t => t.event === 'baker').length, '스카치/베이커 팀')}</div>
      <p class="small mt"><b>일정:</b> ${esc((s.dates || []).filter(Boolean).join(' ~ ') || '미정')} &nbsp; <b>장소:</b> ${esc(s.venue || '미정')} &nbsp; <b>주최:</b> ${esc(regionName(s.hostRegionId))}</p>
      ${s.schedule ? `<div class="schedule mt">${esc(s.schedule)}</div>` : ''}</div>`;
    html += `<div class="card"><h2>진행 현황</h2>${bar('개인전', pr.individual)}${bar('스카치', pr.scotch)}${bar('베이커', pr.baker)}${bar('5인조', pr.team5)}</div>`;
    if (res.standings.some(r => r.total > 0)) html += `<div class="card"><h2>🏆 지역 종합 <button class="btn btn-xs btn-outline" data-action="tab" data-tab="standings">자세히</button></h2>${podium(res.standings.slice(0, 3), r => r.regionName, r => r.total + '점')}</div>`;
    if (res.male.some(r => r.gamesPlayed) || res.female.some(r => r.gamesPlayed)) {
      html += `<div class="card"><h2>🎳 개인전 현재 순위 <button class="btn btn-xs btn-outline" data-action="tab" data-tab="individual">자세히</button></h2>
        <h3>남자</h3>${podium(res.male.filter(r => r.gamesPlayed).slice(0, 3), r => r.name, r => r.score, r => r.regionName)}<h3>여자</h3>${podium(res.female.filter(r => r.gamesPlayed).slice(0, 3), r => r.name, r => r.score, r => r.regionName)}</div>`;
    }
    html += `<div class="card"><h2>지역별 참가 인원</h2><div class="row">${byRegion.map(r => `<span class="chip">${esc(r.name)} <b>${r.n}</b></span>`).join('') || '<p class="empty">등록된 지역이 없습니다.</p>'}</div></div>`;
    if (!isAdmin()) html += `<p class="muted small center mt">선수 등록·배정·점수 입력은 우측 상단 <b>관리자</b> 버튼으로 로그인 후 가능합니다.</p>`;
    return html;
  }
  function podium(rows, nameFn, scoreFn, subFn) {
    if (!rows.length) return '<p class="empty">아직 결과가 없습니다.</p>';
    const order = [rows[1], rows[0], rows[2]].filter(Boolean);
    const cls = r => r.rank === 1 ? 'first' : r.rank === 2 ? 'second' : 'third';
    return `<div class="podium">${order.map(r => `<div class="p ${cls(r)}"><div>${medal(r.rank)}</div><div class="n">${esc(nameFn(r))}</div><div class="c">${esc(subFn ? subFn(r) : '')}</div><div class="s">${esc(scoreFn(r))}</div></div>`).join('')}</div>`;
  }

  // ----- 선수 -----
  function renderPlayers() {
    const d = state.data; const s = S();
    let html = '';
    if (isAdmin()) {
      const er = state.editRegion;
      html += `<div class="card"><h2>🗺 지역 (${d.regions.length})</h2>
        <form data-form="save-region" data-id="${esc(er ? er.id || '' : '')}" class="form-row"><div class="form-group"><input type="text" name="name" placeholder="지역명" required value="${esc(er ? er.name : '')}"></div><div class="form-group"><input type="text" name="leader" placeholder="대표/연락 담당" value="${esc(er ? er.leader : '')}"></div><div class="form-group"><input type="text" name="note" placeholder="비고" value="${esc(er ? er.note : '')}"></div><div class="form-group" style="flex:0"><div class="row"><button class="btn btn-small btn-primary" type="submit">${er ? '수정' : '추가'}</button>${er ? '<button class="btn btn-small btn-outline" type="button" data-action="cancel-region">취소</button>' : ''}</div></div></form>
        <div class="row">${d.regions.map(r => `<span class="chip">${esc(r.name)} <small>${d.players.filter(p => p.regionId === r.id).length}명</small> <span data-action="edit-region" data-id="${esc(r.id)}" style="cursor:pointer">✏️</span> <span class="x" data-action="del-region" data-id="${esc(r.id)}">×</span></span>`).join('')}</div></div>`;
      const ep = state.editPlayer; const ev = (ep && ep.events) || { individual: true };
      html += `<div class="card"><h2>${ep && ep.id ? '✏️ 선수 수정' : '＋ 선수 등록'}</h2><form data-form="save-player" data-id="${esc(ep ? ep.id || '' : '')}">
        <div class="form-row"><div class="form-group"><label>이름</label><input type="text" name="name" required value="${esc(ep ? ep.name : '')}"></div><div class="form-group"><label>지역</label><select name="regionId" required>${regionOptions(ep ? ep.regionId : state.playersRegion, '선택')}</select></div><div class="form-group"><label>성별</label><select name="gender"><option value="M" ${ep && ep.gender === 'F' ? '' : 'selected'}>남</option><option value="F" ${ep && ep.gender === 'F' ? 'selected' : ''}>여</option></select></div></div>
        <div class="form-row"><div class="form-group"><label>에버</label><input type="number" name="avg" required value="${esc(ep ? ep.avg : '')}"></div><div class="form-group"><label>핸디 수동 (비우면 자동)</label><input type="number" name="handicapOverride" value="${esc(ep && ep.handicapOverride !== '' && ep.handicapOverride != null ? ep.handicapOverride : '')}"></div><div class="form-group"><label>조</label><select name="group">${groupOptions(ep ? ep.group : '', '미편성')}</select></div></div>
        <div class="form-group"><label>출전 종목 / 대표</label><div class="row">
          <label class="checkbox-item"><input type="checkbox" name="ev_individual" ${ev.individual !== false ? 'checked' : ''}> 개인전</label>
          <label class="checkbox-item"><input type="checkbox" name="ev_scotch" ${ev.scotch ? 'checked' : ''}> 스카치</label>
          <label class="checkbox-item"><input type="checkbox" name="ev_baker" ${ev.baker ? 'checked' : ''}> 베이커</label>
          <label class="checkbox-item"><input type="checkbox" name="ev_team5" ${ev.team5 ? 'checked' : ''}> 5인조</label>
          <label class="checkbox-item"><input type="checkbox" name="isRep" ${ep && ep.isRep ? 'checked' : ''}> <b class="rep">지역 대표</b></label></div></div>
        <div class="form-group"><label>비고</label><input type="text" name="note" value="${esc(ep ? ep.note : '')}"></div>
        <div class="row"><button class="btn btn-small btn-primary" type="submit">저장</button>${ep ? '<button class="btn btn-small btn-outline" type="button" data-action="cancel-player">취소</button>' : ''}</div></form></div>`;
      html += `<div class="card"><h2>📥 신청서 일괄 등록</h2><p class="muted small mb">한 줄에 한 명: <code>이름,지역,성별(남/여),에버,종목,대표</code><br>종목은 "개인 스카치 베이커 5인조" 중 출전하는 것을 띄어쓰기로 (비우면 개인전만). 대표는 "대표" 또는 O.<br>지역이 없으면 자동 생성됩니다. 엑셀 신청서 양식이 정해지면 파일 업로드로 바꿀 예정입니다.</p>
        <form data-form="import-players"><textarea name="csv" placeholder="홍길동,서울,남,185,개인 스카치 5인조,대표&#10;김영희,서울,여,160,개인 베이커"></textarea>
        <div class="row mt"><label class="checkbox-item"><input type="checkbox" name="replace"> 기존 선수·팀 전체 삭제 후 등록</label><button class="btn btn-small btn-primary" type="submit">가져오기</button></div></form></div>`;
    }
    const q = state.playersQ.trim();
    const rows = Ranking.playerRows(d.players, d.regions, s).filter(r => (!state.playersRegion || r.regionId === state.playersRegion) && (!state.playersGender || r.gender === state.playersGender) && (!q || r.name.includes(q)));
    rows.sort((a, b) => a.regionName.localeCompare(b.regionName, 'ko') || (b.isRep - a.isRep) || b.avg - a.avg);
    const pMap = new Map(d.players.map(p => [p.id, p]));
    html += `<div class="card"><h2>👥 참가 선수 (${rows.length}/${d.players.length}) <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#players-table" data-name="참가선수">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="form-row mb"><div class="form-group"><select data-change="players-region">${regionOptions(state.playersRegion, '전체 지역')}</select></div><div class="form-group"><select data-change="players-gender"><option value="">남녀 전체</option><option value="M" ${state.playersGender === 'M' ? 'selected' : ''}>남자</option><option value="F" ${state.playersGender === 'F' ? 'selected' : ''}>여자</option></select></div><div class="form-group"><input type="text" data-input="players-q" placeholder="이름 검색" value="${esc(state.playersQ)}"></div></div>
      <p class="muted small mb">핸디: ${esc(handicapText(s.handicap))} · <span class="rep">★</span> 지역 대표 (지역당 ${s.repCount}명)</p>
      <div class="table-scroll"><table class="tbl" id="players-table"><thead><tr><th class="left">이름</th><th class="left">지역</th><th>성별</th><th>에버</th><th>핸디</th><th>조</th><th>레인</th><th class="left">종목</th>${isAdmin() ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map(r => { const p = pMap.get(r.playerId); return `<tr><td class="left"><b>${esc(r.name)}</b>${r.isRep ? ' <span class="rep">★</span>' : ''}</td><td class="left">${esc(r.regionName)}</td><td>${genderBadge(r.gender)}</td><td>${r.avg}</td><td>${r.handicap}${p.handicapOverride !== '' && p.handicapOverride != null ? '*' : ''}</td><td>${esc(groupName(r.group))}</td><td>${r.lane ? r.lane + '-' + r.pos : '-'}</td><td class="left">${evChips(p.events)}</td>${isAdmin() ? `<td class="nowrap"><button class="btn btn-xs btn-outline" data-action="edit-player" data-id="${esc(p.id)}">수정</button> <button class="btn btn-xs btn-danger" data-action="del-player" data-id="${esc(p.id)}">삭제</button></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="9" class="empty">선수가 없습니다.</td></tr>'}
      </tbody></table></div></div>`;
    return html;
  }
  function handicapText(h) {
    if (!h || h.type === 'none') return '핸디 없음';
    let t = `(${h.base} − 에버) × ${h.rate == null || h.rate === '' ? 1 : h.rate}`;
    if (h.cap !== '' && h.cap != null) t += `, 최대 ${h.cap}`;
    if (h.femaleBonus) t += `, 여성 +${h.femaleBonus}`;
    return t;
  }

  // ----- 배정 -----
  function renderAssign() {
    const s = S(); const d = state.data;
    const items = s.groups.map(g => [g.id, `개인전 ${g.name}`]).concat([['scotch', '스카치'], ['baker', '베이커'], ['team5', '5인조']]);
    if (!items.some(i => i[0] === state.assignSub)) state.assignSub = items[0][0];
    let html = subtabs(items, state.assignSub, 'assign-sub', 'sub');
    if (EV[state.assignSub]) return html + renderTeamAssign(state.assignSub);
    const g = s.groups.find(x => x.id === state.assignSub);
    const rows = Ranking.playerRows(d.players.filter(p => p.group === g.id), d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || num(a.pos, 99) - num(b.pos, 99) || a.name.localeCompare(b.name, 'ko'));
    const unassigned = d.players.filter(p => !p.group || !s.groups.some(x => x.id === p.group)).length;
    if (isAdmin()) {
      html += `<div class="card"><h2>조 편성 / 레인 배정</h2>
        <p class="small mb">전체 ${d.players.length}명 · 미편성 ${unassigned}명 · ${s.groups.map(x => x.name + ' ' + d.players.filter(p => p.group === x.id).length + '명').join(' · ')}</p>
        <div class="row mb"><button class="btn btn-small btn-secondary" data-action="auto-groups">🎲 전체 조 자동 편성 (지역별 균등)</button></div>
        <div class="form-row"><div class="form-group"><label>시작 레인</label><input type="number" id="lane-from" value="${s.laneFrom || 1}"></div><div class="form-group"><label>레인당 인원</label><input type="number" id="per-lane" value="${s.perLane || 4}"></div><div class="form-group" style="flex:0;align-self:flex-end"><button class="btn btn-small btn-primary" data-action="auto-lanes" data-group="${esc(g.id)}">${esc(g.name)} 레인 자동 배정</button></div></div>
        <p class="muted small">같은 지역 선수가 같은 레인에 겹치지 않도록 배정합니다. 아래 표에서 조·레인·순번을 직접 고칠 수 있습니다 (자동 저장).</p></div>`;
    }
    const byLane = new Map(); rows.forEach(r => { const k = r.lane || '미배정'; if (!byLane.has(k)) byLane.set(k, []); byLane.get(k).push(r); });
    html += `<div class="card"><h2>${esc(g.name)} <span class="muted small">${g.day ? g.day + '일차' : ''} ${esc(g.time || '')} · ${rows.length}명</span> <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#assign-table" data-name="${esc(g.name)}배정">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="lane-grid mb">${[...byLane.entries()].map(([lane, list]) => `<div class="lane-box"><div class="ln">${lane === '미배정' ? '미배정' : lane + '레인'}</div><ol>${list.map(r => `<li>${esc(r.name)}${r.isRep ? '<span class="rep">★</span>' : ''} <small>${esc(r.regionName)} ${r.gender === 'F' ? '여' : ''} ${r.avg}/${r.handicap}</small></li>`).join('')}</ol></div>`).join('') || '<p class="empty">이 조에 편성된 선수가 없습니다.</p>'}</div>
      <div class="table-scroll"><table class="tbl" id="assign-table"><thead><tr><th>레인</th><th>순번</th><th class="left">이름</th><th class="left">지역</th><th>성별</th><th>에버</th><th>핸디</th>${isAdmin() ? '<th>조</th>' : ''}</tr></thead><tbody>
      ${rows.map(r => `<tr>${isAdmin() ? `<td><input type="number" class="sm" data-pfield="lane" data-id="${esc(r.playerId)}" value="${esc(r.lane)}"></td><td><input type="number" class="sm" data-pfield="pos" data-id="${esc(r.playerId)}" value="${esc(r.pos)}"></td>` : `<td>${r.lane || '-'}</td><td>${r.pos || '-'}</td>`}<td class="left"><b>${esc(r.name)}</b>${r.isRep ? ' <span class="rep">★</span>' : ''}</td><td class="left">${esc(r.regionName)}</td><td>${genderBadge(r.gender)}</td><td>${r.avg}</td><td>${r.handicap}</td>${isAdmin() ? `<td><select class="sm" data-pfield="group" data-id="${esc(r.playerId)}">${groupOptions(r.group, '미편성')}</select></td>` : ''}</tr>`).join('') || '<tr><td colspan="8" class="empty">선수가 없습니다.</td></tr>'}
      </tbody></table></div><p class="save-state mt" id="save-state"></p></div>`;
    if (isAdmin() && unassigned) {
      const un = d.players.filter(p => !p.group || !s.groups.some(x => x.id === p.group));
      html += `<div class="card"><h2>미편성 선수 (${un.length})</h2><div class="table-scroll"><table class="tbl"><tbody>${un.map(p => `<tr><td class="left"><b>${esc(p.name)}</b></td><td class="left">${esc(regionName(p.regionId))}</td><td><select class="sm" data-pfield="group" data-id="${esc(p.id)}">${groupOptions('', '미편성')}</select></td></tr>`).join('')}</tbody></table></div></div>`;
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
      const cands = d.players.filter(p => p.regionId === reg && !inTeam.has(p.id) && (!p.events || p.events[event] || event === 'team5')).sort((a, b) => a.gender.localeCompare(b.gender) || b.avg - a.avg);
      const hint = event === 'scotch' ? '남 1명 + 여 1명' : event === 'baker' ? '3명' : '5명 (지역 대표)';
      html += `<div class="card"><h2>${ev.name} 팀 만들기</h2><p class="muted small mb">팀 구성: ${hint} · 해당 종목에 출전 신청한 선수만 표시됩니다${event === 'team5' ? ' (5인조는 전원)' : ''}.</p>
        <div class="form-row"><div class="form-group"><label>지역</label><select data-change="team-region">${regionOptions(reg)}</select></div><div class="form-group"><label>팀명 (선택)</label><input type="text" id="team-name" placeholder="비우면 선수명"></div></div>
        <div class="checkbox-grid">${cands.map(p => `<label class="checkbox-item"><input type="checkbox" class="team-cb" value="${esc(p.id)}" data-gender="${p.gender}"> ${esc(p.name)} <small>${p.gender === 'F' ? '여' : '남'} · ${p.avg}</small></label>`).join('') || '<span class="muted small">선택 가능한 선수가 없습니다.</span>'}</div>
        <div class="row mt"><button class="btn btn-small btn-primary" data-action="add-team" data-event="${event}">팀 등록</button>
        <button class="btn btn-small btn-secondary" data-action="auto-team-lanes" data-event="${event}">레인 자동 배정</button>
        <input type="number" id="team-lane-from" value="${s.laneFrom || 1}" style="width:70px" title="시작 레인"> <input type="number" id="team-per-lane" value="${event === 'scotch' ? 2 : 1}" style="width:60px" title="레인당 팀 수"></div></div>`;
    }
    html += `<div class="card"><h2>${ev.name} 팀 (${rows.length}) <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#team-assign-table" data-name="${ev.name}배정">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="table-scroll"><table class="tbl" id="team-assign-table"><thead><tr><th>레인</th><th class="left">지역</th><th class="left">팀 / 선수</th><th>팀 핸디</th>${isAdmin() ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map(r => `<tr>${isAdmin() ? `<td><input type="number" class="sm" data-tfield="lane" data-id="${esc(r.teamId)}" value="${esc(r.lane)}"></td>` : `<td>${r.lane || '-'}</td>`}<td class="left">${esc(r.regionName)}</td><td class="left"><b>${esc(r.name)}</b>${!r.valid ? ' <span class="badge live">인원 확인</span>' : ''}<br><small class="muted">${r.members.map(m => esc(m.name) + '(' + (m.gender === 'F' ? '여' : '남') + ' ' + m.avg + '/' + m.handicap + ')').join(', ')}</small></td><td>${r.handicap}</td>${isAdmin() ? `<td><button class="btn btn-xs btn-danger" data-action="del-team" data-id="${esc(r.teamId)}">삭제</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="5" class="empty">등록된 팀이 없습니다.</td></tr>'}
      </tbody></table></div><p class="save-state mt" id="save-state"></p></div>`;
    return html;
  }

  // ----- 개인전 -----
  function renderIndividual() {
    const s = S(); const d = state.data; const res = results(); const n = s.games.individual;
    const items = [['M', '남자'], ['F', '여자'], ['all', '전체']].concat(s.groups.map(g => ['g:' + g.id, g.name]));
    if (isAdmin()) items.push(['score', '✏️ 점수 입력']);
    if (!items.some(i => i[0] === state.indSub)) state.indSub = 'M';
    let html = subtabs(items, state.indSub, 'ind-sub', 'sub');
    if (state.indSub === 'score') return html + renderIndividualScore();
    const label = items.find(i => i[0] === state.indSub)[1];
    let rows;
    if (state.indSub === 'M') rows = res.male; else if (state.indSub === 'F') rows = res.female;
    else if (state.indSub === 'all') rows = Ranking.individualRanking(res.playerRows);
    else { const gid = state.indSub.slice(2); rows = Ranking.individualRanking(res.playerRows, r => r.group === gid); }
    const topN = s.points.individual.length;
    const isGender = state.indSub === 'M' || state.indSub === 'F';
    html += `<p class="muted small mb">${s.status === 'final' ? '<span class="status-final">✅ 확정된 결과</span>' : '⏱ 실시간 집계'} · 순위 기준: ${s.basis === 'scratch' ? '스크래치' : '핸디 포함 총점'}${isGender ? ` · 상위 ${topN}명 지역 포인트 (${s.points.individual.join('/')})` : ''}</p>`;
    html += `<div class="card"><h2>개인전 ${esc(label)} <span class="muted small">${rows.length}명</span> <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#ind-table" data-name="개인전${esc(label)}">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="table-scroll"><table class="tbl" id="ind-table"><thead><tr><th>순위</th><th class="left">이름</th><th class="left">지역</th><th>조</th><th>에버</th><th>핸디</th>${gameHeads(n)}<th>스크래치</th><th>총점</th><th>하이</th>${isGender ? '<th>포인트</th>' : ''}</tr></thead><tbody>
      ${rows.map(r => `<tr class="rank-${r.rank}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.name)}</b>${r.isRep ? ' <span class="rep">★</span>' : ''}${!isGender && r.gender === 'F' ? ' <span class="badge gender-F">여</span>' : ''}</td><td class="left">${esc(r.regionName)}</td><td>${esc(groupName(r.group))}</td><td>${r.avg}</td><td>${r.handicap}</td>${gamesOf(r, n)}<td>${r.scratch}</td><td class="strong">${r.total}</td><td>${r.high || '-'}</td>${isGender ? `<td class="pts">${Ranking.pointsForRank(r.rank, s.points.individual) || ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${n + 11}" class="empty">데이터 없음</td></tr>`}
      </tbody></table></div></div>`;
    return html;
  }

  function renderIndividualScore() {
    const s = S(); const d = state.data; const n = s.games.individual;
    const gid = state.scoreGroup || s.groups[0].id;
    const list = d.players.filter(p => p.group === gid);
    const rows = Ranking.playerRows(list, d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || num(a.pos, 99) - num(b.pos, 99) || a.name.localeCompare(b.name, 'ko'));
    const done = rows.filter(r => r.gamesPlayed === n).length;
    return `<div class="card"><h2>개인전 점수 입력 <select data-change="score-group" style="width:auto">${groupOptions(gid)}</select></h2>
      <p class="muted small mb">입력하면 자동 저장됩니다 · 완료 ${done}/${rows.length}명 <span class="save-state" id="save-state"></span></p>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>레인</th><th class="left">이름</th><th class="left">지역</th><th>핸디</th>${gameHeads(n)}<th>합계</th><th>총점</th></tr></thead><tbody>
      ${rows.map(r => `<tr data-row="${esc(r.playerId)}"><td>${r.lane ? r.lane + '-' + r.pos : '-'}</td><td class="left"><b>${esc(r.name)}</b>${r.gender === 'F' ? ' <span class="badge gender-F">여</span>' : ''}</td><td class="left small">${esc(r.regionName)}</td><td>${r.handicap}</td>${r.games.map((g, i) => `<td><input type="number" min="0" max="300" inputmode="numeric" data-pscore="${esc(r.playerId)}" data-g="${i}" value="${g == null ? '' : g}"></td>`).join('')}<td class="c-scratch">${r.scratch}</td><td class="c-total strong">${r.total}</td></tr>`).join('') || `<tr><td colspan="${n + 6}" class="empty">이 조에 선수가 없습니다. 배정 탭에서 조를 편성하세요.</td></tr>`}
      </tbody></table></div></div>`;
  }

  // ----- 팀 종목 -----
  function renderTeamEvent(event) {
    const s = S(); const d = state.data; const ev = EV[event]; const n = s.games[event]; const res = results();
    const items = [['rank', '순위']]; if (isAdmin()) items.push(['score', '✏️ 점수 입력']);
    const cur = state.teamSub[event] || 'rank';
    let html = subtabs(items, cur, 'team-sub', 'sub');
    const ranked = res[event];
    const pts = s.points[event];
    const showPts = event !== 'team5' || s.countTeam5;
    if (cur === 'score') {
      const rows = Ranking.teamRows(d.teams, event, res.playerRows, d.regions, s).sort((a, b) => num(a.lane, 999) - num(b.lane, 999) || a.regionName.localeCompare(b.regionName, 'ko'));
      const done = rows.filter(r => r.gamesPlayed === n).length;
      return html + `<div class="card"><h2>${ev.name} 점수 입력</h2><p class="muted small mb">팀 핸디: ${{ avg: '팀원 평균', sum: '팀원 합계', none: '없음' }[s.teamHandicap[event]] || '없음'} · 완료 ${done}/${rows.length}팀 <span class="save-state" id="save-state"></span></p>
        <div class="table-scroll"><table class="tbl"><thead><tr><th>레인</th><th class="left">지역</th><th class="left">팀</th><th>핸디</th>${gameHeads(n)}<th>합계</th><th>총점</th></tr></thead><tbody>
        ${rows.map(r => `<tr data-row="${esc(r.teamId)}"><td>${r.lane || '-'}</td><td class="left">${esc(r.regionName)}</td><td class="left"><b>${esc(r.name)}</b></td><td>${r.handicap}</td>${r.games.map((g, i) => `<td><input type="number" min="0" max="300" inputmode="numeric" data-tscore="${esc(r.teamId)}" data-g="${i}" value="${g == null ? '' : g}"></td>`).join('')}<td class="c-scratch">${r.scratch}</td><td class="c-total strong">${r.total}</td></tr>`).join('') || `<tr><td colspan="${n + 6}" class="empty">팀이 없습니다. 배정 탭에서 팀을 만드세요.</td></tr>`}
        </tbody></table></div></div>`;
    }
    html += `<p class="muted small mb">${s.status === 'final' ? '<span class="status-final">✅ 확정된 결과</span>' : '⏱ 실시간 집계'} · ${ev.name} ${n}게임 · 팀 핸디 ${{ avg: '팀원 평균', sum: '팀원 합계', none: '없음' }[s.teamHandicap[event]] || '없음'}${showPts && pts ? ` · 상위 ${pts.length}팀 지역 포인트 (${pts.join('/')})` : event === 'team5' ? ' · 이벤트 경기 (지역 포인트 미반영)' : ''}</p>`;
    html += `<div class="card"><h2>${ev.name} 순위 <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#team-table" data-name="${ev.name}">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      <div class="table-scroll"><table class="tbl" id="team-table"><thead><tr><th>순위</th><th class="left">지역</th><th class="left">팀 / 선수</th><th>레인</th><th>핸디</th>${gameHeads(n)}<th>스크래치</th><th>총점</th>${showPts ? '<th>포인트</th>' : ''}</tr></thead><tbody>
      ${ranked.map(r => `<tr class="rank-${r.rank}"><td>${medal(r.rank)}</td><td class="left">${esc(r.regionName)}</td><td class="left"><b>${esc(r.name)}</b><br><small class="muted">${r.memberNames.map(esc).join(', ')}</small></td><td>${r.lane || '-'}</td><td>${r.handicap}</td>${gamesOf(r, n)}<td>${r.scratch}</td><td class="strong">${r.total}</td>${showPts ? `<td class="pts">${Ranking.pointsForRank(r.rank, pts) || ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${n + 9}" class="empty">등록된 팀이 없습니다.</td></tr>`}
      </tbody></table></div></div>`;
    return html;
  }

  // ----- 지역 종합 -----
  function renderStandings() {
    const s = S(); const res = results(); const pr = Ranking.progress(state.data);
    const allDone = pr.individual.done === pr.individual.total && pr.scotch.done === pr.scotch.total && pr.baker.done === pr.baker.total;
    let html = '';
    if (isAdmin()) {
      html += `<div class="card"><h2>결과 관리</h2><p class="small mb">현재 ${statusBadge()} · 개인전 ${pr.individual.done}/${pr.individual.total} · 스카치 ${pr.scotch.done}/${pr.scotch.total} · 베이커 ${pr.baker.done}/${pr.baker.total} · 5인조 ${pr.team5.done}/${pr.team5.total}${allDone ? '' : ' · <span class="badge live">미입력 있음</span>'}</p>
        <div class="row">${s.status === 'final' ? '<button class="btn btn-small btn-outline" data-action="unfinalize">확정 해제</button>' : `${s.status !== 'live' ? '<button class="btn btn-small btn-secondary" data-action="set-status" data-status="live">대회 시작 (진행중)</button>' : ''}<button class="btn btn-small btn-success" data-action="finalize">🏁 최종 결과 확정</button>`}</div>
        <p class="muted small mt">확정하면 순위와 포인트가 스냅샷으로 저장되어 이후 입력이 바뀌어도 결과가 유지됩니다.</p></div>`;
    }
    html += `<p class="muted small mb">${s.status === 'final' ? '<span class="status-final">✅ 확정된 결과</span>' : '⏱ 실시간 집계'} · 배점: 개인전 남/여 ${s.points.individual.join('/')} · 지역 대표 ${s.points.reps.join('/')} · 스카치 ${s.points.scotch.join('/')} · 베이커 ${s.points.baker.join('/')}</p>`;
    html += `<div class="card"><h2>🏆 지역 종합 순위 <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#stand-table" data-name="지역종합">CSV</button><button class="btn btn-xs btn-outline" data-action="print">인쇄</button></span></h2>
      ${podium(res.standings.slice(0, 3), r => r.regionName, r => r.total + '점')}
      <div class="table-scroll"><table class="tbl" id="stand-table"><thead><tr><th>순위</th><th class="left">지역</th><th>개인 남</th><th>개인 여</th><th>대표</th><th>스카치</th><th>베이커</th>${s.countTeam5 ? '<th>5인조</th>' : ''}<th>합계</th></tr></thead><tbody>
      ${res.standings.map(r => `<tr class="rank-${r.rank}" data-action="toggle-region" data-id="${esc(r.regionId)}" style="cursor:pointer"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.regionName)}</b> ${state.openRegion === r.regionId ? '▾' : '▸'}</td><td>${r.male}</td><td>${r.female}</td><td>${r.reps}</td><td>${r.scotch}</td><td>${r.baker}</td>${s.countTeam5 ? `<td>${r.team5}</td>` : ''}<td class="pts">${r.total}</td></tr>${state.openRegion === r.regionId ? `<tr><td colspan="9" class="left detail-list">${r.details.length ? r.details.map(x => `${esc(x.event)} ${x.rank}위 ${esc(x.who)} → <b>${x.pts}</b>점`).join('<br>') : '획득 포인트 없음'}</td></tr>` : ''}`).join('') || '<tr><td colspan="9" class="empty">지역이 없습니다.</td></tr>'}
      </tbody></table></div><p class="muted small mt">지역을 누르면 포인트 상세가 표시됩니다.</p></div>`;
    html += `<div class="card"><h2>지역 대표 개인전 합계 <span class="muted small">지역당 ${s.repCount}명</span></h2><div class="table-scroll"><table class="tbl"><thead><tr><th>순위</th><th class="left">지역</th><th class="left">대표 선수 (점수)</th><th>합계</th><th>포인트</th></tr></thead><tbody>
      ${res.reps.map(r => `<tr class="rank-${r.rank}"><td>${medal(r.rank)}</td><td class="left"><b>${esc(r.regionName)}</b>${r.short ? ' <span class="badge live">대표 부족</span>' : ''}${r.over ? ' <span class="badge live">대표 초과</span>' : ''}</td><td class="left small">${r.reps.map(x => esc(x.name) + '(' + x.score + ')').join(', ') || '-'}</td><td class="strong">${r.score}</td><td class="pts">${Ranking.pointsForRank(r.rank, s.points.reps) || ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    return html;
  }

  // ----- 설정 -----
  function renderSettings() {
    const s = S(); const h = s.handicap;
    const sel = (name, cur, opts) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<div class="card"><h2>🏟 대회 정보</h2><form data-form="save-info">
      <div class="form-row"><div class="form-group" style="flex:2"><label>대회명</label><input type="text" name="name" value="${esc(s.name)}"></div><div class="form-group"><label>주최 지역</label><select name="hostRegionId">${regionOptions(s.hostRegionId, '선택')}</select></div></div>
      <div class="form-row"><div class="form-group"><label>1일차</label><input type="date" name="d1" value="${esc(s.dates[0] || '')}"></div><div class="form-group"><label>2일차</label><input type="date" name="d2" value="${esc(s.dates[1] || '')}"></div><div class="form-group" style="flex:2"><label>장소</label><input type="text" name="venue" value="${esc(s.venue || '')}"></div></div>
      <div class="form-row"><div class="form-group"><label>시작 레인</label><input type="number" name="laneFrom" value="${s.laneFrom || 1}"></div><div class="form-group"><label>레인 수</label><input type="number" name="lanes" value="${s.lanes || 20}"></div><div class="form-group"><label>레인당 인원(개인전)</label><input type="number" name="perLane" value="${s.perLane || 4}"></div></div>
      <div class="form-group"><label>개인전 조 (한 줄에 하나: 조ID,조이름,일차,시간)</label><textarea name="groups">${esc(s.groups.map(g => [g.id, g.name, g.day || '', g.time || ''].join(',')).join('\n'))}</textarea></div>
      <div class="form-group"><label>일정 안내 (홈 화면 표시)</label><textarea name="schedule">${esc(s.schedule || '')}</textarea></div>
      <button class="btn btn-small btn-primary" type="submit">저장</button></form></div>
    <div class="card"><h2>📏 경기 규정</h2><form data-form="save-rules">
      <h3>핸디캡</h3><div class="form-row"><div class="form-group"><label>방식</label>${sel('hType', h.type, [['diff', '(기준 − 에버) × 비율'], ['none', '없음']])}</div><div class="form-group"><label>기준</label><input type="number" name="hBase" value="${esc(h.base)}"></div><div class="form-group"><label>비율</label><input type="number" step="0.05" name="hRate" value="${esc(h.rate)}"></div><div class="form-group"><label>최대</label><input type="number" name="hCap" value="${esc(h.cap != null ? h.cap : '')}"></div><div class="form-group"><label>여성 추가</label><input type="number" name="hFemale" value="${esc(h.femaleBonus || 0)}"></div></div>
      <h3>개인전</h3><div class="form-row"><div class="form-group"><label>게임 수</label><input type="number" name="gInd" value="${s.games.individual}"></div><div class="form-group"><label>순위 기준</label>${sel('basis', s.basis, [['total', '핸디 포함 총점'], ['scratch', '스크래치']])}</div><div class="form-group"><label>지역 대표 인원</label><input type="number" name="repCount" value="${s.repCount}"></div></div>
      <h3>팀 종목</h3><div class="form-row"><div class="form-group"><label>스카치 게임</label><input type="number" name="gScotch" value="${s.games.scotch}"></div><div class="form-group"><label>스카치 핸디</label>${sel('thScotch', s.teamHandicap.scotch, [['avg', '팀원 평균'], ['sum', '팀원 합계'], ['none', '없음']])}</div><div class="form-group"><label>베이커 게임</label><input type="number" name="gBaker" value="${s.games.baker}"></div><div class="form-group"><label>베이커 핸디</label>${sel('thBaker', s.teamHandicap.baker, [['avg', '팀원 평균'], ['sum', '팀원 합계'], ['none', '없음']])}</div><div class="form-group"><label>5인조 게임</label><input type="number" name="gTeam5" value="${s.games.team5}"></div><div class="form-group"><label>5인조 핸디</label>${sel('thTeam5', s.teamHandicap.team5, [['none', '없음'], ['avg', '팀원 평균'], ['sum', '팀원 합계']])}</div></div>
      <h3>지역 포인트 배점 (1위부터, 쉼표 구분)</h3>
      <div class="form-row"><div class="form-group"><label>개인전 남/여 각 상위</label><input type="text" name="pInd" value="${esc(s.points.individual.join(', '))}"></div><div class="form-group"><label>지역 대표 합계 순위</label><input type="text" name="pReps" value="${esc(s.points.reps.join(', '))}"></div></div>
      <div class="form-row"><div class="form-group"><label>스카치 상위 팀</label><input type="text" name="pScotch" value="${esc(s.points.scotch.join(', '))}"></div><div class="form-group"><label>베이커 상위 팀</label><input type="text" name="pBaker" value="${esc(s.points.baker.join(', '))}"></div><div class="form-group"><label>5인조 (반영 시)</label><input type="text" name="pTeam5" value="${esc((s.points.team5 || []).join(', '))}"></div></div>
      <label class="checkbox-item mb"><input type="checkbox" name="countTeam5" ${s.countTeam5 ? 'checked' : ''}> 5인조 결과를 지역 포인트에 반영</label>
      <button class="btn btn-small btn-primary" type="submit">저장</button></form></div>
    <div class="card"><h2>🔐 관리자 PIN 변경</h2><form data-form="save-admin-pin"><div class="form-row"><div class="form-group"><input type="password" name="adminPin" inputmode="numeric" maxlength="6" placeholder="새 PIN (숫자 4~6자리)" required></div><div class="form-group" style="flex:0"><button class="btn btn-small btn-primary" type="submit">변경</button></div></div></form></div>
    <div class="card"><h2>☁️ 서버 연결</h2><p class="muted small mb">현재: <b>${Store.mode() === 'remote' ? '서버 모드 (Google Sheets)' : '로컬 데모 모드 (이 브라우저에만 저장)'}</b>. Apps Script 웹앱 URL을 넣으면 모든 기기가 같은 데이터를 봅니다. 설치 방법은 gas/Code.gs 주석 참고.</p>
      <form data-form="set-api"><div class="form-group"><input type="url" name="url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(Store.getApiUrl())}"></div><div class="row"><button class="btn btn-small btn-primary" type="submit">연결 (다시 로그인)</button>${Store.mode() === 'remote' ? '<button class="btn btn-small btn-outline" type="button" data-action="test-api">연결 테스트</button>' : ''}</div></form></div>
    <div class="card"><h2>💾 백업 / 복원</h2><div class="row"><button class="btn btn-small btn-outline" data-action="export-json">JSON 내보내기</button><label class="btn btn-small btn-outline" style="cursor:pointer">JSON 가져오기 <input type="file" accept=".json,application/json" data-change="import-json" style="display:none"></label></div>
      ${Store.mode() === 'local' ? `<h3 class="mt">로컬 데모 데이터</h3><div class="row"><button class="btn btn-small btn-outline" data-action="reset-demo">데모 데이터로 초기화</button><button class="btn btn-small btn-danger" data-action="reset-empty">모든 데이터 삭제 (빈 상태)</button></div>` : ''}</div>`;
  }

  // ===== 저장 (자동 저장 큐) =====
  function markDirty(kind, id) {
    (kind === 'player' ? state.dirtyPlayers : state.dirtyTeams).set(id, true);
    const st = $('#save-state'); if (st) { st.textContent = '저장 대기…'; st.className = 'save-state dirty'; }
    clearTimeout(state.dirtyTimer); state.dirtyTimer = setTimeout(flush, 900);
  }
  async function flush() {
    clearTimeout(state.dirtyTimer); state.dirtyTimer = null;
    const pids = [...state.dirtyPlayers.keys()], tids = [...state.dirtyTeams.keys()];
    if (!pids.length && !tids.length) return;
    state.dirtyPlayers.clear(); state.dirtyTeams.clear();
    try {
      if (pids.length) { const list = pids.map(playerById).filter(Boolean); if (list.length) state.data.players = await Store.savePlayers(list); }
      if (tids.length) { const list = tids.map(teamById).filter(Boolean); if (list.length) state.data.teams = await Store.saveTeams(list); }
      const st = $('#save-state'); if (st) { st.textContent = '✓ 저장됨'; st.className = 'save-state saved'; }
    } catch (e) {
      toast('저장 실패: ' + e.message, true); const st = $('#save-state'); if (st) { st.textContent = '저장 실패'; st.className = 'save-state dirty'; }
      if (!Store.isAdmin()) { applyRole(); render(); }
    }
  }
  function updateRow(kind, id) {
    const s = S(); let row;
    if (kind === 'player') row = Ranking.playerRows([playerById(id)], state.data.regions, s)[0];
    else { const pr = Ranking.playerRows(state.data.players, state.data.regions, s); const t = teamById(id); row = Ranking.teamRows([t], t.event, pr, state.data.regions, s)[0]; }
    const tr = $(`tr[data-row="${CSS.escape(id)}"]`); if (!tr || !row) return;
    tr.querySelector('.c-scratch').textContent = row.scratch; tr.querySelector('.c-total').textContent = row.total;
  }

  // ===== 이벤트 =====
  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || e.target.closest('input,select,textarea,a,label')) return;
    const a = el.dataset.action, id = el.dataset.id; const d = state.data; const s = S();
    switch (a) {
      case 'tab': state.tab = el.dataset.tab; return render();
      case 'assign-sub': await flush(); state.assignSub = el.dataset.sub; return render();
      case 'ind-sub': await flush(); state.indSub = el.dataset.sub; return render();
      case 'team-sub': await flush(); state.teamSub[state.tab] = el.dataset.sub; return render();
      case 'toggle-region': state.openRegion = state.openRegion === id ? '' : id; return render();
      case 'csv': return tableCsv(el.dataset.sel, el.dataset.name);
      case 'print': return window.print();
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
        const lanes = Lanes.laneRange(from, Lanes.lanesNeeded(list.length, per));
        const a2 = Lanes.assignLanes(list, lanes, per);
        const upd = list.map(p => ({ ...p, lane: a2[p.id].lane, pos: a2[p.id].pos }));
        await run(async () => { d.players = await Store.savePlayers(upd); await Store.saveSettings({ laneFrom: from, perLane: per }); d.settings.laneFrom = from; d.settings.perLane = per; }, `${lanes[0]}~${lanes[lanes.length - 1]}레인에 배정했습니다.`); return render();
      }
      case 'add-team': {
        const ev = el.dataset.event; const ids = $$('.team-cb:checked').map(c => c.value);
        const size = EV[ev].size;
        if (ids.length !== size) return toast(`${EV[ev].name}은(는) ${size}명을 선택해야 합니다.`, true);
        if (ev === 'scotch') { const gs = $$('.team-cb:checked').map(c => c.dataset.gender).sort().join(''); if (gs !== 'FM') return toast('스카치는 남 1명 + 여 1명으로 구성합니다.', true); }
        const reg = $('[data-change="team-region"]').value;
        const t = { event: ev, regionId: reg, name: $('#team-name').value.trim(), members: ids, lane: '', games: Array(s.games[ev]).fill(null) };
        await run(async () => { d.teams = await Store.saveTeams([t]); }, '팀이 등록되었습니다.'); return render();
      }
      case 'del-team': { const t = teamById(id); if ((t.games || []).some(g => g != null) && !confirm('점수가 입력된 팀입니다. 삭제할까요?')) return; await run(async () => { d.teams = await Store.deleteTeam(id); }, '삭제되었습니다.'); return render(); }
      case 'auto-team-lanes': {
        const ev = el.dataset.event; const from = num($('#team-lane-from').value, 1), per = num($('#team-per-lane').value, 1);
        const ts = d.teams.filter(t => t.event === ev); if (!ts.length) return toast('팀이 없습니다.', true);
        const lanes = Lanes.laneRange(from, Math.ceil(ts.length / per));
        const a2 = Lanes.assignTeamLanes(ts, lanes, per);
        await run(async () => { d.teams = await Store.saveTeams(ts.map(t => ({ ...t, lane: a2[t.id] }))); }, '레인을 배정했습니다.'); return render();
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
        const p = { ...(ex || { games: Array(s.games.individual).fill(null), lane: '', pos: '' }), id: f.dataset.id || '', name: v('name'), regionId: v('regionId'), gender: v('gender'), avg: num(v('avg')), handicapOverride: v('handicapOverride') === '' ? '' : num(v('handicapOverride')), group: v('group'), isRep: chk('isRep'), note: v('note'), events: { individual: chk('ev_individual'), scotch: chk('ev_scotch'), baker: chk('ev_baker'), team5: chk('ev_team5') } };
        if (d.players.some(x => x.id !== p.id && x.regionId === p.regionId && x.name === p.name)) return toast('같은 지역에 동명 선수가 있습니다.', true);
        const r = await run(async () => { d.players = await Store.savePlayers([p]); return true; }, '저장되었습니다.'); if (r) { state.editPlayer = null; render(); } return;
      }
      case 'import-players': {
        const lines = v('csv').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const errors = [], list = [], newRegions = [];
        const regionByName = name => d.regions.find(r => r.name === name) || newRegions.find(r => r.name === name);
        lines.forEach((l, i) => {
          const [name, rname, g, avg, evs, rep] = l.split(',').map(x => (x || '').trim());
          if (!name || !rname) { errors.push(`${i + 1}행: 이름/지역 없음`); return; }
          let region = regionByName(rname);
          if (!region) { region = { id: Store.uid('r'), name: rname, leader: '', note: '' }; newRegions.push(region); }
          const evText = evs || '개인';
          list.push({ name, regionId: region.id, gender: /^(F|여|여자)$/i.test(g) ? 'F' : 'M', avg: num(avg), handicapOverride: '', isRep: /대표|O|o|Y|1/.test(rep || ''), group: '', lane: '', pos: '', games: Array(s.games.individual).fill(null), note: '',
            events: { individual: /개인/.test(evText) || !/스카치|베이커|5인/.test(evText), scotch: /스카치/.test(evText), baker: /베이커/.test(evText), team5: /5인/.test(evText) } });
        });
        if (errors.length && !confirm(`오류 ${errors.length}건은 건너뜁니다:\n${errors.slice(0, 5).join('\n')}\n\n${list.length}명을 가져올까요?`)) return;
        if (!list.length) return toast('가져올 선수가 없습니다.', true);
        const replace = chk('replace');
        if (replace && !confirm('기존 선수와 팀을 모두 삭제하고 새로 등록합니다. 계속할까요?')) return;
        const r = await run(async () => {
          for (const nr of newRegions) d.regions = await Store.saveRegion(nr);
          if (replace) { const res = await Store.replacePlayers(list); d.players = res.players; d.teams = res.teams; }
          else {
            const merged = list.map(p => { const ex = d.players.find(x => x.regionId === p.regionId && x.name === p.name); return ex ? { ...ex, gender: p.gender, avg: p.avg, isRep: p.isRep, events: p.events } : p; });
            d.players = await Store.savePlayers(merged);
          }
          return true;
        }, `${list.length}명 처리되었습니다.` + (newRegions.length ? ` (지역 ${newRegions.length}개 추가)` : ''));
        if (r) render(); return;
      }
      case 'save-info': {
        const groups = v('groups').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const [id, name, day, time] = l.split(',').map(x => (x || '').trim()); return { id: id || name, name: name || id, day: num(day) || '', time }; }).filter(g => g.id);
        if (!groups.length) return toast('조를 1개 이상 입력하세요.', true);
        const patch = { name: v('name'), hostRegionId: v('hostRegionId'), dates: [v('d1'), v('d2')], venue: v('venue'), laneFrom: num(v('laneFrom'), 1), lanes: num(v('lanes'), 20), perLane: num(v('perLane'), 4), groups, schedule: v('schedule') };
        const r = await run(async () => { d.settings = { ...d.settings, ...(await Store.saveSettings(patch)) }; applyRole(); return true; }, '저장되었습니다.'); if (r) render(); return;
      }
      case 'save-rules': {
        const patch = {
          handicap: { type: v('hType'), base: num(v('hBase'), 200), rate: v('hRate') === '' ? 1 : num(v('hRate'), 1), cap: v('hCap') === '' ? '' : num(v('hCap')), femaleBonus: num(v('hFemale')) },
          games: { individual: Math.max(1, num(v('gInd'), 3)), scotch: Math.max(1, num(v('gScotch'), 2)), baker: Math.max(1, num(v('gBaker'), 2)), team5: Math.max(1, num(v('gTeam5'), 1)) },
          basis: v('basis'), repCount: Math.max(1, num(v('repCount'), 3)),
          teamHandicap: { scotch: v('thScotch'), baker: v('thBaker'), team5: v('thTeam5') },
          points: { individual: nums('pInd'), reps: nums('pReps'), scotch: nums('pScotch'), baker: nums('pBaker'), team5: nums('pTeam5') }, countTeam5: chk('countTeam5')
        };
        const r = await run(async () => { d.settings = { ...d.settings, ...(await Store.saveSettings(patch)) }; return true; }, '저장되었습니다.'); if (r) render(); return;
      }
      case 'save-admin-pin': { if (!/^\d{4,6}$/.test(v('adminPin'))) return toast('PIN은 숫자 4~6자리여야 합니다.', true); const r = await run(() => Store.saveSettings({ adminPin: v('adminPin') }), '관리자 PIN이 변경되었습니다.'); if (r) f.reset(); return; }
      case 'set-api': Store.setApiUrl(v('url')); location.reload(); return;
    }
  }

  function onChange(e) {
    const el = e.target; const k = el.dataset.change; const d = state.data; const s = S();
    if (k === 'players-region') { state.playersRegion = el.value; return render(); }
    if (k === 'players-gender') { state.playersGender = el.value; return render(); }
    if (k === 'team-region') { state.teamRegion = el.value; return render(); }
    if (k === 'score-group') { flush(); state.scoreGroup = el.value; return render(); }
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
  function onInput(e) {
    const el = e.target;
    if (el.dataset.input === 'players-q') { state.playersQ = el.value; clearTimeout(state.qTimer); state.qTimer = setTimeout(() => { render(); const i = $('[data-input="players-q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
