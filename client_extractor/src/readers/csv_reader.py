import csv

from ..validation.claims_validator import normalize_header


def read_csv_claims(path):
    with path.open("r", newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames:
            raise ValueError("The claims CSV has no header row.")
        normalized_headers = [normalize_header(name) for name in reader.fieldnames]
        if any(not name for name in normalized_headers) or len(normalized_headers) != len(set(normalized_headers)):
            raise ValueError("The claims CSV has blank or duplicate column names.")
        for line_number, row in enumerate(reader, start=2):
            if None in row:
                row["__extra_columns__"] = True
                row.pop(None, None)
            yield line_number, row
