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

  /**
   * Utility for recursing a dir
   */
  static async recurse (filePath: string, itemCallback: (itemPath: string, stats: fs.Stats) => void): Promise<void> {
    const found = new Set<number>()
    async function itemTest (itemPath: string): Promise<void> {
      const stats = await fs.lstat(itemPath).catch(() => null)
      if (!stats) { return }
      if (!found.has(stats.ino)) {
        found.add(stats.ino)
        itemCallback(itemPath, stats)
      }
      if (stats.isDirectory()) {
        const items = await fs.readdir(itemPath).catch(() => null)
        if (!items) { return }
        for (const item of items) {
          await itemTest(path.join(itemPath, item))
        }
      }
    }
    await itemTest(filePath)
  }

  static async getSize (filePath: string) {
    let total = 0
    const cb = (itemPath: string, stats: fs.Stats) => { total += stats.size }
    await ZipperDeeDooDah.recurse(filePath, cb)
    return total
  }

  /**
   * Utility for quick estimation of the size of a zipping job.
   */
  async getPathSize (filePath: string): Promise<number> {
    let total = 0
    const found = new Set<number>()
    async function itemSize (itemPath: string): Promise<void> {
      const stats = await fs.lstat(itemPath).catch(() => null)
      if (!stats) { return }
      if (!found.has(stats.ino)) {
        found.add(stats.ino)
        total += stats.size
      }
      if (stats.isDirectory()) {
        const items = await fs.readdir(itemPath).catch(() => null)
        if (!items) { return }
        for (const item of items) {
          await itemSize(path.join(itemPath, item))
        }
      }
    }
    await itemSize(filePath)
    return total
  }

  /**
   * Five star treatment by default!
   * Get size first and have per file update of percent done
   * @param filePath - file or dir to zip up
   * @param options
   */
  async zipUp (filePath: string, options: any = { calcSize: true }): Promise<void> {
    this.close()
    const s = await fs.stat(filePath)
    const total = await ZipperDeeDooDah.getSize(filePath)
    // Get info on all files in a directory, including subdirectories...
    const ent = await fs.readdir(filePath, { withFileTypes: true, recursive: true })
    // no zip file arg provided, create zip in the same location as the folder with the same name
    const { name, dir } = path.parse(filePath)
    const zipFilePath = path.join(dir, `${name}.zip`)
    // get folder size - not currently needed but sets up expectations...
    const size = total
    dbg(`The folder is approx ${size} bytes large`)
    dbg(`That is the same as ${(size / 1000 / 1000).toFixed(2)} MB`)
    // simplest possible yazl stream usage wrapped in a promise...
    const p = new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(zipFilePath).on('close', () => { resolve() })
      const zipfile = new yazl.ZipFile()
      const zipOptions = { compress: false }
      for (const de of ent) {
        if (de.isFile()) {
          const fp = path.join(de.parentPath, de.name)
          if (!fp.startsWith(filePath)) {
            throw Error(`File path ${fp} does not start with folder path ${filePath}`)
          }
          const entryPath = path.relative(filePath, fp)
          zipfile.addFile(fp, entryPath, zipOptions)
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
}
