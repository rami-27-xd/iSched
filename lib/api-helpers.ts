export function apiResponse<T>(data: T, meta?: { total?: number; page?: number; perPage?: number }) {
  return { data, error: null, meta }
}

export function apiError(message: string) {
  return { data: null, error: message }
}

export function handleApiError(error: unknown) {
  console.error('[API Error]', error)
  if (error instanceof Error) {
    if (error.message === 'UNAUTHORIZED') {
      return apiError('Unauthorized')
    }
    return apiError(error.message)
  }
  return apiError('An unexpected error occurred')
}
