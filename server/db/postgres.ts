import crypto from 'crypto';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { desc, eq, and, gte, lte, sql } from 'drizzle-orm';
import * as schema from './schema.js';
import { Job, NewJob, Conversation } from './schema.js';

class PostgresStore {
  private db: NeonHttpDatabase<typeof schema> | null = null;
  private memoryJobs: Map<string, Job> = new Map();
  private memoryConversations: Map<string, Conversation> = new Map();

  constructor() {
    const connStr = (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim();
    if (connStr && !connStr.includes('ep-sample-pooler')) {
      const sqlClient = neon(connStr);
      this.db = drizzle(sqlClient, { schema });
    }
  }

  public isLive(): boolean {
    return this.db !== null;
  }

  public async ping(): Promise<boolean> {
    if (this.db) {
      try {
        const res = await this.db.execute(sql`SELECT 1 as healthy`);
        return Boolean(res);
      } catch {
        return false;
      }
    }
    return true; // Memory fallback
  }

  // --- Jobs ---
  public async createJob(jobData: NewJob): Promise<Job> {
    const fullJob: Job = {
      jobId: jobData.jobId,
      kind: jobData.kind || 'utterance',
      deviceId: jobData.deviceId || null,
      conversationId: jobData.conversationId || null,
      status: jobData.status,
      sourceLanguage: jobData.sourceLanguage,
      detectedLanguage: jobData.detectedLanguage || null,
      targetLanguage: jobData.targetLanguage,
      transcript: jobData.transcript || null,
      translation: jobData.translation || null,
      audioInputBlobPath: jobData.audioInputBlobPath || null,
      audioOutputBlobPath: jobData.audioOutputBlobPath || null,
      canRetry: jobData.canRetry || false,
      durationSec: jobData.durationSec || null,
      sttMs: (jobData as any).sttMs ?? null,
      translateMs: jobData.translateMs || null,
      synthesizeMs: jobData.synthesizeMs || null,
      totalMs: jobData.totalMs || null,
      errorCode: jobData.errorCode || null,
      errorMessage: jobData.errorMessage || null,
      createdAt: jobData.createdAt ? new Date(jobData.createdAt) : new Date(),
      updatedAt: jobData.updatedAt ? new Date(jobData.updatedAt) : new Date(),
    };

    if (this.db) {
      try {
        await this.db.insert(schema.jobs).values(fullJob);
      } catch (err) {
        console.warn('[Postgres] Insert job failed, falling back to memory:', err);
      }
    }
    this.memoryJobs.set(fullJob.jobId, fullJob);

    // Update conversation if present
    if (fullJob.conversationId && fullJob.deviceId) {
      await this.touchConversation(fullJob.deviceId, 120, fullJob.conversationId);
    }

    return fullJob;
  }

  public async updateJob(jobId: string, partial: Partial<Job>): Promise<Job | null> {
    const existing = await this.getJob(jobId);
    if (!existing) return null;

    const updated: Job = {
      ...existing,
      ...partial,
      updatedAt: new Date(),
    };

    if (this.db) {
      try {
        await this.db.update(schema.jobs).set(updated).where(eq(schema.jobs.jobId, jobId));
      } catch (err) {
        console.warn(`[Postgres] Update job ${jobId} failed:`, err);
      }
    }
    this.memoryJobs.set(jobId, updated);
    return updated;
  }

  public async getJob(jobId: string): Promise<Job | null> {
    if (this.db) {
      try {
        const rows = await this.db.select().from(schema.jobs).where(eq(schema.jobs.jobId, jobId)).limit(1);
        if (rows.length > 0) return rows[0];
      } catch (err) {
        console.warn(`[Postgres] Get job ${jobId} failed:`, err);
      }
    }
    return this.memoryJobs.get(jobId) || null;
  }

  public async listJobs(filters?: {
    status?: string;
    kind?: string;
    deviceId?: string;
    language?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: Job[]; next_cursor?: string }> {
    const limit = filters?.limit || 50;

    if (this.db) {
      try {
        const conditions = [];
        if (filters?.status && filters.status !== 'all') conditions.push(eq(schema.jobs.status, filters.status));
        if (filters?.kind && filters.kind !== 'all') conditions.push(eq(schema.jobs.kind, filters.kind));
        if (filters?.deviceId) conditions.push(eq(schema.jobs.deviceId, filters.deviceId));
        if (filters?.cursor) conditions.push(lte(schema.jobs.createdAt, new Date(filters.cursor)));

        const query = this.db.select().from(schema.jobs);
        const results = conditions.length > 0
          ? await query.where(and(...conditions)).orderBy(desc(schema.jobs.createdAt)).limit(limit + 1)
          : await query.orderBy(desc(schema.jobs.createdAt)).limit(limit + 1);

        const hasMore = results.length > limit;
        const items = hasMore ? results.slice(0, limit) : results;
        const next_cursor = hasMore ? items[items.length - 1].createdAt.toISOString() : undefined;

        return { items, next_cursor };
      } catch (err) {
        console.warn('[Postgres] List jobs failed, using memory:', err);
      }
    }

    // Memory fallback
    let items = Array.from(this.memoryJobs.values());
    if (filters?.status && filters.status !== 'all') items = items.filter((j) => j.status === filters.status);
    if (filters?.kind && filters.kind !== 'all') items = items.filter((j) => j.kind === filters.kind);
    if (filters?.deviceId) items = items.filter((j) => j.deviceId === filters.deviceId);
    if (filters?.language) items = items.filter((j) => j.sourceLanguage === filters.language || j.targetLanguage === filters.language);

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const paginated = items.slice(0, limit);
    return { items: paginated };
  }

  public async deleteJob(jobId: string): Promise<boolean> {
    if (this.db) {
      try {
        await this.db.delete(schema.jobs).where(eq(schema.jobs.jobId, jobId));
      } catch (err) {
        console.warn(`[Postgres] Delete job ${jobId} failed:`, err);
      }
    }
    const existed = this.memoryJobs.has(jobId);
    this.memoryJobs.delete(jobId);
    return existed;
  }

  // --- Conversations ---
  public async touchConversation(
    deviceId: string,
    idleWindowSec: number = 120,
    explicitConvId?: string
  ): Promise<string> {
    const now = new Date();
    const idleThreshold = new Date(now.getTime() - idleWindowSec * 1000);

    // Find the latest active conversation for this device if explicitConvId not provided
    let latestConv: Conversation | null = null;
    if (explicitConvId) {
      latestConv = await this.getConversation(explicitConvId);
    } else {
      if (this.db) {
        try {
          const rows = await this.db
            .select()
            .from(schema.conversations)
            .where(and(eq(schema.conversations.deviceId, deviceId), gte(schema.conversations.lastUtteranceAt, idleThreshold)))
            .orderBy(desc(schema.conversations.lastUtteranceAt))
            .limit(1);
          if (rows.length > 0) {
            latestConv = rows[0];
          }
        } catch (err) {
          console.warn('[Postgres] Failed to query latest conversation:', err);
        }
      }

      if (!latestConv) {
        for (const conv of this.memoryConversations.values()) {
          if (conv.deviceId === deviceId && conv.lastUtteranceAt >= idleThreshold) {
            if (!latestConv || conv.lastUtteranceAt > latestConv.lastUtteranceAt) {
              latestConv = conv;
            }
          }
        }
      }
    }

    const convId = explicitConvId || latestConv?.conversationId || `conv_${crypto.randomBytes(8).toString('hex')}`;
    const updated: Conversation = {
      conversationId: convId,
      deviceId,
      createdAt: latestConv?.createdAt || now,
      lastUtteranceAt: now,
      utteranceCount: (latestConv?.utteranceCount || 0) + 1,
    };

    if (this.db) {
      try {
        await this.db
          .insert(schema.conversations)
          .values(updated)
          .onConflictDoUpdate({
            target: schema.conversations.conversationId,
            set: {
              lastUtteranceAt: now,
              utteranceCount: sql`${schema.conversations.utteranceCount} + 1`,
            },
          });
      } catch (err) {
        console.warn(`[Postgres] Touch conversation ${convId} failed:`, err);
      }
    }

    this.memoryConversations.set(convId, updated);
    return convId;
  }

  public async listConversations(params?: {
    deviceId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Conversation[]> {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    if (this.db) {
      try {
        const query = this.db.select().from(schema.conversations);
        if (params?.deviceId) {
          return await query
            .where(eq(schema.conversations.deviceId, params.deviceId))
            .orderBy(desc(schema.conversations.lastUtteranceAt))
            .limit(limit)
            .offset(offset);
        }
        return await query
          .orderBy(desc(schema.conversations.lastUtteranceAt))
          .limit(limit)
          .offset(offset);
      } catch (err) {
        console.warn('[Postgres] List conversations failed, using memory:', err);
      }
    }

    let items = Array.from(this.memoryConversations.values());
    if (params?.deviceId) items = items.filter((c) => c.deviceId === params.deviceId);
    items.sort((a, b) => b.lastUtteranceAt.getTime() - a.lastUtteranceAt.getTime());
    return items.slice(offset, offset + limit);
  }

  public async getConversation(convId: string): Promise<Conversation | null> {
    if (this.db) {
      try {
        const rows = await this.db.select().from(schema.conversations).where(eq(schema.conversations.conversationId, convId)).limit(1);
        if (rows.length > 0) return rows[0];
      } catch (err) {
        console.warn(`[Postgres] Get conversation ${convId} failed:`, err);
      }
    }
    return this.memoryConversations.get(convId) || null;
  }

  public async listConversationJobs(convId: string): Promise<Job[]> {
    if (this.db) {
      try {
        return await this.db
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.conversationId, convId))
          .orderBy(schema.jobs.createdAt);
      } catch (err) {
        console.warn(`[Postgres] List conversation jobs failed:`, err);
      }
    }

    return Array.from(this.memoryJobs.values())
      .filter((j) => j.conversationId === convId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // --- Retention Cleanup ---
  public async deleteExpiredJobs(retentionDays: number): Promise<{ deletedCount: number; blobPaths: string[] }> {
    return this.deleteOldJobs(retentionDays);
  }

  public async deleteOldJobs(retentionDays: number): Promise<{ deletedCount: number; blobPaths: string[] }> {
    const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000);
    const blobPaths: string[] = [];
    let count = 0;

    if (this.db) {
      try {
        const oldJobs = await this.db.select().from(schema.jobs).where(lte(schema.jobs.createdAt, cutoff));
        for (const j of oldJobs) {
          if (j.audioInputBlobPath) blobPaths.push(j.audioInputBlobPath);
          if (j.audioOutputBlobPath) blobPaths.push(j.audioOutputBlobPath);
        }
        await this.db.delete(schema.jobs).where(lte(schema.jobs.createdAt, cutoff));
        count = oldJobs.length;
      } catch (err) {
        console.warn('[Postgres] Retention cleanup failed:', err);
      }
    }

    for (const [id, j] of this.memoryJobs.entries()) {
      if (j.createdAt <= cutoff) {
        if (j.audioInputBlobPath) blobPaths.push(j.audioInputBlobPath);
        if (j.audioOutputBlobPath) blobPaths.push(j.audioOutputBlobPath);
        this.memoryJobs.delete(id);
        count++;
      }
    }

    return { deletedCount: count, blobPaths };
  }

  // --- SQL Percentiles & Stats Aggregation (Last 24h) ---
  public async getStatsAnalytics(): Promise<{
    counts_by_status: Record<string, number>;
    counts_by_kind: Record<string, number>;
    jobs_per_day: Array<{ date: string; count: number; failed: number }>;
    failure_rate: number;
    top_language_pairs: Array<{ pair: string; count: number; percentage: number }>;
    total_audio_minutes: number;
    utterances_today: number;
    jobs_in_progress: number;
    latency: {
      total: { p50: number; p95: number };
      stt: { p50: number; p95: number };
      translate: { p50: number; p95: number };
      synthesize: { p50: number; p95: number };
    };
  }> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    // Fetch jobs for analysis
    let allJobs: Job[] = [];
    if (this.db) {
      try {
        allJobs = await this.db.select().from(schema.jobs).where(gte(schema.jobs.createdAt, thirtyDaysAgo));
      } catch (err) {
        console.warn('[Postgres] Stats query failed, using memory:', err);
      }
    }
    if (allJobs.length === 0) {
      allJobs = Array.from(this.memoryJobs.values()).filter((j) => j.createdAt >= thirtyDaysAgo);
    }

    const counts_by_status: Record<string, number> = {};
    const counts_by_kind: Record<string, number> = {};
    const daysMap: Record<string, { count: number; failed: number }> = {};
    const pairsMap: Record<string, number> = {};
    let totalAudioSec = 0;
    let utterancesToday = 0;
    let inProgress = 0;

    const totalLatencies: number[] = [];
    const sttLatencies: number[] = [];
    const translateLatencies: number[] = [];
    const synthLatencies: number[] = [];

    const todayStr = now.toISOString().slice(0, 10);

    for (const j of allJobs) {
      counts_by_status[j.status] = (counts_by_status[j.status] || 0) + 1;
      counts_by_kind[j.kind] = (counts_by_kind[j.kind] || 0) + 1;

      if (['QUEUED', 'STT', 'TRANSLATING', 'SYNTHESIZING'].includes(j.status)) {
        inProgress++;
      }

      const dayStr = j.createdAt.toISOString().slice(0, 10);
      if (!daysMap[dayStr]) daysMap[dayStr] = { count: 0, failed: 0 };
      daysMap[dayStr].count++;
      if (j.status === 'FAILED') daysMap[dayStr].failed++;

      if (dayStr === todayStr && j.kind === 'utterance') {
        utterancesToday++;
      }

      const pair = `${j.sourceLanguage}->${j.targetLanguage}`;
      pairsMap[pair] = (pairsMap[pair] || 0) + 1;

      if (j.durationSec) {
        totalAudioSec += j.durationSec;
      }

      if (j.createdAt >= twentyFourHoursAgo) {
        if (j.totalMs != null) totalLatencies.push(j.totalMs);
        if (j.sttMs != null) sttLatencies.push(j.sttMs);
        if (j.translateMs != null) translateLatencies.push(j.translateMs);
        if (j.synthesizeMs != null) synthLatencies.push(j.synthesizeMs);
      }
    }

    const totalScanned = allJobs.length;
    const failedScanned = counts_by_status['FAILED'] || 0;
    const failure_rate = totalScanned > 0 ? Math.round((failedScanned / totalScanned) * 10000) / 10000 : 0;

    const sortedDays = Object.keys(daysMap).sort();
    const jobs_per_day = sortedDays.map((d) => ({
      date: d,
      count: daysMap[d].count,
      failed: daysMap[d].failed,
    }));

    const sortedPairs = Object.entries(pairsMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const top_language_pairs = sortedPairs.map(([pair, count]) => ({
      pair,
      count,
      percentage: totalScanned > 0 ? Math.round((count / totalScanned) * 1000) / 10 : 0,
    }));

    const calcP = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = (sorted.length - 1) * (p / 100);
      const low = Math.floor(idx);
      const high = Math.ceil(idx);
      if (low === high) return Math.round(sorted[low]);
      return Math.round(sorted[low] * (high - idx) + sorted[high] * (idx - low));
    };

    return {
      counts_by_status,
      counts_by_kind,
      jobs_per_day,
      failure_rate,
      top_language_pairs,
      total_audio_minutes: Math.round((totalAudioSec / 60) * 10) / 10,
      utterances_today: utterancesToday,
      jobs_in_progress: inProgress,
      latency: {
        total: { p50: calcP(totalLatencies, 50), p95: calcP(totalLatencies, 95) },
        stt: { p50: calcP(sttLatencies, 50), p95: calcP(sttLatencies, 95) },
        translate: { p50: calcP(translateLatencies, 50), p95: calcP(translateLatencies, 95) },
        synthesize: { p50: calcP(synthLatencies, 50), p95: calcP(synthLatencies, 95) },
      },
    };
  }
}

export const postgres = new PostgresStore();
