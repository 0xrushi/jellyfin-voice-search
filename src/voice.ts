// The Web Speech API types are not in standard TypeScript DOM lib
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySpeechRecognition = any;

export class VoiceCapture {
  private recognition: AnySpeechRecognition = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private stopRequested = false;

  static hasWebSpeech(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  static hasMicrophone(): boolean {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  async captureWebSpeech(lang = 'en-US'): Promise<string> {
    return new Promise((resolve, reject) => {
      const win = window as any;
      const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;
      if (!SR) { reject(new Error('SpeechRecognition not available')); return; }

      this.recognition = new SR();
      this.recognition.lang = lang;
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      let settled = false;

      this.recognition.onresult = (e: any) => {
        settled = true;
        resolve(e.results[0][0].transcript as string);
      };

      this.recognition.onerror = (e: any) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Speech recognition error: ${e.error}`));
        }
      };

      this.recognition.onend = () => {
        if (!settled) {
          settled = true;
          reject(new Error('No speech detected'));
        }
      };

      this.recognition.start();
    });
  }

  async captureMediaRecorder(
    maxSeconds = 20,
    silenceThreshold = 0.01,
    onStateChange?: (state: 'listening' | 'silence') => void
  ): Promise<Blob> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stopRequested = false;
    const chunks: Blob[] = [];

    return new Promise((resolve, reject) => {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(this.stream!);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);

      let silenceChunks = 0;
      // ~1.3 s of silence at 60 ms intervals
      const maxSilenceChunks = 22;
      const maxChunks = Math.floor((maxSeconds * 1000) / 60);
      let totalChunks = 0;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.stream!, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        clearInterval(vadTimer);
        ctx.close();
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: mimeType }));
      };

      this.mediaRecorder.onerror = (e) => {
        clearInterval(vadTimer);
        ctx.close();
        this.stream?.getTracks().forEach((t) => t.stop());
        reject(e);
      };

      this.mediaRecorder.start(60);
      onStateChange?.('listening');

      const vadTimer = setInterval(() => {
        if (this.stopRequested) {
          clearInterval(vadTimer);
          this.mediaRecorder?.stop();
          return;
        }

        analyser.getFloatTimeDomainData(dataArray);
        const rms = Math.sqrt(
          dataArray.reduce((sum, v) => sum + v * v, 0) / bufferLength
        );

        totalChunks++;

        if (rms < silenceThreshold) {
          silenceChunks++;
          if (silenceChunks >= maxSilenceChunks) {
            clearInterval(vadTimer);
            this.mediaRecorder?.stop();
          }
        } else {
          if (silenceChunks > 0) onStateChange?.('listening');
          silenceChunks = 0;
        }

        if (totalChunks >= maxChunks) {
          clearInterval(vadTimer);
          this.mediaRecorder?.stop();
        }
      }, 60);
    });
  }

  stop(): void {
    this.stopRequested = true;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.recognition?.abort();
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }
}
