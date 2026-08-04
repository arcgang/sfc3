export interface ErrorDetail {
  code: string;
  message: string;
  field: string;
}

export interface ErrorResponse {
  meta: {
    correlationId: string;
    timestamp: string;
  };
  error: {
    type: string;
    details: ErrorDetail[];
  };
}
