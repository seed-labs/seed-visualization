import { fireEvent, render, screen } from '@testing-library/vue';
import { defineComponent } from 'vue';
import Pagination from '@/components/Pagination/index.vue';

const PaginationStub = defineComponent({
  name: 'ElPagination',
  props: ['currentPage', 'pageSize', 'pageSizes', 'total', 'disabled'],
  emits: ['size-change', 'current-change', 'update:current-page', 'update:page-size'],
  template: `
    <div data-testid="pagination">
      <span>Total: {{ total }}</span>
      <button type="button" @click="$emit('size-change', 10)">set-size</button>
      <button type="button" @click="$emit('current-change', 2)">set-page</button>
    </div>
  `,
});

describe('Pagination', () => {
  it('calls getData when page size changes', async () => {
    const getData = vi.fn();
    const pageParams = {
      total: 12,
      pageSize: 5,
      currentPage: 1,
      pageSizes: [5, 10],
    };

    render(Pagination, {
      props: { pageParams, getData },
      global: { stubs: { ElPagination: PaginationStub } },
    });

    await fireEvent.click(screen.getByText('set-size'));

    expect(pageParams.pageSize).toBe(10);
    expect(getData).toHaveBeenCalledTimes(1);
  });

  it('calls getData when current page changes', async () => {
    const getData = vi.fn();
    const pageParams = {
      total: 12,
      pageSize: 5,
      currentPage: 1,
      pageSizes: [5, 10],
    };

    render(Pagination, {
      props: { pageParams, getData },
      global: { stubs: { ElPagination: PaginationStub } },
    });

    await fireEvent.click(screen.getByText('set-page'));

    expect(pageParams.currentPage).toBe(2);
    expect(getData).toHaveBeenCalledTimes(1);
  });
});
