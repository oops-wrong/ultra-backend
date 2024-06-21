import { HttpModule } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { S3Service } from './services/s3.service';
import { VideoGenerationService } from './services/video-generation.service';
import { VideoLogService } from './services/video-log.service';
import { VideoQueueService } from './services/video-queue.service';
import { VideoServerService } from './services/video-server.service';
import { VideoController } from './video.controller';

@Module({
  controllers: [VideoController],
  providers: [
    EmailService,
    Logger,
    S3Service,
    VideoGenerationService,
    VideoLogService,
    VideoQueueService,
    VideoServerService,
  ],
  imports: [HttpModule],
})
export class VideoGenerationModule {}
