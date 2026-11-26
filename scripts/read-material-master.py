"""Read the material master sheet (.xlsb or .xlsx) as UTF-8 JSON lines; never modifies the workbook."""
import datetime
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
SHEET = 'MedSupplies&Others'
path = sys.argv[1]

if path.lower().endswith('.xlsx'):
    import warnings
    from openpyxl import load_workbook
    warnings.filterwarnings('ignore')
    epoch = datetime.datetime(1899, 12, 30)

    def conv(v):
        if isinstance(v, datetime.datetime):
            return (v - epoch).total_seconds() / 86400
        if isinstance(v, datetime.date):
            return (datetime.datetime(v.year, v.month, v.day) - epoch).days
        return v

    wb = load_workbook(path, read_only=True, data_only=True)
    if SHEET not in wb.sheetnames:
        raise ValueError(f'Missing worksheet: {SHEET}')
    for number, row in enumerate(wb[SHEET].iter_rows(values_only=True), start=1):
        if number < 2:
            continue
        print(json.dumps({'number': number, 'values': [conv(c) for c in row]}, ensure_ascii=False))
else:
    from pyxlsb import open_workbook
    with open_workbook(path) as workbook:
        if SHEET not in workbook.sheets:
            raise ValueError(f'Missing worksheet: {SHEET}')
        with workbook.get_sheet(SHEET) as worksheet:
            for row in worksheet.rows(sparse=True):
                if row[0].r < 1:
                    continue
                print(json.dumps({'number': row[0].r + 1, 'values': [c.v for c in row]}, ensure_ascii=False))
