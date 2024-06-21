import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { catchError, of, retry } from 'rxjs';
import 'dotenv/config';

interface PostmarkSend {
  From: string;
  To: string;
  Subject: string;
  HtmlBody?: string;
  TextBody?: string;
}

@Injectable()
export class EmailService {
  private readonly _apiUrl = 'https://api.postmarkapp.com/email';

  constructor(private readonly _httpService: HttpService, private readonly _logger: Logger) {}

  public sendEmail(htmlBody: string, to: string, subject: string) {
    this._logger.log(`Sending email to ${to}`, EmailService.name);
    const headers = {
      'X-Postmark-Server-Token': process.env.POSTMARK_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    // docs: https://postmarkapp.com/developer/api/email-api
    return this._httpService
      .post<{ Message: string }>(
        this._apiUrl,
        {
          From: process.env.POSTMARK_FROM,
          To: to,
          Subject: subject,
          HtmlBody: htmlBody,
        } as PostmarkSend,
        { headers },
      )
      .pipe(
        retry(1),
        catchError((err: AxiosError) => {
          this._logger.error(
            `Sending email error: ${JSON.stringify(err.response.data)}`,
            err.stack,
            EmailService.name,
          );
          return of(null);
        }),
      );
  }
}
