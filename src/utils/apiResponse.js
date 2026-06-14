export const success = (res, data, statusCode = 200) => {
  res.status(statusCode).json({
    data,
    error: {},
    isSuccess: true,
  });
};

function paginationQueryString(req, limit, offset) {
  const params = new URLSearchParams();
  if (req?.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (k === 'limit' || k === 'offset') continue;
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
  }
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const q = params.toString();
  return q ? `?${q}` : '';
}

export const successPaginated = (res, results, count, limit, offset, statusCode = 200, req = null, extra = {}) => {
  const currentPage = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
  const totalPages = limit > 0 ? Math.ceil(count / limit) : 1;

  let next = currentPage < totalPages ? currentPage + 1 : null;
  let previous = currentPage > 1 ? currentPage - 1 : null;

  if (req) {
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
    const qsNext = paginationQueryString(req, limit, offset + limit);
    const qsPrev = paginationQueryString(req, limit, Math.max(0, offset - limit));
    next =
      currentPage < totalPages && results.length > 0
        ? `${baseUrl}${qsNext}`
        : null;
    previous = currentPage > 1 ? `${baseUrl}${qsPrev}` : null;
  } else if (!results.length) {
    next = null;
  }

  res.status(statusCode).json({
    data: {
      ...extra,
      count,
      currentPage,
      totalPages,
      next,
      previous,
      results,
    },
    error: {},
    isSuccess: true,
  });
};

export const error = (res, message, statusCode = 500) => {
  res.status(statusCode).json({
    data: null,
    error: { message },
    isSuccess: false,
  });
};
