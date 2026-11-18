import React, { useEffect, useRef } from 'react';
import { Scientist } from '../data/scientists';

export type SpritePose = 'idle' | 'ready' | 'attack' | 'cast' | 'hurt' | 'guard' | 'ko';

interface ScientistSpriteProps {
  scientist: Scientist;
  pose?: SpritePose;
  facing?: 'left' | 'right';
  size?: number;
  portraitOnly?: boolean;
  hasShield?: boolean;
  hasHaste?: boolean;
  hasSlow?: boolean;
  hasPoison?: boolean;
  hasEvasion?: boolean;
  hasReflect?: boolean;
  limitFull?: boolean;
  className?: string;
}

export const ScientistSprite: React.FC<ScientistSpriteProps> = ({
  scientist,
  pose = 'idle',
  facing = 'right',
  size = 140,
  portraitOnly = false,
  hasShield = false,
  hasHaste = false,
  hasSlow = false,
  hasPoison = false,
  hasEvasion = false,
  hasReflect = false,
  limitFull = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();

    const drawFrame = (now: number) => {
      const t = (now - start) / 1000;
      const dpr = window.devicePixelRatio || 1;
      const w = size;
      const h = size;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      if (portraitOnly) {
        drawPortrait(ctx, scientist, w, h, t);
        ctx.restore();
        rafId = requestAnimationFrame(drawFrame);
        return;
      }

      const scale = w / 140;
      ctx.translate(w / 2, h * 0.86);
      ctx.scale(scale, scale);

      // Ground shadow
      if (pose !== 'ko') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 6, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Limit Break Aura Ring on floor
      if (limitFull && pose !== 'ko') {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 + pulse * 0.45})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 5, 38 + pulse * 4, 11 + pulse * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Casting Arcane Magic Circle
      if (pose === 'cast') {
        ctx.save();
        ctx.strokeStyle = scientist.accentColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.ellipse(0, 4, 42, 13, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 4, 30, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Facing direction (default drawn facing right)
      if (facing === 'left') {
        ctx.scale(-1, 1);
      }

      // Pose offsets
      let offsetX = 0;
      let offsetY = 0;
      let leanAngle = 0;
      const bob = pose === 'ko' ? 0 : Math.sin(t * (pose === 'ready' ? 6 : 3.2)) * (pose === 'cast' ? 4 : 2.2);

      if (pose === 'attack') {
        offsetX = 16;
        leanAngle = 0.14;
      } else if (pose === 'cast') {
        offsetY = -6 + Math.sin(t * 7) * 2;
      } else if (pose === 'hurt') {
        offsetX = -10 + Math.sin(t * 45) * 4;
        leanAngle = -0.18;
      } else if (pose === 'ko') {
        offsetY = 6;
        leanAngle = -1.25;
      }

      if (hasEvasion) {
        ctx.globalAlpha = 0.65 + 0.25 * Math.sin(t * 14);
      }

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.rotate(leanAngle);

      // Haste afterimage
      if (hasHaste && pose !== 'ko') {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.translate(-10, -2);
        drawBody(ctx, scientist, bob, pose, t, true);
        ctx.restore();
      }

      drawBody(ctx, scientist, bob, pose, t, false);
      ctx.restore();

      // Hurt flash overlay
      if (pose === 'hurt') {
        ctx.fillStyle = 'rgba(255, 90, 90, 0.25)';
        ctx.beginPath();
        ctx.arc(0, -48, 36, 0, Math.PI * 2);
        ctx.fill();
      }

      // Status Overlays
      if (pose !== 'ko') {
        if (hasShield || hasReflect || pose === 'guard') {
          ctx.save();
          ctx.strokeStyle = hasReflect ? '#10b981' : '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.65 + 0.2 * Math.sin(t * 5);
          ctx.beginPath();
          ctx.arc(0, -46, 44, -Math.PI * 0.65, Math.PI * 0.65);
          ctx.stroke();
          ctx.fillStyle = hasReflect ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.12)';
          ctx.beginPath();
          ctx.arc(0, -46, 42, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (hasSlow) {
          ctx.fillStyle = 'rgba(6, 182, 212, 0.24)';
          ctx.beginPath();
          ctx.roundRect(-24, -18, 48, 22, 6);
          ctx.fill();
        }
        if (hasPoison) {
          for (let i = 0; i < 3; i++) {
            const py = -25 - ((t * 28 + i * 24) % 55);
            const px = Math.sin(t * 3 + i * 2) * 16;
            ctx.fillStyle = 'rgba(74, 222, 128, 0.8)';
            ctx.beginPath();
            ctx.arc(px, py, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();
      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [scientist, pose, facing, size, portraitOnly, hasShield, hasHaste, hasSlow, hasPoison, hasEvasion, hasReflect, limitFull]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={`pointer-events-none select-none ${className}`}
    />
  );
};

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  sci: Scientist,
  w: number,
  h: number,
  t: number
) {
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.4, 4, w * 0.5, h * 0.5, w * 0.65);
  grad.addColorStop(0, `${sci.accentColor}44`);
  grad.addColorStop(1, '#0b1224');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const s = w / 92;
  ctx.translate(w * 0.48, h * 1.18);
  ctx.scale(s, s);
  drawBody(ctx, sci, Math.sin(t * 2.5) * 1.4, 'idle', t, false);
  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  sci: Scientist,
  bob: number,
  pose: SpritePose,
  t: number,
  silhouette: boolean
) {
  const torsoTop = -68 + bob;

  if (silhouette) {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, -82 + bob, 16, 0, Math.PI * 2);
    ctx.roundRect(-16, torsoTop, 32, 42, 8);
    ctx.fill();
    return;
  }

  // Heroic RPG Cape / Cloak behind torso
  const capeWave = Math.sin(t * 4) * 3;
  ctx.fillStyle = sci.accentColor;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-12, torsoTop + 4);
  ctx.quadraticCurveTo(-28 - capeWave, torsoTop + 28, -24 - capeWave, -12);
  ctx.lineTo(-4, -14);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Legs & Boots
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, -26);
  ctx.lineTo(-10, -2);
  ctx.moveTo(7, -26);
  ctx.lineTo(12, -2);
  ctx.stroke();

  // Boots highlight
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(-9, 0, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(13, 0, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Torso Coat / Scholar Robe
  ctx.fillStyle = sci.primaryColor;
  ctx.beginPath();
  ctx.roundRect(-16, torsoTop, 32, 44, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Lapel / Shirt / Tie details
  if (sci.id === 'aristotle') {
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-14, torsoTop + 4);
    ctx.lineTo(14, torsoTop + 34);
    ctx.stroke();
  } else if (sci.id === 'einstein') {
    ctx.fillStyle = '#d6d3d1';
    ctx.beginPath();
    ctx.roundRect(-14, torsoTop + 4, 28, 34, 6);
    ctx.fill();
  } else if (sci.id === 'feynman') {
    ctx.fillStyle = '#f1c29b';
    ctx.beginPath();
    ctx.moveTo(-7, torsoTop);
    ctx.lineTo(7, torsoTop);
    ctx.lineTo(0, torsoTop + 14);
    ctx.closePath();
    ctx.fill();
  } else if (sci.id === 'faraday' || sci.id === 'schrodinger') {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-5, torsoTop + 2, 10, 18);
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.moveTo(-6, torsoTop + 4);
    ctx.lineTo(6, torsoTop + 8);
    ctx.lineTo(6, torsoTop + 4);
    ctx.lineTo(-6, torsoTop + 8);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(-4, torsoTop + 2, 8, 18);
    ctx.fillStyle = sci.accentColor;
    ctx.fillRect(-2, torsoTop + 5, 4, 14);
  }

  // Gold belt trim
  ctx.fillStyle = '#d97706';
  ctx.fillRect(-15, torsoTop + 32, 30, 3);

  // Back Hair (Long wigs or buns)
  if (['newton_curls', 'huygens_curls', 'hooke_curls', 'coulomb_wig'].includes(sci.hairType)) {
    ctx.fillStyle = sci.hairColor;
    ctx.beginPath();
    ctx.roundRect(-22, -98 + bob, 44, 38, 14);
    ctx.fill();
  } else if (sci.hairType === 'curie_bun') {
    ctx.fillStyle = sci.hairColor;
    ctx.beginPath();
    ctx.arc(-15, -92 + bob, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  const headY = -86 + bob;
  ctx.fillStyle = '#f3c69f';
  ctx.beginPath();
  ctx.arc(0, headY, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3f2817';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hair & Beards
  ctx.fillStyle = sci.hairColor;
  if (['newton_curls', 'huygens_curls', 'hooke_curls', 'coulomb_wig'].includes(sci.hairType)) {
    [-14, -10, 0, 10, 14].forEach((cx, i) => {
      ctx.beginPath();
      ctx.arc(cx, headY - 10 + (i % 2) * 3, 7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.beginPath();
    ctx.arc(-14, headY + 2, 6, 0, Math.PI * 2);
    ctx.arc(14, headY + 2, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (['galileo_beard', 'rontgen_beard', 'aristotle_greek'].includes(sci.hairType)) {
    ctx.beginPath();
    ctx.arc(-13, headY - 4, 5, 0, Math.PI * 2);
    ctx.arc(13, headY - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, headY + 2);
    ctx.quadraticCurveTo(0, headY + 25, 13, headY + 3);
    ctx.quadraticCurveTo(3, headY + 10, -12, headY + 2);
    ctx.fill();
    if (sci.hairType === 'aristotle_greek') {
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-14, headY - 8);
      ctx.lineTo(14, headY - 8);
      ctx.stroke();
    }
  } else if (['maxwell_beard', 'kelvin_beard', 'kepler_ruff'].includes(sci.hairType)) {
    ctx.beginPath();
    ctx.arc(0, headY - 8, 14, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, headY + 1);
    ctx.quadraticCurveTo(2, headY + 23, 13, headY + 2);
    ctx.fill();
  } else if (['faraday_wave', 'ampere_curls'].includes(sci.hairType)) {
    ctx.beginPath();
    ctx.arc(-6, headY - 10, 9, 0, Math.PI * 2);
    ctx.arc(7, headY - 10, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (sci.hairType === 'planck_bald') {
    ctx.beginPath();
    ctx.arc(-13, headY - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-2, headY + 3, 12, 3);
  } else if (sci.hairType === 'einstein_wild') {
    [
      [-14, -8, 8],
      [-8, -14, 9],
      [2, -15, 9],
      [11, -11, 8],
      [15, -3, 7],
      [-16, 0, 7],
    ].forEach(([hx, hy, hr]) => {
      ctx.beginPath();
      ctx.arc(hx, headY + hy, hr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(5, headY + 4, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (sci.hairType === 'curie_bun') {
    ctx.beginPath();
    ctx.ellipse(0, headY - 11, 15, 7, -0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (['thomson_mustache', 'rutherford_mustache'].includes(sci.hairType)) {
    ctx.beginPath();
    ctx.ellipse(-1, headY - 11, 14, 7, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5, headY + 4, 7, 2.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(-1, headY - 11, 14, 7, -0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes & Glasses
  ctx.fillStyle = '#111827';
  if (pose === 'hurt' || pose === 'ko') {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3, headY - 5);
    ctx.lineTo(9, headY + 1);
    ctx.moveTo(9, headY - 5);
    ctx.lineTo(3, headY + 1);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(6, headY - 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, headY - 6);
    ctx.lineTo(10, headY - 4);
    ctx.stroke();

    if (['planck', 'ohm', 'thomson', 'schrodinger'].includes(sci.id)) {
      ctx.strokeStyle = sci.id === 'schrodinger' ? '#18181b' : '#d4af37';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(6, headY - 2, 4.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Arm & Signature Props
  ctx.strokeStyle = sci.primaryColor;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  const extend = pose === 'attack' ? 18 : pose === 'cast' ? 12 : 4;
  const liftY = pose === 'cast' ? -12 : pose === 'ready' ? -4 : 0;
  const handX = 20 + extend;
  const handY = torsoTop + 14 + liftY;

  ctx.beginPath();
  ctx.moveTo(4, torsoTop + 10);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  ctx.fillStyle = '#f3c69f';
  ctx.beginPath();
  ctx.arc(handX, handY, 5, 0, Math.PI * 2);
  ctx.fill();

  drawSignatureProp(ctx, sci, handX, handY, t);
}

function drawSignatureProp(
  ctx: CanvasRenderingContext2D,
  sci: Scientist,
  handX: number,
  handY: number,
  t: number
) {
  switch (sci.prop) {
    case 'apple':
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(handX + 4, handY - 5, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(handX + 3, handY - 13, 4, 3);
      break;
    case 'pendulum': {
      const swing = Math.sin(t * 5) * 7;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(handX, handY);
      ctx.lineTo(handX + swing, handY + 22);
      ctx.stroke();
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.arc(handX + swing, handY + 24, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'telescope':
      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(-0.45);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(-6, -3, 28, 6);
      ctx.strokeStyle = '#713f12';
      ctx.lineWidth = 1;
      ctx.strokeRect(-6, -3, 28, 6);
      ctx.restore();
      break;
    case 'flask':
    case 'radium_vial':
      ctx.fillStyle = sci.prop === 'radium_vial' ? 'rgba(74, 222, 128, 0.9)' : 'rgba(186, 230, 253, 0.75)';
      ctx.beginPath();
      ctx.arc(handX + 3, handY - 6, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(handX + 3, handY - 4, 4.5, 0, Math.PI);
      ctx.fill();
      break;
    case 'atom':
    case 'planet':
    case 'wave_orb':
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(handX + 7, handY - 6, 10, 4, 0.5 + t * 0.8, 0, Math.PI * 2);
      ctx.ellipse(handX + 7, handY - 6, 10, 4, -0.5 - t * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = sci.accentColor;
      ctx.beginPath();
      ctx.arc(handX + 7, handY - 6, 3.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'spring':
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(handX, handY - 12);
      ctx.lineTo(handX + 8, handY - 8);
      ctx.lineTo(handX, handY - 4);
      ctx.lineTo(handX + 8, handY);
      ctx.stroke();
      break;
    case 'magnet':
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(handX + 5, handY - 4, 6.5, Math.PI * 0.5, Math.PI * 1.5, true);
      ctx.stroke();
      break;
    case 'ice_crystal':
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(handX + 5, handY - 15);
      ctx.lineTo(handX + 11, handY - 6);
      ctx.lineTo(handX + 5, handY + 3);
      ctx.lineTo(handX - 1, handY - 6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cat_box':
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(handX - 1, handY - 13, 13, 11);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(handX - 1, handY - 13, 13, 11);
      break;
    case 'bongo':
      ctx.fillStyle = '#b45309';
      ctx.fillRect(handX - 6, handY + 2, 9, 13);
      ctx.fillRect(handX + 4, handY + 4, 8, 11);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(handX - 6, handY + 1, 9, 3);
      ctx.fillRect(handX + 4, handY + 3, 8, 3);
      break;
    case 'spark_orb':
    case 'crt_tube':
    case 'antenna':
      ctx.fillStyle = sci.accentColor;
      ctx.beginPath();
      ctx.arc(handX + 5, handY - 6, 5.5 + Math.sin(t * 10) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'scroll':
    case 'manuscript':
    case 'notes':
    case 'xray_plate':
    case 'slit_card':
      ctx.fillStyle = sci.prop === 'xray_plate' ? '#1e293b' : '#fef3c7';
      ctx.fillRect(handX + 1, handY - 12, 10, 13);
      ctx.strokeStyle = sci.accentColor;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(handX + 1, handY - 12, 10, 13);
      break;
    case 'chalk':
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(handX, handY - 2);
      ctx.lineTo(handX + 9, handY - 10);
      ctx.stroke();
      break;
    default:
      ctx.fillStyle = sci.accentColor;
      ctx.beginPath();
      ctx.arc(handX + 4, handY - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}
