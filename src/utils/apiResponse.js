export const success = (res, data, statusCode = 200) => {
  res.status(statusCode).json({
    data,
    error: {},
    isSuccess: true,
  });
};

export const successPaginated = (res, results, count, limit, offset, statusCode = 200) => {
  const currentPage = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
  const totalPages = limit > 0 ? Math.ceil(count / limit) : 1;

  res.status(statusCode).json({
    data: {
      count,
      currentPage,
      totalPages,
      next: currentPage < totalPages ? currentPage + 1 : null,
      previous: currentPage > 1 ? currentPage - 1 : null,
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
