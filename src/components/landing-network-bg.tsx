'use client';

import { useEffect, useRef } from 'react';

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
};

/**
 * Subtle blockchain mesh + radar pulse behind the landing page.
 * Canvas only — no layout impact; respects prefers-reduced-motion.
 */
export function LandingNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let nodes: Node[] = [];
    let t = 0;

    const BLUE = { r: 0, g: 82, b: 255 };
    const GREEN = { r: 14, g: 203, b: 129 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(64, Math.max(32, Math.floor((w * h) / 30000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 1.2 + Math.random() * 1.8,
        pulse: Math.random() * Math.PI * 2,
      }));
    }

    function drawRadar(cx: number, cy: number) {
      const maxR = Math.min(w, h) * 0.52;
      const rings = 4;

      for (let i = 1; i <= rings; i++) {
        const radius = (maxR / rings) * i;
        const breath = 0.35 + 0.25 * Math.sin(t * 0.012 + i * 0.7);
        ctx!.beginPath();
        ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(${BLUE.r},${BLUE.g},${BLUE.b},${0.045 + breath * 0.05})`;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      const angle = (t * 0.008) % (Math.PI * 2);
      const sweep = Math.PI / 5;

      ctx!.save();
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.arc(cx, cy, maxR, angle - sweep, angle);
      ctx!.closePath();
      const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      g.addColorStop(0, `rgba(${BLUE.r},${BLUE.g},${BLUE.b},0.14)`);
      g.addColorStop(0.55, `rgba(${BLUE.r},${BLUE.g},${BLUE.b},0.04)`);
      g.addColorStop(1, `rgba(${BLUE.r},${BLUE.g},${BLUE.b},0)`);
      ctx!.fillStyle = g;
      ctx!.fill();
      ctx!.restore();

      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
      ctx!.strokeStyle = `rgba(${BLUE.r},${BLUE.g},${BLUE.b},0.28)`;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();

      const beat = 0.5 + 0.5 * Math.sin(t * 0.04);
      ctx!.beginPath();
      ctx!.arc(cx, cy, 3 + beat * 3, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${GREEN.r},${GREEN.g},${GREEN.b},${0.35 + beat * 0.35})`;
      ctx!.fill();
    }

    function draw() {
      t += 1;
      ctx!.clearRect(0, 0, w, h);

      const sky = ctx!.createRadialGradient(
        w * 0.5,
        h * 0.35,
        0,
        w * 0.5,
        h * 0.35,
        Math.max(w, h) * 0.75,
      );
      sky.addColorStop(0, 'rgba(0, 82, 255, 0.08)');
      sky.addColorStop(0.4, 'rgba(10, 15, 26, 0.25)');
      sky.addColorStop(1, 'rgba(8, 9, 10, 0)');
      ctx!.fillStyle = sky;
      ctx!.fillRect(0, 0, w, h);

      drawRadar(w * 0.5, h * 0.38);

      const linkDist = Math.min(150, 85 + w * 0.035);

      if (!reduced) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          n.pulse += 0.02;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > linkDist) continue;

          const alpha = (1 - dist / linkDist) * 0.2;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = `rgba(${BLUE.r},${BLUE.g},${BLUE.b},${alpha})`;
          ctx!.lineWidth = 1;
          ctx!.stroke();

          const packetPhase = (t * 0.015 + i * 0.37 + j * 0.11) % 1;
          if (packetPhase < 0.32 && alpha > 0.07) {
            const p = packetPhase / 0.32;
            const px = a.x + (b.x - a.x) * p;
            const py = a.y + (b.y - a.y) * p;
            ctx!.beginPath();
            ctx!.arc(px, py, 1.4, 0, Math.PI * 2);
            ctx!.fillStyle = `rgba(${GREEN.r},${GREEN.g},${GREEN.b},0.6)`;
            ctx!.fill();
          }
        }
      }

      for (const n of nodes) {
        const glow = 0.45 + 0.35 * Math.sin(n.pulse);
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r + glow * 0.6, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${BLUE.r},${BLUE.g},${BLUE.b},${0.12 + glow * 0.1})`;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(215, 222, 235,${0.35 + glow * 0.35})`;
        ctx!.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 120);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
