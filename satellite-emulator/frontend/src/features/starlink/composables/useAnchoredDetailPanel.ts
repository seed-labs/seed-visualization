import { computed, nextTick, ref, watch } from 'vue';
import type { ScreenAnchor } from '@/features/starlink/types';

const DEFAULT_PANEL_WIDTH = 520;
const DEFAULT_PANEL_HEIGHT = 240;
const VIEWPORT_MARGIN = 12;
const ANCHOR_OFFSET_X = 18;
const ANCHOR_OFFSET_Y = 14;

export function useAnchoredDetailPanel(options: {
  anchor: () => ScreenAnchor | undefined;
  active: () => boolean;
  identity: () => unknown;
}) {
  const panelRef = ref<HTMLElement>();
  const position = ref({ x: Math.max(window.innerWidth - 568, 24), y: 600 });
  const dragOffset = ref({ x: 0, y: 0 });

  const panelStyle = computed(() => ({
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  }));

  watch(
    () => {
      const anchor = options.anchor();
      return [
        options.active(),
        options.identity(),
        anchor?.x,
        anchor?.y,
      ];
    },
    () => {
      if (!options.active()) {
        return;
      }

      const anchor = options.anchor();
      if (!anchor) {
        return;
      }

      void placeNearAnchor(anchor);
    },
    { immediate: true },
  );

  async function placeNearAnchor(anchor: ScreenAnchor) {
    await nextTick();

    const panel = panelRef.value;
    const width = panel?.offsetWidth || DEFAULT_PANEL_WIDTH;
    const height = panel?.offsetHeight || DEFAULT_PANEL_HEIGHT;
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);

    let nextX = anchor.x + ANCHOR_OFFSET_X;
    let nextY = anchor.y + ANCHOR_OFFSET_Y;

    if (nextX > maxX) {
      nextX = anchor.x - width - ANCHOR_OFFSET_X;
    }

    if (nextY > maxY) {
      nextY = anchor.y - height - ANCHOR_OFFSET_Y;
    }

    position.value = {
      x: clamp(nextX, VIEWPORT_MARGIN, maxX),
      y: clamp(nextY, VIEWPORT_MARGIN, maxY),
    };
  }

  function startDrag(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }

    const panel = panelRef.value;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    dragOffset.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    position.value = { x: rect.left, y: rect.top };

    panel.setPointerCapture(event.pointerId);
    panel.addEventListener('pointermove', movePanel);
    panel.addEventListener('pointerup', stopDrag, { once: true });
    panel.addEventListener('pointercancel', stopDrag, { once: true });
  }

  function movePanel(event: PointerEvent) {
    const panel = panelRef.value;
    if (!panel) {
      return;
    }

    position.value = {
      x: clamp(event.clientX - dragOffset.value.x, 0, window.innerWidth - panel.offsetWidth),
      y: clamp(event.clientY - dragOffset.value.y, 0, window.innerHeight - panel.offsetHeight),
    };
  }

  function stopDrag(event: PointerEvent) {
    const panel = panelRef.value;
    if (!panel) {
      return;
    }

    panel.releasePointerCapture(event.pointerId);
    panel.removeEventListener('pointermove', movePanel);
  }

  return {
    panelRef,
    panelStyle,
    startDrag,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
