import { computed, ref } from 'vue';

export type DockListTab = 'all' | 'selected' | 'stations' | 'settings';
export type DockPage = 'shells' | 'traffic' | DockListTab;

export type DockPageDefinition = {
  id: DockPage;
  label: string;
};

export function useDockPages(
  pageDefinitions: DockPageDefinition[],
  getDockPageCount: (page: DockPage) => number | undefined,
) {
  const activeDockPage = ref<DockPage>('shells');
  const dockCollapsed = ref(false);
  const dockPageMenuVisible = ref(false);

  const dockPages = computed(() =>
    pageDefinitions.map((page) => ({
      ...page,
      count: getDockPageCount(page.id),
    })),
  );
  const activeDockPageLabel = computed(
    () => pageDefinitions.find((page) => page.id === activeDockPage.value)?.label ?? '',
  );
  const activeDockPageCount = computed(() => getDockPageCount(activeDockPage.value));
  const activeDockListTab = computed<DockListTab>(() =>
    ['all', 'selected', 'stations', 'settings'].includes(activeDockPage.value)
      ? activeDockPage.value as DockListTab
      : 'all',
  );

  function toggleDockCollapsed() {
    dockCollapsed.value = !dockCollapsed.value;
    if (dockCollapsed.value) {
      dockPageMenuVisible.value = false;
    }
  }

  function toggleDockPageMenu() {
    dockPageMenuVisible.value = !dockPageMenuVisible.value;
    dockCollapsed.value = false;
  }

  function selectDockPage(page: DockPage) {
    activeDockPage.value = page;
    dockPageMenuVisible.value = false;
    dockCollapsed.value = false;
  }

  function switchDockPage(direction: -1 | 1) {
    const currentIndex = pageDefinitions.findIndex((page) => page.id === activeDockPage.value);
    const nextIndex = (currentIndex + direction + pageDefinitions.length) % pageDefinitions.length;
    activeDockPage.value = pageDefinitions[nextIndex].id;
    dockPageMenuVisible.value = false;
    dockCollapsed.value = false;
  }

  return {
    activeDockPage,
    dockCollapsed,
    dockPageMenuVisible,
    dockPages,
    activeDockPageLabel,
    activeDockPageCount,
    activeDockListTab,
    toggleDockCollapsed,
    toggleDockPageMenu,
    selectDockPage,
    switchDockPage,
  };
}
