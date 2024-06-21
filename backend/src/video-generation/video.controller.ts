import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import * as multer from 'multer';
import { VideoUploadDto } from './dto/video-upload.dto';
import { VideoQueueService } from './services/video-queue.service';
import { VideoServerService } from './services/video-server.service';

@Controller('video')
export class VideoController {
  constructor(
    private readonly _logger: Logger,
    private readonly _videoQueueService: VideoQueueService,
    private readonly _videoServerService: VideoServerService,
  ) {}

  @Get('server')
  public getServer(@Req() request: Request) {
    return { server: this._videoServerService.getServer(request.get('host')) };
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
    }),
  )
  public async uploadZip(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: VideoUploadDto,
  ): Promise<{ id: string }> {
    if (!body.to) {
      throw new HttpException({ message: 'Field "to" was not provided' }, HttpStatus.BAD_REQUEST);
    }
    if (!file) {
      this._logger.log(`Body: ${JSON.stringify(body)}`);
      throw new HttpException({ message: 'File was not provided' }, HttpStatus.BAD_REQUEST);
    }

    this._logger.log(
      `Uploaded ZIP "${file.originalname}". SkipS3 ${body.skipS3}. 720p ${body.is720p}`,
      VideoQueueService.name,
    );

    return {
      id: this._videoQueueService.placeToQueue(
        file,
        body.skipS3 === 'true',
        body.to,
        body.is720p === 'true',
        body.noEmail === 'true',
      ),
    };
  }

  @Get('is-busy')
  public isBusy() {
    return { status: this._videoQueueService.isBusy() };
  }

  @Get('status')
  public async status(@Query('id') id: string) {
    return { status: await this._videoQueueService.getStatus(id) };
  }

  @Get('status-all')
  public async statusAll() {
    return { statuses: await this._videoQueueService.getStatusAll() };
  }
}
