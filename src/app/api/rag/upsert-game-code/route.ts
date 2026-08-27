import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPineconeIndex } from '@/../../../src/rag/pineconeClient.js';
import { embedDocument } from '@/../../../src/rag/embedGemini.js';
import { chunkCode } from '@/../../../src/rag/chunkCode.js';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const code = formData.get('code') as string;
    const metadataStr = formData.get('metadata') as string;
    const files = formData.getAll('files') as File[];

    let metadata = {
      title: "",
      sourceGame: "manual-upload",
      genre: "unknown",
      framework: "html5_canvas",
      mechanics: "",
      path: "pasted-code"
    };

    if (metadataStr) {
      try {
        const parsed = JSON.parse(metadataStr);
        metadata = { ...metadata, ...parsed };
      } catch (e) {
        console.warn("Failed to parse metadata", e);
      }
    }

    const index = getPineconeIndex();
    let totalChunks = 0;
    let recordsUpserted = 0;
    const itemsToProcess: { content: string; path: string; sourceGame: string; title: string }[] = [];

    if (code && code.trim() !== '') {
      itemsToProcess.push({
        content: code,
        path: metadata.path || 'pasted-code',
        sourceGame: metadata.sourceGame || 'manual-upload',
        title: metadata.title || 'pasted-code'
      });
    }

    for (const file of files) {
      if (file && file.size > 0) {
        const text = await file.text();
        itemsToProcess.push({
          content: text,
          path: file.name,
          sourceGame: metadata.sourceGame || 'manual-upload',
          title: metadata.title || file.name
        });
      }
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ error: "No valid code or files provided." }, { status: 400 });
    }

    const recordsToUpsert = [];

    for (const item of itemsToProcess) {
      const chunks = chunkCode(item.content, item.path);
      totalChunks += chunks.length;

      const extMatch = item.path.match(/\.([^.]+)$/);
      const ext = extMatch ? extMatch[1] : 'unknown';

      const fileTypeMap: Record<string, string> = {
        'js': 'JavaScript',
        'ts': 'TypeScript',
        'tsx': 'TypeScript React',
        'html': 'HTML',
        'css': 'CSS'
      };

      const language = fileTypeMap[ext] || ext;

      // Infer mechanics
      const inferredMechanics = new Set<string>();
      if (metadata.mechanics) {
        metadata.mechanics.split(',').map(m => m.trim()).filter(Boolean).forEach(m => inferredMechanics.add(m));
      }

      const contentLower = item.content.toLowerCase();
      if (contentLower.includes('requestanimationframe')) inferredMechanics.add('render_loop');
      if (contentLower.includes('canvas') || contentLower.includes('getcontext')) inferredMechanics.add('html5_canvas');
      if (contentLower.includes('collision') || contentLower.includes('hitbox') || contentLower.includes('intersect')) inferredMechanics.add('collision');
      if (contentLower.includes('keydown') || contentLower.includes('keyup') || contentLower.includes('input')) inferredMechanics.add('input');
      if (contentLower.includes('velocity') || contentLower.includes('gravity') || contentLower.includes('jump')) inferredMechanics.add('movement');
      if (contentLower.includes('health') || contentLower.includes('damage') || contentLower.includes('hp')) inferredMechanics.add('health');
      if (contentLower.includes('enemy') || contentLower.includes('patrol') || contentLower.includes('chase')) inferredMechanics.add('enemy_ai');

      const mechanicsStr = Array.from(inferredMechanics).join(', ') || 'unknown';
      const framework = metadata.framework || (item.path.endsWith('.html') ? 'html5_canvas' : 'Vanilla');

      const baseMetadata = {
        title: item.title,
        source_game: item.sourceGame,
        language: language,
        file_type: ext,
        framework: framework,
        genre: metadata.genre || 'unknown',
        mechanics: mechanicsStr,
        path: item.path,
        quality_score: '0.75',
        version: 'v1',
        created_at: new Date().toISOString()
      };

      const sourceGameSlug = item.sourceGame.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const fileSlug = item.path.replace(/[^a-z0-9]/gi, '-').toLowerCase();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        const chunkMetadata = {
          ...baseMetadata,
          chunk_type: chunk.chunkType,
          content: chunk.content,
        };

        const embedding = await embedDocument(chunk.content, chunkMetadata);

        const hash = crypto.createHash('md5')
          .update(`${item.path}-${chunk.startLine}-${chunk.endLine}`)
          .digest('hex')
          .substring(0, 8);

        const id = `dreamstudio_${sourceGameSlug}_${fileSlug}_${i}_${hash}`;

        recordsToUpsert.push({
          id,
          values: embedding,
          metadata: chunkMetadata
        });
      }
    }

    if (recordsToUpsert.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < recordsToUpsert.length; i += batchSize) {
        const batch = recordsToUpsert.slice(i, i + batchSize);
        await index.upsert(batch as any); // using any here to bypass types due to pinecone type diffs
      }
      recordsUpserted += recordsToUpsert.length;
    }

    return NextResponse.json({
      success: true,
      filesProcessed: itemsToProcess.length,
      chunksCreated: totalChunks,
      recordsUpserted: recordsUpserted
    });

  } catch (error: any) {
    console.error("Upsert failed:", error);
    return NextResponse.json({ error: error.message || "Failed to upsert game code." }, { status: 500 });
  }
}
