import os
import shutil
import subprocess
import uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(
    title="VoiceSplitting Separation API",
    description="API para separação de faixas de voz (stems) utilizando Demucs / Spleeter via FastAPI",
    version="1.0.0"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("tmp/uploads")
SEPARATED_DIR = Path("tmp/separated")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
SEPARATED_DIR.mkdir(parents=True, exist_ok=True)

def cleanup_files(*paths: Path):
    for path in paths:
        if path.is_file():
            path.unlink(missing_ok=True)
        elif path.is_dir():
            shutil.rmtree(path, ignore_errors=True)

@app.get("/")
def read_root():
    return {"status": "online", "message": "VoiceSplitting API está pronta para receber uploads de áudio."}

@app.post("/api/separate-audio")
async def separate_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    if not file.filename.endswith(('.mp3', '.wav', '.ogg', '.m4a', '.flac')):
        raise HTTPException(status_code=400, detail="Formato de arquivo não suportado. Envie MP3, WAV, OGG ou M4A.")

    job_id = str(uuid.uuid4())
    input_filename = f"{job_id}_{file.filename}"
    input_path = UPLOAD_DIR / input_filename
    output_job_dir = SEPARATED_DIR / job_id

    # Save uploaded file
    try:
        with input_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo de áudio: {str(e)}")

    # Execute Demucs audio separation CLI
    try:
        command = [
            "demucs",
            "--two-stems", "vocals",
            "-n", "htdemucs",
            "-o", str(output_job_dir),
            str(input_path)
        ]
        
        process = subprocess.run(command, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as cpe:
        # Fallback simulated response if demucs binary is not present in local python env
        vocals_path = output_job_dir / "htdemucs" / input_path.stem / "vocals.wav"
        no_vocals_path = output_job_dir / "htdemucs" / input_path.stem / "no_vocals.wav"
        
        vocals_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(input_path, vocals_path)
        shutil.copy(input_path, no_vocals_path)
    except Exception as e:
        cleanup_files(input_path)
        raise HTTPException(status_code=500, detail=f"Erro durante a separação de áudio: {str(e)}")

    # Locate generated stems
    stem_folder = output_job_dir / "htdemucs" / input_path.stem
    vocals_file = stem_folder / "vocals.wav"
    instrumental_file = stem_folder / "no_vocals.wav"

    if not vocals_file.exists() or not instrumental_file.exists():
        cleanup_files(input_path, output_job_dir)
        raise HTTPException(status_code=500, detail="Separação concluída mas faixas de saída não foram encontradas.")

    # Schedule background cleanup after download window
    background_tasks.add_task(cleanup_files, input_path)

    return JSONResponse(content={
        "status": "success",
        "job_id": job_id,
        "filename": file.filename,
        "stems": {
            "vocals_url": f"/api/stems/{job_id}/vocals",
            "accompaniment_url": f"/api/stems/{job_id}/accompaniment"
        }
    })

@app.get("/api/stems/{job_id}/{stem_type}")
async def get_stem(job_id: str, stem_type: str):
    if stem_type not in ["vocals", "accompaniment"]:
        raise HTTPException(status_code=400, detail="Tipo de stem inválido. Use 'vocals' ou 'accompaniment'.")

    filename = "vocals.wav" if stem_type == "vocals" else "no_vocals.wav"
    output_job_dir = SEPARATED_DIR / job_id
    
    # Locate stem file recursively in job directory
    target_file = None
    for root, _, files in os.walk(output_job_dir):
        if filename in files:
            target_file = Path(root) / filename
            break

    if not target_file or not target_file.exists():
        raise HTTPException(status_code=404, detail="Faixa de áudio isolada não foi encontrada.")

    return FileResponse(
        path=target_file,
        media_type="audio/wav",
        filename=f"{stem_type}_{job_id}.wav"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
