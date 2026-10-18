export interface StemSeparationWorkerInput {
  type: 'SEPARATE_STEMS';
  audioBufferData: {
    channelData: Float32Array[];
    sampleRate: number;
    length: number;
    duration: number;
  };
  modelUrl?: string;
}

export interface StemSeparationWorkerProgress {
  type: 'PROGRESS';
  progress: number;
  message: string;
}

export interface StemSeparationWorkerSuccess {
  type: 'SUCCESS';
  vocalsChannelData: Float32Array[];
  accompanimentChannelData: Float32Array[];
  sampleRate: number;
  length: number;
}

export interface StemSeparationWorkerError {
  type: 'ERROR';
  error: string;
}

export type StemSeparationWorkerOutput =
  | StemSeparationWorkerProgress
  | StemSeparationWorkerSuccess
  | StemSeparationWorkerError;

/**
 * Precomputed Radix-2 Cooley-Tukey FFT implementation
 */
class Radix2FFT {
  private n: number;
  private bitRev: Uint32Array;
  private cosTable: Float32Array;
  private sinTable: Float32Array;

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) {
      throw new Error('FFT size must be a power of 2');
    }
    this.n = n;
    this.bitRev = new Uint32Array(n);
    const bits = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) {
      let rev = 0;
      let temp = i;
      for (let j = 0; j < bits; j++) {
        rev = (rev << 1) | (temp & 1);
        temp >>= 1;
      }
      this.bitRev[i] = rev;
    }

    const half = n / 2;
    this.cosTable = new Float32Array(half);
    this.sinTable = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      const angle = (-2 * Math.PI * i) / n;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }
  }

  public transform(real: Float32Array, imag: Float32Array, inverse = false): void {
    const n = this.n;

    // Bit-reversal permutation
    for (let i = 0; i < n; i++) {
      const rev = this.bitRev[i];
      if (rev > i) {
        const tr = real[i];
        real[i] = real[rev];
        rev in real && (real[rev] = tr);

        const ti = imag[i];
        imag[i] = imag[rev];
        imag[rev] = ti;
      }
    }

    // Cooley-Tukey butterflies
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < halfLen; j++) {
          const tableIdx = j * step;
          const c = this.cosTable[tableIdx];
          const s = inverse ? -this.sinTable[tableIdx] : this.sinTable[tableIdx];

          const uR = real[i + j];
          const uI = imag[i + j];

          const vR = real[i + j + halfLen];
          const vI = imag[i + j + halfLen];

          const tR = vR * c - vI * s;
          const tI = vR * s + vI * c;

          real[i + j] = uR + tR;
          imag[i + j] = uI + tI;
          real[i + j + halfLen] = uR - tR;
          imag[i + j + halfLen] = uI - tI;
        }
      }
    }

    if (inverse) {
      const invN = 1 / n;
      for (let i = 0; i < n; i++) {
        real[i] *= invN;
        imag[i] *= invN;
      }
    }
  }
}

self.onmessage = async (event: MessageEvent<StemSeparationWorkerInput>) => {
  const { type, audioBufferData } = event.data;

  if (type !== 'SEPARATE_STEMS') return;

  try {
    postMessage({
      type: 'PROGRESS',
      progress: 0.05,
      message: 'Iniciando isolador acústico espectral (STFT Center-Pan Isolation)...'
    } as StemSeparationWorkerProgress);

    const { channelData, sampleRate, length } = audioBufferData;
    const leftCh = channelData[0];
    const rightCh = channelData.length > 1 ? channelData[1] : leftCh;

    const fftSize = 2048;
    const hopSize = 512; // 75% overlap for artifact-free reconstruction
    const fft = new Radix2FFT(fftSize);

    // Precompute Hann window and window squared sum
    const window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    // Frequency weighting profile:
    // Attenuates sub-bass (<100Hz) and high sizzle/cymbals (>7.5kHz),
    // focusing heavily on human vocal formants (120Hz - 4200Hz).
    const freqWeights = new Float32Array(fftSize / 2 + 1);
    for (let k = 0; k <= fftSize / 2; k++) {
      const freq = (k * sampleRate) / fftSize;
      if (freq < 90) {
        // Cut sub-bass, kick drum, bass fundamentals
        freqWeights[k] = 0.0;
      } else if (freq < 160) {
        // Smooth vocal fundamental rise
        const t = (freq - 90) / 70;
        freqWeights[k] = t * t;
      } else if (freq <= 4200) {
        // Core vocal range and primary speech formants
        freqWeights[k] = 1.0;
      } else if (freq <= 7500) {
        // High vocal presence and sibilance roll-off
        const t = (freq - 4200) / 3300;
        freqWeights[k] = 1.0 - t * 0.85; // rolls down to 0.15
      } else if (freq <= 10000) {
        // High cymbals, air, percussion suppression
        const t = (freq - 7500) / 2500;
        freqWeights[k] = Math.max(0.02, 0.15 - t * 0.13);
      } else {
        freqWeights[k] = 0.01;
      }
    }

    const numFrames = Math.floor((length - fftSize) / hopSize) + 1;
    const vocalAccumL = new Float32Array(length);
    const vocalAccumR = new Float32Array(length);
    const normWeight = new Float32Array(length);

    const realL = new Float32Array(fftSize);
    const imagL = new Float32Array(fftSize);
    const realR = new Float32Array(fftSize);
    const imagR = new Float32Array(fftSize);

    const realOutL = new Float32Array(fftSize);
    const imagOutL = new Float32Array(fftSize);
    const realOutR = new Float32Array(fftSize);
    const imagOutR = new Float32Array(fftSize);

    let lastProgressTime = Date.now();

    for (let frame = 0; frame < numFrames; frame++) {
      const offset = frame * hopSize;

      // Extract windowed samples
      for (let i = 0; i < fftSize; i++) {
        const idx = offset + i;
        const w = window[i];
        realL[i] = (leftCh[idx] || 0) * w;
        imagL[i] = 0;
        realR[i] = (rightCh[idx] || 0) * w;
        imagR[i] = 0;
      }

      // Compute STFT for both channels
      fft.transform(realL, imagL, false);
      fft.transform(realR, imagR, false);

      // Spectral Processing per frequency bin
      for (let k = 0; k <= fftSize / 2; k++) {
        const rL = realL[k];
        const iL = imagL[k];
        const rR = realR[k];
        const iR = imagR[k];

        const magL = Math.sqrt(rL * rL + iL * iL);
        const magR = Math.sqrt(rR * rR + iR * iR);
        const sumMag = magL + magR + 1e-7;

        // Panning disparity: 0 when centered, ~1 when panned hard
        const panRatio = Math.abs(magL - magR) / sumMag;

        // Center Panning Mask: vocals are centered in studio mixes,
        // while stereo guitars, reverbs, cymbals, synths are panned.
        // Threshold: sounds with pan disparity > 0.28 are strongly attenuated.
        const centerScore = Math.max(0, 1 - Math.pow(panRatio / 0.28, 2));

        // Combined mask: Center Pan Mask x Vocal Frequency Weight
        const vocalMask = centerScore * freqWeights[k];

        // Mid-channel (L + R) * 0.5 contains the centered vocal
        const midR = (rL + rR) * 0.5;
        const midI = (iL + iR) * 0.5;

        const outReal = midR * vocalMask;
        const outImag = midI * vocalMask;

        realOutL[k] = outReal;
        imagOutL[k] = outImag;
        realOutR[k] = outReal;
        imagOutR[k] = outImag;

        // Symmetric complex conjugate for inverse FFT
        if (k > 0 && k < fftSize / 2) {
          const symK = fftSize - k;
          realOutL[symK] = outReal;
          imagOutL[symK] = -outImag;
          realOutR[symK] = outReal;
          imagOutR[symK] = -outImag;
        }
      }

      // Inverse FFT back to time domain
      fft.transform(realOutL, imagOutL, true);
      fft.transform(realOutR, imagOutR, true);

      // Overlap-Add with window
      for (let i = 0; i < fftSize; i++) {
        const idx = offset + i;
        if (idx < length) {
          const w = window[i];
          vocalAccumL[idx] += realOutL[i] * w;
          vocalAccumR[idx] += realOutR[i] * w;
          normWeight[idx] += w * w;
        }
      }

      // Periodic progress dispatch (every ~200ms)
      if (Date.now() - lastProgressTime > 200 || frame === numFrames - 1) {
        lastProgressTime = Date.now();
        const pct = Math.round(((frame + 1) / numFrames) * 85);
        postMessage({
          type: 'PROGRESS',
          progress: 0.1 + (pct / 100) * 0.75,
          message: `Processando análise espectral avançada (${pct}%)...`
        } as StemSeparationWorkerProgress);
      }
    }

    postMessage({
      type: 'PROGRESS',
      progress: 0.9,
      message: 'Normalizando e reconstruindo faixas estéreo...'
    } as StemSeparationWorkerProgress);

    // Normalize overlap-add by window energy and calculate clean Accompaniment = Mix - Vocal
    const vocalChannelL = new Float32Array(length);
    const vocalChannelR = new Float32Array(length);
    const accChannelL = new Float32Array(length);
    const accChannelR = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const norm = normWeight[i] > 1e-4 ? normWeight[i] : 1;
      const vL = vocalAccumL[i] / norm;
      const vR = vocalAccumR[i] / norm;

      // Soft clamp
      const clampedVL = Math.max(-1, Math.min(1, vL));
      const clampedVR = Math.max(-1, Math.min(1, vR));

      vocalChannelL[i] = clampedVL;
      vocalChannelR[i] = clampedVR;

      // Pure subtraction guarantees no phase cancellations in the accompaniment
      accChannelL[i] = Math.max(-1, Math.min(1, (leftCh[i] || 0) - clampedVL));
      accChannelR[i] = Math.max(-1, Math.min(1, (rightCh[i] || 0) - clampedVR));
    }

    postMessage({
      type: 'PROGRESS',
      progress: 1.0,
      message: 'Separação de faixas concluída com sucesso!'
    } as StemSeparationWorkerProgress);

    const vocalsChannelData = [vocalChannelL, vocalChannelR];
    const accompanimentChannelData = [accChannelL, accChannelR];

    const successResponse: StemSeparationWorkerSuccess = {
      type: 'SUCCESS',
      vocalsChannelData,
      accompanimentChannelData,
      sampleRate,
      length
    };

    (self as any).postMessage(successResponse, [
      vocalsChannelData[0].buffer,
      vocalsChannelData[1].buffer,
      accompanimentChannelData[0].buffer,
      accompanimentChannelData[1].buffer
    ]);
  } catch (err: any) {
    postMessage({
      type: 'ERROR',
      error: err?.message || 'Falha durante o processamento espectral no Web Worker.'
    } as StemSeparationWorkerError);
  }
};
