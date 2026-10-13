import { ExternalLink, Music2, Pause, Play, SkipForward, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { SoundscapeController } from "@/hooks/use-soundscape";
import { cn } from "@/lib/utils";

type MusicPlayerProps = {
  soundscape: SoundscapeController;
};

export function MusicPlayer({ soundscape }: MusicPlayerProps) {
  const {
    category,
    setCategory,
    track,
    playing,
    toggle,
    next,
    volume,
    setVolume,
    supported,
    error,
  } = soundscape;

  return (
    <section className="panel music-card" aria-labelledby="music-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow"><Music2 /> 原创对局音乐</span>
          <h2 id="music-title">{track.title}</h2>
          <small>{track.subtitle}</small>
        </div>
        <span className="music-kind">{category === "pop" ? "流行氛围" : "纯音乐"}</span>
      </div>

      <div className="player-row">
        <Button
          type="button"
          aria-label={playing ? `暂停${track.title}` : `播放${track.title}`}
          className="play-button"
          size="icon"
          onClick={toggle}
          disabled={!supported}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className={cn("waveform", playing && "playing")} aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => <i key={index} />)}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={next} aria-label="下一首原创曲目">
          <SkipForward />
        </Button>
      </div>

      <div className="volume-row">
        <Volume2 aria-hidden="true" />
        <Slider
          value={[volume]}
          min={0}
          max={1}
          step={0.05}
          onValueChange={(value) => setVolume(value[0] ?? volume)}
          aria-label="音乐音量"
        />
        <span>{Math.round(volume * 100)}%</span>
      </div>

      {error ? <p className="audio-error" role="status">{error}</p> : null}

      <div className="music-links">
        <button className={category === "pop" ? "active" : ""} onClick={() => setCategory("pop")} type="button">流行氛围</button>
        <button className={category === "instrumental" ? "active" : ""} onClick={() => setCategory("instrumental")} type="button">纯音乐</button>
        <a href="https://www.gequhai.com/" target="_blank" rel="noopener noreferrer">在线选歌 <ExternalLink /></a>
      </div>
    </section>
  );
}
