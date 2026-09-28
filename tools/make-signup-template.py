"""참가 신청서 양식(docs/signup-template.xlsx) 생성.  python3 tools/make-signup-template.py
기존 신청서 틀(조별 가로 블록 + 3인조/스카치/베이커 세로 섹션)을 유지하고, 지역명·챔프전·사이드·참가비 내역(수식)을 더한 양식.
js/signup.js 의 블록 파서가 그대로 읽는다."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as L

FONT = '맑은 고딕'
yellow = PatternFill('solid', fgColor='FFF2CC'); navy = PatternFill('solid', fgColor='1E2537'); grey = PatternFill('solid', fgColor='F2F2F2'); gold = PatternFill('solid', fgColor='FFFF00')
thin = Side(style='thin', color='BFBFBF'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal='center', vertical='center'); left = Alignment(horizontal='left', vertical='center'); right = Alignment(horizontal='right', vertical='center')
ROWS_PER_GROUP = 16; TEAMS = 5
GROUP_COLS = [1, 9, 17]          # 각 조 블록의 순번 열 (A, I, Q): 순번|성명|성별|핸디|시니어핸디|사이드|챔프전(1조만)
FEE_COL = 25                     # Y: 참가비 내역 블록
FEES = [('개인전 참가비', 35000), ('챔프전', 10000), ('사이드', 10000), ('클럽 참가비', 110000), ('클럽 찬조금', 50000)]

def f(size=10, bold=False, color='000000'): return Font(name=FONT, size=size, bold=bold, color=color)
def hcell(ws, r, c, v, fill=navy, color='FFFFFF'):
    x = ws.cell(row=r, column=c, value=v); x.font = f(10, True, color); x.fill = fill; x.alignment = center; x.border = box; return x
def icell(ws, r, c, v=None, align=center, fmt=None):
    x = ws.cell(row=r, column=c, value=v); x.font = f(10); x.fill = yellow; x.border = box; x.alignment = align
    if fmt: x.number_format = fmt
    return x

def build(ws, example):
    ws.sheet_view.showGridLines = False
    for c in range(1, 30): ws.column_dimensions[L(c)].width = 7
    for c in (2, 10, 18): ws.column_dimensions[L(c)].width = 11
    for c in (5, 13, 21): ws.column_dimensions[L(c)].width = 9
    ws.column_dimensions[L(8)].width = 2; ws.column_dimensions[L(16)].width = 2; ws.column_dimensions[L(24)].width = 2
    ws.column_dimensions[L(FEE_COL)].width = 13; ws.column_dimensions[L(FEE_COL + 3)].width = 11
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=23)
    ws.cell(row=1, column=1, value='제46회 네이버 볼링 동호회 서울 전국대회 참가 신청서').font = f(15, True); ws.row_dimensions[1].height = 30
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=23)
    n = ws.cell(row=2, column=1, value='노란 칸만 입력하세요. 대표·팀 명단(아래 섹션)에는 개인전 명단과 똑같은 이름을 적어 주세요. 챔프전은 1조만, 사이드·챔프전 참가는 O 표시. 작성 예시는 "작성 예시" 시트.')
    n.font = f(9, color='595959'); n.alignment = Alignment(wrap_text=True, vertical='center'); ws.row_dimensions[2].height = 30
    # 클럽명 / 지역명 / 연락처
    for c, label in ((1, '클럽명'), (5, '지역명'), (9, '연락처')): hcell(ws, 3, c, label, grey, '000000')
    ws.merge_cells(start_row=3, start_column=2, end_row=3, end_column=4); ws.merge_cells(start_row=3, start_column=6, end_row=3, end_column=8); ws.merge_cells(start_row=3, start_column=10, end_row=3, end_column=15)
    icell(ws, 3, 2, '드림존' if example else None, left, '@'); icell(ws, 3, 6, '청주' if example else None, left, '@'); icell(ws, 3, 10, '010-0000-0000 (총무 홍길동)' if example else None, left, '@')
    # 개인전 블록
    ws.cell(row=5, column=1, value='개인전').font = f(11, True)
    first, last = 7, 7 + ROWS_PER_GROUP - 1
    samples = {
        0: [('홍길동', '남', None, None, 'O', 'O'), ('김영희', '여', 15, None, 'X', None), ('박철수', '남', None, 3, 'O', 'O')],
        1: [('이순자', '여', 15, 5, 'O'), ('최민수', '남', None, None, 'X')],
        2: [('정미라', '여', 15, None, 'O'), ('강동원', '남', None, None, 'O')],
    }
    name_ranges = []; side_ranges = []
    for gi, c0 in enumerate(GROUP_COLS):
        heads = ['순번', '성명', '성별', '핸디', '시니어핸디', '사이드'] + (['챔프전'] if gi == 0 else [])
        lab = ws.cell(row=5, column=c0 + 1, value=f'{gi + 1}조'); lab.font = f(11, True, 'FF5A2E')
        for i, h in enumerate(heads): hcell(ws, 6, c0 + i, h)
        for r in range(first, last + 1):
            no = ws.cell(row=r, column=c0, value=r - first + 1); no.font = f(10, color='808080'); no.border = box; no.alignment = center
            for i in range(1, len(heads)): icell(ws, r, c0 + i, None, left if i == 1 else center, '@' if i == 1 else None)
            if example and r - first < len(samples[gi]):
                for i, v in enumerate(samples[gi][r - first], start=1): ws.cell(row=r, column=c0 + i, value=v)
        name_ranges.append(f'{L(c0 + 1)}{first}:{L(c0 + 1)}{last}'); side_ranges.append(f'{L(c0 + 5)}{first}:{L(c0 + 5)}{last}')
        for off, formula in ((2, '"남,여"'), (5, '"O,X"')) + (((6, '"O,X"'),) if gi == 0 else ()):
            dv = DataValidation(type='list', formula1=formula, allow_blank=True); dv.add(f'{L(c0 + off)}{first}:{L(c0 + off)}{last}'); ws.add_data_validation(dv)
    champ_range = f'{L(GROUP_COLS[0] + 6)}{first}:{L(GROUP_COLS[0] + 6)}{last}'
    # 3인조 / 스카치 / 베이커 (왼쪽 블록의 순번·성명·성별 열 사용)
    r = last + 2
    def section(r, title, n_teams, size, sample_teams):
        ws.cell(row=r, column=1, value=title).font = f(11, True); ws.cell(row=r, column=1).fill = grey
        hcell(ws, r, 2, '성명'); hcell(ws, r, 3, '성별')
        rr = r + 1
        for t in range(n_teams):
            for m in range(size):
                no = ws.cell(row=rr, column=1, value=t + 1 if m == 0 else None); no.font = f(10, color='808080'); no.border = box; no.alignment = center
                icell(ws, rr, 2, None, left, '@'); icell(ws, rr, 3)
                if example and t < len(sample_teams) and m < len(sample_teams[t]): ws.cell(row=rr, column=2, value=sample_teams[t][m][0]); ws.cell(row=rr, column=3, value=sample_teams[t][m][1])
                rr += 1
        dv = DataValidation(type='list', formula1='"남,여"', allow_blank=True); dv.add(f'C{r + 1}:C{rr - 1}'); ws.add_data_validation(dv)
        return rr + 1
    r = section(r, '3인조', 1, 3, [[('홍길동', '남'), ('박철수', '남'), ('최민수', '남')]])
    r = section(r, '스카치', TEAMS, 2, [[('홍길동', '남'), ('김영희', '여')], [('박철수', '남'), ('이순자', '여')], [('최민수', '남'), ('정미라', '여')]])
    r = section(r, '베이커', TEAMS, 3, [[('홍길동', '남'), ('박철수', '남'), ('최민수', '남')], [('김영희', '여'), ('이순자', '여'), ('정미라', '여')]])
    end_row = r
    ws.cell(row=end_row, column=1, value='입금계좌 : (대회 공지의 계좌)').font = f(9, color='595959')
    ws.cell(row=end_row + 1, column=1, value='위와 같이 전국대회 참가를 신청합니다.').font = f(10, True)
    # 자동 집계 + 참가비 내역 (오른쪽)
    c = FEE_COL
    ws.cell(row=5, column=c, value='자동 집계').font = f(11, True)
    counta = '+'.join(f'COUNTA({rg})' for rg in name_ranges)
    items = [('개인전 인원', f'={counta}'), ('1조', f'=COUNTA({name_ranges[0]})'), ('2조', f'=COUNTA({name_ranges[1]})'), ('3조', f'=COUNTA({name_ranges[2]})'),
             ('여성', '=' + '+'.join(f'COUNTIF({L(c0 + 2)}{first}:{L(c0 + 2)}{last},"여")' for c0 in GROUP_COLS)),
             ('사이드', '=' + '+'.join(f'COUNTIF({rg},"O")' for rg in side_ranges)), ('챔프전', f'=COUNTIF({champ_range},"O")')]
    for i, (k, v) in enumerate(items):
        a = hcell(ws, 6 + i, c, k, grey, '000000'); b = ws.cell(row=6 + i, column=c + 1, value=v); b.font = f(10, True); b.border = box; b.alignment = center
    fr = 6 + len(items) + 1
    ws.cell(row=fr, column=c, value='참가비 내역').font = f(11, True)
    for i, h in enumerate(['항목', '단가', '수량', '금액']): hcell(ws, fr + 1, c + i, h)
    qty = {'개인전 참가비': f'={L(c + 1)}6', '챔프전': f'={L(c + 1)}12', '사이드': f'={L(c + 1)}11', '클럽 참가비': 1, '클럽 찬조금': 1}
    for i, (label, unit) in enumerate(FEES):
        rr = fr + 2 + i
        hcell(ws, rr, c, label, grey, '000000'); icell(ws, rr, c + 1, unit, right, '#,##0')
        q = ws.cell(row=rr, column=c + 2, value=qty[label]); q.font = f(10); q.border = box; q.alignment = center
        m = ws.cell(row=rr, column=c + 3, value=f'={L(c + 1)}{rr}*{L(c + 2)}{rr}'); m.font = f(10); m.border = box; m.alignment = right; m.number_format = '#,##0'
    rr = fr + 2 + len(FEES)
    hcell(ws, rr, c, '개인 찬조', grey, '000000'); ws.cell(row=rr, column=c + 1).border = box; ws.cell(row=rr, column=c + 2).border = box
    icell(ws, rr, c + 3, 30000 if example else 0, right, '#,##0')
    tr = rr + 1
    ws.merge_cells(start_row=tr, start_column=c, end_row=tr, end_column=c + 2)
    hcell(ws, tr, c, '총금액', gold, '000000')
    t = ws.cell(row=tr, column=c + 3, value=f'=SUM({L(c + 3)}{fr + 2}:{L(c + 3)}{rr})'); t.font = f(10, True); t.fill = gold; t.border = box; t.alignment = right; t.number_format = '#,##0'
    note = ws.cell(row=tr + 2, column=c, value='수량은 왼쪽 명단에서 자동 집계됩니다. 단가는 대회 공지 기준으로 고쳐 쓰세요. 핸디는 게임당(여성 15 등), 시니어핸디는 별도 칸(합산). 프로 등 총점 감점은 핸디 칸에 음수로 적고 비고로 알려 주세요.')
    note.font = f(8, color='595959'); note.alignment = Alignment(wrap_text=True, vertical='top'); ws.merge_cells(start_row=tr + 2, start_column=c, end_row=tr + 9, end_column=c + 3)
    ws.freeze_panes = 'A7'
    ws.print_area = f'A1:{L(c + 3)}{end_row + 1}'; ws.page_setup.orientation = 'landscape'; ws.page_setup.fitToWidth = 1; ws.sheet_properties.pageSetUpPr.fitToPage = True

if __name__ == '__main__':
    wb = Workbook(); build(wb.active, False); wb.active.title = '참가신청서'
    build(wb.create_sheet('작성 예시'), True)
    wb.calculation.fullCalcOnLoad = True  # 이 환경에 Calc 가 없어 캐시값을 넣지 못함 → 엑셀이 열 때 계산
    wb.save('docs/signup-template.xlsx'); print('saved docs/signup-template.xlsx')
