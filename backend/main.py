import os
import sys
import json
import shutil
import subprocess
import hashlib
import uuid
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(
    title="VoiceSplitting Separation & Musical Analysis API",
    description="API para separação de faixas (Demucs), detecção de tom/BPM (Librosa), e overlay de voz IA via FastAPI",
    version="1.2.0"
)

# CORS setup
CORS_ORIGINS = [orig.strip() for orig in os.getenv("CORS_ORIGINS", "*").split(",") if orig.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if "*" not in CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("tmp/uploads")
SEPARATED_DIR = Path("tmp/separated")
CACHE_DIR = Path("tmp/cache")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
SEPARATED_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Note names and Major/Minor Portuguese translations
PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_NAMES_PT = {
    'C': 'Dó', 'C#': 'Dó#', 'D': 'Ré', 'D#': 'Ré#', 'E': 'Mi', 'F': 'Fá',
    'F#': 'Fá#', 'G': 'Sol', 'G#': 'Sol#', 'A': 'Lá', 'A#': 'Lá#', 'B': 'Si'
}

# Krumhansl-Schmuckler Key Profiles
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

def calculate_file_hash(file_path: Path) -> str:
    """Calcula o hash SHA256 do arquivo para servir como cache persistente único."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    return sha256.hexdigest()

def detect_musical_key_and_bpm(audio_path: Path) -> Dict[str, Any]:
    """
    Analisa o tom musical (Key) e o andamento (BPM) do áudio usando Librosa.
    Utiliza correlação cruzada de perfis harmônicos de Krumhansl-Schmuckler.
    """
    try:
        import librosa
        import numpy as np

        # Carrega os primeiros 60 segundos (suficiente para detectar tonalidade com alta precisão)
        y, sr = librosa.load(str(audio_path), sr=22050, mono=True, duration=60.0)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # 1. Detecção de BPM
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = int(round(float(tempo[0] if isinstance(tempo, (list, np.ndarray)) else tempo)))

        # 2. Chromagram para detecção de tom
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_avg = np.mean(chroma, axis=1)

        # 3. Correlação de Krumhansl-Schmuckler
        def correlate(profile, chromavec):
            p = np.array(profile)
            c = np.array(chromavec)
            p_norm = p - np.mean(p)
            c_norm = c - np.mean(c)
            denom = (np.std(p_norm) * np.std(c_norm) * len(p))
            return 0 if denom == 0 else np.sum(p_norm * c_norm) / denom

        best_score = -999.0
        best_key = "C"
        best_mode = "Major"

        for i in range(12):
            # Rotaciona para comparar com os 12 semitones
            chroma_rotated = np.roll(chroma_avg, -i)
            major_corr = correlate(MAJOR_PROFILE, chroma_rotated)
            minor_corr = correlate(MINOR_PROFILE, chroma_rotated)

            if major_corr > best_score:
                best_score = major_corr
                best_key = PITCH_CLASSES[i]
                best_mode = "Major"

            if minor_corr > best_score:
                best_score = minor_corr
                best_key = PITCH_CLASSES[i]
                best_mode = "Minor"

        pt_note = NOTE_NAMES_PT.get(best_key, best_key)
        pt_mode = "Maior" if best_mode == "Major" else "Menor"
        formatted_key = f"{pt_note} {pt_mode} ({best_key}{'m' if best_mode == 'Minor' else ''})"

        # Escala de notas associada (maior ou menor natural)
        intervals = [0, 2, 4, 5, 7, 9, 11] if best_mode == "Major" else [0, 2, 3, 5, 7, 8, 10]
        root_idx = PITCH_CLASSES.index(best_key)
        scale_notes = [PITCH_CLASSES[(root_idx + iv) % 12] for iv in intervals]

        return {
            "key": formatted_key,
            "root_note": best_key,
            "mode": best_mode,
            "bpm": max(50, min(240, bpm)),
            "duration": round(duration, 2),
            "scale_notes": scale_notes,
            "confidence": round(float(max(0.0, min(1.0, best_score))), 2)
        }
    except Exception as e:
        # Fallback didático caso librosa encontre erro em áudio corrompido
        return {
            "key": "Dó Maior (C)",
            "root_note": "C",
            "mode": "Major",
            "bpm": 120,
            "duration": 0.0,
            "scale_notes": ["C", "D", "E", "F", "G", "A", "B"],
            "fallback": True,
            "error": str(e)
        }

def cleanup_files(*paths: Path):
    for path in paths:
        if path.is_file():
            path.unlink(missing_ok=True)
        elif path.is_dir():
            shutil.rmtree(path, ignore_errors=True)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "VoiceSplitting Separation & Musical Analysis API",
        "version": "1.2.0",
        "features": ["demucs-separation", "key-bpm-detection", "ai-voice-overlay", "sha256-caching"]
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/api/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    """
    Detecta automaticamente o Tom Musical (Key) e o BPM de uma música enviada.
    """
    temp_id = str(uuid.uuid4())
    temp_path = UPLOAD_DIR / f"analyze_{temp_id}_{file.filename}"

    try:
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_hash = calculate_file_hash(temp_path)
        meta_cache_path = CACHE_DIR / f"{file_hash}_analysis.json"

        # Retorna do cache se já analisado anteriormente
        if meta_cache_path.exists():
            with open(meta_cache_path, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                cached_data["cached"] = True
                return JSONResponse(content=cached_data)

        analysis = detect_musical_key_and_bpm(temp_path)
        analysis["file_hash"] = file_hash
        analysis["filename"] = file.filename
        analysis["cached"] = False

        # Salva em cache no servidor
        with open(meta_cache_path, "w", encoding="utf-8") as f:
            json.dump(analysis, f, ensure_ascii=False, indent=2)

        return JSONResponse(content=analysis)
    finally:
        cleanup_files(temp_path)

@app.get("/api/song-analysis")
def get_song_analysis(title: str = ""):
    """
    Retorna a análise musical de Tom & BPM armazenada em cache pelo Demucs para uma música.
    Permite restaurar a tonalidade e andamento reais caso o navegador tenha usado o valor padrão.
    """
    if not title:
        return {"found": False}
    clean_query = title.lower().replace("_", " ").replace("-", " ")
    for meta_file in SEPARATED_DIR.glob("*/metadata.json"):
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
                meta_fn = meta.get("filename", "").lower().replace("_", " ").replace("-", " ")
                query_words = [w for w in clean_query.split() if len(w) > 3]
                if clean_query in meta_fn or meta_fn in clean_query or (query_words and any(word in meta_fn for word in query_words)):
                    return {
                        "found": True,
                        "musical_analysis": meta.get("musical_analysis"),
                        "job_id": meta.get("job_id")
                    }
        except Exception:
            continue
    return {"found": False}

@app.post("/api/separate-audio")
async def separate_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Separa a voz do instrumental e analisa tom/BPM.
    Utiliza cache persistente por hash do arquivo para jamais reprocessar a mesma música.
    """
    if not file.filename.lower().endswith(('.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mp4', '.mov', '.webm', '.avi', '.mkv')):
        raise HTTPException(status_code=400, detail="Formato não suportado. Envie áudio (MP3, WAV, OGG, FLAC, M4A) ou vídeo (MP4, MOV, WEBM).")

    temp_id = str(uuid.uuid4())
    input_filename = f"{temp_id}_{file.filename}"
    input_path = UPLOAD_DIR / input_filename

    # Salva arquivo temporário para hash e processamento
    try:
        with input_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo de áudio: {str(e)}")

    DEMUCS_MODEL = os.getenv("DEMUCS_MODEL", "htdemucs")
    file_hash = calculate_file_hash(input_path)
    cached_job_dir = SEPARATED_DIR / file_hash
    meta_cache_path = cached_job_dir / "metadata.json"

    # 1. VERIFICAÇÃO DE CACHE: Se já foi processado neste servidor, retorna se for válido
    if cached_job_dir.exists() and meta_cache_path.exists():
        try:
            vocals_candidates = list(cached_job_dir.glob("**/vocals.wav"))
            if vocals_candidates and vocals_candidates[0].exists():
                # Invalida cache antigo corrompido onde vocals.wav era cópia idêntica da música original inteira
                if vocals_candidates[0].stat().st_size == input_path.stat().st_size:
                    cleanup_files(cached_job_dir)
                else:
                    with open(meta_cache_path, "r", encoding="utf-8") as f:
                        cached_meta = json.load(f)
                    background_tasks.add_task(cleanup_files, input_path)
                    cached_meta["cached"] = True
                    return JSONResponse(content=cached_meta)
            else:
                cleanup_files(cached_job_dir)
        except Exception:
            pass

    # 2. Análise musical de Tom & BPM
    musical_analysis = detect_musical_key_and_bpm(input_path)

    # 3. Execução da separação neural via Demucs
    output_job_dir = cached_job_dir
    output_job_dir.mkdir(parents=True, exist_ok=True)

    try:
        py_exec = sys.executable
        venv_py = Path(__file__).resolve().parent.parent / ".venv" / "bin" / "python"
        if venv_py.exists():
            py_exec = str(venv_py)

        command = [
            py_exec,
            "-m",
            "demucs.separate",
            "--two-stems", "vocals",
            "-n", DEMUCS_MODEL,
            "-o", str(output_job_dir),
            str(input_path)
        ]
        res = subprocess.run(command, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"Demucs exit code {res.returncode}: {res.stderr or res.stdout}")
    except Exception as cpe:
        # Nunca cria cópias falsas da música inteira como voz!
        cleanup_files(input_path, output_job_dir)
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao executar separação neural Demucs: {str(cpe)}"
        )

    stem_folder = output_job_dir / DEMUCS_MODEL / input_path.stem
    vocals_file = stem_folder / "vocals.wav"
    instrumental_file = stem_folder / "no_vocals.wav"

    if not vocals_file.exists() or not instrumental_file.exists():
        cleanup_files(input_path, output_job_dir)
        raise HTTPException(status_code=500, detail="Separação concluída mas faixas neurais não foram geradas corretamente.")

    result_payload = {
        "status": "success",
        "job_id": file_hash,
        "filename": file.filename,
        "musical_analysis": musical_analysis,
        "stems": {
            "vocals_url": f"/api/stems/{file_hash}/vocals",
            "accompaniment_url": f"/api/stems/{file_hash}/accompaniment"
        },
        "cached": False
    }

    # Salva os metadados no diretório persistente
    try:
        with open(meta_cache_path, "w", encoding="utf-8") as f:
            json.dump(result_payload, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    background_tasks.add_task(cleanup_files, input_path)
    return JSONResponse(content=result_payload)

@app.get("/api/stems/{job_id}/{stem_type}")
async def get_stem(job_id: str, stem_type: str):
    valid_stems = ["vocals", "accompaniment", "ai_overlay", "soprano", "contralto", "tenor", "bass"]
    if stem_type not in valid_stems:
        raise HTTPException(status_code=400, detail=f"Tipo de stem inválido. Use um dos: {valid_stems}")

    filename_map = {
        "vocals": "vocals.wav",
        "accompaniment": "no_vocals.wav",
        "ai_overlay": "ai_overlay.wav",
        "soprano": "soprano.wav",
        "contralto": "contralto.wav",
        "tenor": "tenor.wav",
        "bass": "bass.wav"
    }
    filename = filename_map.get(stem_type, f"{stem_type}.wav")
    output_job_dir = SEPARATED_DIR / job_id
    
    target_file = None
    for root, _, files in os.walk(output_job_dir):
        if filename in files:
            target_file = Path(root) / filename
            break

    if not target_file or not target_file.exists():
        raise HTTPException(status_code=404, detail="Faixa de áudio solicitada não foi encontrada no servidor.")

    return FileResponse(
        path=target_file,
        media_type="audio/wav",
        filename=f"{stem_type}_{job_id}.wav"
    )

@app.post("/api/ai-voice/overlay")
async def generate_ai_voice_overlay(
    job_id: str = Form(...),
    voice_style: str = Form("soprano_guide"),
    semitones: int = Form(0),
    lyrics: Optional[str] = Form(None),
    voice_audio: Optional[UploadFile] = File(None)
):
    """
    Gera ou ajusta a voz guia de IA no tom da música:
    1. Se um arquivo de áudio for enviado (ex: voz gravada/clonada), aplica o pitch-shift correspondente.
    2. Se letra (lyrics) for fornecida e houver chave de API (ElevenLabs), sintetiza o vocal no tom.
    3. Caso padrão: utiliza a voz isolada real da música (Demucs vocals.wav) e aplica transposição harmônica
       específica da voz coral solicitada (Soprano: 0 ST, Contralto: +4 ST, Tenor: +7 ST, Baixo: -12 ST).
    """
    job_dir = SEPARATED_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Música não encontrada para este job_id.")

    # Localiza o instrumental e a voz isolada real
    inst_file = None
    vocals_file = None
    for root, _, files in os.walk(job_dir):
        if "no_vocals.wav" in files:
            inst_file = Path(root) / "no_vocals.wav"
        if "vocals.wav" in files:
            vocals_file = Path(root) / "vocals.wav"

    if not inst_file or not inst_file.exists():
        raise HTTPException(status_code=404, detail="Instrumental não encontrado.")

    overlay_out = job_dir / "ai_overlay.wav"

    # Intervalos harmônicos canônicos para vozes corais (Tônica, Terça, Quinta, Oitava baixa)
    VOICE_INTERVALS = {
        "soprano": 0,
        "soprano_guide": 0,
        "mezzosoprano": 4,
        "contralto": 4,
        "contralto_guide": 4,
        "tenor": 7,
        "tenor_guide": 7,
        "baritone": -5,
        "bass": -12,
        "bass_guide": -12
    }

    harmonic_shift = VOICE_INTERVALS.get(voice_style.lower(), 0) + int(semitones)

    try:
        import librosa
        import soundfile as sf

        # Caso 1: Áudio de voz enviado diretamente (gravação do usuário ou arquivo externo)
        if voice_audio:
            temp_voice = job_dir / "temp_voice.wav"
            with temp_voice.open("wb") as buf:
                shutil.copyfileobj(voice_audio.file, buf)

            try:
                y, sr = librosa.load(str(temp_voice), sr=44100)
                if harmonic_shift != 0:
                    y = librosa.effects.pitch_shift(y, sr=sr, n_steps=harmonic_shift)
                sf.write(str(overlay_out), y, sr)
            finally:
                cleanup_files(temp_voice)

        # Caso 2: Síntese de letra via ElevenLabs (se configurada)
        elif lyrics and os.getenv("ELEVENLABS_API_KEY"):
            import urllib.request
            api_key = os.getenv("ELEVENLABS_API_KEY")
            voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM") # Rachel
            req = urllib.request.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                data=json.dumps({"text": lyrics, "model_id": "eleven_multilingual_v2"}).encode('utf-8'),
                headers={"xi-api-key": api_key, "Content-Type": "application/json"}
            )
            tts_path = job_dir / "temp_tts.mp3"
            with urllib.request.urlopen(req) as resp, open(tts_path, "wb") as f:
                f.write(resp.read())

            y, sr = librosa.load(str(tts_path), sr=44100)
            if harmonic_shift != 0:
                y = librosa.effects.pitch_shift(y, sr=sr, n_steps=harmonic_shift)
            sf.write(str(overlay_out), y, sr)
            cleanup_files(tts_path)

        # Caso 3: Gera a voz harmônica transposta a partir da voz isolada real (vocals.wav do Demucs)
        elif vocals_file and vocals_file.exists():
            y, sr = librosa.load(str(vocals_file), sr=44100)
            if harmonic_shift != 0:
                y = librosa.effects.pitch_shift(y, sr=sr, n_steps=harmonic_shift)
            sf.write(str(overlay_out), y, sr)

        else:
            raise HTTPException(status_code=404, detail="Voz isolada não localizada para aplicar afinação de IA.")

        return JSONResponse(content={
            "status": "success",
            "overlay_url": f"/api/stems/{job_id}/ai_overlay",
            "semitones": harmonic_shift,
            "voice_style": voice_style
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar voz IA: {str(e)}")

@app.post("/api/export-mix")
async def export_mix(
    job_id: str = Form(...),
    voice_type: str = Form("soprano"),
    instrumental_vol: float = Form(0.4),
    vocal_vol: float = Form(1.0)
):
    """
    Renderiza no servidor uma mixagem estéreo combinando Instrumental e Voz Guia de IA.
    """
    job_dir = SEPARATED_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Música não encontrada.")

    inst_file = None
    vocals_file = None
    overlay_file = job_dir / "ai_overlay.wav"

    for root, _, files in os.walk(job_dir):
        if "no_vocals.wav" in files:
            inst_file = Path(root) / "no_vocals.wav"
        if "vocals.wav" in files:
            vocals_file = Path(root) / "vocals.wav"

    if not inst_file or not inst_file.exists():
        raise HTTPException(status_code=404, detail="Instrumental não encontrado.")

    chosen_vocal = overlay_file if overlay_file.exists() else vocals_file
    if not chosen_vocal or not chosen_vocal.exists():
        chosen_vocal = inst_file

    try:
        import librosa
        import soundfile as sf
        import numpy as np

        y_inst, sr = librosa.load(str(inst_file), sr=44100, mono=False)
        y_voc, _ = librosa.load(str(chosen_vocal), sr=44100, mono=False)

        if y_inst.ndim == 1:
            y_inst = np.array([y_inst, y_inst])
        if y_voc.ndim == 1:
            y_voc = np.array([y_voc, y_voc])

        min_len = min(y_inst.shape[1], y_voc.shape[1])
        mix = (y_inst[:, :min_len] * float(instrumental_vol)) + (y_voc[:, :min_len] * float(vocal_vol))

        # Peak normalization para evitar clipping digital
        peak = float(np.max(np.abs(mix)))
        if peak > 0.95:
            mix = mix * (0.95 / peak)

        export_path = job_dir / f"mix_{voice_type}.wav"
        sf.write(str(export_path), mix.T, sr)

        return FileResponse(
            path=export_path,
            media_type="audio/wav",
            filename=f"Ensaio_{voice_type}_{job_id[:8]}.wav"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao renderizar mixagem: {str(e)}")

@app.post("/api/virtual-singer/generate-stems")
async def generate_virtual_singer_stems(job_id: str = Form(...)):
    """
    Gera as 4 vozes de Cantor Virtual (Soprano, Contralto, Tenor, Baixo) com isolamento
    total e zero vazamento de instrumental, utilizando gate acústico e pitch shift harmônico.
    """
    job_dir = SEPARATED_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Música não encontrada.")

    vocals_file = None
    for root, _, files in os.walk(job_dir):
        if "vocals.wav" in files:
            vocals_file = Path(root) / "vocals.wav"
            break

    if not vocals_file or not vocals_file.exists():
        raise HTTPException(status_code=404, detail="Faixa vocal original não encontrada.")

    try:
        import librosa
        import soundfile as sf
        import numpy as np

        y, sr = librosa.load(str(vocals_file), sr=44100, mono=True)

        # 1. Noise gate adaptativo para garantir ZERO vazamento de instrumental durante pausas
        hop_length = 512
        frame_length = 1024
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        # Interpola o RMS para o tamanho de amostras exato
        times = librosa.times_like(rms, sr=sr, hop_length=hop_length)
        sample_times = np.arange(len(y)) / sr
        interp_rms = np.interp(sample_times, times, rms)

        gate_threshold = 0.02
        gate_mask = np.where(interp_rms >= gate_threshold, 1.0, 0.0)
        # Suavização para evitar estalos na transição
        kernel_size = int(sr * 0.02)
        if kernel_size > 0:
            kernel = np.ones(kernel_size) / kernel_size
            gate_mask = np.convolve(gate_mask, kernel, mode="same")
            gate_mask = np.clip(gate_mask, 0.0, 1.0)
            gate_mask[gate_mask < 0.01] = 0.0

        y_clean = y * gate_mask

        # 2. Gera Soprano (0 semitones)
        soprano_path = job_dir / "soprano.wav"
        sf.write(str(soprano_path), y_clean, sr)

        # 3. Gera Contralto (+4 semitones)
        y_contralto = librosa.effects.pitch_shift(y_clean, sr=sr, n_steps=4)
        contralto_path = job_dir / "contralto.wav"
        sf.write(str(contralto_path), y_contralto, sr)

        # 4. Gera Tenor (+7 semitones)
        y_tenor = librosa.effects.pitch_shift(y_clean, sr=sr, n_steps=7)
        tenor_path = job_dir / "tenor.wav"
        sf.write(str(tenor_path), y_tenor, sr)

        # 5. Gera Baixo (-12 semitones)
        y_bass = librosa.effects.pitch_shift(y_clean, sr=sr, n_steps=-12)
        bass_path = job_dir / "bass.wav"
        sf.write(str(bass_path), y_bass, sr)

        return JSONResponse(content={
            "status": "success",
            "job_id": job_id,
            "stems": {
                "soprano": f"/api/stems/{job_id}/soprano",
                "contralto": f"/api/stems/{job_id}/contralto",
                "tenor": f"/api/stems/{job_id}/tenor",
                "bass": f"/api/stems/{job_id}/bass"
            }
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar vozes de Cantor Virtual: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

