# -*- coding: utf-8 -*-
"""用本机 Qwen3-TTS + 珂珂参考音色，批量生成固定台词语音。

运行（必须用 voice-clone 的 venv）：
  H:\\...\\work\\voice-clone\\venv\\Scripts\\python.exe scripts\\tts_generate_fixed.py

输出：
  public/assets/voice/ella/<id>.mp3
  public/assets/voice/ella/index.json
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(r"H:\录屏\gpt\珂珂陪伴插件\work\voice-clone")
FFMPEG = Path(r"H:\录屏\gpt\珂珂陪伴插件\work\voice-lab\venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe")
PROJECT = Path(__file__).resolve().parent.parent

parser = argparse.ArgumentParser()
parser.add_argument("--reference", default=str(ROOT / "reference" / "keke-reference.wav"), help="参考音频（5~15 秒干净人声）")
parser.add_argument("--ref-text", default="", help="参考音频对应的文字；留空则用 reference.json 里的原文")
parser.add_argument("--lines", default=str(PROJECT / "scripts" / "voice-lines.json"), help="台词表 JSON")
parser.add_argument("--out", default=str(PROJECT / "public" / "assets" / "voice" / "ella"), help="输出目录")
args = parser.parse_args()

MANIFEST = Path(args.lines)
OUT = Path(args.out)
REFERENCE = Path(args.reference)
META = json.loads((ROOT / "reference" / "reference.json").read_text(encoding="utf8"))
REF_TEXT = args.ref_text or META["reference_text"]
USE_KEKE_PROMPT = REFERENCE.resolve() == (ROOT / "reference" / "keke-reference.wav").resolve()

sys.stdout.reconfigure(encoding="utf8")
os.environ["HF_HOME"] = str(ROOT / "models" / "hf-cache")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
from qwen_tts import Qwen3TTSModel  # noqa: E402

torch.set_num_threads(6)
torch.manual_seed(42)

lines = json.loads(MANIFEST.read_text(encoding="utf8"))
OUT.mkdir(parents=True, exist_ok=True)

print("LOADING_QWEN", torch.cuda.get_device_name(0), flush=True)
t0 = time.monotonic()
model = Qwen3TTSModel.from_pretrained(
    str(ROOT / "models" / "Qwen3-TTS-0.6B-Base"),
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="eager",
)
prompt = torch.load(ROOT / "reference" / "keke-voice-prompt.pt", map_location="cuda:0", weights_only=False)
if not USE_KEKE_PROMPT:
    import soundfile as sf
    ref_audio, ref_sr = sf.read(str(REFERENCE), dtype="float32")
    prompt = model.create_voice_clone_prompt(ref_audio=(ref_audio, ref_sr), ref_text=REF_TEXT, x_vector_only_mode=False)
    print("REFERENCE_SWITCHED", REFERENCE.name, flush=True)
print("MODEL_LOADED", round(time.monotonic() - t0, 1), flush=True)

index = []
for item in lines:
    line_id = item["id"]
    text = item["text"]
    start = time.monotonic()
    with torch.inference_mode():
        wavs, rate = model.generate_voice_clone(
            text=text,
            language="Chinese",
            voice_clone_prompt=prompt,
            max_new_tokens=900,
        )
    audio = np.asarray(wavs[0], dtype=np.float32)
    if not np.isfinite(audio).all() or len(audio) / rate < 0.6:
        raise RuntimeError(f"{line_id}: invalid waveform")
    peak = float(np.max(np.abs(audio)))
    if peak > 0.99:
        audio *= 0.99 / peak
    wav_path = OUT / f"{line_id}.wav"
    mp3_path = OUT / f"{line_id}.mp3"
    sf.write(wav_path, audio, rate, subtype="PCM_16")
    subprocess.run(
        [str(FFMPEG), "-y", "-loglevel", "error", "-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", "96k", "-ac", "1", str(mp3_path)],
        check=True,
    )
    wav_path.unlink(missing_ok=True)
    seconds = round(len(audio) / rate, 2)
    index.append({"id": line_id, "text": text, "file": f"{line_id}.mp3", "seconds": seconds})
    print(json.dumps({**index[-1], "generation_seconds": round(time.monotonic() - start, 2)}, ensure_ascii=False), flush=True)

(OUT / "index.json").write_text(
    json.dumps({"voice": "keke-qwen3-tts", "lines": index}, ensure_ascii=False, indent=2),
    encoding="utf8",
)
print("VOICE_READY", OUT, flush=True)
