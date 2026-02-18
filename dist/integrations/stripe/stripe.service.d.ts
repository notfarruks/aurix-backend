import { Pool } from 'pg';
export declare class StripeService {
    private stripe;
    private pool;
    constructor(pool: Pool);
    createTopupSession(userId: string, walletId: string, amount: number, currency?: string): Promise<{
        sessionId: string;
        sessionUrl: string;
        topupId: string;
    }>;
    handleWebhook(payload: Buffer, signature: string): Promise<{
        event: string;
        topupId?: string;
    }>;
    private completeTopup;
    private failTopup;
    getTopupStatus(topupId: string): Promise<any>;
    getUserTopups(userId: string, limit?: number, offset?: number): Promise<any[]>;
}
//# sourceMappingURL=stripe.service.d.ts.map