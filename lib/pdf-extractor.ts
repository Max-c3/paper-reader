import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Extracts all text content from a PDF file
 * @param filepath - Path to the PDF file (relative to project root or absolute)
 * @returns Promise<string> - Full text content of the PDF
 */
export async function extractPDFText(filepath: string): Promise<string> {
  try {
    // Resolve file path - handle both relative and absolute paths
    const fullPath = filepath.startsWith('/') 
      ? filepath 
      : join(process.cwd(), filepath);

    // Read PDF file
    const data = await readFile(fullPath);
    
    // Use pdf-parse internal module to avoid test file loading issue
    // The main entry point tries to load './test/data/05-versions-space.pdf'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    
    // Extract text using pdf-parse (designed for Node.js)
    const pdfData = await pdfParse(data);
    
    // Return extracted text
    return pdfData.text.trim();
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

