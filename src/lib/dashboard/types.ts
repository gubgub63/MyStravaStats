import type { Aggregation } from './aggregate';
export type DashboardData = Aggregation & {
    athlete: { id: number; firstname?: string; lastname?: string; profile?: string };
    fetchedAt: string;
    cacheExpiresAt: string;
    partial: boolean;
    days: number;
    range: { from: string; to: string };
    rateLimit: {
        limit: string | null;
        usage: string | null;
        readLimit: string | null;
        readUsage: string | null;
    } | null;
};
