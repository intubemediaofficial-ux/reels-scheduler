import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MediaProbe = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  frameRate: number | null;
  container: string | null;
};

type FfprobeStream = { codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; duration?: string };
type FfprobeOutput = { streams?: FfprobeStream[]; format?: { duration?: string; format_name?: string } };

export async function probeVideo(file: string): Promise<MediaProbe> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout) as FfprobeOutput;
  const video = data.streams?.find((s) => s.codec_type === "video");
  const audio = data.streams?.find((s) => s.codec_type === "audio");
  const duration = Number(data.format?.duration ?? video?.duration ?? NaN);
  return {
    durationSec: Number.isFinite(duration) ? duration : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: Boolean(audio),
    frameRate: parseFrameRate(video?.r_frame_rate),
    container: data.format?.format_name ?? null,
  };
}

function parseFrameRate(raw?: string): number | null {
  if (!raw) return null;
  const [n, d] = raw.split("/").map(Number);
  if (!n) return null;
  const fps = d ? n / d : n;
  return Number.isFinite(fps) ? Math.round(fps * 100) / 100 : null;
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

export type ReelRules = { minDurationSec: number; maxDurationSec: number; minWidth: number; maxFileBytes: number };

/**
 * Rules default to Meta's published Reels guidance but are configurable via env
 * so limit changes never require a code deploy.
 */
export function validateReel(probe: MediaProbe, sizeBytes: number, rules: ReelRules): { errors: string[]; warnings: string[]; aspectRatio: string | null } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (sizeBytes > rules.maxFileBytes) errors.push(`File is ${(sizeBytes / 1048576).toFixed(0)} MB; max is ${(rules.maxFileBytes / 1048576).toFixed(0)} MB.`);
  if (probe.durationSec === null) errors.push("Could not read video duration.");
  else {
    if (probe.durationSec < rules.minDurationSec) errors.push(`Video is ${probe.durationSec.toFixed(1)}s; Reels must be at least ${rules.minDurationSec}s.`);
    if (probe.durationSec > rules.maxDurationSec) errors.push(`Video is ${probe.durationSec.toFixed(0)}s; max allowed is ${rules.maxDurationSec}s.`);
  }
  if (!probe.videoCodec) errors.push("No video stream found.");
  else if (!["h264", "hevc"].includes(probe.videoCodec)) errors.push(`Video codec ${probe.videoCodec} is not supported; use H.264 (MP4/MOV).`);
  if (probe.hasAudio && probe.audioCodec && probe.audioCodec !== "aac") warnings.push(`Audio codec ${probe.audioCodec}; Meta prefers AAC.`);
  if (!probe.hasAudio) warnings.push("Video has no audio track.");
  if (probe.width && probe.width < rules.minWidth) errors.push(`Width ${probe.width}px is below the minimum ${rules.minWidth}px.`);

  let aspectRatio: string | null = null;
  if (probe.width && probe.height) {
    const r = probe.width / probe.height;
    aspectRatio = `${probe.width}:${probe.height}`;
    if (Math.abs(r - 9 / 16) < 0.02) aspectRatio = "9:16";
    else if (Math.abs(r - 1) < 0.02) aspectRatio = "1:1";
    else if (Math.abs(r - 4 / 5) < 0.02) aspectRatio = "4:5";
    else if (Math.abs(r - 16 / 9) < 0.02) aspectRatio = "16:9";
    if (r < 0.01 * 56 || r > 1.91) errors.push(`Aspect ratio ${aspectRatio} is outside the allowed 0.56–1.91 range.`);
    else if (aspectRatio !== "9:16") warnings.push(`Aspect ratio ${aspectRatio}; Reels display best at 9:16.`);
  }
  if (probe.frameRate && (probe.frameRate < 23 || probe.frameRate > 60)) warnings.push(`Frame rate ${probe.frameRate} fps; Meta recommends 23–60 fps.`);
  return { errors, warnings, aspectRatio };
}
