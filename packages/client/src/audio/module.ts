/**
 * Tracker module player (§8b): libopenmpt in an AudioWorklet, from the `chiptune3` package (MIT).
 * Its two worklet files are served under `audio/` by a Vite plugin and loaded only when music is
 * first played, so neither is in the initial bundle.
 */
export class ModulePlayer {
  private constructor(private readonly node: AudioWorkletNode) {}

  static async create(ctx: BaseAudioContext, out: AudioNode): Promise<ModulePlayer> {
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio/chiptune3.worklet.js`);
    const node = new AudioWorkletNode(ctx, 'libopenmpt-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    // softer stereo than Amiga hard-panning, and linear interpolation for a clean chip tone
    node.port.postMessage({
      cmd: 'config',
      val: { repeatCount: -1, stereoSeparation: 50, interpolationFilter: 1 },
    });
    node.connect(out);
    return new ModulePlayer(node);
  }

  /** Start a module from its bytes; `loop` repeats it forever. */
  play(bytes: ArrayBuffer, loop: boolean): void {
    this.node.port.postMessage({ cmd: 'repeatCount', val: loop ? -1 : 0 });
    // the worklet takes ownership of a copy
    this.node.port.postMessage({ cmd: 'play', val: bytes.slice(0) });
  }

  stop(): void {
    this.node.port.postMessage({ cmd: 'stop' });
  }
}
