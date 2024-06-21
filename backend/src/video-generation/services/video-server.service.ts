import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { sample } from 'lodash';

@Injectable()
export class VideoServerService {
  private readonly _servers = [];

  constructor(private readonly _httpService: HttpService, private readonly _logger: Logger) {}

  public getServer(host: string) {
    const servers = this._servers.filter((s) => !s.includes(host));
    return sample(servers);
  }
}
