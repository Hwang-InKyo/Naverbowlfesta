"""참가 신청서 양식(docs/signup-template.xlsx) 생성.  python3 tools/make-signup-template.py
제45회 신청서와 같은 틀(A~O열, A4 세로 1장): 1조·2조 가로 블록, 3조는 1조 아래, 오른쪽 아래에 참가비 내역(수식),
그 아래 3인조/스카치/베이커 세로 섹션. 수식·라벨 칸은 시트 보호로 잠그고 노란 입력 칸만 열어 둔다.
js/signup.js 의 블록 파서가 그대로 읽는다."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.properties import PageSetupProperties

FONT = '맑은 고딕'
yellow = PatternFill('solid', fgColor='FFF2CC'); navy = PatternFill('solid', fgColor='1E2537'); grey = PatternFill('solid', fgColor='F2F2F2'); gold = PatternFill('solid', fgColor='FFFF00'); dim = PatternFill('solid', fgColor='E7E6E6')
thin = Side(style='thin', color='999999'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal='center', vertical='center'); left = Alignment(horizontal='left', vertical='center'); right = Alignment(horizontal='right', vertical='center')
UNLOCKED = Protection(locked=False)
G12_ROWS = 16   # 1조·2조 행 수 (6~21)
G3_ROWS = 12    # 3조 행 수 (23~34)
TEAMS = 5
FEES = [('개인전 참가비', 35000), ('챔프전 참가비', 10000), ('사이드 참가비', 10000), ('클럽 참가비', 110000), ('클럽 찬조금', 50000)]

def f(size=9, bold=False, color='000000'): return Font(name=FONT, size=size, bold=bold, color=color)
def hcell(ws, r, c, v, fill=navy, color='FFFFFF', size=9):
    x = ws.cell(row=r, column=c)
    if v not in ('', None): x.value = v
    x.font = f(size, True, color); x.fill = fill; x.alignment = center; x.border = box; return x
def icell(ws, r, c, v=None, align=center, fmt=None):
    x = ws.cell(row=r, column=c, value=v); x.font = f(); x.fill = yellow; x.border = box; x.alignment = align; x.protection = UNLOCKED
    if fmt: x.number_format = fmt
    return x
def bordered(ws, r, c1, c2):
    for c in range(c1, c2 + 1):
        x = ws.cell(row=r, column=c); x.border = box
        if x.font.name != FONT: x.font = f()

def build(ws, example):
    ws.sheet_view.showGridLines = False
    widths = {'A': 7, 'B': 4.5, 'C': 9.5, 'D': 4.5, 'E': 5.5, 'F': 7.5, 'G': 5.5, 'H': 6, 'I': 8, 'J': 9.5, 'K': 4.5, 'L': 7, 'M': 7.5, 'N': 8.5, 'O': 8}
    for k, v in widths.items(): ws.column_dimensions[k].width = v
    for r in range(1, 70): ws.row_dimensions[r].height = 15
    # 제목 / 클럽·지역·연락처
    ws.merge_cells('A1:O1'); t = ws.cell(row=1, column=1, value='제46회 네이버 볼링 동호회 서울 전국대회 참가 신청서'); t.font = f(14, True); t.alignment = center; ws.row_dimensions[1].height = 26
    ws.merge_cells('A2:O2'); n = ws.cell(row=2, column=1, value='노란 칸만 입력 · 대표/팀 명단에는 개인전 명단과 똑같은 이름 · 챔프전은 1조만 · 사이드·챔프전 참가는 O 표시 · 수량·금액은 자동 계산')
    n.font = f(8, color='595959'); n.alignment = center
    ws.merge_cells('A3:B3'); hcell(ws, 3, 1, '클럽명', grey, '000000'); ws.merge_cells('C3:F3'); icell(ws, 3, 3, '드림존' if example else None, left, '@'); bordered(ws, 3, 4, 6)
    hcell(ws, 3, 7, '지역명', grey, '000000'); ws.merge_cells('H3:I3'); icell(ws, 3, 8, '청주' if example else None, left, '@'); bordered(ws, 3, 9, 9)
    hcell(ws, 3, 10, '연락처', grey, '000000'); ws.merge_cells('K3:O3'); icell(ws, 3, 11, '010-0000-0000 (총무 홍길동)' if example else None, left, '@'); bordered(ws, 3, 12, 15)
    # 개인전 블록: B 순번 | C~I 1조 (성명 성별 핸디 시니어핸디 사이드 챔프전 비고) | J~O 2조 (성명 성별 핸디 시니어핸디 사이드 비고)
    ws.merge_cells('A4:A34'); a = hcell(ws, 4, 1, '개인전', grey, '000000', 10); a.alignment = Alignment(horizontal='center', vertical='center', text_rotation=255)
    hcell(ws, 4, 2, '순번', grey, '000000')
    ws.merge_cells('C4:I4'); hcell(ws, 4, 3, '1조', grey, 'FF5A2E', 10); bordered(ws, 4, 4, 9)
    ws.merge_cells('J4:O4'); hcell(ws, 4, 10, '2조', grey, 'FF5A2E', 10); bordered(ws, 4, 11, 15)
    h1 = ['성명', '성별', '핸디', '시니어핸디', '사이드', '챔프전', '비고']; h2 = ['성명', '성별', '핸디', '시니어핸디', '사이드', '비고']
    hcell(ws, 5, 2, '', grey)
    for i, h in enumerate(h1): hcell(ws, 5, 3 + i, h)
    for i, h in enumerate(h2): hcell(ws, 5, 10 + i, h)
    first, last = 6, 6 + G12_ROWS - 1
    s1 = [('홍길동', '남', None, None, 'O', 'O', None), ('김영희', '여', 15, None, 'X', None, None), ('박철수', '남', None, 3, 'O', 'O', '시니어 63세')]
    s2 = [('이순자', '여', 15, 5, 'O', '시니어 66세'), ('최민수', '남', -7, None, 'X', '프로 (게임당 -7)')]
    s3 = [('정미라', '여', 15, None, 'O', None, None), ('강동원', '남', None, None, 'O', None, None)]
    def block_rows(r0, r1, c0, heads, sample, numcol=True):
        for r in range(r0, r1 + 1):
            if numcol: no = ws.cell(row=r, column=2, value=r - r0 + 1); no.font = f(9, color='808080'); no.border = box; no.alignment = center
            for i in range(len(heads)):
                is_text = heads[i] in ('성명', '비고')
                icell(ws, r, c0 + i, None, left if is_text else center, '@' if is_text else None)
            if example and r - r0 < len(sample):
                for i, v in enumerate(sample[r - r0]): ws.cell(row=r, column=c0 + i, value=v)
    block_rows(first, last, 3, h1, s1); block_rows(first, last, 10, h2, s2, numcol=False)
    # 3조: 1조 아래 (열 배치 동일, 챔프전 칸은 회색으로 막음)
    ws.merge_cells(f'C{last + 1}:I{last + 1}'); hcell(ws, last + 1, 3, '3조', grey, 'FF5A2E', 10); bordered(ws, last + 1, 4, 9); hcell(ws, last + 1, 2, '', grey)
    g3a, g3b = last + 2, last + 1 + G3_ROWS
    block_rows(g3a, g3b, 3, h1, s3)
    for r in range(g3a, g3b + 1): x = ws.cell(row=r, column=8); x.fill = dim; x.protection = Protection(locked=True); x.value = None
    for col, formula in (('D', '"남,여"'), ('K', '"남,여"'), ('G', '"O,X"'), ('N', '"O,X"'), ('H', '"O,X"')):
        dv = DataValidation(type='list', formula1=formula, allow_blank=True); dv.add(f'{col}{first}:{col}{last}')
        if col in 'DG': dv.add(f'{col}{g3a}:{col}{g3b}')
        ws.add_data_validation(dv)
    # 참가비 내역: 2조 블록 아래 (J~O, 3조 옆)
    names = f'COUNTA(C{first}:C{last})+COUNTA(J{first}:J{last})+COUNTA(C{g3a}:C{g3b})'
    fr = last + 1
    ws.merge_cells(f'J{fr}:O{fr}'); hcell(ws, fr, 10, '참가비 내역 (자동 계산)', grey, '000000', 10); bordered(ws, fr, 11, 15)
    ws.merge_cells(f'J{fr + 1}:K{fr + 1}'); hcell(ws, fr + 1, 10, '항목'); hcell(ws, fr + 1, 11, ''); hcell(ws, fr + 1, 12, '단가'); hcell(ws, fr + 1, 13, '수량'); ws.merge_cells(f'N{fr + 1}:O{fr + 1}'); hcell(ws, fr + 1, 14, '금액'); hcell(ws, fr + 1, 15, '')
    qty = {'개인전 참가비': f'={names}', '챔프전 참가비': f'=COUNTIF(H{first}:H{last},"O")', '사이드 참가비': f'=COUNTIF(G{first}:G{last},"O")+COUNTIF(N{first}:N{last},"O")+COUNTIF(G{g3a}:G{g3b},"O")', '클럽 참가비': 1, '클럽 찬조금': 1}
    for i, (label, unit) in enumerate(FEES):
        r = fr + 2 + i
        ws.merge_cells(f'J{r}:K{r}'); lab = ws.cell(row=r, column=10, value=label); lab.font = f(); lab.border = box; lab.alignment = left; ws.cell(row=r, column=11).border = box
        icell(ws, r, 12, unit, right, '#,##0')
        q = ws.cell(row=r, column=13, value=qty[label]); q.font = f(); q.border = box; q.alignment = center
        ws.merge_cells(f'N{r}:O{r}'); m = ws.cell(row=r, column=14, value=f'=L{r}*M{r}'); m.font = f(); m.border = box; m.alignment = right; m.number_format = '#,##0'; ws.cell(row=r, column=15).border = box
    r = fr + 2 + len(FEES)
    ws.merge_cells(f'J{r}:K{r}'); lab = ws.cell(row=r, column=10, value='개인 찬조'); lab.font = f(); lab.border = box; lab.alignment = left; ws.cell(row=r, column=11).border = box
    ws.cell(row=r, column=12).border = box; ws.cell(row=r, column=13).border = box
    ws.merge_cells(f'N{r}:O{r}'); icell(ws, r, 14, 30000 if example else 0, right, '#,##0'); ws.cell(row=r, column=15).border = box
    tr = r + 1
    ws.merge_cells(f'J{tr}:M{tr}'); hcell(ws, tr, 10, '총금액', gold, '000000', 10); bordered(ws, tr, 11, 13)
    ws.merge_cells(f'N{tr}:O{tr}'); tot = ws.cell(row=tr, column=14, value=f'=SUM(N{fr + 2}:N{r})'); tot.font = f(10, True); tot.fill = gold; tot.border = box; tot.alignment = right; tot.number_format = '#,##0'; ws.cell(row=tr, column=15).border = box
    ws.merge_cells(f'J{tr + 1}:O{tr + 3}'); memo = ws.cell(row=tr + 1, column=10, value='단가는 대회 공지 기준으로 수정. 핸디는 게임당(여성 15 등), 시니어핸디는 별도 칸(합산). 프로 감점 등은 핸디에 음수로 적고 비고에 표시.')
    memo.font = f(7.5, color='595959'); memo.alignment = Alignment(wrap_text=True, vertical='top')
    # 총 인원 요약 (수식 → 문자열)
    sr = g3b + 1
    ws.merge_cells(f'B{sr}:O{sr}')
    summ = ws.cell(row=sr, column=2, value=f'="총 인원 "&({names})&"명 (1조 "&COUNTA(C{first}:C{last})&"명, 2조 "&COUNTA(J{first}:J{last})&"명, 3조 "&COUNTA(C{g3a}:C{g3b})&"명, 챔프전 "&M{fr + 3}&"명, 사이드 "&M{fr + 4}&"명)"')
    summ.font = f(9, True); summ.alignment = left; bordered(ws, sr, 2, 15)
    # 3인조 / 스카치 / 베이커
    r = sr + 1
    def section(r, title, n_teams, size, sample_teams):
        ws.merge_cells(start_row=r, start_column=1, end_row=r + n_teams * size - 1, end_column=1)
        a = hcell(ws, r, 1, title, grey, '000000', 10); a.alignment = Alignment(horizontal='center', vertical='center', text_rotation=255 if n_teams * size > 3 else 0)
        rr = r
        for t in range(n_teams):
            if size > 1: ws.merge_cells(start_row=rr, start_column=2, end_row=rr + size - 1, end_column=2)
            no = ws.cell(row=rr, column=2, value=t + 1); no.font = f(9, color='808080'); no.alignment = center
            for m in range(size):
                ws.cell(row=rr + m, column=1).border = box; ws.cell(row=rr + m, column=2).border = box
                icell(ws, rr + m, 3, None, left, '@'); icell(ws, rr + m, 4)
                if example and t < len(sample_teams) and m < len(sample_teams[t]): ws.cell(row=rr + m, column=3, value=sample_teams[t][m][0]); ws.cell(row=rr + m, column=4, value=sample_teams[t][m][1])
            rr += size
        dv = DataValidation(type='list', formula1='"남,여"', allow_blank=True); dv.add(f'D{r}:D{rr - 1}'); ws.add_data_validation(dv)
        return rr
    r = section(r, '3인조', 1, 3, [[('홍길동', '남'), ('박철수', '남'), ('최민수', '남')]])
    ws.merge_cells(f'F{r - 3}:O{r - 1}'); note = ws.cell(row=r - 3, column=6, value='3인조: 지역 대표 3명 (개인전 합계로 지역 순위 포인트)   스카치: 남 1 + 여 1   베이커: 3명'); note.font = f(8, color='595959'); note.alignment = Alignment(wrap_text=True, vertical='top')
    sc = r; r = section(r, '스카치', TEAMS, 2, [[('홍길동', '남'), ('김영희', '여')], [('박철수', '남'), ('이순자', '여')], [('최민수', '남'), ('정미라', '여')]])
    bk = r; r = section(r, '베이커', TEAMS, 3, [[('홍길동', '남'), ('박철수', '남'), ('최민수', '남')], [('김영희', '여'), ('이순자', '여'), ('정미라', '여')]])
    # 스카치/베이커 옆 메모 칸 (팀 비고)
    for r0, r1 in ((sc, bk - 1), (bk, r - 1)):
        ws.merge_cells(start_row=r0, start_column=6, end_row=r1, end_column=15)
        x = ws.cell(row=r0, column=6, value=None); x.alignment = Alignment(wrap_text=True, vertical='top'); x.font = f(8, color='595959')
    ws.cell(row=sc, column=6, value='팀 순서대로 번호가 붙습니다 (지역명1, 지역명2 …). 핸디(베이커 여성 +3/+5 등)는 대회에서 적용합니다.')
    # 하단: 총금액 / 입금계좌 / 신청 문구
    ws.merge_cells(f'A{r}:B{r}'); hcell(ws, r, 1, '총금액', gold, '000000', 10)
    ws.merge_cells(f'C{r}:E{r}'); tt = ws.cell(row=r, column=3, value=f'=N{tr}'); tt.font = f(10, True); tt.fill = gold; tt.border = box; tt.alignment = right; tt.number_format = '#,##0'; bordered(ws, r, 4, 5)
    ws.merge_cells(f'F{r}:O{r}'); acc = ws.cell(row=r, column=6, value='입금계좌 : (대회 공지의 계좌)'); acc.font = f(9); acc.alignment = left
    ws.merge_cells(f'A{r + 1}:O{r + 1}'); fin = ws.cell(row=r + 1, column=1, value='위와 같이 제46회 네이버 볼링 동호회 서울 전국대회 참가를 신청합니다.'); fin.font = f(10, True); fin.alignment = center
    end_row = r + 1
    # 인쇄: A4 세로 1장
    ws.print_area = f'A1:O{end_row}'
    ws.page_setup.orientation = 'portrait'; ws.page_setup.paperSize = ws.PAPERSIZE_A4; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.4; ws.page_margins.top = ws.page_margins.bottom = 0.5
    ws.print_options.horizontalCentered = True
    # 시트 보호: 노란 입력 칸만 열어 둠 (비밀번호 없음 → 검토 > 시트 보호 해제로 풀 수 있음)
    ws.protection.sheet = True
    ws.protection.formatCells = False; ws.protection.formatColumns = False; ws.protection.formatRows = False
    ws.protection.selectLockedCells = False

if __name__ == '__main__':
    wb = Workbook(); build(wb.active, False); wb.active.title = '참가신청서'
    build(wb.create_sheet('작성 예시'), True)
    wb.calculation.fullCalcOnLoad = True  # 이 환경에 Calc 가 없어 캐시값을 넣지 못함 → 엑셀이 열 때 계산
    wb.save('docs/signup-template.xlsx'); print('saved docs/signup-template.xlsx')
