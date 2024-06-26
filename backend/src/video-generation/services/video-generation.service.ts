import { Injectable, Logger } from '@nestjs/common';
import * as ffmpegPath from 'ffmpeg-static';
import * as ffprobe from 'ffprobe';
import * as ffprobePath from 'ffprobe-static';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import { compact, round } from 'lodash';
import { parseFile } from 'music-metadata';
import * as path from 'path';
import { cleanUpTempFiles } from '../../utils/common.utils';

@Injectable()
export class VideoGenerationService {
  private readonly delayBetweenSlides = 2; // Delay between slides in seconds

  constructor(private readonly _logger: Logger) {}

  public async createVideoWithIntro(
    introVideoPath: string,
    images: string[],
    audios: string[],
    outputFull: string,
    outputShort: string,
    is720p: boolean,
    progressFn: (progress: number) => void,
  ): Promise<void> {
    let tempVideos: string[] = [];
    const start = new Date().getTime() / 1000;
    try {
      tempVideos = await this.processImageAudioPairs(images, audios, start, is720p, progressFn);

      const concatenateStart = new Date().getTime() / 1000;

      await this.processVideos([introVideoPath, ...tempVideos], 1, outputFull);
      await this.processVideos([introVideoPath, tempVideos[0]], 1, outputShort);

      const concatenateEnd = new Date().getTime() / 1000;
      const concatenateDiff = round(concatenateEnd - concatenateStart, 2);
      const totalDiff = round(concatenateEnd - start, 2);
      console.log(`Concatenate took ${concatenateDiff}s. Total time is ${totalDiff}s`);
      this._logger.log(
        `Concatenate took ${concatenateDiff}s. Total time is ${totalDiff}s`,
        VideoGenerationService.name,
      );
    } catch (error) {
      throw new Error(error);
    } finally {
      cleanUpTempFiles(tempVideos).catch();
    }
  }

  private async processImageAudioPairs(
    images: string[],
    audios: string[],
    start: number,
    is720p: boolean,
    progressFn: (progress: number) => void,
  ): Promise<string[]> {
    const processedVideos = [];
    for (let i = 0; i < images.length; i++) {
      progressFn(round((i / images.length) * 100, 0));

      const iterStart = new Date().getTime() / 1000;

      // if (i === 0) {
      //   const tempSilence = path.join('temp', `temp_silence.mp4`);
      //   await this.createVideoFromImageAndAudio({
      //     image: images[i],
      //     audio: '/var/www/ultra-assets/silence.mp3',
      //     output: tempSilence,
      //     audioDuration: 1,
      //     delayBetweenSlides: 0,
      //     is720p,
      //   });
      //   processedVideos.push(tempSilence);
      // }

      const tempOutput = path.join('temp', `temp_${i}.mp4`);
      const audioDuration = await this.getAudioDuration(audios[i]);

      await this.createVideoFromImageAndAudio({
        image: images[i],
        audio: audios[i],
        output: tempOutput,
        audioDuration,
        delayBetweenSlides: this.delayBetweenSlides,
        is720p,
      });
      processedVideos.push(tempOutput);

      const iterEnd = new Date().getTime() / 1000;
      const iterDiff = round(iterEnd - iterStart, 2);
      const totalDiff = round(iterEnd - start, 2);
      console.log(`Iteration ${i} took ${iterDiff}s. Total time is ${totalDiff}s`);
      this._logger.log(
        `Iteration ${i} took ${iterDiff}s. Total time is ${totalDiff}s`,
        VideoGenerationService.name,
      );
    }
    return processedVideos;
  }

  private async getAudioDuration(audio: string): Promise<number> {
    try {
      const metadata = await parseFile(audio);
      return metadata.format.duration; // duration is in seconds
    } catch (err) {
      throw new Error(`Error getting audio duration: ${err.message}`);
    }
  }

  private createVideoFromImageAndAudio(conf: {
    image: string;
    audio: string;
    output: string;
    audioDuration: number;
    delayBetweenSlides: number;
    is720p: boolean;
  }): Promise<void> {
    const { image, audio, output, audioDuration, delayBetweenSlides, is720p } = conf;
    return new Promise((resolve, reject) => {
      ffmpeg()
        .setFfmpegPath(ffmpegPath as unknown as string)
        .setFfprobePath(ffprobePath.path)
        .input(image)
        .loop(audioDuration + delayBetweenSlides)
        .input(audio)
        .outputOptions(
          compact([
            '-c:a aac', // AAC audio codec
            '-b:a 317k', // Set audio bitrate to 317 kbps
            '-ar 48000', // Set audio sampling rate to 48 kHz
            '-ac 2', // Set number of audio channels to 2 (stereo)
            '-filter:a volume=2.4', // Increase audio volume
            '-pix_fmt yuv420p', // Set pixel format to YUV 4:2:0
            '-c:v libx264', // Use the H.264 video codec (libx264)
            '-r 23.98', // Set frame rate to 23.98 fps
            '-colorspace bt709', // Set colorspace to BT.709
            '-b:v 15705k', // Set video bitrate to 15705 kbps
            `-vf scale=${is720p ? '1280:720' : '1920:1080'}`, // Scale video resolution
            '-preset fast', // Preset for encoding speed vs quality tradeoff
            '-profile:v high', // Profile level for H.264
            '-level 4.2', // Level for compatibility
            '-movflags +faststart', // For web compatibility
          ]),
        )
        .on('start', (commandLine) => {
          console.log('[ffmpeg]: Slide. Spawned Ffmpeg with command: ' + commandLine);
        })
        .on('progress', (progress) => {
          console.log(`[ffmpeg]: Slide. Processing. Target size is ${progress.targetSize}kb`);
        })
        .on('end', () => {
          console.log('[ffmpeg]: Slide. End');
          resolve();
        })
        .on('error', (err) => reject(err))
        .save(output);
    });
  }

  // Function to check if file exists
  private fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch (err) {
      return false;
    }
  }

  // Function to get duration of a video file
  private getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.fileExists(filePath)) {
        return reject(new Error(`File does not exist: ${filePath}`));
      }

      ffprobe(filePath, { path: ffprobePath.path }, (err, info) => {
        if (err) return reject(err);
        const duration = parseInt(info.streams[0].duration, 10);
        resolve(duration);
      });
    });
  }

  // Function to create crossfade effect between two videos
  private async createCrossfade(
    inputVideo1: string,
    inputVideo2: string,
    outputVideo: string,
    crossfadeDuration: number,
    delay: number,
    currentIndex: number,
    total: number,
  ): Promise<string> {
    const duration1 = await this.getVideoDuration(inputVideo1);
    const transitionStart = Math.max(0, duration1 - crossfadeDuration);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputVideo1)
        .input(inputVideo2)
        .complexFilter([
          // Video crossfade
          `[0:v]format=pix_fmts=yuva420p,fade=t=out:st=${transitionStart}:d=${crossfadeDuration}:alpha=1,setpts=PTS-STARTPTS[v0];` +
          `[1:v]format=pix_fmts=yuva420p,fade=t=in:st=0:d=${crossfadeDuration}:alpha=1,setpts=PTS-STARTPTS+${transitionStart}/TB[v1];` +
          `[v0][v1]overlay,format=yuv420p[vid]`,
          // Extend the last frame of the video to pause
          `[vid]tpad=stop_mode=clone:stop_duration=${delay / 2}[viddelayed]`,
          // Audio delay and concat
          `[1:a]adelay=${delay * 1000}|${delay * 1000}[a1];` +
          `[0:a][a1]concat=n=2:v=0:a=1[aout]`,
        ])
        .outputOptions('-map', '[viddelayed]')
        .outputOptions('-map', '[aout]')
        .outputOptions('-c:v', 'libx264')
        .outputOptions('-c:a', 'aac')
        .output(outputVideo)
        .on('start', (commandLine) => {
          console.log(
            `[ffmpeg]: Crossfade (${currentIndex}/${total}). Spawned Ffmpeg with command: ${commandLine}`,
          );
        })
        .on('stderr', (stderrLine) =>
          console.log(`[ffmpeg] Crossfade (${currentIndex}/${total}). ${stderrLine}`),
        )
        .on('progress', (progress) => {
          console.log(
            `[ffmpeg]: Crossfade (${currentIndex}/${total}). Processing. Target size is ${progress.targetSize}kb`,
          );
        })
        .on('end', () => {
          console.log(`[ffmpeg]: Crossfade (${currentIndex}/${total}). End`);
          resolve(outputVideo);
        })
        .on('error', (err) => {
          console.error(`[ffmpeg]: Crossfade (${currentIndex}/${total}). Error ${err}`);
          reject(err);
        })
        .run();
    });
  }

  // Function to create temp folder
  private makeFolder(folder: string) {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
  }

  // Function to process list of videos from a text file
  private async processVideos(
    videoFiles: string[],
    crossfadeDuration: number,
    finalOutput: string,
  ) {
    try {
      if (videoFiles.length < 2) {
        throw new Error('At least two videos are required to create crossfade effect.');
      }

      let previousVideo = videoFiles[0];
      let tempOutput: string;
      this.makeFolder('temp');
      const pauseDuration = crossfadeDuration;

      for (let i = 1; i < videoFiles.length; i++) {
        const currentVideo = videoFiles[i];
        tempOutput = path.join('temp', `crossfade_${i}.mp4`);

        await this.createCrossfade(
          previousVideo,
          currentVideo,
          tempOutput,
          crossfadeDuration,
          pauseDuration,
          i,
          videoFiles.length - 1,
        );

        previousVideo = tempOutput;
      }

      fs.renameSync(tempOutput, finalOutput);
      console.log('Final video with crossfade effect created successfully:', finalOutput);
    } catch {}
  }
}
