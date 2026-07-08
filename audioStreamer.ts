/**
 * Zoya's Audio Streamer
 * Handles 16kHz PCM microphone recording, 24kHz PCM playback with gapless scheduling,
 * and spectrum analysis for both user input and Zoya's speech.
 */

export class AudioStreamer {
  // Input (Microphone) properties
  private inputCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;

  // Output (Playback) properties
  private outputCtx: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private outputGain: GainNode | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  // Callbacks
  private onInputAudio: ((base64Pcm: string) => void) | null = null;
  private onSpeechDetected: ((isActive: boolean) => void) | null = null;

  // State
  private isRecording = false;
  private isPlaying = false;
  private speechTimeout: NodeJS.Timeout | null = null;

  constructor(
    onInputAudio: (base64Pcm: string) => void,
    onSpeechDetected?: (isActive: boolean) => void
  ) {
    this.onInputAudio = onInputAudio;
    if (onSpeechDetected) {
      this.onSpeechDetected = onSpeechDetected;
    }
  }

  /**
   * Initializes the input audio context and begins recording from microphone
   */
  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    try {
      // 1. Request microphone access
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Create Input AudioContext locked strictly at 16000Hz (Gemini standard)
      this.inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      // Resume context if suspended (browser security autoplay policies)
      if (this.inputCtx.state === 'suspended') {
        await this.inputCtx.resume();
      }

      this.micSource = this.inputCtx.createMediaStreamSource(this.micStream);
      
      // 3. Create Analyser for microphone input
      this.inputAnalyser = this.inputCtx.createAnalyser();
      this.inputAnalyser.fftSize = 256;
      this.micSource.connect(this.inputAnalyser);

      // 4. Create ScriptProcessorNode for reading raw audio floats
      // 4096 buffer size is standard and offers a good trade-off between latency and stability
      this.processor = this.inputCtx.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        
        const float32Data = e.inputBuffer.getChannelData(0);
        
        // Compute root-mean-square (RMS) value to detect if user is actively speaking
        let sum = 0;
        for (let i = 0; i < float32Data.length; i++) {
          sum += float32Data[i] * float32Data[i];
        }
        const rms = Math.sqrt(sum / float32Data.length);
        this.detectVoiceActivity(rms);

        // Convert the Float32 input to raw 16-bit Signed PCM Little-Endian
        const pcmBuffer = this.float32ToPCM16(float32Data);
        const base64 = this.arrayBufferToBase64(pcmBuffer);
        
        if (this.onInputAudio && base64) {
          this.onInputAudio(base64);
        }
      };

      // Connect everything
      this.micSource.connect(this.processor);
      this.processor.connect(this.inputCtx.destination);

      this.isRecording = true;
      console.log("[Zoya Audio] Microphones recording started at 16kHz.");
    } catch (err) {
      console.error("[Zoya Audio] Failed to start microphone capture:", err);
      this.stopRecording();
      throw err;
    }
  }

  /**
   * Simple voice activity detection based on energy threshold
   */
  private detectVoiceActivity(rms: number): void {
    const threshold = 0.015; // Noise gate threshold
    const isSpeakingNow = rms > threshold;
    
    if (isSpeakingNow) {
      if (this.speechTimeout) {
        clearTimeout(this.speechTimeout);
        this.speechTimeout = null;
      }
      if (this.onSpeechDetected) {
        this.onSpeechDetected(true);
      }
    } else if (!this.speechTimeout) {
      // Small debounce delay before marking user as "stopped speaking"
      this.speechTimeout = setTimeout(() => {
        if (this.onSpeechDetected) {
          this.onSpeechDetected(false);
        }
        this.speechTimeout = null;
      }, 800);
    }
  }

  /**
   * Stops microphone recording and cleans up resources
   */
  stopRecording(): void {
    this.isRecording = false;

    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.inputCtx) {
      this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }

    if (this.inputAnalyser) {
      this.inputAnalyser = null;
    }

    console.log("[Zoya Audio] Microphone recording stopped and cleaned up.");
  }

  /**
   * Initializes the output audio context (at 24000Hz for model speech output)
   */
  private initPlayback(): void {
    if (this.outputCtx) return;

    this.outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });

    this.outputAnalyser = this.outputCtx.createAnalyser();
    this.outputAnalyser.fftSize = 256;

    this.outputGain = this.outputCtx.createGain();
    this.outputGain.gain.setValueAtTime(1.0, this.outputCtx.currentTime);

    // Chain: Output Nodes -> Analyser -> Gain -> Audio Destination
    this.outputAnalyser.connect(this.outputGain);
    this.outputGain.connect(this.outputCtx.destination);

    this.nextStartTime = 0;
  }

  /**
   * Accepts raw 24kHz base64 PCM chunk and schedules it gaplessly
   */
  async playResponseChunk(base64Pcm: string): Promise<void> {
    this.initPlayback();
    if (!this.outputCtx || !this.outputAnalyser) return;

    try {
      // Resume context if suspended (browser autoplay restrictions)
      if (this.outputCtx.state === 'suspended') {
        await this.outputCtx.resume();
      }

      // Convert 16-bit PCM base64 back into browser-native Float32 array
      const float32Data = this.pcm16ToFloat32(base64Pcm);
      
      // Create a single-channel (mono) audio buffer at 24000Hz
      const audioBuffer = this.outputCtx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      // Create a buffer source node
      const source = this.outputCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAnalyser);

      const currentTime = this.outputCtx.currentTime;
      let playTime = this.nextStartTime;

      // Handle fallback if network jitter caused a gap or we fell behind real-time
      if (playTime < currentTime) {
        playTime = currentTime + 0.03; // 30ms warm padding buffer
      }

      source.start(playTime);
      this.nextStartTime = playTime + audioBuffer.duration;

      // Register the source so we can stop it if Zoya gets interrupted
      this.activeSources.push(source);
      this.isPlaying = true;

      source.onended = () => {
        // Remove from active sources
        this.activeSources = this.activeSources.filter((s) => s !== source);
        if (this.activeSources.length === 0) {
          this.isPlaying = false;
        }
      };

    } catch (err) {
      console.error("[Zoya Audio] Error scheduling audio playback chunk:", err);
    }
  }

  /**
   * Instantly stops all playing audio streams and clears the playback queue
   */
  stopPlayback(): void {
    console.log("[Zoya Audio] Interrupt triggered: Stopping all playing output channels");
    
    this.activeSources.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source already stopped or not started
      }
    });

    this.activeSources = [];
    this.nextStartTime = 0;
    this.isPlaying = false;
  }

  /**
   * Cleanly closes and releases all input/output audio contexts
   */
  cleanup(): void {
    this.stopRecording();
    this.stopPlayback();

    if (this.outputCtx) {
      this.outputCtx.close().catch(() => {});
      this.outputCtx = null;
    }

    this.outputAnalyser = null;
    this.outputGain = null;
  }

  /**
   * Retrieves live mic input frequency spectrum data for the visualizer
   */
  getMicFrequencyData(): Uint8Array | null {
    if (!this.inputAnalyser) return null;
    const dataArray = new Uint8Array(this.inputAnalyser.frequencyBinCount);
    this.inputAnalyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Retrieves live playback frequency spectrum data for the visualizer
   */
  getPlaybackFrequencyData(): Uint8Array | null {
    if (!this.outputAnalyser) return null;
    const dataArray = new Uint8Array(this.outputAnalyser.frequencyBinCount);
    this.outputAnalyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Helper: Converts browser Float32 audio to standard 16-bit Signed PCM Little-Endian
   */
  private float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      // Scaled up to 16-bit limits
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, val, true); // true = little-endian
      offset += 2;
    }
    
    return buffer;
  }

  /**
   * Helper: Decodes 16-bit Signed PCM Little-Endian base64 string back to Float32 Array
   */
  private pcm16ToFloat32(base64: string): Float32Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    
    return float32Array;
  }

  /**
   * Helper: Encodes ArrayBuffer to base64 format safely
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
