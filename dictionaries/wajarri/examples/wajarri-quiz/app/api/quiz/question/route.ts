import { NextResponse } from 'next/server';
import { generateQuizQuestion } from '@/lib/db';

export async function GET() {
  try {
    const question = await generateQuizQuestion();
    return NextResponse.json(question);
  } catch (error) {
    console.error('Error generating quiz question:', error);
    return NextResponse.json(
      { error: 'Failed to generate quiz question' },
      { status: 500 }
    );
  }
}