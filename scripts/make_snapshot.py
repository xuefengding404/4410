"""Create a portable snapshot zip (forward-slash entries, top folder starry-theater/)."""

from __future__ import annotations

import datetime
import json
import os
import zipfile
from pathlib import Path

ROOT = Path(r"H:\录屏\gpt\珂珂陪伴插件\珂珂的小屋\starry-theater")
BACKUP_DIR = ROOT.parent / "starry-theater-backups"
EXCLUDE_DIRS = {"node_modules", ".pnpm-store", ".cache", ".git"}
EXCLUDE_REL_DIRS = {"desktop/stage", "desktop-dist", "src-tauri/target", "dist-free"}

version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
stamp = datetime.date.today().strftime("%Y%m%d")
OUT = BACKUP_DIR / f"starry-theater-v{version}-{stamp}.zip"

OUT.parent.mkdir(parents=True, exist_ok=True)
if OUT.exists():
    OUT.unlink()

count = 0
with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = Path(dirpath).relative_to(ROOT).as_posix()
        dirnames[:] = sorted(
            d
            for d in dirnames
            if d not in EXCLUDE_DIRS and (f"{rel_dir}/{d}" if rel_dir != "." else d) not in EXCLUDE_REL_DIRS
        )
        for name in sorted(filenames):
            if name.endswith(".log"):
                continue
            path = Path(dirpath) / name
            rel = path.relative_to(ROOT).as_posix()
            zf.write(path, arcname=f"starry-theater/{rel}")
            count += 1

print(f"{count} files -> {OUT} ({OUT.stat().st_size / 1024 / 1024:.1f} MB)")
