from openpyxl import load_workbook

from ..validation.claims_validator import normalize_header


def read_excel_claims(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        headers = next(rows, None)
        if not headers or not any(value is not None for value in headers):
            raise ValueError("The claims workbook has no header row.")
        names = [str(value).strip() if value is not None else "" for value in headers]
        normalized_headers = [normalize_header(name) for name in names]
        if any(not name for name in normalized_headers) or len(normalized_headers) != len(set(normalized_headers)):
            raise ValueError("The claims workbook has blank or duplicate column names.")
        for line_number, values in enumerate(rows, start=2):
            yield line_number, {name: values[index] for index, name in enumerate(names)}
    finally:
        workbook.close()
