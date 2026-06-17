import debug from 'debug'
import * as fs from 'fs-extra'
import * as path from 'node:path'
import * as stream from 'node:stream'
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

// cspell:ignore zipperdeedoodah yazl yauzl
const dbg = debug('zipperdeedoodah')

export type ZipperEntry = {
  name: string,
  sizeCompressed: number,
  sizeUncompressed: number,
  wasExtracted: boolean,
}

export class ZipperDeeDooDah {

  public readonly zipFilePath: string
  zipFile: yauzl.ZipFile | null = null

  constructor (zipFilePath: string) {
    this.zipFilePath = zipFilePath
  }

  [Symbol.dispose] () {
    this.close()
  }

  close () {
    if (this.zipFile) {
      this.zipFile.close()
      this.zipFile = null
    }
  }

  /**
   * Opens the zip file, reads each entry and invokes the provided callback.
   * @param onEntry Callback invoked for each entry in the zip file.
   * @returns list of entries
   */
  private async passThroughRead (onEntry: (zbe: ZipperEntry, yze: yauzl.Entry, yzf: yauzl.ZipFile) => Promise<void>): Promise<ZipperEntry[]> {
    const entries: ZipperEntry[] = []
    const zf = await yauzl.openPromise(this.zipFilePath)
    for await (const entry of zf.eachEntry()) {
      // Directory file names end with '/'. Note that entries for directories themselves are optional.
      // An entry's fileName implicitly requires its parent directories to exist.
      if (entry.fileName.endsWith('/')) { continue }
      const zbe: ZipperEntry = {
        name: entry.fileName,
        sizeCompressed: entry.compressedSize,
        sizeUncompressed: entry.uncompressedSize,
        wasExtracted: false,
      }
      entries.push(zbe)
      await onEntry(zbe, entry, zf)
    }
    return entries
  }

  /**
   * Just a special case of extractSome where all entries are extracted.
   */
  async extractAll (destFolderPath: string, fileDoneCallback?: (zbe: ZipperEntry) => void): Promise<void> {
    const shouldExtract = (_zbe: ZipperEntry) => true
    await this.extractSome(destFolderPath, shouldExtract, fileDoneCallback)
  }

  /**
   * Just a special case of extractSome where no entries are extracted.
   */
  async list (): Promise<ZipperEntry[]> {
    const entries: ZipperEntry[] = []
    const shouldExtract = (_zbe: ZipperEntry) => false
    await this.extractSome('', shouldExtract, (zbe) => {
      entries.push(zbe)
    })
    return entries
  }

  async extractSome (destFolderPath: string, shouldExtract?: (zbe: ZipperEntry) => boolean, fileDoneCallback?: (zbe: ZipperEntry) => void): Promise<void> {
    await this.passThroughRead(async (zbe, yze, yzf) => {
      if (shouldExtract?.(zbe)) {
        const destFilePath = path.join(destFolderPath, zbe.name)
        await fs.ensureDir(path.dirname(destFilePath))
        const readStream = await yzf.openReadStreamPromise(yze)
        const writeStream = fs.createWriteStream(destFilePath)
        await stream.promises.pipeline(readStream, writeStream)
        zbe.wasExtracted = true
      }
      fileDoneCallback?.(zbe)
    })
  }

  /*
  static async zipDir (folderPath: string): Promise<void> {
    // Get info on all files in a directory, including subdirectories...
    const ent = await fs.readdir(folderPath, { withFileTypes: true, recursive: true })
    // no zip file arg provided, create zip in the same location as the folder with the same name
    const { name, dir } = path.parse(folderPath)
    const zipFilePath = path.join(dir, `${name}.zip`)
    // get folder size - not currently needed but sets up expectations...
    const size = await getFolderSize.loose(folderPath)
    dbg(`The folder is approx ${size} bytes large`)
    dbg(`That is the same as ${(size / 1000 / 1000).toFixed(2)} MB`)
    // simplest possible yazl stream usage wrapped in a promise...
    const p = new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(zipFilePath).on('close', () => { resolve() })
      const zipfile = new yazl.ZipFile()
      const zipOptions = { compress: false }
      for (const de of ent) {
        if (de.isFile()) {
          const filePath = path.join(de.parentPath, de.name)
          if (!filePath.startsWith(folderPath)) {
            throw Error(`File path ${filePath} does not start with folder path ${folderPath}`)
          }
          const entryPath = path.relative(folderPath, filePath)
          zipfile.addFile(filePath, entryPath, zipOptions)
        } else if (de.isDirectory()) {
          const filePath = path.join(de.parentPath, de.name)
          dbg(`dir: ${filePath}`)
        } else {
          dbg(`skipping non-file, non-directory: ${de.name}`)
        }
      }
      zipfile.outputStream.pipe(stream)
      zipfile.end()
    })
    dbg('wait zip promise...')
    const t1 = Date.now()
    await p
    const t2 = Date.now()
    const elapsed = (t2 - t1) / 1000
    dbg(`Elapsed time: ${elapsed.toFixed(2)} seconds`)
    dbg('...done zip promise...')
  }
  */
}






