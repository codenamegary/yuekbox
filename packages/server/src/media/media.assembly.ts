import {
  makeCopyDirectory,
  makeFindFiles,
  makeMakeDirectory,
  makeMoveFile,
  makeOpenFileRange,
  makePutFile,
  makeReadFile,
  makeRemoveDirectory,
  makeRemoveFile,
  makeStatFile,
} from "./media.adapters"
import {
  CopyDirectory,
  FindFiles,
  MakeDirectory,
  MoveFile,
  OpenFileRange,
  PutFile,
  ReadFile,
  RemoveDirectory,
  RemoveFile,
  StatFile,
} from "./media.ports"

export type MediaSlice = Readonly<{
  makeDirectory: MakeDirectory
  putFile: PutFile
  statFile: StatFile
  readFile: ReadFile
  openFileRange: OpenFileRange
  moveFile: MoveFile
  removeFile: RemoveFile
  removeDirectory: RemoveDirectory
  find: FindFiles
  copyDirectory: CopyDirectory
}>

export const assembleMediaSlice = (mediaDir: string): MediaSlice =>
  Object.freeze({
    makeDirectory: makeMakeDirectory(mediaDir),
    putFile: makePutFile(mediaDir),
    statFile: makeStatFile(mediaDir),
    readFile: makeReadFile(mediaDir),
    openFileRange: makeOpenFileRange(mediaDir),
    moveFile: makeMoveFile(mediaDir),
    removeFile: makeRemoveFile(mediaDir),
    removeDirectory: makeRemoveDirectory(mediaDir),
    find: makeFindFiles(mediaDir),
    copyDirectory: makeCopyDirectory(mediaDir),
  })
