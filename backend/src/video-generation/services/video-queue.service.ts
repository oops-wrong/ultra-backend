import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as AdmZip from 'adm-zip';
import * as fs from 'fs';
import { compact, round } from 'lodash';
import * as path from 'path';
import { BehaviorSubject, catchError, concatMap, filter, of, tap } from 'rxjs';
import * as tmp from 'tmp';
import { cleanUpTempFiles, escapeFileName, getUuidName } from '../../utils/common.utils';
import { EmailService } from './email.service';
import { VideoGeneration, VideoGenerationComplete } from '../models/video.model';
import { S3Service } from './s3.service';
import { VideoGenerationService } from './video-generation.service';
import { VideoLogService } from './video-log.service';

@Injectable()
export class VideoQueueService {
  private readonly _isBusy$ = new BehaviorSubject<boolean>(false);

  // todo make it as WS
  private readonly _status$ = new BehaviorSubject<string>('');

  private readonly _videoGenerations$ = new BehaviorSubject<VideoGeneration[]>([]);

  private _currentVideoGeneration: VideoGeneration;

  constructor(
    private readonly _emailService: EmailService,
    private readonly _logger: Logger,
    private readonly _s3Service: S3Service,
    private readonly _videoGenerationService: VideoGenerationService,
    private readonly _videoLogService: VideoLogService,
  ) {
    this.runQueue();
  }

  private runQueue() {
    this._videoGenerations$
      .pipe(
        filter((videoGenerations) => videoGenerations.length > 0),
        concatMap((videoGenerations) => {
          const queue = videoGenerations.slice();
          this._currentVideoGeneration = queue.shift();
          this._videoGenerations$.next(queue);
          if (this._currentVideoGeneration) {
            this._isBusy$.next(true);
            return this.handleQueueItem(this._currentVideoGeneration);
          }
          return of(null);
        }),
        tap({
          next: (result) => {
            if (result?.videoGeneration) {
              this._videoLogService.addLog(result).catch();
            }
            if (!result.videoGeneration.noEmail) {
              this.sendEmailSucceed(result);
            }
            this._isBusy$.next(false);
          },
          error: (err) => {
            this.sendEmailError(err);
            this._isBusy$.next(false);
          },
        }),
        catchError(() => of(null)),
      )
      .subscribe();
  }

  private async handleQueueItem(
    videoGeneration: VideoGeneration,
  ): Promise<VideoGenerationComplete> {
    const start = new Date().getTime() / 1000;
    const { id, zip, skipS3, is720p } = videoGeneration;
    const zipFileName = path.parse(zip.originalname).name;
    const { files, tempZipFiles } = this.extractZip(zip.buffer);
    const { images, audios } = this.categorizeFiles(files);

    this._logger.log(
      `${id}. Handling ZIP with ${images.length} images and ${audios.length} audios. SkipS3 ${skipS3}`,
      VideoQueueService.name,
    );

    let outputFull: string;
    let outputShort: string;

    try {
      this.checkZipContent(images, audios);

      const introVideoPath = is720p
        ? '/var/www/ultra-assets/intro720.mp4'
        : '/var/www/ultra-assets/intro.mp4';
      outputFull = escapeFileName(
        `${new Date().toISOString().split('.')[0]}_full_${zipFileName}.mp4`,
      );
      outputShort = escapeFileName(
        `${new Date().toISOString().split('.')[0]}_short_${zipFileName}.mp4`,
      );

      await this._videoGenerationService.createVideoWithIntro(
        introVideoPath,
        images,
        audios,
        outputFull,
        outputShort,
        is720p,
        (progress) => {
          this._status$.next(`Generation progress: ${progress}%`);
        },
      );
      this._status$.next(`Video processing completed. Starting upload...`);

      const fullVideoPath = `videos/${outputFull}`;
      const shortVideoPath = `videos/${outputShort}`;
      if (!skipS3) {
        await this._s3Service.uploadFileWithProgress(outputFull, fullVideoPath, (progress) => {
          this._status$.next(` Upload full progress: ${progress}%`);
        });
        await this._s3Service.uploadFileWithProgress(outputShort, shortVideoPath, (progress) => {
          this._status$.next(`Upload short progress: ${progress}%`);
        });
      }

      this._status$.next(`Upload completed.`);

      return {
        videoGeneration,
        images,
        audios,
        fullVideoPath,
        shortVideoPath,
        totalTime: new Date().getTime() / 1000 - start,
      };
    } catch (error) {
      this._status$.next(`Error: ${error.message}`);
      this._logger.error(
        `${id}. Uploading ZIP failed: ${error.message}`,
        error?.stack,
        VideoQueueService.name,
      );
    } finally {
      cleanUpTempFiles([...tempZipFiles, outputFull, outputShort, 'concat_list.txt']).catch();
    }
  }

  private extractZip(buffer: Buffer): {
    files: { name: string; path: string }[];
    tempZipFiles: string[];
  } {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    const tempFiles: string[] = [];
    const files = zipEntries
      .sort((a, b) => parseInt(a.entryName, 10) - parseInt(b.entryName, 10))
      .map((zipEntry) => {
        const entryName = zipEntry.entryName.toLowerCase();
        const tempPath = tmp.tmpNameSync({ postfix: path.extname(entryName) });
        fs.writeFileSync(tempPath, zipEntry.getData());
        tempFiles.push(tempPath);
        return { name: entryName, path: tempPath };
      });
    return { files, tempZipFiles: tempFiles };
  }

  private categorizeFiles(files: { name: string; path: string }[]): {
    images: string[];
    audios: string[];
  } {
    const images = files
      .filter((file) => file.name.endsWith('.png') || file.name.endsWith('.jpg'))
      .map((file) => file.path);

    const audios = files.filter((file) => file.name.endsWith('.mp3')).map((file) => file.path);

    return { images, audios };
  }

  private checkZipContent(images: string[], audios: string[]) {
    if (images.length === 0) {
      throw new HttpException(
        { message: 'No images was provided in the ZIP' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (images.length !== audios.length) {
      throw new HttpException(
        {
          message: `Images provided ${images.length} items while audios ${audios.length} in the ZIP`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private sendEmailSucceed(result: VideoGenerationComplete) {
    if (!this._currentVideoGeneration) {
      this._logger.error(`No way to send email. No current video`, '', VideoQueueService.name);
      return;
    }
    const getVideoUrl = (path: string) => {
      return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${path}`;
    };
    const full = getVideoUrl(result.fullVideoPath);
    const short = getVideoUrl(result.shortVideoPath);
    this._emailService
      .sendEmail(
        `<html><body><strong>Course videos are ready:</strong><br><br>ID ${
          result.videoGeneration.id
        } ${
          result.videoGeneration.name
        }<br><br>Full video <a href="${full}">${full}</a><br>Short video <a href="${short}">${short}</a><br><br>Images items ${
          result.images.length
        }. Audio items ${
          result.audios.length
        }.<br><br>Generation requested at ${result.videoGeneration.createdAt.toLocaleString()} (${result.videoGeneration.createdAt.toUTCString()}).<br>The video was generating ${round(
          result.totalTime,
        )} seconds (${round(result.totalTime / 60, 1)} minutes)</body></html>`,
        this._currentVideoGeneration.to,
        `Course Generation Complete ${result.videoGeneration.id}`,
      )
      .subscribe();
  }

  private sendEmailError(err: Error) {
    if (!this._currentVideoGeneration) {
      this._logger.error(
        `No way to send email with ERROR. No current video`,
        '',
        VideoQueueService.name,
      );
      return;
    }
    this._emailService
      .sendEmail(
        `<html><body><strong>Some error happened. ID ${this._currentVideoGeneration.id}. Video "${this._currentVideoGeneration.name}"</strong><br><br>${err?.name}: ${err?.message}</body></html>`,
        this._currentVideoGeneration.to,
        'Course Generation ERROR',
      )
      .subscribe();
  }

  public async getStatus(id: string): Promise<string> {
    if (id && this._currentVideoGeneration?.id === id) {
      return this._status$.value;
    }
    if (this._videoGenerations$.value.find((i) => i.id === id)) {
      return 'Waiting...';
    }
    if ((await this._videoLogService.getLog()).find((i) => i.videoGeneration.id === id)) {
      return 'Complete.';
    }
    return 'Not found';
  }

  public async getStatusAll(): Promise<
    { id: string; createdAt: string; name: string; status: string }[]
  > {
    const getStatus = (gen: VideoGeneration, status: string) => {
      return {
        id: gen.id,
        status,
        name: gen.name,
        createdAt: typeof gen.createdAt === 'string' ? gen.createdAt : gen.createdAt.toISOString(),
      };
    };

    return compact([
      this._currentVideoGeneration?.id
        ? getStatus(this._currentVideoGeneration, this._status$.value)
        : null,
      ...this._videoGenerations$.value
        .filter((g) => g.id !== this._currentVideoGeneration?.id)
        .map((generation) => getStatus(generation, 'Waiting...')),
      ...(await this._videoLogService.getLog())
        .filter((g) => g.videoGeneration.id !== this._currentVideoGeneration?.id)
        .map((g) => getStatus(g.videoGeneration, 'Complete.')),
    ]);
  }

  public isBusy(): boolean {
    return this._isBusy$.value;
  }

  public placeToQueue(
    zip: Express.Multer.File,
    skipS3: boolean,
    to: string,
    is720p: boolean,
    noEmail: boolean,
  ): string {
    const id = getUuidName();
    const queue = this._videoGenerations$.value;
    this._videoGenerations$.next(
      queue.concat({
        id,
        zip,
        skipS3,
        to,
        is720p,
        noEmail,
        name: path.parse(zip.originalname).name,
        createdAt: new Date(),
      }),
    );
    return id;
  }
}
