class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const notFound = (resource) => new ApiError(404, `${resource} was not found`);

module.exports = { ApiError, notFound };
