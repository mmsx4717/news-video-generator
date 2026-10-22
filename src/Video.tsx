import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
type Cue = { text: string; start: number; end: number };
type Media = {
  type: "image" | "video";
  file: string;
  source: string;
  cue: number;
};
type Scene = {
  id: string;
  company: string;
  title: string;
  points: string[];
  sources: string[];
  media: Media[];
  cues: Cue[];
  startFrame: number;
  frames: number;
};
export type Edition = {
  title: string;
  date: string;
  fps: number;
  frames: number;
  scenes: Scene[];
  captions: Cue[];
  ticker: { text: string; source: string }[];
  demo: boolean;
};
const colors = {
  bg: "#eef5ff",
  ink: "#123269",
  blue: "#1960ee",
  line: "#cbdcf6",
};
const ease = (f: number, start: number, n = 25) =>
  interpolate(f, [start, start + n], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
const base: React.CSSProperties = {
  fontFamily:
    'system-ui, -apple-system, "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
  color: colors.ink,
  background: colors.bg,
};
const RSS: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <rect width="200" height="200" rx="44" fill={colors.blue} />
    <circle cx="50" cy="150" r="14" fill="white" />
    <path
      d="M43 94a64 64 0 0 1 64 64M43 44a114 114 0 0 1 114 114"
      fill="none"
      stroke="white"
      strokeWidth="23"
    />
  </svg>
);
const Story: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  const active = Math.max(
    0,
    s.cues.reduce((last, c, i) => (f >= c.start * fps ? i : last), -1),
  );
  const chosen = s.media.filter((m) => m.cue <= active).at(-1);
  const from = chosen ? Math.round(s.cues[chosen.cue].start * fps) : 0;
  const p = spring({ frame: f, fps, config: { damping: 18 } });
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(ease(f, 0, 14), 1 - ease(f, s.frames - 15, 15)),
        transform: `translateY(${(1 - p) * 35}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 145,
          fontSize: 31,
          fontWeight: 800,
          color: colors.blue,
        }}
      >
        {s.company}
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 195,
          right: 96,
          fontSize: 62,
          lineHeight: 1.18,
          fontWeight: 900,
        }}
      >
        {s.title}
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 320,
          width: 1080,
          height: 550,
          borderRadius: 30,
          background: "white",
          border: `2px solid ${colors.line}`,
          overflow: "hidden",
          boxShadow: "0 24px 70px #153a7610",
        }}
      >
        {chosen ? (
          <Sequence from={from} layout="none">
            <div
              style={{
                height: "100%",
                padding: "30px 30px 55px",
                boxSizing: "border-box",
                opacity: ease(f, from, 18),
                transform: `translateX(${(1 - ease(f, from, 22)) * 40}px)`,
              }}
            >
              {chosen.type === "image" ? (
                <Img
                  src={staticFile(chosen.file)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <OffthreadVideo
                  muted
                  src={staticFile(chosen.file)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              )}
            </div>
          </Sequence>
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 70,
            }}
          >
            <div
              style={{
                transform: `rotate(${Math.sin(f / 60) * 3}deg) scale(${1 + Math.sin(f / 40) * 0.025})`,
              }}
            >
              <RSS size={210} />
            </div>
            <div style={{ fontSize: 55, fontWeight: 850, width: 520 }}>
              {s.points[active % s.points.length] || s.title}
            </div>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 44,
            background: "#f6f9ff",
            display: "flex",
            alignItems: "center",
            paddingLeft: 24,
            fontSize: 20,
            color: "#607ba4",
          }}
        >
          来源：{new URL(chosen?.source || s.sources[0]).hostname}
          {!chosen ? " · 内容示意" : ""}
        </div>
      </div>
      <div style={{ position: "absolute", left: 1230, top: 334, width: 590 }}>
        {s.points.map((point, i) => {
          const enter = spring({
            frame: f - i * 12,
            fps,
            config: { damping: 18 },
          });
          return (
            <div
              key={point}
              style={{
                padding: "28px 30px",
                marginBottom: 28,
                borderRadius: 24,
                fontSize: 35,
                lineHeight: 1.4,
                fontWeight: 750,
                background:
                  active % s.points.length === i ? colors.blue : "white",
                color: active % s.points.length === i ? "white" : colors.ink,
                opacity: enter,
                transform: `translateX(${(1 - enter) * 80}px)`,
              }}
            >
              <span style={{ fontSize: 24, opacity: 0.65, marginRight: 20 }}>
                0{i + 1}
              </span>
              {point}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
export const NewsVideo: React.FC<{ edition: Edition }> = ({ edition: e }) => {
  const f = useCurrentFrame(),
    seconds = f / 60,
    caption = e.captions.find((c) => seconds >= c.start && seconds < c.end);
  const companies = [...new Set(e.scenes.map((s) => s.company))];
  const ticker = e.ticker.length
    ? e.ticker[Math.floor(seconds / 6) % e.ticker.length].text
    : "RSS → 核验 → 文稿 → 配音 → 视频";
  return (
    <AbsoluteFill style={base}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.25,
          backgroundImage: "radial-gradient(#85a9e7 1px,transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 46,
          right: 96,
          display: "flex",
          gap: 30,
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 43, fontWeight: 950, whiteSpace: "nowrap" }}>
          资讯日报
        </div>
        <div style={{ height: 44, width: 3, background: colors.line }} />
        <div
          style={{
            fontSize: 28,
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ticker}
        </div>
        <div style={{ fontSize: 26, color: colors.blue }}>{e.date}</div>
      </div>
      {e.scenes.map((s) => (
        <Sequence key={s.id} from={s.startFrame} durationInFrames={s.frames}>
          <Story s={s} />
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          left: 180,
          right: 180,
          bottom: 115,
          textAlign: "center",
          fontSize: 38,
          fontWeight: 800,
          lineHeight: 1.32,
          textShadow: "0 2px 4px white",
        }}
      >
        {caption?.text}
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 35,
          height: 45,
          display: "flex",
          gap: 8,
        }}
      >
        {companies.map((company) => {
          const scenes = e.scenes.filter((s) => s.company === company),
            start = scenes[0].startFrame,
            end = scenes.at(-1)!.startFrame + scenes.at(-1)!.frames;
          return (
            <div
              key={company}
              style={{
                position: "relative",
                flex: end - start,
                background: "#dbe7fa",
                borderRadius: 5,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${interpolate(f, [start, end], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%`,
                  background: "#8eb5ff",
                }}
              />
              <span style={{ position: "relative" }}>{company}</span>
            </div>
          );
        })}
      </div>
      {e.demo && (
        <div
          style={{
            position: "absolute",
            top: 113,
            right: 96,
            fontSize: 22,
            color: "#607ba4",
          }}
        >
          静音示意模板 · 非真实新闻
        </div>
      )}
      <Audio src={staticFile("narration.wav")} />
    </AbsoluteFill>
  );
};
export const Cover: React.FC<{ edition: Edition }> = ({ edition: e }) => (
  <AbsoluteFill style={base}>
    <div
      style={{
        position: "absolute",
        left: 290,
        top: 100,
        fontSize: 55,
        fontWeight: 900,
      }}
    >
      资讯视频
    </div>
    <div
      style={{
        position: "absolute",
        right: 290,
        top: 100,
        fontSize: 55,
        color: colors.blue,
        fontWeight: 900,
      }}
    >
      {e.date}
    </div>
    <div
      style={{
        position: "absolute",
        left: 290,
        top: 300,
        width: 870,
        fontSize: 115,
        lineHeight: 1.3,
        fontWeight: 950,
      }}
    >
      {e.title}
    </div>
    <div
      style={{
        position: "absolute",
        right: 300,
        top: 420,
        transform: "rotate(-6deg)",
      }}
    >
      <RSS size={340} />
    </div>
  </AbsoluteFill>
);
