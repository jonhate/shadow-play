/**
 * 模块解析钩子：把浏览器专用的 MediaPipe 包换成测试用的假实现，
 * 这样就能在 node 里直接对真实的 app/gesture.js 做行为测试。
 * 由 tests/gesture-loadmodel.test.mjs 通过 module.register() 注册。
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('vendor/mediapipe/vision_bundle.mjs')) {
    return { url: new URL('./stubs/vision_bundle.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
