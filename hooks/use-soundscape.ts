"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createSoundscapePlayer,
  TRACKS,
  type SoundscapeCategory,
  type SoundscapePlayer,
} from "@/lib/audio/soundscapes";

export type SoundscapeController = ReturnType<typeof useSoundscape>;

export function useSoundscape() {
  const playerRef = useRef<SoundscapePlayer | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [category, setCategoryState] = useState<SoundscapeCategory>("instrumental");
  const [trackId, setTrackId] = useState("bamboo-rain");
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.42);
  const [error, setError] = useState<string | null>(null);

  const tracks = useMemo(
    () => TRACKS.filter((candidate) => candidate.category === category),
    [category],
  );
  const track = tracks.find((candidate) => candidate.id === trackId) ?? tracks[0];

  useEffect(() => {
    const player = createSoundscapePlayer();
    playerRef.current = player;
    let active = true;
    queueMicrotask(() => {
      if (active) setSupported(player.supported);
    });
    return () => {
      active = false;
      void player.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      !playing ||
      !track ||
      !playerRef.current ||
      activeTrackIdRef.current === track.id
    ) return;
    void playerRef.current.play(track, volume).catch(() => {
      setPlaying(false);
      setError("内置音乐启动失败，请检查浏览器的音频权限。");
    });
    activeTrackIdRef.current = track.id;
  }, [playing, track, volume]);

  const play = useCallback(async () => {
    if (!playerRef.current?.supported || !track) {
      setError("当前浏览器无法播放内置音乐。");
      return false;
    }
    try {
      await playerRef.current.play(track, volume);
      activeTrackIdRef.current = track.id;
      setPlaying(true);
      setError(null);
      return true;
    } catch {
      setError("内置音乐启动失败，请检查浏览器的音频权限。");
      return false;
    }
  }, [track, volume]);

  const pause = useCallback(() => {
    playerRef.current?.pause();
    activeTrackIdRef.current = null;
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else void play();
  }, [pause, play, playing]);

  const setCategory = useCallback((next: SoundscapeCategory) => {
    const first = TRACKS.find((candidate) => candidate.category === next);
    setCategoryState(next);
    if (first) setTrackId(first.id);
  }, []);

  const next = useCallback(() => {
    const index = tracks.findIndex((candidate) => candidate.id === track.id);
    setTrackId(tracks[(index + 1) % tracks.length].id);
  }, [track.id, tracks]);

  const setVolume = useCallback((next: number) => {
    const safeVolume = Math.max(0, Math.min(1, next));
    setVolumeState(safeVolume);
    playerRef.current?.setVolume(safeVolume);
  }, []);

  return {
    supported,
    category,
    setCategory,
    track,
    playing,
    play,
    pause,
    toggle,
    next,
    volume,
    setVolume,
    error,
  };
}
