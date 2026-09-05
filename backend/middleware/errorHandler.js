function errorHandler(error, request, response, next) {
  console.error(error);

  if (response.headersSent) {
    return next(error);
  }

  response.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : 'An unexpected server error occurred',
    ...(error.field ? { field: error.field } : {})
  });
}

module.exports = errorHandler;
