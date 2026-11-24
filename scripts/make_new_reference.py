from pathlib import Path

import numpy as np
import soundfile as sf

root = Path(r"H:\录屏\gpt\珂珂陪伴插件\work\voice-clone\reference\new-voice")
src = root / "vocals.wav"
out = root / "ref-11-19.wav"

audio, sr = sf.read(str(src), dtype="float32")
if audio.ndim > 1:
    audio = audio.mean(axis=1)
start = int(11.54 * sr)
end = int(19.34 * sr)
seg = audio[start:end].copy()
seg -= seg.mean()
peak = float(np.max(np.abs(seg)))
if peak > 0:
    seg *= 0.95 / peak
sf.write(str(out), seg, sr, subtype="PCM_16")
print("REF_OK", out, "seconds", round(len(seg) / sr, 2), "sr", sr, "peak", round(float(np.max(np.abs(seg))), 3))
