import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  downloadedModelId,
  embedMinutes,
  hfFileUrl,
  isEngineImage,
  isOurServerLine,
  isGpuBackend,
  llamaServerArgs,
  localModelsDir,
  modelFileIn,
  modelIdForFile,
  parseLocalState,
  RECOMMENDED_EMBEDDING
} from './local-embeddings-pure'

describe('local embeddings (T83)', () => {
  it('keeps the model out of the core models folder the chat picker lists', () => {
    const dir = localModelsDir('C:\\home')
    expect(dir).toMatch(/aec[\\/]embedding-models$/)
    expect(dir).not.toMatch(/[\\/]models$/)
  })

  it('starts the engine the way the bench measured it, layers on the GPU only with one', () => {
    const args = llamaServerArgs({ modelPath: 'm.gguf', alias: 'bge-m3', port: 47821, gpu: true })
    expect(args).toEqual(expect.arrayContaining(['--embeddings', '--alias', 'bge-m3']))
    expect(args.slice(args.indexOf('--host'), args.indexOf('--host') + 2)).toEqual([
      '--host',
      '127.0.0.1'
    ])
    expect(args.slice(args.indexOf('-c'), args.indexOf('-c') + 2)).toEqual(['-c', '8192'])
    expect(args).toContain('-ngl')
    expect(llamaServerArgs({ modelPath: 'm.gguf', alias: 'x', port: 1, gpu: false })).not.toContain(
      '-ngl'
    )
  })

  it('estimates from the measured speeds: the bench corpus is minutes on a GPU, half an hour on a CPU', () => {
    expect(embedMinutes(1669, true)).toBe(3)
    expect(embedMinutes(1669, false)).toBe(31)
    expect(embedMinutes(1, true)).toBe(1)
    expect(isGpuBackend('cuda')).toBe(true)
    expect(isGpuBackend('vulkan')).toBe(true)
    expect(isGpuBackend('cpu')).toBe(false)
    expect(isGpuBackend(null)).toBe(false)
  })

  it('reads a broken or foreign state file as nothing chosen', () => {
    expect(parseLocalState(null)).toEqual({})
    expect(parseLocalState('{oops')).toEqual({})
    expect(parseLocalState('{"model":{"id":"x","path":"C:/m.bin"}}')).toEqual({})
    expect(
      parseLocalState(
        '{"model":{"id":"bge-m3","path":"C:/m/bge-m3-Q8_0.gguf","source":"file"},"port":47821,"pid":12}'
      )
    ).toEqual({
      model: { id: 'bge-m3', path: 'C:/m/bge-m3-Q8_0.gguf', source: 'file' },
      port: 47821,
      pid: 12
    })
    expect(parseLocalState('{"port":99999,"pid":-1}')).toEqual({})
  })

  it('names models by file and pins the recommended one', () => {
    expect(modelIdForFile(RECOMMENDED_EMBEDDING.file)).toBe('bge-m3')
    expect(modelIdForFile('D:\\x\\Qwen3-Embedding-0.6B-Q8_0.gguf')).toBe(
      'Qwen3-Embedding-0.6B-Q8_0'
    )
    expect(modelIdForFile('big-00001-of-00003.gguf')).toBe('big')
  })

  it('builds Hugging Face addresses only from a repo name and a .gguf path', () => {
    expect(
      hfFileUrl(
        RECOMMENDED_EMBEDDING.repo,
        RECOMMENDED_EMBEDDING.file,
        RECOMMENDED_EMBEDDING.revision
      )
    ).toBe(
      `https://huggingface.co/gpustack/bge-m3-GGUF/resolve/${RECOMMENDED_EMBEDDING.revision}/bge-m3-Q8_0.gguf`
    )
    expect(hfFileUrl('a/b', 'sub dir/m.gguf')).toBe(
      'https://huggingface.co/a/b/resolve/main/sub%20dir/m.gguf'
    )
    expect(hfFileUrl('a/b', '../m.gguf')).toBeNull()
    expect(hfFileUrl('a/b', 'm.exe')).toBeNull()
    expect(hfFileUrl('evil.com/x?y', 'm.gguf')).toBeNull()
    expect(hfFileUrl('a/b/c', 'm.gguf')).toBeNull()
  })

  it('never lets a repo file name leave the models folder (review T84: backslash traversal)', () => {
    expect(hfFileUrl('a/b', '..\\..\\..\\evil.gguf')).toBeNull()
    expect(hfFileUrl('a/b', 'C:evil.gguf')).toBeNull()
    expect(hfFileUrl('a/b', 'sub/\u0001x.gguf')).toBeNull()
    const dir = join('C:\\h', 'aec', 'embedding-models', 'a__b')
    expect(modelFileIn(dir, '..\\..\\..\\evil.gguf')).toBeNull()
    // Only the last segment is used: it lands inside, and the address refuses `..` anyway.
    expect(modelFileIn(dir, '../evil.gguf')).toBe(join(dir, 'evil.gguf'))
    expect(hfFileUrl('a/b', '../evil.gguf')).toBeNull()
    expect(modelFileIn(dir, 'sub/model-Q8_0.gguf')).toBe(join(dir, 'model-Q8_0.gguf'))
  })

  it('names a model from another repo by repo and file: two repos never share an id', () => {
    expect(downloadedModelId('a/b', 'm-Q8_0.gguf')).toBe('a/b/m-Q8_0')
    expect(downloadedModelId('c/d', 'm-Q8_0.gguf')).not.toBe(
      downloadedModelId('a/b', 'm-Q8_0.gguf')
    )
  })

  it('takes for a leftover only our embedding server, never the core chat router', () => {
    const ours = `"C:\\t\\llama-server.exe" ${llamaServerArgs({ modelPath: 'C:\\m\\x.gguf', alias: 'bge-m3', port: 47821, gpu: true }).join(' ')}`
    expect(isOurServerLine(ours, 47821)).toBe(true)
    expect(isOurServerLine(ours, 47822)).toBe(false)
    expect(
      isOurServerLine(
        '"C:\\t\\llama-server.exe" --models-dir C:\\m --port 47821 --host 127.0.0.1',
        47821
      )
    ).toBe(false)
  })

  it('stops only our engine as a leftover, never a process that reused the number', () => {
    expect(isEngineImage('llama-server.exe')).toBe(true)
    expect(isEngineImage('llama-server')).toBe(true)
    expect(isEngineImage('explorer.exe')).toBe(false)
  })
})
