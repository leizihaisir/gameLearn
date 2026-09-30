/**
 * 按 devicePixelRatio 配置画布，返回已经缩放到 CSS 像素坐标系的上下文。
 * 这样绘制代码里可以直接用 CSS 像素，不必到处乘 dpr。
 */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('无法获取 2D 绘图上下文');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
