import crypto from 'crypto';

export class BlobStore {
  private memoryBlobs: Map<string, { buffer: Buffer; contentType: string }> = new Map();

  public isAvailable(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  public async putAudio(
    jobId: string,
    kind: 'original' | 'translated',
    audioBuffer: Buffer,
    contentType: string = 'audio/wav'
  ): Promise<string> {
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const ext = contentType.includes('wav') ? 'wav' : contentType.includes('mp3') ? 'mp3' : 'pcm';
    const blobPath = `audio/${jobId}/${kind}_${randomSuffix}.${ext}`;

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      try {
        // Upload to Vercel Blob via standard REST API
        const res = await fetch(`https://blob.vercel-storage.com/${blobPath}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-api-version': '7',
            'Content-Type': contentType,
          },
          body: audioBuffer,
        });
        if (res.ok) {
          return blobPath;
        }
      } catch (err) {
        console.warn('[Blob] Upload failed, using memory cache:', err);
      }
    }

    // Memory fallback
    this.memoryBlobs.set(blobPath, { buffer: audioBuffer, contentType });
    return blobPath;
  }

  public async getAudio(blobPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      try {
        const res = await fetch(`https://blob.vercel-storage.com/${blobPath}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-api-version': '7',
          },
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || 'audio/wav';
          const buffer = Buffer.from(await res.arrayBuffer());
          return { buffer, contentType };
        }
      } catch (err) {
        console.warn(`[Blob] Download ${blobPath} failed:`, err);
      }
    }

    return this.memoryBlobs.get(blobPath) || null;
  }

  public async deleteAudio(blobPath: string): Promise<void> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      try {
        await fetch(`https://blob.vercel-storage.com/${blobPath}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-api-version': '7',
          },
        });
      } catch (err) {
        console.warn(`[Blob] Delete ${blobPath} failed:`, err);
      }
    }
    this.memoryBlobs.delete(blobPath);
  }
}

export const blobStore = new BlobStore();

export const blob = {
  uploadAudio: async (
    audioBuffer: Buffer,
    kind: 'original' | 'translated',
    jobId: string,
    contentType: string = 'audio/wav'
  ): Promise<string> => {
    return blobStore.putAudio(jobId, kind, audioBuffer, contentType);
  },
  downloadAudio: async (blobPath: string): Promise<Buffer | null> => {
    const res = await blobStore.getAudio(blobPath);
    return res ? res.buffer : null;
  },
  deleteAudio: async (blobPath: string): Promise<void> => {
    return blobStore.deleteAudio(blobPath);
  },
  isAvailable: (): boolean => blobStore.isAvailable(),
};
