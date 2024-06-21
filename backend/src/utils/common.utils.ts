import * as fs from 'node:fs';
import * as uuid from 'uuid';

export const escapeFileName = (fileName: string, maxLength = 200): string => {
  // Characters not allowed in Windows file names
  const windowsReservedChars = /[<>:"\/\\|?*\x00-\x1F]/g;
  // Characters not allowed in macOS file names
  const macReservedChars = /[\/\x00-\x1F]/g;
  fileName = fileName.trim();
  fileName = fileName
    .replace(/\s/g, '_')
    .replace(windowsReservedChars, '_')
    .replace(macReservedChars, '_');
  fileName = fileName.slice(0, maxLength);
  return fileName;
};

export const cleanUpTempFiles = async (tempFiles: string[]) => {
  for (const file of tempFiles) {
    if (fs.existsSync(file)) {
      // todo skip removing the files
      // await fs.promises.unlink(file);
    }
  }
};

export const getUuidName = () => uuid.v4().split('-')[0];
