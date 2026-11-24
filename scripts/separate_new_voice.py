import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model

src = Path(r"H:\录屏\gpt\珂珂陪伴插件\work\voice-clone\reference\new-voice\full-44k.wav")
out = src.parent / "vocals.wav"

wav, sr = sf.read(str(src), dtype="float32")
if wav.ndim == 1:
    wav = np.stack([wav, wav], axis=1)
tensor = torch.from_numpy(wav.T).float()
ref = tensor.mean(0)
tensor = (tensor - ref.mean()) / (ref.std() + 1e-8)

model = get_model("htdemucs")
model.eval()
device = "cuda" if torch.cuda.is_available() else "cpu"
print("DEMUCS_DEVICE", device, flush=True)
with torch.no_grad():
    sources = apply_model(model, tensor[None], device=device, progress=True)[0]

vocals = sources[3] * ref.std() + ref.mean()
sf.write(str(out), vocals.T.numpy(), sr, subtype="PCM_16")
print("VOCALS_OK", out, flush=True)
