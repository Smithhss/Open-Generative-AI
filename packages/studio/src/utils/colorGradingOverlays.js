// Shared by the original and local PNG exporters so visible grading overlays
// are retained when the original full tool panel is used locally.
export function drawColorGradingOverlays(ctx, width, height, colorGrading) {
  // 2. Add Vignette if configured
  if (colorGrading.lensInstructions.vignette > 0) {
    const vRadius = Math.max(width, height) * 0.7;
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      vRadius * 0.35,
      width / 2,
      height / 2,
      vRadius,
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(
      1,
      `rgba(0,0,0,${colorGrading.lensInstructions.vignette * 0.95})`,
    );
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. Add Film Grain if configured
  if (colorGrading.filmGrain.strength > 0) {
    const grainCanvas = document.createElement("canvas");
    grainCanvas.width = 128;
    grainCanvas.height = 128;
    const gCtx = grainCanvas.getContext("2d");
    const gImgData = gCtx.createImageData(128, 128);
    const data = gImgData.data;
    const bias = colorGrading.filmGrain.bias * 50;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 255 + bias;
      data[i] = noise;
      data[i + 1] = noise;
      data[i + 2] = noise;
      data[i + 3] = 40;
    }
    gCtx.putImageData(gImgData, 0, 0);

    ctx.globalAlpha = colorGrading.filmGrain.strength * 0.5;
    ctx.globalCompositeOperation = "overlay";
    const pat = ctx.createPattern(grainCanvas, "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";
  }

}
