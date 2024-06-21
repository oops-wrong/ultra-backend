import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import { omit } from 'lodash';
import { VideoGenerationComplete } from '../models/video.model';

const LOG_FILE_PATH = '/var/log/ultra/generations.json';
const EXPIRATION_TIME = 72 * 60 * 60 * 1000; // 72 hours in milliseconds

@Injectable()
export class VideoLogService {
  constructor(private readonly _logger: Logger) {}

  public async addLog(data: VideoGenerationComplete): Promise<void> {
    const saving = {
      ...data,
      videoGeneration: omit(data.videoGeneration, 'zip'),
    };
    try {
      let logs: VideoGenerationComplete[] = [];
      if (await fs.pathExists(LOG_FILE_PATH)) {
        logs = await fs.readJSON(LOG_FILE_PATH);
      }
      logs = this.removeExpiredLogs(logs);
      logs.unshift(saving);
      await fs.writeJSON(LOG_FILE_PATH, logs);
    } catch (error) {
      this._logger.error(`Error writing log file`, error.stack, VideoLogService.name);
      console.error('Error writing log file:', error);
    }
  }

  private removeExpiredLogs(logs: VideoGenerationComplete[]): VideoGenerationComplete[] {
    const now = Date.now();
    return logs.filter(
      (log) => now - new Date(log.videoGeneration.createdAt).getTime() <= EXPIRATION_TIME,
    );
  }

  public async getLog(): Promise<VideoGenerationComplete[]> {
    try {
      if (await fs.pathExists(LOG_FILE_PATH)) {
        return await fs.readJSON(LOG_FILE_PATH);
      }
      return [];
    } catch (error) {
      console.error('Error reading log file:', error);
      return [];
    }
  }
}
