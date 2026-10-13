export type SoundscapeCategory = "pop" | "instrumental";

export type SoundscapeTrack = {
  id: string;
  title: string;
  subtitle: string;
  category: SoundscapeCategory;
  bpm: number;
  waveform: OscillatorType;
  notes: number[];
  bass: number[];
};

export const TRACKS: SoundscapeTrack[] = [
  {
    id: "city-breeze",
    title: "城南风起",
    subtitle: "轻快鼓点般的少年行",
    category: "pop",
    bpm: 92,
    waveform: "triangle",
    notes: [60, 64, 67, 69, 67, 64, 62, 64, 67, 71, 69, 67],
    bass: [48, 48, 53, 55],
  },
  {
    id: "river-lanterns",
    title: "灯影入江",
    subtitle: "温暖流行氛围",
    category: "pop",
    bpm: 84,
    waveform: "sine",
    notes: [57, 60, 64, 67, 64, 60, 59, 60, 64, 69, 67, 64],
    bass: [45, 48, 41, 43],
  },
  {
    id: "bamboo-rain",
    title: "竹窗听雨",
    subtitle: "清润的弈室雨声",
    category: "instrumental",
    bpm: 64,
    waveform: "sine",
    notes: [60, 67, 64, 69, 67, 64, 62, 60, 55, 62, 59, 64],
    bass: [48, 43, 45, 41],
  },
  {
    id: "empty-mountain",
    title: "空山落子",
    subtitle: "缓慢沉静的山水回响",
    category: "instrumental",
    bpm: 58,
    waveform: "triangle",
    notes: [55, 62, 59, 64, 62, 59, 57, 55, 52, 59, 57, 55],
    bass: [43, 40, 45, 38],
  },
];

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export type SoundscapePlayer = {
  supported: boolean;
  play(track: SoundscapeTrack, volume: number): Promise<void>;
  pause(): void;
  setVolume(volume: number): void;
  destroy(): Promise<void>;
};

export function createSoundscapePlayer(): SoundscapePlayer {
  const supported = typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let step = 0;

  const clearSchedule = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const fadeOut = () => {
    clearSchedule();
    if (!context || !master) return;
    const fading = master;
    const now = context.currentTime;
    fading.gain.cancelScheduledValues(now);
    fading.gain.setValueAtTime(Math.max(fading.gain.value, 0.0001), now);
    fading.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    globalThis.setTimeout(() => fading.disconnect(), 220);
    master = null;
  };

  const scheduleVoice = (
    destination: AudioNode,
    frequency: number,
    waveform: OscillatorType,
    gain: number,
    duration: number,
  ) => {
    if (!context) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.04);
  };

  return {
    supported,
    async play(track, volume) {
      if (!supported) throw new Error("Web Audio unavailable");
      fadeOut();
      context ??= new AudioContext();
      await context.resume();

      const nextMaster = context.createGain();
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = track.category === "pop" ? 2100 : 1650;
      filter.Q.value = 0.55;
      nextMaster.connect(filter).connect(context.destination);
      nextMaster.gain.setValueAtTime(0.0001, context.currentTime);
      nextMaster.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), context.currentTime + 0.18);
      master = nextMaster;
      step = 0;

      const tick = () => {
        if (!master) return;
        const note = track.notes[step % track.notes.length];
        scheduleVoice(master, midiToHz(note), track.waveform, 0.11, track.category === "pop" ? 0.58 : 0.9);
        if (step % 3 === 0) {
          const bass = track.bass[Math.floor(step / 3) % track.bass.length];
          scheduleVoice(master, midiToHz(bass), "sine", 0.045, 1.2);
        }
        step += 1;
      };

      tick();
      timer = setInterval(tick, 60_000 / track.bpm);
    },
    pause: fadeOut,
    setVolume(volume) {
      if (!context || !master) return;
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(Math.max(volume, 0.0001), now, 0.04);
    },
    async destroy() {
      fadeOut();
      if (context) await context.close();
      context = null;
    },
  };
}
