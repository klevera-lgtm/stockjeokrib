"""
CSV price files: keep only date + close columns
python scripts/slim_prices.py
"""
import glob, csv, os, sys

sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = "data/prices"

files = glob.glob(os.path.join(DATA_DIR, "*.csv"))
total_before = 0
total_after = 0

for path in sorted(files):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        lower = [h.strip().lower() for h in header]
        try:
            date_idx  = lower.index("date")
            close_idx = lower.index("close")
        except ValueError:
            print(f"  SKIP {os.path.basename(path)}: no date/close header")
            continue

        for row in reader:
            if len(row) > max(date_idx, close_idx):
                d = row[date_idx].strip()
                c = row[close_idx].strip()
                if d and c:
                    rows.append([d, c])

    before = os.path.getsize(path)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "close"])
        writer.writerows(rows)
    after = os.path.getsize(path)

    total_before += before
    total_after  += after
    print(f"  OK  {os.path.basename(path):22s} {before//1024:4d}KB -> {after//1024:3d}KB  ({len(rows)} rows)")

pct = 100 * (1 - total_after / total_before) if total_before else 0
print(f"\nTotal: {total_before//1024//1024}MB -> {total_after//1024//1024}MB  ({pct:.0f}% reduction)")
