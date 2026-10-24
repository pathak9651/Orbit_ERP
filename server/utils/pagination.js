const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

/** Parses safe, bounded page values shared by list endpoints. */
export function getPaginationOptions(query = {}, { defaultPageSize = DEFAULT_PAGE_SIZE, maxPageSize = MAX_PAGE_SIZE } = {}) {
  const requestedPage = Number.parseInt(query.page, 10)
  const requestedPageSize = Number.parseInt(query.pageSize, 10)
  return {
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, maxPageSize)
      : defaultPageSize,
  }
}

/** Executes a sorted/populated query with its count and returns consistent paging metadata. */
export async function paginateQuery(findQuery, countQuery, options) {
  const totalItems = await countQuery
  const totalPages = Math.ceil(totalItems / options.pageSize)
  const page = totalPages ? Math.min(options.page, totalPages) : 1
  const items = await findQuery.skip((page - 1) * options.pageSize).limit(options.pageSize)

  return {
    items,
    pagination: {
      page,
      pageSize: options.pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  }
}
