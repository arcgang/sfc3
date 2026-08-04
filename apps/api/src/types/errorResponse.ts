export interface ErrorResponse {
  meta: {
    correlationId: string;
    timestamp: string;
  };
  error: {
    type: string;
    details: unknown[];
  };
}
