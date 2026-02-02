/**
 * Document Extraction Script
 * 
 * Reads OCR text from the data sources and loads it into PostgreSQL.
 * This is the first step in the pipeline.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { config } from '../config.js';
import { insertDocument, close } from '../db.js';

// Path to the combined text file
const DATA_DIR = path.resolve(config.DATA_DIR);
const COMBINED_TEXT_PATH = path.join(DATA_DIR, 'combined-all-epstein-files/COMBINED_ALL_EPSTEIN_FILES_djvu.txt');

// Document ID pattern: EFTA00000001
const DOC_ID_PATTERN = /^EFTA\d{8}$/;

interface DocumentChunk {
  docId: string;
  lines: string[];
}

async function* readDocuments(): AsyncGenerator<DocumentChunk> {
  const fileStream = fs.createReadStream(COMBINED_TEXT_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let currentDoc: DocumentChunk | null = null;

  for await (const line of rl) {
    const trimmed = line.trim();
    
    // Check if this is a new document ID
    if (DOC_ID_PATTERN.test(trimmed)) {
      // If we have a previous document, yield it
      if (currentDoc && currentDoc.lines.length > 0) {
        yield currentDoc;
      }
      
      // Start a new document
      currentDoc = {
        docId: trimmed,
        lines: [],
      };
    } else if (currentDoc) {
      // Add line to current document
      if (trimmed.length > 0) {
        currentDoc.lines.push(line);
      }
    }
  }

  // Yield the last document
  if (currentDoc && currentDoc.lines.length > 0) {
    yield currentDoc;
  }
}

function getDatasetId(docId: string): number {
  // Extract the numeric portion
  const num = parseInt(docId.replace('EFTA', ''), 10);
  
  // Map to dataset based on the metadata:
  // DataSet 1: EFTA00000001-00003158
  // DataSet 2: EFTA00003159-00003857
  // DataSet 3: EFTA00003858-00005586
  // DataSet 4: EFTA00005705-00008320
  // DataSet 5: EFTA00008409-00008528
  
  if (num <= 3158) return 1;
  if (num <= 3857) return 2;
  if (num <= 5586) return 3;
  if (num <= 8320) return 4;
  return 5;
}

async function main() {
  console.log('📄 Starting document extraction...');
  console.log(`Reading from: ${COMBINED_TEXT_PATH}`);
  
  // Check if file exists
  if (!fs.existsSync(COMBINED_TEXT_PATH)) {
    console.error(`❌ File not found: ${COMBINED_TEXT_PATH}`);
    console.error('Make sure the DataSources directory is properly set up.');
    process.exit(1);
  }

  let count = 0;
  let errors = 0;
  const seenDocs = new Set<string>();

  for await (const doc of readDocuments()) {
    // Skip duplicate doc IDs (the OCR sometimes repeats)
    if (seenDocs.has(doc.docId)) {
      continue;
    }
    seenDocs.add(doc.docId);

    try {
      const fullText = doc.lines.join('\n');
      const datasetId = getDatasetId(doc.docId);
      
      await insertDocument({
        docId: doc.docId,
        datasetId,
        fullText,
        pageCount: 1, // We'll update this later with actual page counts
      });

      count++;
      if (count % 100 === 0) {
        console.log(`  ✓ Processed ${count} documents...`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${doc.docId}:`, error);
      errors++;
    }
  }

  console.log(`\n✅ Document extraction complete!`);
  console.log(`   Total documents: ${count}`);
  console.log(`   Errors: ${errors}`);

  await close();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
