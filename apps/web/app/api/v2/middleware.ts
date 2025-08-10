import { NextResponse } from 'next/server'

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  }
}

export function handleCors(response: NextResponse) {
  const headers = corsHeaders()
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

export function createErrorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { 
      status,
      headers: corsHeaders()
    }
  )
}

export function createSuccessResponse(data: any, status: number = 200) {
  return NextResponse.json(
    data,
    { 
      status,
      headers: corsHeaders()
    }
  )
}