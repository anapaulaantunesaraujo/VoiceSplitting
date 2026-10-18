import { RunWorkerStemSeparationResult } from './stemSeparationClient';

/**
 * Tenta realizar a separação neural de faixas (Vocal & Instrumental)
 * utilizando o backend FastAPI com Demucs (`htdemucs` / `htdemucs_ft`).
 * Retorna `null` caso o backend esteja offline ou ocorra falha,
 * permitindo fallback transparente e resiliente para o Web Worker no navegador.
 */
export async function separateStemsWithServer(
  fileOrBlob: File | Blob,
  fileName: string,
  onProgress?: (message: string) => void
): Promise<RunWorkerStemSeparationResult | null> {
  const rawBase = ((import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
  const separateEndpoint = rawBase.endsWith('/api') ? `${rawBase}/separate-audio` : `${rawBase}/api/separate-audio`;

  try {
    if (onProgress) onProgress('Verificando conexão com o servidor neural (Demucs)...');

    // Quick health check to fail immediately if backend is offline
    const healthEndpoint = rawBase.endsWith('/api') ? `${rawBase.slice(0, -4)}/health` : `${rawBase}/health`;
    const checkController = new AbortController();
    const checkTimeout = setTimeout(() => checkController.abort(), 2000);
    try {
      const healthRes = await fetch(healthEndpoint, { method: 'GET', signal: checkController.signal });
      clearTimeout(checkTimeout);
      if (!healthRes.ok) return null;
    } catch {
      clearTimeout(checkTimeout);
      return null;
    }

    if (onProgress) onProgress('Enviando áudio para separação neural no servidor (Demucs)...');

    const formData = new FormData();
    const uploadFile = fileOrBlob instanceof File
      ? fileOrBlob
      : new File([fileOrBlob], fileName, { type: fileOrBlob.type || 'audio/wav' });

    formData.append('file', uploadFile);

    const controller = new AbortController();
    // Demucs on CPU may take 30-120 seconds
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const res = await fetch(separateEndpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`Server separation failed with status ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data.stems?.vocals_url || !data.stems?.accompaniment_url) {
      return null;
    }

    if (onProgress) onProgress('Baixando faixas neurais isoladas (Voz e Instrumental)...');

    const baseHost = rawBase.replace(/\/api$/, '');
    const vocalsUrl = data.stems.vocals_url.startsWith('http')
      ? data.stems.vocals_url
      : `${baseHost}${data.stems.vocals_url}`;
    const accUrl = data.stems.accompaniment_url.startsWith('http')
      ? data.stems.accompaniment_url
      : `${baseHost}${data.stems.accompaniment_url}`;

    const [vocalRes, accRes] = await Promise.all([
      fetch(vocalsUrl),
      fetch(accUrl)
    ]);

    if (!vocalRes.ok || !accRes.ok) {
      return null;
    }

    const [vocalBlob, accBlob] = await Promise.all([
      vocalRes.blob(),
      accRes.blob()
    ]);

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();

    const [vocalArrBuf, accArrBuf] = await Promise.all([
      vocalBlob.arrayBuffer(),
      accBlob.arrayBuffer()
    ]);

    const [vocalAudioBuffer, accompanimentAudioBuffer] = await Promise.all([
      ctx.decodeAudioData(vocalArrBuf),
      ctx.decodeAudioData(accArrBuf)
    ]);
    await ctx.close();

    const vocalBlobUrl = URL.createObjectURL(vocalBlob);
    const accompanimentBlobUrl = URL.createObjectURL(accBlob);

    const musicalAnalysis = data.musical_analysis ? {
      key: data.musical_analysis.key,
      rootNote: data.musical_analysis.root_note,
      mode: data.musical_analysis.mode as ('Major' | 'Minor'),
      bpm: data.musical_analysis.bpm,
      duration: data.musical_analysis.duration,
      scaleNotes: data.musical_analysis.scale_notes,
      confidence: data.musical_analysis.confidence
    } : undefined;

    return {
      vocalAudioBuffer,
      accompanimentAudioBuffer,
      vocalBlobUrl,
      accompanimentBlobUrl,
      musicalAnalysis
    };
  } catch (err) {
    console.warn('Erro ao processar via servidor Demucs:', err);
    return null;
  }
}

/**
 * Consulta a análise musical (Tom e BPM) detectada pelo Demucs no backend para uma música.
 */
export async function fetchServerSongAnalysis(title: string): Promise<{
  key: string;
  rootNote: string;
  mode: 'Major' | 'Minor';
  bpm: number;
} | null> {
  const rawBase = ((import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
  const url = `${rawBase}/api/song-analysis?title=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.found && data.musical_analysis) {
      return {
        key: data.musical_analysis.key,
        rootNote: data.musical_analysis.root_note,
        mode: data.musical_analysis.mode,
        bpm: data.musical_analysis.bpm
      };
    }
  } catch {
    // Backend offline ou sem cache
  }
  return null;
}
