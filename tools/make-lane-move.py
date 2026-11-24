"""테이블에 붙이는 레인 이동 안내문(A4 가로, 테이블당 1장) HTML 생성.
사용: python3 tools/make-lane-move.py [레인 수=16] [이동 테이블 수=2] > docs/lane-move.html
개인전은 1게임 후 오른쪽으로 두 테이블(4레인) 이동, 끝에서는 처음으로 돌아간다. 예: 1·2 → 5·6 → 9·10, 13·14 → 1·2."""
import sys
lanes = int(sys.argv[1]) if len(sys.argv) > 1 else 16
step = int(sys.argv[2]) if len(sys.argv) > 2 else 2
tables = lanes // 2
def lanes_of(t): return (2 * t - 1, 2 * t)
def nxt(t): return (t - 1 + step) % tables + 1
pages = []
for t in range(1, tables + 1):
    a, b = lanes_of(t); n = nxt(t); na, nb = lanes_of(n); n2 = nxt(n); n2a, n2b = lanes_of(n2)
    wrap = n < t
    pages.append(f'''
  <section class="page">
    <div class="top"><span class="tag">개인전 · 1게임 후 레인 이동</span><span class="tag right">{'처음 레인으로 돌아갑니다' if wrap else '오른쪽으로 이동'}</span></div>
    <div class="main">
      <div class="box now"><div class="lbl">지금 치는 레인</div><div class="num">{a}<i>·</i>{b}</div><div class="unit">레인</div></div>
      <div class="arrow {'wrap' if wrap else ''}"><svg viewBox="0 0 120 60" aria-hidden="true"><path d="M4 30h88" stroke="#FF5A2E" stroke-width="10" stroke-linecap="round"/><path d="M78 10l26 20-26 20" fill="none" stroke="#FF5A2E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="atxt">다음 게임</div></div>
      <div class="box next"><div class="lbl">다음 게임 레인</div><div class="num">{na}<i>·</i>{nb}</div><div class="unit">레인</div></div>
    </div>
    <div class="foot"><div class="path"><b>이 자리에서 시작한 분의 경로</b> {a}·{b} → {na}·{nb} → {n2a}·{n2b}레인</div><div class="rule">한 게임이 끝나면 {'맨 앞 레인으로 돌아갑니다' if wrap else '오른쪽으로 네 레인(두 테이블) 이동합니다'} · 점수표와 소지품을 챙겨 주세요</div></div>
  </section>''')
html = f'''<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>레인 이동 안내</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@500;700;900&display=swap" rel="stylesheet">
<style>
@page {{ size: A4 landscape; margin: 0; }}
* {{ box-sizing: border-box; }} body {{ margin: 0; background: #ddd; font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; color: #1E2537; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ width: 297mm; height: 210mm; background: #F5F2EA; margin: 10px auto; padding: 14mm 16mm 12mm; display: flex; flex-direction: column; page-break-after: always; position: relative; overflow: hidden; }}
.page:last-child {{ page-break-after: auto; }}
.top {{ display: flex; justify-content: space-between; align-items: center; }}
.tag {{ background: #1E2537; color: #fff; font-weight: 700; font-size: 17px; padding: 7px 16px; border-radius: 999px; letter-spacing: .5px; }}
.tag.right {{ background: #FF5A2E; }}
.main {{ flex: 1; display: grid; grid-template-columns: 1fr 150px 1fr; align-items: center; gap: 8mm; }}
.box {{ background: #fff; border-radius: 26px; text-align: center; padding: 10mm 6mm 9mm; border: 3px solid #E6E0D2; }}
.box.next {{ border-color: #FF5A2E; background: #FFF4EF; }}
.lbl {{ font-size: 22px; font-weight: 700; color: #5B5F6B; }} .box.next .lbl {{ color: #C2410C; }}
.num {{ font-family: 'Black Han Sans', 'Noto Sans KR', sans-serif; font-size: 150px; line-height: 1; margin-top: 4mm; letter-spacing: -2px; }}
.num i {{ font-style: normal; font-size: 70px; vertical-align: middle; margin: 0 6px; color: #9aa0ad; }} .box.next .num {{ color: #FF5A2E; }}
.unit {{ font-size: 28px; font-weight: 900; margin-top: 2mm; }}
.arrow {{ text-align: center; }} .arrow svg {{ width: 150px; height: 75px; }} .arrow.wrap svg {{ transform: none; }}
.atxt {{ font-size: 18px; font-weight: 700; color: #C2410C; margin-top: 2mm; }}
.foot {{ display: flex; justify-content: space-between; align-items: center; gap: 10mm; border-top: 2px solid #D9D3C4; padding-top: 5mm; }}
.path {{ font-size: 20px; font-weight: 700; }} .path b {{ display: block; font-size: 13px; color: #5B5F6B; font-weight: 700; margin-bottom: 1mm; }}
.rule {{ font-size: 14px; color: #5B5F6B; text-align: right; max-width: 110mm; line-height: 1.5; }}
@media print {{ body {{ background: #fff; }} .page {{ margin: 0; }} }}
</style></head><body>{''.join(pages)}</body></html>'''
sys.stdout.write(html)
