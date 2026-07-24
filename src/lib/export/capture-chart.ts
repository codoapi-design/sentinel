/**
 * Capture chart cards as PNG data URLs for PDF embedding.
 *
 * Strategy (visual parity with on-screen cards):
 * 1. Expand clipped legends / hide interactive chrome (`data-export-ignore`)
 * 2. Pre-rasterize every Recharts SVG (inline computed styles → PNG `<img>`)
 * 3. Screenshot the full card with modern-screenshot, then html2canvas
 * 4. Reject tiny/empty captures and fall back to SVG-only + legend caption
 *
 * Mark the outer card with `data-export-chart="Title"`.
 * Mark interactive clutter (period pills, filter popovers) with `data-export-ignore`.
 */

import { domToPng } from 'modern-screenshot';
import html2canvas from 'html2canvas';

export type CapturedChartImage = {
  title: string;
  dataUrl: string;
  /** Optional legend / series key text when SVG fallback is used. */
  caption?: string;
};

export type CaptureChartOpts = {
  background?: string;
  scale?: number;
};

const MIN_DATA_URL_CHARS = 10_000;
const DEFAULT_BG = '#0f1011';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load chart image'));
    img.src = url;
  });
}

function isValidCapture(dataUrl: string | null | undefined): dataUrl is string {
  return Boolean(dataUrl && dataUrl.startsWith('data:image') && dataUrl.length >= MIN_DATA_URL_CHARS);
}

function shouldIgnoreElement(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('data-export-ignore')) return true;
  return Boolean(el.closest('[data-export-ignore]'));
}

/**
 * Collect human-readable legend / color-key text from a chart card
 * (Recharts legend items or custom list keys).
 */
export function extractChartLegendCaption(container: HTMLElement): string | undefined {
  const fromAttr = container.getAttribute('data-export-legend')?.trim();
  if (fromAttr) return fromAttr;

  const rechartsItems = Array.from(
    container.querySelectorAll<HTMLElement>('.recharts-legend-item'),
  )
    .map(item => item.textContent?.replace(/\s+/g, ' ').trim())
    .filter((t): t is string => Boolean(t));

  if (rechartsItems.length > 0) {
    return `Legend: ${rechartsItems.join(' · ')}`;
  }

  const customKeys = Array.from(
    container.querySelectorAll<HTMLElement>('[data-export-legend-item]'),
  )
    .map(
      item =>
        item.getAttribute('data-export-legend-item')?.trim() ||
        item.textContent?.replace(/\s+/g, ' ').trim(),
    )
    .filter((t): t is string => Boolean(t));

  if (customKeys.length > 0) {
    return `Legend: ${customKeys.join(' · ')}`;
  }

  return undefined;
}

type StyleSnapshot = {
  fill: string;
  stroke: string;
  strokeWidth: string;
  opacity: string;
  fillOpacity: string;
  strokeOpacity: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  color: string;
};

function readComputedSvgStyles(el: Element): StyleSnapshot {
  const cs = window.getComputedStyle(el);
  return {
    fill: cs.fill,
    stroke: cs.stroke,
    strokeWidth: cs.strokeWidth,
    opacity: cs.opacity,
    fillOpacity: cs.fillOpacity,
    strokeOpacity: cs.strokeOpacity,
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    fontWeight: cs.fontWeight,
    color: cs.color,
  };
}

function applyStyleAttrs(el: Element, styles: StyleSnapshot): void {
  const existingFill = el.getAttribute('fill');
  const existingStroke = el.getAttribute('stroke');

  // Never clobber gradient / pattern paint servers — serializers keep url(#id)
  const fillIsPaintServer = Boolean(existingFill?.startsWith('url('));
  const strokeIsPaintServer = Boolean(existingStroke?.startsWith('url('));

  if (!fillIsPaintServer && styles.fill && styles.fill !== 'none' && styles.fill !== 'currentColor') {
    // Only set when attribute missing or currentColor (CSS-driven)
    if (!existingFill || existingFill === 'currentColor' || existingFill === 'none') {
      el.setAttribute('fill', styles.fill);
    }
  }
  if (!strokeIsPaintServer && styles.stroke && styles.stroke !== 'none' && styles.stroke !== 'currentColor') {
    if (!existingStroke || existingStroke === 'currentColor' || existingStroke === 'none') {
      el.setAttribute('stroke', styles.stroke);
    }
  }
  if (styles.strokeWidth && styles.strokeWidth !== '0px' && !el.getAttribute('stroke-width')) {
    el.setAttribute('stroke-width', styles.strokeWidth);
  }
  if (styles.opacity && styles.opacity !== '1' && !el.getAttribute('opacity')) {
    el.setAttribute('opacity', styles.opacity);
  }
  if (styles.fillOpacity && styles.fillOpacity !== '1' && !el.getAttribute('fill-opacity')) {
    el.setAttribute('fill-opacity', styles.fillOpacity);
  }
  if (styles.strokeOpacity && styles.strokeOpacity !== '1' && !el.getAttribute('stroke-opacity')) {
    el.setAttribute('stroke-opacity', styles.strokeOpacity);
  }
  if (styles.fontSize && !el.getAttribute('font-size')) {
    el.setAttribute('font-size', styles.fontSize);
  }
  if (styles.fontFamily && !el.getAttribute('font-family')) {
    el.setAttribute('font-family', styles.fontFamily);
  }
  if (styles.fontWeight && styles.fontWeight !== '400' && !el.getAttribute('font-weight')) {
    el.setAttribute('font-weight', styles.fontWeight);
  }

  // SVG <text> often inherits via CSS `fill: currentColor`
  if (el.tagName.toLowerCase() === 'text') {
    const fill = el.getAttribute('fill');
    if (!fill || fill === 'currentColor' || fill === 'none') {
      if (styles.fill && styles.fill !== 'none' && styles.fill !== 'currentColor') {
        el.setAttribute('fill', styles.fill);
      } else if (styles.color && styles.color !== 'rgba(0, 0, 0, 0)') {
        el.setAttribute('fill', styles.color);
      }
    }
  }
}

/**
 * Deep-clone an SVG with computed fill/stroke/font baked into attributes
 * so XMLSerializer / foreignObject capture preserves Recharts colors.
 */
function cloneSvgWithInlinedStyles(svg: SVGElement): SVGElement {
  const clone = svg.cloneNode(true) as SVGElement;
  const origNodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];

  const n = Math.min(origNodes.length, cloneNodes.length);
  for (let i = 0; i < n; i += 1) {
    applyStyleAttrs(cloneNodes[i], readComputedSvgStyles(origNodes[i]));
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Ensure explicit pixel size (ResponsiveContainer often uses 100%)
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || Number(svg.getAttribute('width')) || 800));
  const height = Math.max(1, Math.round(rect.height || Number(svg.getAttribute('height')) || 320));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  return clone;
}

/**
 * Rasterize a single SVG element to a PNG data URL (manual path).
 */
async function rasterizeSvgElement(
  svg: SVGElement,
  opts?: CaptureChartOpts,
): Promise<string | null> {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || Number(svg.getAttribute('width')) || 800));
  const height = Math.max(1, Math.round(rect.height || Number(svg.getAttribute('height')) || 320));
  const scale = opts?.scale ?? 2;
  const background = opts?.background ?? DEFAULT_BG;

  const clone = cloneSvgWithInlinedStyles(svg);
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.length > 500 ? dataUrl : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type DomPrepRestore = () => void;

function pushStyleRestore(el: HTMLElement, restores: Array<() => void>, patch: Partial<CSSStyleDeclaration>) {
  const prev: Record<string, string> = {};
  for (const key of Object.keys(patch) as Array<keyof CSSStyleDeclaration>) {
    const k = key as string;
    prev[k] = (el.style as unknown as Record<string, string>)[k] ?? '';
    const val = patch[key];
    if (typeof val === 'string') {
      (el.style as unknown as Record<string, string>)[k] = val;
    }
  }
  restores.push(() => {
    for (const [k, v] of Object.entries(prev)) {
      (el.style as unknown as Record<string, string>)[k] = v;
    }
  });
}

/**
 * Temporarily expand clipped legends and hide interactive chrome.
 */
function prepareCardForCapture(container: HTMLElement): DomPrepRestore {
  const restores: Array<() => void> = [];

  const hide = (el: HTMLElement) => {
    const prev = el.style.display;
    el.style.display = 'none';
    restores.push(() => {
      el.style.display = prev;
    });
  };

  // Card itself must not clip expanded legends
  pushStyleRestore(container, restores, {
    overflow: 'visible',
    overflowY: 'visible',
    maxHeight: 'none',
  });

  container.querySelectorAll<HTMLElement>('[data-export-ignore]').forEach(hide);

  const candidates = new Set<HTMLElement>();
  container
    .querySelectorAll<HTMLElement>(
      '.overflow-y-auto, .overflow-auto, .overflow-hidden, .overflow-x-hidden, [class*="max-h-"]',
    )
    .forEach(el => candidates.add(el));

  // Also catch inline / computed clipping not covered by Tailwind class selectors
  container.querySelectorAll<HTMLElement>('*').forEach(el => {
    if (el.closest('[data-export-ignore]')) return;
    const cs = window.getComputedStyle(el);
    const maxH = cs.maxHeight;
    const clipped =
      cs.overflowY === 'auto' ||
      cs.overflowY === 'scroll' ||
      cs.overflowY === 'hidden' ||
      cs.overflow === 'hidden' ||
      (maxH !== 'none' && maxH !== '0px' && Number.parseFloat(maxH) > 0);
    if (clipped) candidates.add(el);
  });

  candidates.forEach(el => {
    if (el === container) return;
    if (el.closest('[data-export-ignore]')) return;
    pushStyleRestore(el, restores, {
      maxHeight: 'none',
      overflow: 'visible',
      overflowY: 'visible',
      overflowX: 'visible',
    });
  });

  // Hide Recharts tooltips / cursors if somehow visible
  container
    .querySelectorAll<HTMLElement>(
      '.recharts-tooltip-wrapper, .recharts-default-tooltip, .recharts-active-dot',
    )
    .forEach(hide);

  return () => {
    for (let i = restores.length - 1; i >= 0; i -= 1) restores[i]();
  };
}

type SvgSwapRestore = () => void;

/**
 * Replace live SVGs with pre-rasterized <img> so card screenshot libraries
 * never have to re-render Recharts paths (html2canvas often fails here).
 */
async function swapSvgsForPngs(
  container: HTMLElement,
  opts?: CaptureChartOpts,
): Promise<SvgSwapRestore> {
  const restores: Array<() => void> = [];
  const svgs = Array.from(container.querySelectorAll('svg')).filter(svg => {
    // Skip tiny decorative icons (legend markers etc. under 24px)
    const r = svg.getBoundingClientRect();
    return r.width >= 40 && r.height >= 40;
  });

  for (const svg of svgs) {
    const dataUrl = await rasterizeSvgElement(svg, opts);
    if (!dataUrl) continue;

    const rect = svg.getBoundingClientRect();
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    img.setAttribute('data-export-svg-swap', '1');
    img.style.display = 'block';
    img.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    img.style.height = `${Math.max(1, Math.round(rect.height))}px`;
    img.style.maxWidth = '100%';

    const parent = svg.parentElement;
    if (!parent) continue;

    // Preserve layout of ResponsiveContainer wrapper
    const prevDisplay = (svg as unknown as HTMLElement).style?.display;
    svg.style.display = 'none';
    parent.insertBefore(img, svg.nextSibling);

    restores.push(() => {
      img.remove();
      svg.style.display = prevDisplay || '';
    });
  }

  return () => {
    for (let i = restores.length - 1; i >= 0; i -= 1) restores[i]();
  };
}

async function captureWithModernScreenshot(
  container: HTMLElement,
  opts?: CaptureChartOpts,
): Promise<string | null> {
  const scale = opts?.scale ?? 2;
  const backgroundColor = opts?.background ?? DEFAULT_BG;
  try {
    const dataUrl = await domToPng(container, {
      scale,
      backgroundColor,
      // Filter interactive chrome still present in clone
      filter: (el: Node) => {
        if (!(el instanceof Element)) return true;
        return !shouldIgnoreElement(el);
      },
    });
    return isValidCapture(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * html2canvas path with onclone SVG style inlining (backup).
 */
async function captureWithHtml2Canvas(
  container: HTMLElement,
  opts?: CaptureChartOpts,
): Promise<string | null> {
  const scale = opts?.scale ?? 2;
  const background = opts?.background ?? DEFAULT_BG;

  try {
    // Pair original SVG paint nodes with clone by index for style copy
    const originalPaint = Array.from(
      container.querySelectorAll(
        'svg path, svg line, svg rect, svg circle, svg ellipse, svg polyline, svg polygon, svg text, svg tspan',
      ),
    );
    const originalStyles = originalPaint.map(readComputedSvgStyles);

    const canvas = await html2canvas(container, {
      backgroundColor: background,
      scale,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: el => shouldIgnoreElement(el),
      onclone: (_doc, cloned) => {
        cloned.querySelectorAll<HTMLElement>('.overflow-y-auto, .overflow-auto, .overflow-hidden').forEach(el => {
          if (el.closest('[data-export-ignore]')) return;
          el.style.maxHeight = 'none';
          el.style.overflow = 'visible';
        });

        const clonedPaint = Array.from(
          cloned.querySelectorAll(
            'svg path, svg line, svg rect, svg circle, svg ellipse, svg polyline, svg polygon, svg text, svg tspan',
          ),
        );
        const n = Math.min(originalStyles.length, clonedPaint.length);
        for (let i = 0; i < n; i += 1) {
          applyStyleAttrs(clonedPaint[i], originalStyles[i]);
        }

        cloned.querySelectorAll('svg').forEach(svg => {
          const svgEl = svg as SVGSVGElement;
          const w = svgEl.getAttribute('width');
          const h = svgEl.getAttribute('height');
          if (!w || w.endsWith('%')) {
            const box = svgEl.viewBox?.baseVal;
            if (box && box.width) svgEl.setAttribute('width', String(box.width));
          }
          if (!h || h.endsWith('%')) {
            const box = svgEl.viewBox?.baseVal;
            if (box && box.height) svgEl.setAttribute('height', String(box.height));
          }
        });
      },
    });

    if (!canvas.width || !canvas.height) return null;
    const dataUrl = canvas.toDataURL('image/png');
    return isValidCapture(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * Rasterize the first large SVG inside `container` to a PNG data URL.
 */
export async function captureSvgPng(
  container: HTMLElement | null,
  opts?: CaptureChartOpts,
): Promise<string | null> {
  if (!container || typeof document === 'undefined') return null;

  const svg =
    (container.querySelector('svg.recharts-surface') as SVGElement | null) ||
    (container.querySelector('svg') as SVGElement | null);
  if (!svg) return null;

  return rasterizeSvgElement(svg, opts);
}

export type CaptureChartResult = {
  dataUrl: string;
  /** Present when SVG fallback was used and a legend caption could be inferred. */
  caption?: string;
  mode: 'card' | 'svg';
};

/**
 * Capture a chart card: full-card screenshot preferred (after SVG→PNG swap).
 */
export async function captureChartCard(
  container: HTMLElement | null,
  opts?: CaptureChartOpts,
): Promise<CaptureChartResult | null> {
  if (!container || typeof document === 'undefined') return null;

  const restorePrep = prepareCardForCapture(container);
  let restoreSvgs: SvgSwapRestore = () => {};

  try {
    // Let expanded legends reflow before measuring/swapping SVGs
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    restoreSvgs = await swapSvgsForPngs(container, opts);

    // Allow layout to settle after SVG→img swap
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const modern = await captureWithModernScreenshot(container, opts);
    if (modern) {
      return { dataUrl: modern, mode: 'card' };
    }

    const h2c = await captureWithHtml2Canvas(container, opts);
    if (h2c) {
      return { dataUrl: h2c, mode: 'card' };
    }
  } finally {
    restoreSvgs();
    restorePrep();
  }

  // Last resort: plot-only SVG + text legend caption
  const svgShot = await captureSvgPng(container, opts);
  if (!svgShot) return null;

  const caption = extractChartLegendCaption(container);
  return { dataUrl: svgShot, caption, mode: 'svg' };
}

/**
 * @deprecated Prefer `captureChartCard`. Kept for call sites that only need a data URL.
 */
export async function captureChartPng(
  container: HTMLElement | null,
  opts?: CaptureChartOpts,
): Promise<string | null> {
  const result = await captureChartCard(container, opts);
  return result?.dataUrl ?? null;
}

/**
 * Capture every element marked with `data-export-chart` under `root`.
 * Attribute value is used as the chart title in the PDF.
 */
export async function captureExportCharts(
  root?: ParentNode | null,
  opts?: CaptureChartOpts,
): Promise<CapturedChartImage[]> {
  if (typeof document === 'undefined') return [];
  const scope = root ?? document;
  const nodes = scope.querySelectorAll<HTMLElement>('[data-export-chart]');
  const charts: CapturedChartImage[] = [];

  for (const node of Array.from(nodes)) {
    // Skip nested markers — only capture outermost cards
    if (node.parentElement?.closest('[data-export-chart]')) continue;

    const title = (node.getAttribute('data-export-chart') || 'Chart').trim() || 'Chart';
    const result = await captureChartCard(node, opts);
    if (result) {
      charts.push({
        title,
        dataUrl: result.dataUrl,
        caption: result.caption,
      });
    }
  }

  return charts;
}
