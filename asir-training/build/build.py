"""Build the Asir training-satisfaction dashboard from the survey workbook.

Usage:
    python3 build.py <workbook.xlsx> [--out ../index.html]

What it does
  1. Reads the response sheet exactly as exported (headers + cells).
  2. Drops personal contact data: every e-mail column is replaced by a
     salted, irreversible token so duplicate submissions can still be
     detected in the page, while no address is ever written out.
  3. Redacts personal names found in free-text answers (REDACT below).
  4. Attaches the manual theme/sentiment coding (coding/q*.txt), keyed by
     the response timestamp, so text analytics stay traceable to comments.
  5. Inlines data, logo and template into one self-contained index.html.

All metrics are computed in the browser from these rows; nothing is
pre-aggregated here.
"""
import argparse, base64, datetime as dt, hashlib, json, os, re, secrets, sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Personal names that appear inside comments -> neutral placeholder.
REDACT = [
    "نوره الهجيني", "محمد جابر", "عبد الله عسيري", "عبدالله الجالي",
]
PLACEHOLDER = "[اسم محجوب]"

# coding file -> page question key (see QUESTIONS in template.html)
CODING = {
    "q19": "skill", "q42": "supStrength", "q43": "benefits", "q44": "improve",
    "q45": "market", "q47": "recReason", "q51": "challenge", "q52": "proposal",
    "q53": "notes",
}


def ts_key(v):
    """Timestamp rounded to the second: the join key for coding files."""
    if isinstance(v, dt.datetime):
        return (v + dt.timedelta(microseconds=500_000)).strftime("%Y-%m-%d %H:%M:%S")
    return str(v)


def redact(text):
    for name in REDACT:
        text = text.replace(name, PLACEHOLDER)
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook")
    ap.add_argument("--out", default=os.path.join(ROOT, "index.html"))
    ap.add_argument("--fragment", action="store_true",
                    help="omit the <!doctype>/<html> wrapper (for hosts that add their own)")
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    headers = [("" if h is None else str(h)) for h in rows[0]]
    body = [r for r in rows[1:] if any(c not in (None, "") for c in r)]

    email_cols = [i for i, h in enumerate(headers) if "بريد" in h or "mail" in h.lower()]
    salt = secrets.token_bytes(16)
    ts_col = next(i for i, h in enumerate(headers) if "طابع" in h)

    out_rows = []
    for r in body:
        cells = []
        for i, v in enumerate(r):
            if i in email_cols:
                if v in (None, ""):
                    cells.append(None)
                else:
                    norm = str(v).strip().lower().encode()
                    cells.append("id:" + hashlib.sha256(salt + norm).hexdigest()[:12])
            elif isinstance(v, dt.datetime):
                cells.append(ts_key(v))
            elif isinstance(v, str):
                cells.append(redact(v))
            else:
                cells.append(v)
        out_rows.append(cells)

    # Theme / sentiment coding, keyed by response timestamp.
    by_index = {}
    for fname, key in CODING.items():
        path = os.path.join(HERE, "coding", fname + ".txt")
        for line in open(path, encoding="utf-8"):
            line = line.rstrip("\n")
            if not line.strip():
                continue
            idx, _, code = line.partition(" ")
            by_index.setdefault(int(idx), {})[key] = code.strip()
    codes = {}
    for idx, c in by_index.items():
        if idx >= len(body):
            sys.exit(f"coding refers to row {idx}, workbook has {len(body)} rows")
        codes[ts_key(body[idx][ts_col])] = c
    if len(codes) != len(by_index):
        sys.exit("timestamp keys are not unique; cannot attach coding")

    data = {
        "source": os.path.basename(args.workbook),
        "sheet": ws.title,
        "built": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "headers": [h if i not in email_cols else "[معرّف مشفّر]" + str(i) for i, h in enumerate(headers)],
        "emailCols": email_cols,
        "rows": out_rows,
        "codes": codes,
    }

    logo = base64.b64encode(open(os.path.join(ROOT, "assets", "logo-reverse.png"), "rb").read()).decode()
    tpl = open(os.path.join(ROOT, "src", "template.html"), encoding="utf-8").read()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = tpl.replace("/*__DATA__*/null", payload).replace("__LOGO__", "data:image/png;base64," + logo)
    if not args.fragment:
        html = ('<!doctype html>\n<html lang="ar" dir="rtl">\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                + html + "\n</html>\n")
    open(args.out, "w", encoding="utf-8").write(html)
    print(f"{len(out_rows)} responses, {len(headers)} columns, {len(codes)} coded rows -> {args.out}")


if __name__ == "__main__":
    main()
