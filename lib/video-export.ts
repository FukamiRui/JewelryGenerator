import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { randomUUID } from "crypto";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export type SocialPlatform = "tiktok" | "twitter" | "reels";

// TikTok/Reels want vertical full-screen video; Twitter's feed favors square.
const PLATFORM_DIMENSIONS: Record<SocialPlatform, { width: number; height: number }> = {
  tiktok: { width: 1080, height: 1920 },
  reels: { width: 1080, height: 1920 },
  twitter: { width: 1080, height: 1080 },
};

/**
 * Reformats a generated/uploaded portfolio video to a social platform's
 * preferred aspect ratio (center-crop + scale) via a local ffmpeg binary —
 * no external API call, so this has no per-export cost beyond the compute
 * already being paid for. Not a "publish to TikTok/Twitter" integration:
 * the shop downloads the result and posts it themselves.
 */
export async function exportVideoForPlatform(sourceUrl: string, platform: SocialPlatform): Promise<Buffer> {
  const { width, height } = PLATFORM_DIMENSIONS[platform];

  let res: Response;
  try {
    res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Timed out downloading the source video.");
    }
    throw new Error(`Failed to download source video: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`Failed to download source video: ${res.status}`);

  const jobId = randomUUID();
  const inputPath = path.join(tmpdir(), `${jobId}-in.mp4`);
  const outputPath = path.join(tmpdir(), `${jobId}-out.mp4`);
  await writeFile(inputPath, Buffer.from(await res.arrayBuffer()));

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([
          `scale=${width}:${height}:force_original_aspect_ratio=increase`,
          `crop=${width}:${height}`,
        ])
        .outputOptions(["-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-movflags", "+faststart"])
        .on("error", (err) => reject(new Error(`ffmpeg transcode failed: ${err.message}`)))
        .on("end", () => resolve())
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
