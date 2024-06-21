import { Controller, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly _appService: AppService, private readonly _logger: Logger) {}

  @Get('ping')
  public ping() {
    this._logger.log('ping', AppController.name);
    return 'pong';
  }

  @Get('error')
  public makeError() {
    throw new HttpException({ message: 'Some error response here' }, HttpStatus.BAD_REQUEST);
  }
}
