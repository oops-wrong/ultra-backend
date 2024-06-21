import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VideoGenerationModule } from './video-generation/video-generation.module';

@Module({
  imports: [VideoGenerationModule],
  controllers: [AppController],
  providers: [AppService, Logger],
})
export class AppModule {}
