import json
from pathlib import Path

import soundfile as sf
from faster_whisper import WhisperModel

root = Path(r"H:\录屏\gpt\珂珂陪伴插件\work\voice-clone")
snap = next((root / "models" / "asr").glob("models--Systran--faster-whisper-small/snapshots/*"))
wav = root / "reference" / "new-voice" / "full-16k.wav"

audio, sr = sf.read(str(wav), dtype="float32")
if audio.ndim > 1:
    audio = audio.mean(axis=1)
if sr != 16000:
    raise RuntimeError(f"expected 16k, got {sr}")

model = WhisperModel(str(snap), device="cpu", compute_type="int8")
segments, info = model.transcribe(audio, language="zh", vad_filter=True, beam_size=5)
rows = []
for seg in segments:
    rows.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()})

out = root / "reference" / "new-voice" / "asr.json"
out.write_text(
    json.dumps({"language": info.language, "duration": info.duration, "segments": rows}, ensure_ascii=False, indent=2),
    encoding="utf8",
)
print("ASR_OK", out)
