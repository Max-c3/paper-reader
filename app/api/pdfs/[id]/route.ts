import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const pdfId = params.id;

    // Find the PDF in database
    const pdf = await db.pDF.findUnique({
      where: { id: pdfId },
      include: {
        highlights: {
          include: {
            conversation: {
              include: {
                messages: true,
              },
            },
          },
        },
      },
    });

    if (!pdf) {
      return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
    }

    // Delete the file from filesystem
    const filePath = join(process.cwd(), pdf.filepath);
    if (existsSync(filePath)) {
      try {
        await unlink(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
        // Continue with DB deletion even if file deletion fails
      }
    }

    // Delete from database (cascade will handle highlights, conversations, messages)
    await db.pDF.delete({
      where: { id: pdfId },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting PDF:', error);
    return NextResponse.json(
      { error: 'Failed to delete PDF' },
      { status: 500 }
    );
  }
}

