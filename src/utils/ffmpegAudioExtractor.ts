import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface ExtractAudioProgress {
  ratio: number;
  message: string;
}

let ffmpegInstance: FFmpeg | null = null;

export async function getFFmpegInstance(onProgress?: (progress: ExtractAudioProgress) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg WASM]', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) {
      onProgress({
        ratio: Math.min(Math.max(progress, 0), 1),
        message: `Processando áudio do vídeo... (${Math.round(progress * 100)}%)`
      });
    }
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * Extracts audio track from video files (MP4, MOV, MKV, AVI) via WebAssembly FFmpeg
 * preserving original sample rate, returning a WAV File and decoded AudioBuffer.
 */
export async function extractAudioFromVideo(
  videoFile: File,
  onProgress?: (progress: ExtractAudioProgress) => void
): Promise<{ audioFile: File; audioBuffer: AudioBuffer; sampleRate: number }> {
  const ffmpeg = await getFFmpegInstance(onProgress);

  const inputName = `input_${Date.now()}_${videoFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const outputName = `extracted_${Date.now()}.wav`;

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  // Run FFmpeg extraction command (-vn: disable video, -acodec pcm_s16le: uncompressed 16-bit WAV)
  await ffmpeg.exec(['-i', inputName, '-vn', '-acodec', 'pcm_s16le', outputName]);

  const fileData = await ffmpeg.readFile(outputName);

  let blobPart: BlobPart;
  if (typeof fileData === 'string') {
    blobPart = fileData;
  } else {
    // Copy into standard ArrayBuffer to bypass SharedArrayBuffer strict TS types
    const ab = new ArrayBuffer(fileData.byteLength);
    new Uint8Array(ab).set(fileData);
    blobPart = ab;
  }

  const audioBlob = new Blob([blobPart], { type: 'audio/wav' });
  const audioFile = new File([audioBlob], `${videoFile.name.split('.')[0]}_audio.wav`, { type: 'audio/wav' });

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  await audioCtx.close();

  return {
    audioFile,
    audioBuffer,
    sampleRate
  };
}
