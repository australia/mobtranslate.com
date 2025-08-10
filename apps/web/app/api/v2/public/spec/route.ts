import { NextResponse } from 'next/server'
import { corsHeaders } from '../../middleware'
import openApiSpec from '../openapi.json'

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET() {
  return NextResponse.json(openApiSpec, {
    status: 200,
    headers: corsHeaders()
  })
}