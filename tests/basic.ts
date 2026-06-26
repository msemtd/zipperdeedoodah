import { it, describe } from 'mocha'
import * as path from 'node:path'
import * as assert from 'node:assert'
import * as fs from 'fs-extra'
import debug from 'debug'
import { ZipperDeeDooDah } from '../src'

const dbg = debug('zipperdeedoodah')
dbg.enabled = true

const td = path.join(__dirname, '..', 'test-data')
const noTestData = fs.pathExistsSync(td) ? false : true
if (noTestData) {
  console.log('we need some stuff in test-data...')
  console.log('empty.zip, big.zip')
}
describe('zipperdeedoodah tests', function (this:Mocha.Suite) {
  const suite = this
  it('should fail to list entries from a non-existent zip file', async () => {
    if (noTestData) { return suite.ctx.skip() }
    const dd = path.join(td, 'test-zipBag-data')
    await fs.emptyDir(dd)
    // the file shouldn't exist - that should be fine
    const zipBag = new ZipperDeeDooDah(path.join(dd, 'non-ex-zip-test.zip'))
    // this implies that the zip file exists and should be read - it should fail
    try {
      await zipBag.list()
      assert.fail('unexpected success when trying to list entries from non-existent zip file')
    } catch (error) {
      console.log(`expected error: ${error}`)
    }
  })
  it('should be able to open a zip file and return a list of entries to later pick from', async () => {
    if (noTestData) { return suite.ctx.skip() }
    const zf = path.join(td, 'big.zip')
    {
      const s = await fs.stat(zf)
      console.log(`zip file ${zf} size is ${s.size}`)
      const zb = new ZipperDeeDooDah(zf)
      const t1 = Date.now()
      const entries = await zb.list()
      const t2 = Date.now()
      console.log(`zip file ${zf} has ${entries.length} entries, read in ${(t2 - t1) / 1000} seconds`)
      entries.forEach((entry, index) => {
        console.log(`entry ${index}: ${entry.name} (${entry.sizeUncompressed} bytes)`)
      })
      assert.ok(entries.length > 0, 'expected zip file to have entries')
    }
  })
  it('should be able to extract all files from a zip file', async () => {
    if (noTestData) { return suite.ctx.skip() }
    const zf = path.join(td, 'big.zip')
    const dd = path.dirname(zf)
    const outDir = path.join(dd, 'test-output-big')
    await fs.emptyDir(outDir)
    const zb = new ZipperDeeDooDah(zf)
    console.log('Extracting all files from zip file...')
    const t1 = Date.now()
    await zb.extractAll(outDir)
    const t2 = Date.now()
    console.log(`zip file ${zf} extracted to ${outDir} in ${(t2 - t1) / 1000} seconds`)
    const files = await fs.readdir(outDir)
    console.log(`extracted ${files.length} files from zip file`)
    assert.ok(files.length > 0, 'expected zip file to have extracted files')
  })
})
