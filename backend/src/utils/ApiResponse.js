'use strict';

/** Uniform success envelope — see docs/03-api-contract.md. */
class ApiResponse {
  static send(res, data, { meta, statusCode = 200 } = {}) {
    const body = { success: true, data };
    if (meta) body.meta = meta;
    return res.status(statusCode).json(body);
  }

  static created(res, data, meta) {
    return ApiResponse.send(res, data, { meta, statusCode: 201 });
  }

  static noContent(res) {
    return res.status(204).end();
  }

  /** data = [...rows], meta = { page, limit, total, totalPages } */
  static paginated(res, rows, pagination) {
    return ApiResponse.send(res, rows.items ?? rows, { meta: pagination });
  }
}

module.exports = ApiResponse;
