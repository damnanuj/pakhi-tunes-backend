export const success = (res, data, statusCode = 200) => {
  res.status(statusCode).json({
    data,
    error: {},
    isSuccess: true,
  });
};

export const successPaginated = (res, results, count, limit, offset, statusCode = 200, req = null) => {
  const currentPage = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
  const totalPages = limit > 0 ? Math.ceil(count / limit) : 1;

  let next = currentPage < totalPages ? currentPage + 1 : null;
  let previous = currentPage > 1 ? currentPage - 1 : null;

  if (req) {
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
    next = currentPage < totalPages ? `${baseUrl}?limit=${limit}&offset=${offset + limit}` : null;
    previous = currentPage > 1 ? `${baseUrl}?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null;
  }

  res.status(statusCode).json({
    data: {
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
