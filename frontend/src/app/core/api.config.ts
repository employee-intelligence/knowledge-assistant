/**
 * Single source for the backend base URL. Every HTTP call is built from this
 * constant so the environment can change in one place.
 */
export const API_BASE_URL = '/api';

/** Prefix applied to every knowledge assistant endpoint. */
export const API_V1 = `${API_BASE_URL}/v1`;
