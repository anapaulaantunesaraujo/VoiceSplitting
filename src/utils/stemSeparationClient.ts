import {
  StemSeparationWorkerInput,
  StemSeparationWorkerOutput
} from '../workers/stemSeparation.worker';

export interface RunWorkerStemSeparationOptions {
  audioBuffer: AudioBuffer;
  modelUrl?: string;
  onProgress?: (progress: number, message: string) => void;
}

export interface RunWorkerStemSeparationResult {
  vocalAudioBuffer: AudioBuffer;
  accompanimentAudioBuffer: AudioBuffer;
  vocalBlobUrl: string;
  accompanimentBlobUrl: string;
}

/**
 * Encodes an AudioBuffer into an uncompressed WAV Blob
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Offloads stem separation DSP & ONNX inference to a background Web Worker without blocking the main UI thread.
 */
export function separateStemsWithWorker(
  options: RunWorkerStemSeparationOptions
): Promise<RunWorkerStemSeparationResult> {
  return new Promise((resolve, reject) => {
    const { audioBuffer, modelUrl, onProgress } = options;

    const worker = new Worker(new URL('../workers/stemSeparation.worker.ts', import.meta.url), {
      type: 'module'
    });

    const channelData: Float32Array[] = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }

    const payload: StemSeparationWorkerInput = {
      type: 'SEPARATE_STEMS',
      audioBufferData: {
        channelData,
        sampleRate: audioBuffer.sampleRate,
        length: audioBuffer.length,
        duration: audioBuffer.duration
      },
      modelUrl
    };

    worker.onmessage = (e: MessageEvent<StemSeparationWorkerOutput>) => {
      const data = e.data;

      if (data.type === 'PROGRESS') {
        if (onProgress) {
          onProgress(data.progress, data.message);
        }
      } else if (data.type === 'SUCCESS') {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();

          const vocalAudioBuffer = ctx.createBuffer(
            data.vocalsChannelData.length,
            data.length,
            data.sampleRate
          );
          data.vocalsChannelData.forEach((ch, idx) => {
            const arr = new Float32Array(ch);
            vocalAudioBuffer.copyToChannel(arr, idx);
          });

          const accompanimentAudioBuffer = ctx.createBuffer(
            data.accompanimentChannelData.length,
            data.length,
            data.sampleRate
          );
          data.accompanimentChannelData.forEach((ch, idx) => {
            const arr = new Float32Array(ch);
            accompanimentAudioBuffer.copyToChannel(arr, idx);
          });

          ctx.close();

          const vocalBlob = audioBufferToWavBlob(vocalAudioBuffer);
          const accompanimentBlob = audioBufferToWavBlob(accompanimentAudioBuffer);

          const vocalBlobUrl = URL.createObjectURL(vocalBlob);
          const accompanimentBlobUrl = URL.createObjectURL(accompanimentBlob);

          worker.terminate();

          resolve({
            vocalAudioBuffer,
            accompanimentAudioBuffer,
            vocalBlobUrl,
            accompanimentBlobUrl
          });
        } catch (err: any) {
          worker.terminate();
          reject(err);
        }
      } else if (data.type === 'ERROR') {
        worker.terminate();
        reject(new Error(data.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(`Erro de execução no Web Worker: ${err.message}`));
    };

    worker.postMessage(payload);
  });
}
