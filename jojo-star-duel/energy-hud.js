'use strict';

// Presentation only: every fighter uses three 100-point layers. This module
// never changes energy, owns a clock, or depends on the combat implementation.
const EnergyHUD = (() => {
  const colors = Object.freeze(['#8bdfff', '#ffda65', '#ff6176']);
  const maximum = 300, layerSize = 100;
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  function snapshot(value) {
    const energy = Math.max(0, Math.min(maximum, finite(value, 0)));
    const completed = Math.floor(energy / layerSize), active = Math.min(2, completed);
    return { energy, completed, active, progress: energy === maximum ? 1 : (energy - completed * layerSize) / layerSize,
      baseColor: completed ? colors[completed - 1] : '#10202e', activeColor: colors[active] };
  }
  function measure(options = {}) {
    return { x: finite(options.x, 0), y: finite(options.y, 0), width: Math.max(168, finite(options.width, 210)),
      height: 36, barHeight: 18, footerBaseline: finite(options.y, 0) + 33 };
  }
  function silhouette(ctx, x, y, width, height, cut) {
    ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + width - cut, y);
    ctx.lineTo(x + width, y + cut); ctx.lineTo(x + width, y + height - cut);
    ctx.lineTo(x + width - cut, y + height); ctx.lineTo(x + cut, y + height);
    ctx.lineTo(x, y + height - cut); ctx.lineTo(x, y + cut); ctx.closePath();
  }
  function draw(ctx, fighter, options = {}) {
    const layout = measure(options), state = snapshot(fighter?.energy), mirrored = !!options.mirrored;
    const { x, y, width, barHeight } = layout, innerX = x + 2, innerY = y + 2, innerWidth = width - 4, innerHeight = barHeight - 4;
    const fillWidth = innerWidth * state.progress, fillX = mirrored ? innerX + innerWidth - fillWidth : innerX;
    ctx.save();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    silhouette(ctx, x, y, width, barHeight, 4); ctx.fillStyle = '#3b5266'; ctx.fill();
    silhouette(ctx, x + 1, y + 1, width - 2, barHeight - 2, 3); ctx.fillStyle = '#09121c'; ctx.fill();
    ctx.save(); silhouette(ctx, innerX, innerY, innerWidth, innerHeight, 2); ctx.clip();
    // At 100 and 200 the completed layer remains fully visible. Only energy
    // beyond that boundary starts covering it with the next layer's color.
    ctx.fillStyle = state.baseColor; ctx.fillRect(innerX, innerY, innerWidth, innerHeight);
    if (fillWidth > 0) { ctx.fillStyle = state.activeColor; ctx.fillRect(fillX, innerY, fillWidth, innerHeight); }
    const chargedWidth = state.completed ? innerWidth : fillWidth;
    if (chargedWidth > 0) {
      const chargedX = mirrored ? innerX + innerWidth - chargedWidth : innerX;
      ctx.fillStyle = '#ffffff48'; ctx.fillRect(chargedX, innerY, chargedWidth, 1);
      ctx.fillStyle = '#06101930'; ctx.fillRect(chargedX, innerY + innerHeight - 3, chargedWidth, 3);
    }
    if (fillWidth > 0 && fillWidth < innerWidth) {
      ctx.fillStyle = '#fff8de'; ctx.fillRect(mirrored ? fillX : fillX + fillWidth - 1, innerY + 1, 1, innerHeight - 2);
    }
    ctx.restore();

    ctx.font = '600 10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'alphabetic';
    const chipWidth = 17, chipHeight = 12, chipGap = 4, chipY = y + 24;
    for (let index = 0; index < 3; index++) {
      const chipX = mirrored ? x + width - chipWidth - index * (chipWidth + chipGap) : x + index * (chipWidth + chipGap);
      const complete = index < state.completed, charging = index === state.active && state.progress > 0 && !complete;
      ctx.fillStyle = complete || charging ? colors[index] : '#3b5266'; ctx.fillRect(chipX, chipY, chipWidth, chipHeight);
      if (!complete) { ctx.fillStyle = '#10202e'; ctx.fillRect(chipX + 1, chipY + 1, chipWidth - 2, chipHeight - 2); }
      ctx.fillStyle = complete ? '#10202e' : charging ? colors[index] : '#bdcbd6'; ctx.textAlign = 'center';
      ctx.fillText(String(index + 1), chipX + chipWidth / 2, chipY + 9);
    }
    ctx.fillStyle = '#bdcbd6'; ctx.textAlign = mirrored ? 'right' : 'left';
    ctx.fillText('层', mirrored ? x + width - 65 : x + 65, layout.footerBaseline);
    ctx.fillStyle = '#edf3f7'; ctx.textAlign = mirrored ? 'left' : 'right';
    ctx.fillText(`气 ${Math.floor(state.energy)} / ${maximum}`, mirrored ? x : x + width, layout.footerBaseline);
    ctx.restore();
    return layout;
  }
  return Object.freeze({ draw, measure, snapshot, colors, maximum, layerSize });
})();
