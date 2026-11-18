import React, { useEffect, useRef } from 'react';
import { PhysicsElement } from '../data/scientists';

export interface VfxEvent {
  id: number;
  kind: 'strike' | 'spell' | 'heal' | 'super' | 'shield' | 'apple' | 'lightning' | 'ice' | 'quantum';
  element: PhysicsElement;
  fromX: number; // 0..1000
  fromY: number; // 0..560
  toX: number;   // 0..1000
  toY: number;   // 0..560
  color: string;
  formula?: string;
  createdAt: number;
  durationMs: number;
}

interface BattleVfxCanvasProps {
  events: VfxEvent[];
}

export const BattleVfxCanvas: React.FC<BattleVfxCanvasProps> = ({ events }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventsRef = useRef<VfxEvent[]>(events);
  eventsRef.current = events;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const render = () => {
      const now = performance.now();
      const W = 1000;
      const H = 560;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      ctx.clearRect(0, 0, W, H);

      for (const ev of eventsRef.current) {
        const elapsed = now - ev.createdAt;
        if (elapsed < 0 || elapsed > ev.durationMs) continue;
        const p = Math.min(1, elapsed / ev.durationMs);
        drawVfx(ctx, ev, p);
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={560}
      className="pointer-events-none absolute inset-0 h-full w-full z-20"
    />
  );
};

function drawVfx(ctx: CanvasRenderingContext2D, ev: VfxEvent, p: number) {
  ctx.save();

  if (ev.kind === 'strike') {
    // Classic FF diagonal slash across target
    const alpha = 1 - p;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = ev.color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 6 * (1 - p * 0.5);
    ctx.globalAlpha = alpha;
    const slashLen = 78 * Math.min(1, p * 2.5);
    ctx.beginPath();
    ctx.moveTo(ev.toX - slashLen * 0.5, ev.toY - slashLen * 0.65);
    ctx.lineTo(ev.toX + slashLen * 0.5, ev.toY + slashLen * 0.65);
    ctx.stroke();

    // Hit sparks
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.3;
      const dist = p * 70;
      ctx.fillStyle = i % 2 === 0 ? '#fde047' : ev.color;
      ctx.beginPath();
      ctx.arc(ev.toX + Math.cos(angle) * dist, ev.toY + Math.sin(angle) * dist, 4 * (1 - p), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ev.kind === 'apple') {
    // Giant gravity apple dropping onto target
    const dropP = Math.min(1, p * 1.45);
    const bounce = p > 0.68 ? Math.abs(Math.sin((p - 0.68) * 14)) * 28 : 0;
    const ay = (ev.toY - 260) * (1 - dropP) + ev.toY * dropP - bounce;
    ctx.globalAlpha = p > 0.85 ? (1 - p) / 0.15 : 1;
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(ev.toX, ay - 16, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(ev.toX - 3, ay - 46, 12, 7);

    if (p > 0.62) {
      const ringR = (p - 0.62) * 260;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4 * (1 - p);
      ctx.beginPath();
      ctx.ellipse(ev.toX, ev.toY + 28, ringR, ringR * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (ev.kind === 'lightning') {
    // High-voltage electromagnetic bolts from sky + beam
    ctx.globalAlpha = 1 - p * 0.8;
    ctx.strokeStyle = '#e0f2fe';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 22;
    ctx.lineWidth = 5 * (1 - p * 0.4);
    ctx.beginPath();
    ctx.moveTo(ev.toX, 0);
    const segs = 7;
    for (let i = 1; i <= segs; i++) {
      const jitter = i === segs ? 0 : (Math.sin(i * 19 + p * 40) * 26);
      ctx.lineTo(ev.toX + jitter, (ev.toY / segs) * i);
    }
    ctx.stroke();

    ctx.strokeStyle = ev.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ev.toX, ev.toY, 20 + p * 75, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ev.kind === 'ice') {
    // Absolute zero crystal shards & frost ring
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = '#67e8f9';
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 16;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + p * 1.2;
      const dist = 16 + p * 54;
      const cx = ev.toX + Math.cos(ang) * dist;
      const cy = ev.toY + Math.sin(ang) * dist * 0.65;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 16);
      ctx.lineTo(cx + 8, cy);
      ctx.lineTo(cx, cy + 16);
      ctx.lineTo(cx - 8, cy);
      ctx.closePath();
      ctx.fill();
    }
  } else if (ev.kind === 'heal' || ev.kind === 'shield') {
    // Rising emerald/cyan sparkles & harmonic rings
    ctx.globalAlpha = 1 - p;
    const ringColor = ev.kind === 'heal' ? '#34d399' : '#38bdf8';
    ctx.strokeStyle = ringColor;
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(ev.toX, ev.toY + 34 - p * 80, 44, 14, 0, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 10; i++) {
      const rx = ev.toX + Math.sin(i * 2.1 + p * 5) * 34;
      const ry = ev.toY + 30 - ((p * 120 + i * 18) % 105);
      ctx.fillStyle = i % 2 === 0 ? '#a7f3d0' : '#fde047';
      ctx.beginPath();
      ctx.arc(rx, ry, 3.5 * (1 - p * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ev.kind === 'super') {
    // Epic Equation Limit Break Multi-Wave Burst!
    const fade = p > 0.78 ? (1 - p) / 0.22 : 1;
    ctx.globalAlpha = fade * 0.9;

    // Expanding spacetime/energy shockwaves across target zone
    for (let ring = 0; ring < 3; ring++) {
      const rp = Math.max(0, p - ring * 0.14);
      if (rp <= 0) continue;
      ctx.strokeStyle = ring === 0 ? '#fde047' : ring === 1 ? ev.color : '#38bdf8';
      ctx.shadowColor = ev.color;
      ctx.shadowBlur = 24;
      ctx.lineWidth = 6 * (1 - rp * 0.6);
      ctx.beginPath();
      ctx.arc(ev.toX, ev.toY, rp * 220, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Converging energy beam from caster to target
    if (p < 0.7) {
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = ev.color;
      ctx.shadowBlur = 30;
      ctx.lineWidth = 18 * Math.sin((p / 0.7) * Math.PI);
      ctx.beginPath();
      ctx.moveTo(ev.fromX, ev.fromY - 12);
      ctx.lineTo(ev.toX, ev.toY);
      ctx.stroke();
    }

    // Floating glowing formula emblem at impact
    if (ev.formula) {
      ctx.font = 'bold 28px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = ev.color;
      ctx.shadowBlur = 18;
      ctx.fillText(ev.formula, ev.toX, ev.toY - 58 - p * 26);
    }
  } else {
    // Standard projectile wave / quantum orb from caster to target
    const travel = Math.min(1, p * 1.6);
    const cx = ev.fromX + (ev.toX - ev.fromX) * travel;
    const cy = ev.fromY + (ev.toY - ev.fromY) * travel - Math.sin(travel * Math.PI) * 32;

    ctx.globalAlpha = p > 0.8 ? (1 - p) / 0.2 : 1;
    ctx.fillStyle = ev.color;
    ctx.shadowColor = ev.color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();

    // Orbital trail ring
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 24, 9, p * 8, 0, Math.PI * 2);
    ctx.stroke();

    if (p > 0.58) {
      const burst = (p - 0.58) / 0.42;
      ctx.strokeStyle = ev.color;
      ctx.lineWidth = 4 * (1 - burst);
      ctx.beginPath();
      ctx.arc(ev.toX, ev.toY, 20 + burst * 85, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}
