/**
 * MediaPipe 的假实现（只在 node 测试里用，替换 vendor/mediapipe/vision_bundle.mjs）。
 * 行为由 globalThis.__mpStub 控制：
 *   { filesets: [], creates: [], filesetError: Error|null, createError: Error|null, failDelegates: Set }
 *   creates 里记录每次 createFromOptions 拿到的 delegate，方便断言「有没有重复创建」。
 */
const stub = () => globalThis.__mpStub || (globalThis.__mpStub = { filesets: [], creates: [] });

export class FilesetResolver {
  static async forVisionTasks(wasmPath) {
    const s = stub();
    s.filesets = s.filesets || [];
    s.filesets.push(wasmPath);
    if (s.filesetError) throw s.filesetError;
    return { wasmPath };
  }
}

export class GestureRecognizer {
  static async createFromOptions(fileset, options) {
    const s = stub();
    const delegate = options?.baseOptions?.delegate;
    s.creates = s.creates || [];
    s.creates.push({ delegate, hasBuffer: Boolean(options?.baseOptions?.modelAssetBuffer), modelAssetPath: options?.baseOptions?.modelAssetPath });
    if (s.createError) throw s.createError;
    if (s.failDelegates && s.failDelegates.has(delegate)) throw new Error(`${delegate} 建不起来`);
    return {
      delegate,
      recognizeForVideo: () => ({ landmarks: [], handedness: [], gestures: [] }),
      close: () => {},
    };
  }
}
