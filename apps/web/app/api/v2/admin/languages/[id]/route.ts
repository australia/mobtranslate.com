import { NextRequest, NextResponse } from 'next/server';
import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireRole } from '@/lib/auth-helpers';
import { languages as languagesT, words as wordsT } from '@/lib/db/schema';

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Authz in code (RLS is gone): admin role required.
    const { response } = await requireRole(['super_admin', 'dictionary_admin']);
    if (response) return response;

    const body = await request.json();
    const { name, code, is_active } = body;

    // Validate input
    if (!name || !code) {
      return NextResponse.json(
        { error: 'Name and code are required' },
        { status: 400 }
      );
    }

    // First check if the language exists
    const existingLang = await db
      .select({ id: languagesT.id })
      .from(languagesT)
      .where(eq(languagesT.id, params.id))
      .limit(1);

    if (existingLang.length === 0) {
      console.error('Language not found:', params.id);
      return NextResponse.json(
        { error: 'Language not found' },
        { status: 404 }
      );
    }

    // Update language
    const [updatedLanguage] = await db
      .update(languagesT)
      .set({
        name,
        code: String(code).toLowerCase(),
        isActive: is_active ?? true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(languagesT.id, params.id))
      .returning();

    return NextResponse.json(snakeRow(updatedLanguage));
  } catch (error) {
    console.error('Failed to update language:', error);
    return NextResponse.json(
      { error: 'Failed to update language' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Only super admin can delete languages.
    const { response } = await requireRole(['super_admin']);
    if (response) return response;

    // Check if language has words
    const wordCountRows = await db
      .select({ value: count() })
      .from(wordsT)
      .where(eq(wordsT.languageId, params.id));
    const wordCount = wordCountRows[0]?.value ?? 0;

    if (wordCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete language with existing words' },
        { status: 400 }
      );
    }

    // Delete language
    await db.delete(languagesT).where(eq(languagesT.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete language:', error);
    return NextResponse.json(
      { error: 'Failed to delete language' },
      { status: 500 }
    );
  }
}
