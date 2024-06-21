import { Injectable, Logger } from '@nestjs/common';
import * as ffmpegPath from 'ffmpeg-static';
import * as ffprobePath from 'ffprobe-static';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import { compact, round } from 'lodash';
import { parseFile } from 'music-metadata';
import { cleanUpTempFiles } from '../../utils/common.utils';

@Injectable()
export class VideoGenerationService {
  private readonly delayBetweenSlides = 1.5; // Delay between slides in seconds

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

      await this.concatenateVideos([introVideoPath, ...tempVideos], outputFull);
      await this.concatenateVideos([introVideoPath, tempVideos[0], tempVideos[1]], outputShort);

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

      if (i === 0) {
        const tempSilence = `temp_silence.mp4`;
        await this.createVideoFromImageAndAudio({
          image: images[i],
          audio: '/var/www/ultra-assets/silence.mp3',
          output: tempSilence,
          audioDuration: 1,
          delayBetweenSlides: 0,
          is720p,
        });
        processedVideos.push(tempSilence);
      }

      const tempOutput = `temp_${i}.mp4`;
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

  private concatenateVideos(videos: string[], output: string): Promise<void> {
    const concatList = videos.map((video) => `file '${video}'`).join('\n');
    fs.writeFileSync('concat_list.txt', concatList);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .setFfmpegPath(ffmpegPath as unknown as string)
        .setFfprobePath(ffprobePath.path)
        .input('concat_list.txt')
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .on('start', (commandLine) => {
          console.log('[ffmpeg]: Final. Spawned Ffmpeg with command: ' + commandLine);
        })
        .on('progress', (progress) => {
          console.log(`[ffmpeg]: Final. Processing. Target size is ${progress.targetSize}kb`);
        })
        .on('end', () => {
          console.log('[ffmpeg]: Final. End');
          resolve();
        })
        .on('error', (err) => {
          console.error('[ffmpeg]: Final. Error', err);
          reject(err);
        })
        .save(output);
    });
  }
}
