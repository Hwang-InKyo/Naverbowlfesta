"""참가 신청서 양식(docs/signup-template.xlsx) 생성 스크립트.  python3 tools/make-signup-template.py
세로 한 줄에 선수 한 명(조 열 포함), 스카치·베이커는 한 행에 팀원 가로 배치 → js/signup.js 가 그대로 읽는다."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

FONT = '맑은 고딕'
yellow = PatternFill('solid', fgColor='FFF2CC'); navy = PatternFill('solid', fgColor='1E2537'); grey = PatternFill('solid', fgColor='F2F2F2')
thin = Side(style='thin', color='BFBFBF'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal='center', vertical='center'); left = Alignment(horizontal='left', vertical='center')
N_PLAYERS = 40; N_TEAMS = 10
HEADS = ['순번', '조', '성명', '성별', '핸디', '시니어핸디', '총점가감', '사이드', '3인조', '비고']  # A..J
SUMMARY_COL = 12  # L 라벨, M 값

def f(size=10, bold=False, color='000000'): return Font(name=FONT, size=size, bold=bold, color=color)

def build(ws, example):
    ws.sheet_view.showGridLines = False
    for k, v in {'A': 6, 'B': 8, 'C': 12, 'D': 6, 'E': 7, 'F': 9, 'G': 9, 'H': 7, 'I': 7, 'J': 16, 'K': 3, 'L': 14, 'M': 8}.items(): ws.column_dimensions[k].width = v
    ws.merge_cells('A1:J1'); ws['A1'] = '제46회 네이버 볼링 동호회 서울 전국대회 참가 신청서'; ws['A1'].font = f(15, True); ws['A1'].alignment = left; ws.row_dimensions[1].height = 30
    ws.merge_cells('A2:J2'); ws['A2'] = '노란 칸만 입력하세요. 스카치·베이커의 선수 이름은 개인전 명단의 성명과 똑같이 적어 주세요(목록에서 선택 가능). 작성 예시는 "작성 예시" 시트를 참고하세요.'
    ws['A2'].font = f(9, color='595959'); ws['A2'].alignment = Alignment(wrap_text=True, vertical='center'); ws.row_dimensions[2].height = 30
    for c, label in (('A3', '클럽명'), ('C3', '지역명'), ('E3', '연락처')):
        ws[c] = label; ws[c].font = f(10, True); ws[c].fill = grey; ws[c].border = box; ws[c].alignment = center
    ws.merge_cells('F3:J3')
    for c in ('B3', 'D3', 'F3'):
        ws[c].fill = yellow; ws[c].border = box; ws[c].font = f(10); ws[c].alignment = left; ws[c].number_format = '@'
    if example: ws['B3'] = '드림존'; ws['D3'] = '청주'; ws['F3'] = '010-0000-0000 (총무 홍길동)'
    ws['A5'] = '개인전 (1인 3게임)'; ws['A5'].font = f(11, True)
    for i, h in enumerate(HEADS, start=1):
        c = ws.cell(row=6, column=i, value=h); c.font = f(10, True, 'FFFFFF'); c.fill = navy; c.alignment = center; c.border = box
    first = 7; last = first + N_PLAYERS - 1
    sample = [('1조', '홍길동', '남', None, None, None, 'O', 'O', None), ('1조', '김영희', '여', 15, None, None, 'X', None, None),
              ('2조', '박철수', '남', None, 3, None, 'O', 'O', '시니어 63세'), ('2조', '이순자', '여', 15, 5, None, 'O', None, '시니어 66세'),
              ('3조', '최민수', '남', None, None, -21, 'X', 'O', '프로'), ('3조', '정미라', '여', 15, None, None, 'O', None, None)]
    for r in range(first, last + 1):
        ws.cell(row=r, column=1, value=r - first + 1).font = f(10, color='808080')
        for cidx in range(1, len(HEADS) + 1):
            c = ws.cell(row=r, column=cidx); c.border = box; c.alignment = left if cidx == len(HEADS) else center
            if cidx >= 2: c.fill = yellow; c.font = f(10)
        ws.cell(row=r, column=3).number_format = '@'; ws.cell(row=r, column=len(HEADS)).number_format = '@'
        if example and r - first < len(sample):
            for cidx, v in zip(range(2, len(HEADS) + 1), sample[r - first]): ws.cell(row=r, column=cidx, value=v)
    for col, formula in (('B', '"1조,2조,3조"'), ('D', '"남,여"'), ('H', '"O,X"'), ('I', '"O"')):
        dv = DataValidation(type='list', formula1=formula, allow_blank=True); dv.add(f'{col}{first}:{col}{last}'); ws.add_data_validation(dv)

    def team_section(row, title, n_members, sample_teams):
        ws.cell(row=row, column=1, value=title).font = f(11, True)
        for i, h in enumerate(['팀'] + [f'선수{i + 1}' for i in range(n_members)], start=1):
            c = ws.cell(row=row + 1, column=i, value=h); c.font = f(10, True, 'FFFFFF'); c.fill = navy; c.alignment = center; c.border = box
        r0 = row + 2; r1 = r0 + N_TEAMS - 1
        for r in range(r0, r1 + 1):
            a = ws.cell(row=r, column=1, value=r - r0 + 1); a.font = f(10, color='808080'); a.border = box; a.alignment = center
            for cidx in range(2, 2 + n_members):
                c = ws.cell(row=r, column=cidx); c.fill = yellow; c.border = box; c.font = f(10); c.alignment = center; c.number_format = '@'
            if example and r - r0 < len(sample_teams):
                for cidx, v in zip(range(2, 2 + n_members), sample_teams[r - r0]): ws.cell(row=r, column=cidx, value=v)
        dv = DataValidation(type='list', formula1=f'=$C${first}:$C${last}', allow_blank=True); dv.add(f'B{r0}:{get_column_letter(1 + n_members)}{r1}'); ws.add_data_validation(dv)
        return r0, r1
    s0, s1 = team_section(last + 2, '스카치 더블 (남 1명 + 여 1명, 2게임)', 2, [('홍길동', '김영희'), ('박철수', '이순자'), ('최민수', '정미라')])
    b0, b1 = team_section(s1 + 2, '베이커 (3인, 2게임)', 3, [('홍길동', '박철수', '최민수'), ('김영희', '이순자', '정미라')])

    L = get_column_letter(SUMMARY_COL); M = get_column_letter(SUMMARY_COL + 1)
    ws[f'{L}5'] = '자동 집계'; ws[f'{L}5'].font = f(11, True)
    items = [('개인전 인원', f'=COUNTA(C{first}:C{last})'), ('여성', f'=COUNTIF(D{first}:D{last},"여")'), ('1조', f'=COUNTIF(B{first}:B{last},"1조")'),
             ('2조', f'=COUNTIF(B{first}:B{last},"2조")'), ('3조', f'=COUNTIF(B{first}:B{last},"3조")'), ('3인조 대표', f'=COUNTIF(I{first}:I{last},"O")'),
             ('사이드', f'=COUNTIF(H{first}:H{last},"O")'), ('스카치 팀', f'=COUNTA(B{s0}:B{s1})'), ('베이커 팀', f'=COUNTA(B{b0}:B{b1})')]
    for i, (k, v) in enumerate(items):
        a = ws.cell(row=6 + i, column=SUMMARY_COL, value=k); b = ws.cell(row=6 + i, column=SUMMARY_COL + 1, value=v)
        a.font = f(10); a.fill = grey; a.border = box; b.font = f(10, True); b.border = box; b.alignment = center
    note = ws.cell(row=16, column=SUMMARY_COL, value='조는 클럽에서 정한 조를 적어 주세요. 핸디는 게임당(여성 15 등), 시니어핸디는 별도 칸(합산됨). 프로 -21 같은 총점 단위 감점은 총점가감 칸에 음수로.')
    note.font = f(8, color='595959'); note.alignment = Alignment(wrap_text=True, vertical='top'); ws.merge_cells(f'{L}16:{M}24')
    ws.freeze_panes = 'A7'
    ws.print_area = f'A1:{M}{b1}'; ws.page_setup.fitToWidth = 1; ws.sheet_properties.pageSetUpPr.fitToPage = True

if __name__ == '__main__':
    wb = Workbook(); build(wb.active, False); wb.active.title = '참가신청서'
    build(wb.create_sheet('작성 예시'), True)
    wb.calculation.fullCalcOnLoad = True  # 이 환경에 Calc 가 없어 캐시값을 넣지 못함 → 엑셀이 열 때 계산
    wb.save('docs/signup-template.xlsx'); print('saved docs/signup-template.xlsx')
