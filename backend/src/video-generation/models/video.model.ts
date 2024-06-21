export interface VideoGeneration {
  id: string;
  zip?: Express.Multer.File;
  skipS3: boolean;
  is720p: boolean;
  noEmail: boolean;
  to: string;
  name: string;
  createdAt: Date;
}

export interface VideoGenerationComplete {
  videoGeneration: VideoGeneration;
  images: string[];
  audios: string[];
  fullVideoPath: string;
  shortVideoPath: string;
  totalTime: number;
}
