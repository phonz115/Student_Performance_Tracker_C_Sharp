import './TablePagination.css';

type TablePaginationProps = {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
};

const TablePagination = ({ currentPage, totalItems, pageSize, itemLabel, onPageChange }: TablePaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <nav className="table-pagination" aria-label={`${itemLabel} table pagination`}>
      <span>Showing {start} to {end} of {totalItems} {itemLabel}</span>
      <div className="table-pagination-controls">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            className={page === currentPage ? 'active' : ''}
            aria-current={page === currentPage ? 'page' : undefined}
            aria-label={`Page ${page}`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    </nav>
  );
};

export default TablePagination;
