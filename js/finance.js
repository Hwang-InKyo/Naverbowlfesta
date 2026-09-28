/**
 * finance.js - 정산 · 입금 확인 (관리자 전용 화면)
 *
 *  데이터(state.finance, Store.loadFinance/saveFinance):
 *   fees        { individual, champ, club, clubDonation, team5, side, gameFee }  항목별 단가 (0 이면 정산서에서 생략)
 *   account     입금계좌 안내 문구
 *   cashDonations [{ id, name, amount }]       개인 현금 찬조
 *   goodsDonations [{ id, name, item }]        행운상 물품 찬조
 *   expenses    [{ id, category, label, amount }]  상품비·물품 등 지출 (게임비는 자동 계산)
 *   payments    { [regionId]: { form, formCounts, formIssues, paid, paidAt, confirmed, note } }
 *   pools       { champ: { basis, prizes[] }, side: { basis, prizes[] } }  내기 순위 기준(total|scratch)과 순위별 상금
 *  정산서의 참가비 수입은 등록된 명단(인원·지역 수)에 단가를 곱해 계산한다.
 *  챔프전·사이드(내기)는 정산서에 넣지 않고 '챔프전 · 사이드' 탭에서 판돈·상금·잔액을 따로 관리한다.
 *  (입금 확인의 계산 금액에는 신청서에 함께 내는 챔프전·사이드 참가비가 포함된다.)
 *  챔프전: 1조 참가자 중 신청자끼리 3게임 합산 순위. 사이드: 조별로 매 게임 신청자끼리 그 게임 점수 순위.
 */
const Finance = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 0) => { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : d; };
  const won = n => (Number(n) || 0).toLocaleString('ko-KR');
  const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const FEE_LABELS = { individual: '개인 참가비', champ: '챔프전', club: '클럽 참가비', clubDonation: '클럽 찬조금', team5: '5인조', side: '사이드', personalDonation: '개인 찬조' };

  /** 등록된 명단 기준 집계 */
  function stats(state) {
    const d = state.data; const s = d.settings || {}; const games = s.games || { individual: 3, scotch: 2, baker: 2 };
    const ev = (p, k) => !!(p.events && p.events[k]);
    const per = {};
    d.regions.forEach(r => { per[r.id] = { region: r, players: 0, female: 0, side: 0, champ: 0, reps: 0, scotch: 0, baker: 0 }; });
    d.players.forEach(p => { const x = per[p.regionId]; if (!x) return; x.players++; if (p.gender === 'F') x.female++; if (ev(p, 'side')) x.side++; if (ev(p, 'champ')) x.champ++; if (p.isRep) x.reps++; });
    d.teams.forEach(t => { const x = per[t.regionId]; if (!x) return; if (t.event === 'scotch') x.scotch++; if (t.event === 'baker') x.baker++; });
    const tot = Object.values(per).reduce((a, x) => { ['players', 'female', 'side', 'champ', 'reps', 'scotch', 'baker'].forEach(k => a[k] += x[k]); return a; }, { players: 0, female: 0, side: 0, champ: 0, reps: 0, scotch: 0, baker: 0, regions: d.regions.length });
    return { per, tot, games };
  }
  /** 한 지역이 내야 할 금액 (단가 × 명단) */
  function expectedFor(x, fees) {
    const lines = [];
    lines.push(['individual', x.players, fees.individual]);
    if (fees.champ && x.champ) lines.push(['champ', x.champ, fees.champ]);
    if (fees.side && x.side) lines.push(['side', x.side, fees.side]);
    if (fees.club) lines.push(['club', 1, fees.club]);
    if (fees.clubDonation) lines.push(['clubDonation', 1, fees.clubDonation]);
    if (fees.team5) lines.push(['team5', 1, fees.team5]);
    const items = lines.map(([k, q, u]) => ({ key: k, label: FEE_LABELS[k], qty: q, unit: u, amount: q * u }));
    return { items, total: items.reduce((a, i) => a + i.amount, 0) };
  }

  /** 신청서 참가비 내역과 명단 대조 → { counts, issues[] } */
  function checkSignupFees(p, finance) {
    const fees = (finance || Store.defaultFinance()).fees;
    const counts = { players: p.players.length, champ: p.players.filter(x => x.champ).length, side: p.players.filter(x => x.side).length };
    const issues = [];
    const f = p.fees;
    if (!f) return { counts, issues: ['신청서에서 참가비 내역을 찾지 못했습니다.'], total: null };
    const it = f.items || {};
    const qtyCheck = (key, actual, label) => { const i = it[key]; if (!i) return; if (i.qty && i.qty !== actual) issues.push(`${label} 인원: 신청서 ${i.qty}명, 명단 ${actual}명`); };
    qtyCheck('individual', counts.players, '개인전'); qtyCheck('champ', counts.champ, '챔프전'); qtyCheck('side', counts.side, '사이드');
    const unitCheck = (key, unit) => { const i = it[key]; if (!i || !unit) return; const u = i.unit || (i.qty ? i.amount / i.qty : 0); if (u && u !== unit) issues.push(`${FEE_LABELS[key]} 단가: 신청서 ${won(u)}원, 설정 ${won(unit)}원`); };
    unitCheck('individual', fees.individual); unitCheck('champ', fees.champ); unitCheck('side', fees.side); unitCheck('club', fees.club); unitCheck('clubDonation', fees.clubDonation);
    const sum = Object.values(it).reduce((a, i) => a + (i.amount || 0), 0);
    if (f.total != null && sum !== f.total) issues.push(`항목 합계 ${won(sum)}원 ≠ 신청서 총금액 ${won(f.total)}원`);
    if (!it.individual) issues.push('개인전 참가비 항목이 없습니다.');
    else if (it.individual.amount !== counts.players * fees.individual) issues.push(`개인전 참가비: 신청서 ${won(it.individual.amount)}원, 명단 기준 ${counts.players}명 × ${won(fees.individual)} = ${won(counts.players * fees.individual)}원`);
    return { counts, issues, total: f.total != null ? f.total : sum };
  }
  function uploadFeeHtml(p, finance) {
    const c = checkSignupFees(p, finance); const f = p.fees;
    const items = f ? Object.entries(f.items || {}).map(([k, i]) => `${FEE_LABELS[k] || k} ${i.qty ? i.qty + '×' : ''}${won(i.amount)}`).join(' · ') : '';
    return `<div class="fee-check ${c.issues.length ? 'bad' : 'ok'}"><b>참가비 내역</b> ${f ? `${items} · <b>총 ${won(c.total)}원</b>` : '없음'}
      ${c.issues.length ? `<div class="form-error small" style="text-align:left;margin-top:4px">확인 필요:<br>${c.issues.map(esc).join('<br>')}</div>` : '<span class="small" style="color:var(--green,#2e7d32)"> · 명단과 일치</span>'}</div>`;
  }

  // ===== 챔프전 · 사이드 (내기) =====
  const cmpBy = keys => Ranking.makeComparator(keys);
  /** 동점자는 해당 순위 구간의 상금을 균등하게 나눈다 */
  function assignPrizes(rows, prizes) {
    prizes = (prizes || []).map(n => num(n));
    let i = 0;
    while (i < rows.length) {
      let j = i; while (j + 1 < rows.length && rows[j + 1].rank === rows[i].rank) j++;
      const k = j - i + 1; let sum = 0; for (let r = rows[i].rank; r < rows[i].rank + k; r++) sum += prizes[r - 1] || 0;
      const each = Math.round(sum / k); for (let t = i; t <= j; t++) rows[t].prize = each;
      i = j + 1;
    }
    return rows;
  }
  function champRanking(state) {
    const d = state.data; const s = Ranking.mergeSettings(d.settings); const cfg = state.finance.pools.champ;
    const firstGroup = (s.groups[0] || {}).id;
    const all = Ranking.playerRows(d.players.filter(p => p.events && p.events.champ), d.regions, s);
    const outside = all.filter(r => r.group !== firstGroup).map(r => r.name);
    const rows = all.map(r => ({ ...r, poolScore: cfg.basis === 'scratch' ? r.scratch : r.total }));
    const played = rows.filter(r => r.gamesPlayed > 0); const waiting = rows.filter(r => !r.gamesPlayed);
    Ranking.assignRanks(played, cmpBy([r => r.poolScore, r => r.scratch, r => r.high, r => r.low, r => -(num(r.birthYear) || 9999)]));
    assignPrizes(played, cfg.prizes);
    return { rows: played.concat(waiting), outside, participants: all.length, firstGroup, prizeTotal: played.reduce((a, r) => a + (r.prize || 0), 0) };
  }
  /** 특정 조·게임의 사이드 순위 */
  function sideGame(state, groupId, gi) {
    const d = state.data; const s = Ranking.mergeSettings(d.settings); const cfg = state.finance.pools.side;
    const inc = !!s.scoresIncludeHandicap.individual;
    const rows = d.players.filter(p => p.events && p.events.side && (p.group || '') === groupId).map(p => {
      const raw = p.games && p.games[gi]; if (raw == null || raw === '') return null;
      const hcp = num(p.handicap); const scratch = inc ? num(raw) - hcp : num(raw); const total = scratch + hcp;
      return { playerId: p.id, name: p.name, regionId: p.regionId, regionName: (d.regions.find(r => r.id === p.regionId) || {}).name || '', scratch, total, handicap: hcp, birthYear: p.birthYear, poolScore: cfg.basis === 'scratch' ? scratch : total };
    }).filter(Boolean);
    Ranking.assignRanks(rows, cmpBy([r => r.poolScore, r => r.scratch, r => -(num(r.birthYear) || 9999)]));
    return assignPrizes(rows, cfg.prizes);
  }
  function sideSummary(state) {
    const d = state.data; const s = Ranking.mergeSettings(d.settings); const n = num(s.games.individual, 3);
    const groups = s.groups.map(g => {
      const participants = d.players.filter(p => p.events && p.events.side && (p.group || '') === g.id).length;
      const games = Array.from({ length: n }, (_, gi) => sideGame(state, g.id, gi));
      const paid = games.reduce((a, rows) => a + rows.reduce((b, r) => b + (r.prize || 0), 0), 0);
      return { group: g, participants, games, paid, played: games.filter(rows => rows.length).length };
    });
    return { groups, n, participants: groups.reduce((a, g) => a + g.participants, 0), paid: groups.reduce((a, g) => a + g.paid, 0) };
  }
  function renderPools(state) {
    const fin = state.finance; const fees = fin.fees; const s = Ranking.mergeSettings(state.data.settings); const n = num(s.games.individual, 3);
    const ch = champRanking(state); const sd = sideSummary(state);
    const basisSel = (name, v) => `<select name="${name}"><option value="total" ${v === 'total' ? 'selected' : ''}>총점 (핸디 포함)</option><option value="scratch" ${v === 'scratch' ? 'selected' : ''}>총핀 (핸디 제외)</option></select>`;
    const gid = state.finSideGroup || (s.groups[0] || {}).id; const sg = sd.groups.find(g => g.group.id === gid) || sd.groups[0];
    const chPool = ch.participants * fees.champ; const sdPool = sd.participants * fees.side;
    let html = `<div class="card"><h2>내기 요약 <span class="muted" style="font-weight:500;color:var(--text-3)">정산서와 별도로 관리</span></h2>
      <div class="table-scroll"><table class="tbl"><thead><tr><th class="left">구분</th><th>신청</th><th>단가</th><th>판돈</th><th>상금 지급</th><th>잔액</th></tr></thead><tbody>
        <tr><td class="left"><b>챔프전</b> <small class="muted">${esc((s.groups[0] || {}).name || '1조')} · 3게임 합산</small></td><td>${ch.participants}명</td><td class="right">${won(fees.champ)}</td><td class="right">${won(chPool)}</td><td class="right">${won(ch.prizeTotal)}</td><td class="right ${chPool - ch.prizeTotal < 0 ? 'neg' : ''}">${won(chPool - ch.prizeTotal)}</td></tr>
        ${sd.groups.map(g => `<tr><td class="left"><b>사이드 ${esc(g.group.name)}</b> <small class="muted">게임별 · ${g.played}/${n}게임 집계</small></td><td>${g.participants}명</td><td class="right">${won(fees.side)}</td><td class="right">${won(g.participants * fees.side)}</td><td class="right">${won(g.paid)}</td><td class="right ${g.participants * fees.side - g.paid < 0 ? 'neg' : ''}">${won(g.participants * fees.side - g.paid)}</td></tr>`).join('')}
        <tr class="strong"><td class="left"><b>합계</b></td><td>${ch.participants + sd.participants}명</td><td></td><td class="right">${won(chPool + sdPool)}</td><td class="right">${won(ch.prizeTotal + sd.paid)}</td><td class="right ${chPool + sdPool - ch.prizeTotal - sd.paid < 0 ? 'neg' : ''}">${won(chPool + sdPool - ch.prizeTotal - sd.paid)}</td></tr>
      </tbody></table></div></div>
    <div class="card"><h2>내기 설정</h2><form data-form="fin-pools"><div class="form-row">
        <div class="form-group"><label>챔프전 순위 기준</label>${basisSel('champBasis', fin.pools.champ.basis)}</div>
        <div class="form-group" style="flex:2"><label>챔프전 상금 (1위부터, 쉼표로 구분)</label><input type="text" name="champPrizes" value="${esc(fin.pools.champ.prizes.join(', '))}" placeholder="예: 50000, 30000, 20000"></div>
        <div class="form-group"><label>사이드 순위 기준</label>${basisSel('sideBasis', fin.pools.side.basis)}</div>
        <div class="form-group" style="flex:2"><label>사이드 상금 (게임마다 1위부터)</label><input type="text" name="sidePrizes" value="${esc(fin.pools.side.prizes.join(', '))}" placeholder="예: 20000, 10000"></div>
        <div class="form-group" style="flex:0;align-self:flex-end"><button class="btn btn-small btn-primary" type="submit">저장</button></div></div>
      <p class="muted small" style="margin:6px 0 0">참가비 단가(챔프전 ${won(fees.champ)}원 · 사이드 ${won(fees.side)}원)는 "항목 · 단가" 탭에서. 동점자는 해당 순위 구간의 상금을 나눠 받습니다.</p></form></div>`;
    // 챔프전
    html += `<div class="card"><h2>챔프전 <span class="muted" style="font-weight:500;color:var(--text-3)">${esc((s.groups[0] || {}).name || '1조')} 신청자 ${ch.participants}명 · 3게임 합산 · 판돈 ${won(ch.participants * fees.champ)}원 · 상금 지급 ${won(ch.prizeTotal)}원</span>
        <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#champ-table" data-name="챔프전">CSV</button></span></h2>
      ${ch.outside.length ? `<p class="form-error small" style="text-align:left">${esc((s.groups[0] || {}).name || '1조')}가 아닌 챔프전 신청자: ${ch.outside.map(esc).join(', ')} (챔프전은 ${esc((s.groups[0] || {}).name || '1조')}만 유효)</p>` : ''}
      <div class="table-scroll"><table class="tbl" id="champ-table"><thead><tr><th>순위</th><th class="left">이름</th><th class="left">지역</th>${Array.from({ length: n }, (_, i) => `<th>G${i + 1}</th>`).join('')}<th>총핀</th><th>총점</th><th>상금</th></tr></thead><tbody>
        ${ch.rows.map(r => `<tr class="${r.prize ? 'paid' : ''}"><td>${r.rank || '-'}</td><td class="left"><b>${esc(r.name)}</b></td><td class="left">${esc(r.regionName)}</td>${r.games.slice(0, n).map(g => `<td>${g == null ? '-' : g}</td>`).join('')}<td>${r.scratch}</td><td class="strong">${r.gamesPlayed ? r.total : '-'}</td><td class="right">${r.prize ? won(r.prize) : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">챔프전 신청자가 없습니다. 신청서의 챔프전 표시 또는 선수 수정에서 체크하세요.</td></tr>'}
      </tbody></table></div></div>`;
    // 사이드
    html += `<div class="card"><h2><span class="row">사이드 <span class="muted" style="font-weight:500;color:var(--text-3)">신청자 ${sd.participants}명 · 판돈 ${won(sd.participants * fees.side)}원 · 상금 지급 ${won(sd.paid)}원</span></span>
        <span class="row"><select data-change="fin-side-group" style="width:auto">${s.groups.map(g => `<option value="${esc(g.id)}" ${g.id === (sg ? sg.group.id : '') ? 'selected' : ''}>${esc(g.name)} (${(sd.groups.find(x => x.group.id === g.id) || {}).participants || 0}명)</option>`).join('')}</select></span></h2>
      ${sg ? `<p class="muted small mb">${esc(sg.group.name)} 사이드 신청 ${sg.participants}명 · 판돈 ${won(sg.participants * fees.side)}원 · 게임당 상금 ${won(fin.pools.side.prizes.reduce((a, b) => a + num(b), 0))}원 × ${n}게임 · 지급 ${won(sg.paid)}원</p>
      <div class="side-grid">${sg.games.map((rows, gi) => `<div><h3>G${gi + 1}</h3><table class="tbl"><thead><tr><th>순위</th><th class="left">이름</th><th>점수</th><th>상금</th></tr></thead><tbody>
        ${rows.map(r => `<tr class="${r.prize ? 'paid' : ''}"><td>${r.rank}</td><td class="left">${esc(r.name)} <small class="muted">${esc(r.regionName)}</small></td><td>${r.poolScore}${fin.pools.side.basis === 'total' && r.handicap ? ` <small class="muted">(${r.scratch}+${r.handicap})</small>` : ''}</td><td class="right">${r.prize ? won(r.prize) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">점수 없음</td></tr>'}
      </tbody></table></div>`).join('')}</div>` : '<p class="empty">조가 설정되지 않았습니다.</p>'}</div>`;
    return html;
  }

  /** 사이드바의 '챔프전·사이드' 탭 (정산과 별도 관리) */
  function renderPoolsTab(state) {
    if (!state.finance) return '<div class="card"><p class="empty">정산 데이터를 불러오지 못했습니다. 다시 로그인해 보세요.</p></div>';
    return renderPools(state);
  }

  // ===== 화면 =====
  function render(state) {
    if (!state.finance) return '<div class="card"><p class="empty">정산 데이터를 불러오지 못했습니다. 다시 로그인해 보세요.</p></div>';
    const sub = state.finSub || 'payments';
    const tabs = [['payments', '입금 확인'], ['statement', '정산서'], ['items', '항목 · 단가']];
    let html = `<div class="subtabs">${tabs.map(([k, l]) => `<button class="subtab ${sub === k ? 'active' : ''}" data-action="fin-sub" data-sub="${k}">${l}</button>`).join('')}</div>`;
    if (sub === 'payments') html += renderPayments(state);
    else if (sub === 'statement') html += renderStatement(state);
    else html += renderItems(state);
    return html;
  }

  function renderPayments(state) {
    const fin = state.finance; const { per, tot } = stats(state); const fees = fin.fees;
    const rows = Object.values(per).sort((a, b) => a.region.name.localeCompare(b.region.name, 'ko'));
    let confirmed = 0, paidSum = 0, expectedSum = 0;
    const trs = rows.map(x => {
      const pay = fin.payments[x.region.id] || {}; const exp = expectedFor(x, fees);
      const donation = pay.form && pay.form.items && pay.form.items.personalDonation ? num(pay.form.items.personalDonation.amount) : 0; // 신청서의 개인 찬조는 계산 금액에 더한다
      if (donation) { exp.items.push({ key: 'personalDonation', label: '개인 찬조', qty: 1, unit: donation, amount: donation }); exp.total += donation; }
      expectedSum += exp.total;
      const formTotal = pay.form ? (pay.form.total != null ? pay.form.total : Object.values(pay.form.items || {}).reduce((a, i) => a + (i.amount || 0), 0)) : null;
      const diff = formTotal != null ? formTotal - exp.total : null;
      const paid = num(pay.paid); paidSum += paid; if (pay.confirmed) confirmed++;
      const issues = (pay.formIssues || []).concat(formTotal != null && diff ? [`신청서 총금액과 계산 금액 차이 ${won(diff)}원`] : []);
      const tip = exp.items.map(i => `${i.label} ${i.qty}×${won(i.unit)}=${won(i.amount)}`).join('\n');
      return `<tr class="${pay.confirmed ? 'paid' : ''}"><td class="left"><b>${esc(x.region.name)}</b>${x.region.note ? `<br><small class="muted">${esc(x.region.note)}</small>` : ''}</td>
        <td>${x.players}</td><td>${x.side || '-'}</td><td>${x.champ || '-'}</td><td>${x.scotch || '-'}</td><td>${x.baker || '-'}</td>
        <td class="right">${formTotal != null ? won(formTotal) : '<span class="muted">-</span>'}</td>
        <td class="right" title="${esc(tip)}">${won(exp.total)}</td>
        <td class="right ${diff ? 'neg' : ''}">${diff == null ? '-' : diff === 0 ? '<span class="ok">일치</span>' : (diff > 0 ? '+' : '') + won(diff)}</td>
        <td><input type="number" class="sm" style="width:96px" data-change="fin-pay" data-region="${esc(x.region.id)}" data-field="paid" value="${pay.paid != null ? esc(pay.paid) : ''}" placeholder="입금액"></td>
        <td><input type="date" class="sm" style="width:130px" data-change="fin-pay" data-region="${esc(x.region.id)}" data-field="paidAt" value="${esc(pay.paidAt || '')}"></td>
        <td><label class="checkbox-item"><input type="checkbox" data-change="fin-pay" data-region="${esc(x.region.id)}" data-field="confirmed" ${pay.confirmed ? 'checked' : ''}> 확인</label></td>
        <td><input type="text" class="sm" style="width:120px" data-change="fin-pay" data-region="${esc(x.region.id)}" data-field="note" value="${esc(pay.note || '')}" placeholder="비고"></td>
        <td class="left small">${issues.length ? `<span class="form-error" style="display:inline">${issues.map(esc).join('<br>')}</span>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="14" class="empty">등록된 지역이 없습니다. 선수 탭에서 신청서를 올리면 여기에 나타납니다.</td></tr>';
    return `<div class="card"><h2>지역별 입금 확인 <span class="muted" style="font-weight:500;color:var(--text-3)">확인 ${confirmed}/${rows.length} · 입금 합계 ${won(paidSum)}원 / 계산 ${won(expectedSum)}원</span>
        <span class="h-actions no-print"><button class="btn btn-xs btn-outline" data-action="csv" data-sel="#fin-pay-table" data-name="입금확인">CSV</button></span></h2>
      <p class="muted small mb">신청서 금액 = 업로드한 신청서의 참가비 내역 총액. 계산 금액 = 등록된 명단 × 항목·단가(개인 ${won(fees.individual)}${fees.champ ? ` · 챔프전 ${won(fees.champ)}` : ''}${fees.side ? ` · 사이드 ${won(fees.side)}` : ''} · 클럽 ${won(fees.club)} · 찬조금 ${won(fees.clubDonation)}${fees.team5 ? ` · 5인조 ${won(fees.team5)}` : ''}). 입금액·입금일·확인은 입력 즉시 저장됩니다.</p>
      <div class="table-scroll"><table class="tbl" id="fin-pay-table"><thead><tr><th class="left">지역</th><th>인원</th><th>사이드</th><th>챔프전</th><th>스카치</th><th>베이커</th><th>신청서 금액</th><th>계산 금액</th><th>차이</th><th>입금액</th><th>입금일</th><th>확인</th><th>비고</th><th class="left">확인 사항</th></tr></thead><tbody>${trs}</tbody></table></div>
      ${fin.account ? `<p class="small muted mt">입금계좌: ${esc(fin.account)}</p>` : ''}</div>`;
  }

  function statement(state) {
    const fin = state.finance; const { tot, games } = stats(state); const fees = fin.fees;
    const income = [];
    income.push({ cat: '참가비', label: '개인 참가비', qty: tot.players, unit: fees.individual });
    if (fees.club) income.push({ cat: '클럽비용', label: '클럽별 비용', qty: tot.regions, unit: fees.club });
    if (fees.clubDonation) income.push({ cat: '클럽찬조금', label: '클럽별 찬조금', qty: tot.regions, unit: fees.clubDonation });
    if (fees.team5) income.push({ cat: '5인조', label: '5인조', qty: tot.regions, unit: fees.team5 });
    income.forEach(i => { i.amount = i.qty * i.unit; });
    const feeTotal = income.reduce((a, i) => a + i.amount, 0);
    const cashTotal = fin.cashDonations.reduce((a, x) => a + num(x.amount), 0);
    const gameLines = [
      { label: '개인전', qty: tot.players, games: games.individual }, { label: '스카치', qty: tot.scotch, games: games.scotch }, { label: '베이커', qty: tot.baker, games: games.baker }
    ].map(g => ({ ...g, unit: fees.gameFee, amount: g.qty * g.games * fees.gameFee }));
    const gameTotal = gameLines.reduce((a, g) => a + g.amount, 0);
    const expTotal = fin.expenses.reduce((a, x) => a + num(x.amount), 0);
    return { income, feeTotal, cashTotal, gameLines, gameTotal, expTotal, balance: feeTotal + cashTotal - gameTotal - expTotal };
  }

  function renderStatement(state) {
    const fin = state.finance; const st = statement(state); const s = state.data.settings || {};
    const title = `${esc(s.name || '전국대회')} 정산표`;
    const tr = cells => `<tr>${cells.map(c => `<td class="${c[1] || ''}">${c[0]}</td>`).join('')}</tr>`;
    return `<div class="card no-print" style="margin-bottom:12px"><div class="row between"><p class="muted small" style="margin:0">참가비·게임비는 등록된 명단과 항목·단가로 자동 계산됩니다. 찬조·상품비는 "항목 · 단가" 탭에서 입력하세요. 챔프전·사이드(내기) 참가비와 상금은 정산서에 넣지 않고 사이드바의 "챔프전·사이드" 탭에서 따로 관리합니다.</p><div class="row"><button class="btn btn-small btn-outline" data-action="csv" data-sel="#stmt-income" data-name="정산_수입">수입 CSV</button><button class="btn btn-small btn-outline" data-action="csv" data-sel="#stmt-expense" data-name="정산_지출">지출 CSV</button><button class="btn btn-small btn-primary" data-action="print">인쇄</button></div></div></div>
    <div class="statement">
      <h1>${title}</h1>
      <table class="stmt" id="stmt-income"><thead><tr><th colspan="5" class="sec income">수 입 내 역</th></tr><tr><th>구분</th><th>항목</th><th>인원/수량</th><th>단가</th><th>합계</th></tr></thead><tbody>
        ${st.income.map(i => tr([[esc(i.cat)], [esc(i.label)], [i.qty, 'num blue'], [won(i.unit), 'num blue'], [won(i.amount), 'num']])).join('')}
        <tr class="sub"><td colspan="4">참가비용 소계</td><td class="num">${won(st.feeTotal)}</td></tr>
        <tr><th colspan="5" class="sec income">개인 현금찬조</th></tr><tr><th colspan="2">이름</th><th colspan="3">찬조 금액</th></tr>
        ${fin.cashDonations.map(x => `<tr><td colspan="2">${esc(x.name)}</td><td colspan="3" class="num blue">${won(x.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">없음</td></tr>'}
        <tr class="sub"><td colspan="4">찬조금 합계</td><td class="num">${won(st.cashTotal)}</td></tr>
        <tr><th colspan="5" class="sec income">행운상 물품 찬조</th></tr><tr><th colspan="2">이름</th><th colspan="3">찬조 물품</th></tr>
        ${fin.goodsDonations.map(x => `<tr><td colspan="2">${esc(x.name)}</td><td colspan="3" class="blue">${esc(x.item)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">없음</td></tr>'}
      </tbody></table>
      <table class="stmt" id="stmt-expense"><thead><tr><th colspan="5" class="sec expense">지 출 내 역</th></tr><tr><th colspan="5" class="sec sub-expense">게임비 (게임당 ${won(fin.fees.gameFee)}원)</th></tr><tr><th>구분</th><th>인원(팀)수</th><th>게임수</th><th>단가</th><th>합계</th></tr></thead><tbody>
        ${st.gameLines.map(g => tr([[esc(g.label)], [g.qty, 'num blue'], [g.games, 'num blue'], [won(g.unit), 'num blue'], [won(g.amount), 'num']])).join('')}
        <tr class="sub"><td colspan="4">게임비 소계</td><td class="num">${won(st.gameTotal)}</td></tr>
        <tr><th colspan="5" class="sec sub-expense">상품비 · 물품</th></tr><tr><th>항목</th><th colspan="3">내용</th><th>합계</th></tr>
        ${fin.expenses.map(x => `<tr><td>${esc(x.category)}</td><td colspan="3">${esc(x.label)}</td><td class="num">${won(x.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">없음</td></tr>'}
        <tr class="sub"><td colspan="4">소계</td><td class="num">${won(st.expTotal)}</td></tr>
      </tbody></table>
      <table class="stmt final"><thead><tr><th colspan="5" class="sec total">최 종 요 약</th></tr><tr><th>참가비용</th><th>현금찬조</th><th>게임비</th><th>상품비</th><th>최종 잔액</th></tr></thead>
        <tbody><tr><td class="num">${won(st.feeTotal)}</td><td class="num">${won(st.cashTotal)}</td><td class="num red">${won(st.gameTotal)}</td><td class="num red">${won(st.expTotal)}</td><td class="num ${st.balance >= 0 ? 'bal' : 'neg'}">${won(st.balance)}</td></tr></tbody></table>
    </div>`;
  }

  function renderItems(state) {
    const fin = state.finance; const fees = fin.fees;
    const field = (name, label, val, hint) => `<div class="form-group"><label>${label}${hint ? ` <span class="muted" style="font-weight:400">${hint}</span>` : ''}</label><input type="number" name="${name}" value="${esc(val)}"></div>`;
    const lines = (kind, title, cols, rows, rowHtml) => `<div class="card"><h2>${title}</h2>
      <form data-form="fin-line" data-kind="${kind}" class="form-row" style="align-items:flex-end">${cols.map(c => `<div class="form-group"><label>${c[1]}</label><input type="${c[2] || 'text'}" name="${c[0]}" ${c[3] ? 'required' : ''}></div>`).join('')}<div class="form-group" style="flex:0"><button class="btn btn-small btn-primary" type="submit">추가</button></div></form>
      <div class="table-scroll mt"><table class="tbl"><thead><tr>${cols.map(c => `<th class="left">${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map(x => `<tr>${rowHtml(x)}<td class="nowrap"><button class="btn btn-xs btn-danger" data-action="fin-action" data-do="del-line" data-kind="${kind}" data-id="${esc(x.id)}">삭제</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="empty">없음</td></tr>`}
      </tbody></table></div></div>`;
    return `<div class="card"><h2>항목 · 단가</h2><p class="muted small mb">0을 넣으면 그 항목은 정산서와 계산 금액에서 빠집니다(예: 5인조 폐지 → 0). 신청서 업로드 시 이 단가로 참가비 내역을 대조합니다.</p>
      <form data-form="fin-fees">
        <div class="form-row">${field('individual', '개인 참가비', fees.individual, '(1인)')}${field('champ', '챔프전', fees.champ, '(1인)')}${field('side', '사이드', fees.side, '(1인)')}</div>
        <div class="form-row">${field('club', '클럽 참가비', fees.club, '(클럽당)')}${field('clubDonation', '클럽 찬조금', fees.clubDonation, '(클럽당)')}${field('team5', '5인조', fees.team5, '(클럽당)')}</div>
        <div class="form-row">${field('gameFee', '게임비', fees.gameFee, '(1게임, 지출)')}<div class="form-group" style="flex:2"><label>입금계좌 안내</label><input type="text" name="account" value="${esc(fin.account || '')}" placeholder="예: 국민은행 000000-00-000000 (예금주 홍길동)"></div></div>
        <button class="btn btn-small btn-primary" type="submit">저장</button></form></div>
      ${lines('cash', '개인 현금 찬조', [['name', '이름', 'text', true], ['amount', '금액', 'number', true]], fin.cashDonations, x => `<td class="left">${esc(x.name)}</td><td class="left">${won(x.amount)}</td>`)}
      ${lines('goods', '행운상 물품 찬조', [['name', '이름', 'text', true], ['item', '물품', 'text', true]], fin.goodsDonations, x => `<td class="left">${esc(x.name)}</td><td class="left">${esc(x.item)}</td>`)}
      ${lines('expense', '지출 (상품비 · 물품 등, 게임비 제외)', [['category', '항목 (시상/음식/행운상/물품/레인)', 'text', true], ['label', '내용', 'text', false], ['amount', '금액', 'number', true]], fin.expenses, x => `<td class="left">${esc(x.category)}</td><td class="left">${esc(x.label)}</td><td class="left">${won(x.amount)}</td>`)}`;
  }

  // ===== 이벤트 =====
  async function onPaymentChange(el, state, ctx) {
    const fin = state.finance; const id = el.dataset.region; const field = el.dataset.field;
    const pay = fin.payments[id] || {};
    const value = field === 'confirmed' ? el.checked : field === 'paid' ? (el.value === '' ? null : num(el.value)) : el.value;
    fin.payments[id] = { ...pay, [field]: value, ...(field === 'confirmed' && el.checked ? { confirmedAt: new Date().toISOString() } : {}) };
    try { state.finance = await ctx.save(fin); if (field === 'confirmed') ctx.toast(el.checked ? '입금 확인 완료로 표시했습니다.' : '확인을 해제했습니다.'); }
    catch (e) { ctx.toast('저장 실패: ' + e.message, true); }
    const tr = el.closest('tr'); if (tr) tr.classList.toggle('paid', !!(state.finance.payments[id] || {}).confirmed);
  }
  async function onFeesSubmit(f, state, ctx) {
    const fd = new FormData(f); const fin = state.finance;
    ['individual', 'champ', 'side', 'club', 'clubDonation', 'team5', 'gameFee'].forEach(k => { fin.fees[k] = num(fd.get(k)); });
    fin.account = String(fd.get('account') || '').trim();
    const r = await ctx.run(async () => { state.finance = await ctx.save(fin); return true; }, '항목·단가를 저장했습니다.');
    return !!r;
  }
  async function onPoolsSubmit(f, state, ctx) {
    const fd = new FormData(f); const fin = state.finance;
    const list = v => String(v || '').split(/[,\s]+/).map(x => num(x)).filter(x => x > 0);
    fin.pools.champ = { basis: fd.get('champBasis') === 'scratch' ? 'scratch' : 'total', prizes: list(fd.get('champPrizes')) };
    fin.pools.side = { basis: fd.get('sideBasis') === 'scratch' ? 'scratch' : 'total', prizes: list(fd.get('sidePrizes')) };
    const r = await ctx.run(async () => { state.finance = await ctx.save(fin); return true; }, '내기 설정을 저장했습니다.');
    return !!r;
  }
  async function onLineSubmit(f, state, ctx) {
    const fd = new FormData(f); const fin = state.finance; const kind = f.dataset.kind;
    const g = k => String(fd.get(k) || '').trim();
    if (kind === 'cash') fin.cashDonations.push({ id: uid('c'), name: g('name'), amount: num(g('amount')) });
    else if (kind === 'goods') fin.goodsDonations.push({ id: uid('g'), name: g('name'), item: g('item') });
    else fin.expenses.push({ id: uid('e'), category: g('category'), label: g('label'), amount: num(g('amount')) });
    const r = await ctx.run(async () => { state.finance = await ctx.save(fin); return true; }, '추가했습니다.');
    return !!r;
  }
  async function onAction(el, state, ctx) {
    const fin = state.finance;
    if (el.dataset.do === 'del-line') {
      const kind = el.dataset.kind; const id = el.dataset.id;
      const key = kind === 'cash' ? 'cashDonations' : kind === 'goods' ? 'goodsDonations' : 'expenses';
      fin[key] = fin[key].filter(x => x.id !== id);
      await ctx.run(async () => { state.finance = await ctx.save(fin); return true; }, '삭제했습니다.');
      return true;
    }
    return false;
  }

  return { render, renderPoolsTab, stats, expectedFor, statement, champRanking, sideGame, sideSummary, assignPrizes, checkSignupFees, uploadFeeHtml, onPaymentChange, onFeesSubmit, onPoolsSubmit, onLineSubmit, onAction, FEE_LABELS };
})();
if (typeof module === 'object' && module.exports) module.exports = Finance;
