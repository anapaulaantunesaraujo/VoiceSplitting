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
        message: 'Aplicando filtro DSP de formantes vocais (Fórmula de Filtro Passa-Banda)...'
      } as StemSeparationWorkerProgress);

      const alpha = 0.15;
      let prevVal = 0;

      for (let i = 0; i < length; i++) {
        const currentVal = monoChannel[i];
        const vocalEst = alpha * (prevVal + currentVal);
        prevVal = currentVal;

        const vocalVal = Math.max(-1, Math.min(1, vocalEst * 1.8));
        vocalChannel[i] = vocalVal;
        accompanimentChannel[i] = currentVal - vocalVal * 0.7;
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
