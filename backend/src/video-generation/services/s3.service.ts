import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable } from '@nestjs/common';
import 'dotenv/config';
import * as fs from 'fs';
import * as ProgressStream from 'progress-stream';
import { PassThrough } from 'stream';

@Injectable()
export class S3Service {
  constructor() {}

  public async uploadFileWithProgress(
    filePath: string,
    fileName: string,
    progressCallback: (progress: number) => void,
  ): Promise<void> {
    const fileSize = fs.statSync(filePath).size;

    const progress = ProgressStream({
      length: fileSize,
      time: 100, // Update progress every 100ms
    });

    progressCallback(0);
    progress.on('progress', (progress) => {
      progressCallback(Math.round(progress.percentage));
    });

    const fileStream = fs.createReadStream(filePath);
    const passThroughStream = new PassThrough();
    fileStream.pipe(progress).pipe(passThroughStream);

    const upload = new Upload({
      client: this.getClient(),
      params: {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: passThroughStream,
        ACL: 'public-read',
      },
    });

    try {
      await upload.done();
      console.log('Upload completed successfully.');
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  }

  private getClient() {
    return new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
}
