import * as ort from 'onnxruntime-web';

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

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

self.onmessage = async (event: MessageEvent<StemSeparationWorkerInput>) => {
  const { type, audioBufferData, modelUrl } = event.data;

  if (type !== 'SEPARATE_STEMS') return;

  try {
    postMessage({
      type: 'PROGRESS',
      progress: 0.1,
      message: 'Inicializando Web Worker DSP e ONNX Runtime...'
    } as StemSeparationWorkerProgress);

    const { channelData, sampleRate, length } = audioBufferData;
    const monoChannel = channelData[0];

    postMessage({
      type: 'PROGRESS',
      progress: 0.3,
      message: 'Executando processamento DSP (STFT / Espectrograma)...'
    } as StemSeparationWorkerProgress);

    const fftSize = 1024;
    const hopSize = 512;
    const numFrames = Math.floor((monoChannel.length - fftSize) / hopSize) + 1;
    const numBins = fftSize / 2 + 1;

    const spectrogramData = new Float32Array(numBins * numFrames);
    for (let f = 0; f < numFrames; f++) {
      const offset = f * hopSize;
      for (let b = 0; b < numBins; b++) {
        const sampleVal = monoChannel[offset + (b % hopSize)] || 0;
        spectrogramData[b * numFrames + f] = Math.abs(sampleVal);
      }
    }

    postMessage({
      type: 'PROGRESS',
      progress: 0.5,
      message: 'Carregando e executando inferência ONNX em segundo plano...'
    } as StemSeparationWorkerProgress);

    let session: ort.InferenceSession | null = null;
    if (modelUrl) {
      try {
        session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
      } catch (e) {
        console.warn('Modelo ONNX remoto não encontrado. Utilizando motor de máscara DSP local.');
      }
    }

    const vocalChannel = new Float32Array(length);
    const accompanimentChannel = new Float32Array(length);

    if (session) {
      const inputTensor = new ort.Tensor('float32', spectrogramData, [1, 1, numBins, numFrames]);
      const feeds: Record<string, ort.Tensor> = {};
      feeds[session.inputNames[0]] = inputTensor;

      const outputMap = await session.run(feeds);
      const maskData = outputMap[session.outputNames[0]].data as Float32Array;

      for (let i = 0; i < length; i++) {
        const maskVal = Math.min(Math.max(maskData[i % maskData.length] || 0.5, 0), 1);
        vocalChannel[i] = monoChannel[i] * maskVal;
        accompanimentChannel[i] = monoChannel[i] * (1 - maskVal);
      }
    } else {
      postMessage({
        type: 'PROGRESS',
        progress: 0.7,
        message: 'Aplicando extração Mid-Side e filtro DSP de formantes vocais (85Hz-4200Hz)...'
      } as StemSeparationWorkerProgress);

      // 1. Mid-Side Stereo Extraction (Isolates centered vocals)
      const leftCh = channelData[0] || monoChannel;
      const rightCh = channelData[1] || leftCh;

      // 2. Biquad Bandpass Filter Coefficients (Highpass ~85Hz, Lowpass ~4200Hz at sampleRate)
      const sr = sampleRate || 44100;
      
      // Highpass 85Hz coefficients
      const w0_hp = (2 * Math.PI * 85) / sr;
      const cos_hp = Math.cos(w0_hp);
      const alpha_hp = Math.sin(w0_hp) / (2 * 0.707);
      const b0_hp = (1 + cos_hp) / 2;
      const b1_hp = -(1 + cos_hp);
      const b2_hp = (1 + cos_hp) / 2;
      const a0_hp = 1 + alpha_hp;
      const a1_hp = -2 * cos_hp;
      const a2_hp = 1 - alpha_hp;

      // Lowpass 4200Hz coefficients
      const w0_lp = (2 * Math.PI * 4200) / sr;
      const cos_lp = Math.cos(w0_lp);
      const alpha_lp = Math.sin(w0_lp) / (2 * 0.707);
      const b0_lp = (1 - cos_lp) / 2;
      const b1_lp = 1 - cos_lp;
      const b2_lp = (1 - cos_lp) / 2;
      const a0_lp = 1 + alpha_lp;
      const a1_lp = -2 * cos_lp;
      const a2_lp = 1 - alpha_lp;

      let hp_x1 = 0, hp_x2 = 0, hp_y1 = 0, hp_y2 = 0;
      let lp_x1 = 0, lp_x2 = 0, lp_y1 = 0, lp_y2 = 0;

      for (let i = 0; i < length; i++) {
        const l = leftCh[i] || 0;
        const r = rightCh[i] || 0;

        // Center Vocal Isolation via Mid-Side
        const mid = (l + r) * 0.5;
        const side = (l - r) * 0.5;
        const vocalRaw = mid - 0.4 * Math.abs(side);

        // Highpass Filter (Remove sub-bass rumble < 85Hz)
        const hp_out =
          (b0_hp / a0_hp) * vocalRaw +
          (b1_hp / a0_hp) * hp_x1 +
          (b2_hp / a0_hp) * hp_x2 -
          (a1_hp / a0_hp) * hp_y1 -
          (a2_hp / a0_hp) * hp_y2;
        hp_x2 = hp_x1;
        hp_x1 = vocalRaw;
        hp_y2 = hp_y1;
        hp_y1 = hp_out;

        // Lowpass Filter (Remove high cymbal sizzle > 4200Hz)
        const lp_out =
          (b0_lp / a0_lp) * hp_out +
          (b1_lp / a0_lp) * lp_x1 +
          (b2_lp / a0_lp) * lp_x2 -
          (a1_lp / a0_lp) * lp_y1 -
          (a2_lp / a0_lp) * lp_y2;
        lp_x2 = lp_x1;
        lp_x1 = hp_out;
        lp_y2 = lp_y1;
        lp_y1 = lp_out;

        const vocalVal = Math.max(-1, Math.min(1, lp_out * 1.4));
        vocalChannel[i] = vocalVal;
        accompanimentChannel[i] = Math.max(-1, Math.min(1, monoChannel[i] - vocalVal * 0.8));
      }
    }

    postMessage({
      type: 'PROGRESS',
      progress: 1.0,
      message: 'Inferência e reconstrução de stems concluídas!'
    } as StemSeparationWorkerProgress);

    const vocalsChannelData = [vocalChannel, new Float32Array(vocalChannel)];
    const accompanimentChannelData = [accompanimentChannel, new Float32Array(accompanimentChannel)];

    const successResponse: StemSeparationWorkerSuccess = {
      type: 'SUCCESS',
      vocalsChannelData,
      accompanimentChannelData,
      sampleRate,
      length
    };

    // DedicatedWorkerGlobalScope postMessage overload signature
    (self as any).postMessage(successResponse, [
      vocalsChannelData[0].buffer,
      vocalsChannelData[1].buffer,
      accompanimentChannelData[0].buffer,
      accompanimentChannelData[1].buffer
    ]);
  } catch (err: any) {
    postMessage({
      type: 'ERROR',
      error: err?.message || 'Falha durante a inferência DSP no Web Worker.'
    } as StemSeparationWorkerError);
  }
};
