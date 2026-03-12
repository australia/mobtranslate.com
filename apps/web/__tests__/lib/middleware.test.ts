import { describe, it, expect } from 'vitest';
import {
  corsHeaders,
  handleCors,
  createErrorResponse,
  createSuccessResponse,
} from '@/app/api/v2/middleware';
import { NextResponse } from 'next/server';

describe('corsHeaders', () => {
  it('returns Access-Control-Allow-Origin as wildcard', () => {
    const headers = corsHeaders();
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns allowed methods including GET, POST, PUT, DELETE, OPTIONS', () => {
    const headers = corsHeaders();
    expect(headers['Access-Control-Allow-Methods']).toBe(
      'GET, POST, PUT, DELETE, OPTIONS'
    );
  });

  it('returns allowed headers including Content-Type, Authorization, X-Requested-With', () => {
    const headers = corsHeaders();
    expect(headers['Access-Control-Allow-Headers']).toBe(
      'Content-Type, Authorization, X-Requested-With'
    );
  });

  it('returns Max-Age of 86400', () => {
    const headers = corsHeaders();
    expect(headers['Access-Control-Max-Age']).toBe('86400');
  });

  it('returns exactly 4 header keys', () => {
    const headers = corsHeaders();
    expect(Object.keys(headers)).toHaveLength(4);
  });
});

describe('handleCors', () => {
  it('sets CORS headers on the response', () => {
    const response = NextResponse.json({ ok: true });
    const result = handleCors(response);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(result.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    expect(result.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, Authorization, X-Requested-With'
    );
    expect(result.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('returns the same response object', () => {
    const response = NextResponse.json({ ok: true });
    const result = handleCors(response);
    expect(result).toBe(response);
  });
});

describe('createErrorResponse', () => {
  it('returns a response with the given status code', () => {
    const response = createErrorResponse('Not found', 404);
    expect(response.status).toBe(404);
  });

  it('returns JSON body with error message', async () => {
    const response = createErrorResponse('Bad request', 400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Bad request' });
  });

  it('includes CORS headers', () => {
    const response = createErrorResponse('Error', 500);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('handles different status codes', async () => {
    const r401 = createErrorResponse('Unauthorized', 401);
    expect(r401.status).toBe(401);
    const body = await r401.json();
    expect(body.error).toBe('Unauthorized');
  });
});

describe('createSuccessResponse', () => {
  it('defaults to status 200', () => {
    const response = createSuccessResponse({ data: 'test' });
    expect(response.status).toBe(200);
  });

  it('accepts a custom status code', () => {
    const response = createSuccessResponse({ created: true }, 201);
    expect(response.status).toBe(201);
  });

  it('returns the data as JSON body', async () => {
    const data = { items: [1, 2, 3], total: 3 };
    const response = createSuccessResponse(data);
    const body = await response.json();
    expect(body).toEqual(data);
  });

  it('includes CORS headers', () => {
    const response = createSuccessResponse({});
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET, POST, PUT, DELETE, OPTIONS'
    );
  });

  it('handles null data', async () => {
    const response = createSuccessResponse(null);
    const body = await response.json();
    expect(body).toBeNull();
  });

  it('handles array data', async () => {
    const response = createSuccessResponse([1, 2, 3]);
    const body = await response.json();
    expect(body).toEqual([1, 2, 3]);
  });
});
