# Instruction

## Install the app
* `cd backend`
* `npm i`
* place files to `/var/www/ultra-assets/`
  * https://ultra-course-generator-bucket.s3.us-east-2.amazonaws.com/silence.mp3
  * https://ultra-course-generator-bucket.s3.us-east-2.amazonaws.com/intro.mp4
  * https://ultra-course-generator-bucket.s3.us-east-2.amazonaws.com/intro720.mp4

## Run project
* `npm run start:dev`
* check if it works on http://localhost:3000/api/ping

## Make a request
Use Postman to run the request.

POST http://localhost:3000/api/video/upload

form-data fields:
* file - Select ./Personal and Corporate Updates 2024.zip
* skipS3 - true
* to - any
* is720p - true
* noEmail - true

returns: {
"id": "2f13783a"
}

## Project structure
* [video.controller.ts](backend%2Fsrc%2Fvideo-generation%2Fvideo.controller.ts) - gets the requests
* [video-queue.service.ts](backend%2Fsrc%2Fvideo-generation%2Fservices%2Fvideo-queue.service.ts) - makes a queue to run videos in a line
* [video-generation.service.ts](backend%2Fsrc%2Fvideo-generation%2Fservices%2Fvideo-generation.service.ts) - the major part generating the video
