import type { IReadable } from '../types.js'

import type { IFrameDecoder } from './types.js'
import { Bytes } from '../bytes.js'

export interface FramedReaderOptions {
    initialBufferSize?: number
    readChunkSize?: number
}

export class FramedReader<Frame> {
    #readable: IReadable
    #decoder: IFrameDecoder<Frame>
    #buffer: Bytes

    #readChunkSize: number

    #eof = false
    #canDecode = false

    constructor(
        readable: IReadable,
        decoder: IFrameDecoder<Frame>,
        options?: FramedReaderOptions,
    ) {
        this.#readable = readable
        this.#decoder = decoder
        this.#buffer = Bytes.alloc(options?.initialBufferSize ?? 1024 * 16)
        this.#readChunkSize = options?.readChunkSize ?? 1024 * 16
    }

    async read(): Promise<Frame | null> {
        while (true) {
            if (this.#canDecode) {
                const frame = await this.#decoder.decode(this.#buffer, this.#eof)
                this.#buffer.reclaim()

                if (frame !== null) {
                    return frame
                }
            }

            if (this.#eof) {
                return null
            }

            // no frame in buffer, read more
            const into = this.#buffer.writeSync(this.#readChunkSize)
            const read = await this.#readable.read(into)
            this.#buffer.disposeWriteSync(read)

            if (read === 0) {
                this.#eof = true
            } else {
                this.#canDecode = true
            }
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<Frame> {
        return {
            next: async () => {
                const res = await this.read()
                if (res === null) {
                    return { done: true, value: undefined }
                }

                return { done: false, value: res }
            },
        }
    }
}
