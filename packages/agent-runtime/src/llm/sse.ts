export class SSEDataParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';

  push(chunk: Uint8Array): string[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  finish(): string[] {
    this.buffer += this.decoder.decode();
    return this.drain(true);
  }

  private drain(flush: boolean): string[] {
    const normalized = this.buffer.replace(/\r\n/g, '\n');
    const frames = normalized.split('\n\n');

    if (!flush) {
      this.buffer = frames.pop() ?? '';
    } else {
      this.buffer = '';
    }

    const payloads: string[] = [];
    for (const frame of frames) {
      const dataLines = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''));

      if (dataLines.length > 0) {
        payloads.push(dataLines.join('\n'));
      }
    }

    if (flush && normalized && frames.length === 0) {
      const dataLines = normalized
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''));
      if (dataLines.length > 0) payloads.push(dataLines.join('\n'));
    }

    return payloads;
  }
}
