export interface SuccessResponse<T> {
  success: true;
  code: number;
  message: string;
  data: T;
}

export interface ErrorResponse {
  success: false;
  code: number;
  message: string;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
