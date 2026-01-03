import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Some browsers may not set file.type correctly, so we'll be more lenient
    if (file.type && file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.name}`;
    const filepath = join(uploadsDir, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);
    console.log('File saved to:', filepath);

    // Save to database
    try {
      const pdf = await db.pDF.create({
        data: {
          filename: file.name,
          filepath: `uploads/${filename}`,
        },
      });
      console.log('PDF saved to database:', pdf.id);
      return NextResponse.json({ pdf }, { status: 201 });
    } catch (dbError) {
      console.error('Database error:', dbError);
      // If database fails, still return error but with more details
      const dbErrorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
      throw new Error(`Database error: ${dbErrorMessage}`);
    }
  } catch (error) {
    console.error('Error uploading PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Full error details:', error);
    return NextResponse.json(
      { error: `Failed to upload PDF: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const pdfs = await db.pDF.findMany({
      orderBy: { uploadedAt: 'desc' },
    });
    return NextResponse.json({ pdfs });
  } catch (error) {
    console.error('Error fetching PDFs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PDFs' },
      { status: 500 }
    );
  }
}

