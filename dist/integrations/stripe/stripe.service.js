"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const uuid_1 = require("uuid");
// =============================================
// Stripe Service - Handles payments & top-ups
// =============================================
class StripeService {
    constructor(pool) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
        }
        this.stripe = new stripe_1.default(secretKey, {
            apiVersion: '2023-08-16',
        });
        this.pool = pool;
    }
    // -----------------------------------------
    // Create a Stripe Checkout Session for top-up
    // -----------------------------------------
    async createTopupSession(userId, walletId, amount, currency = 'usd') {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Create topup record in DB
            const topupId = (0, uuid_1.v4)();
            await client.query(`INSERT INTO topups (id, user_id, wallet_id, amount, currency, status, payment_provider)
         VALUES ($1, $2, $3, $4, $5, 'pending', 'stripe')`, [topupId, userId, walletId, amount, currency]);
            // Create Stripe Checkout Session
            const session = await this.stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: currency,
                            product_data: {
                                name: 'Goldenia Wallet Top-Up',
                                description: `Add ${amount} ${currency.toUpperCase()} to your wallet`,
                            },
                            unit_amount: Math.round(amount * 100), // Convert to cents
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: process.env.STRIPE_SUCCESS_URL || 'http://localhost:3000/wallet?topup=success',
                cancel_url: process.env.STRIPE_CANCEL_URL || 'http://localhost:3000/wallet?topup=cancel',
                metadata: {
                    topup_id: topupId,
                    user_id: userId,
                    wallet_id: walletId,
                },
            });
            // Update topup with session ID
            await client.query(`UPDATE topups SET provider_session_id = $1, status = 'processing', updated_at = NOW() WHERE id = $2`, [session.id, topupId]);
            await client.query('COMMIT');
            return {
                sessionId: session.id,
                sessionUrl: session.url || '',
                topupId,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    // -----------------------------------------
    // Handle Stripe Webhook Events
    // -----------------------------------------
    async handleWebhook(payload, signature) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not set');
        }
        // Verify webhook signature
        const event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const topupId = session.metadata?.topup_id;
                if (topupId) {
                    await this.completeTopup(topupId, session.payment_intent);
                    return { event: 'topup_completed', topupId };
                }
                break;
            }
            case 'checkout.session.expired': {
                const session = event.data.object;
                const topupId = session.metadata?.topup_id;
                if (topupId) {
                    await this.failTopup(topupId);
                    return { event: 'topup_expired', topupId };
                }
                break;
            }
            default:
                return { event: event.type };
        }
        return { event: event.type };
    }
    // -----------------------------------------
    // Complete a top-up (credit wallet)
    // -----------------------------------------
    async completeTopup(topupId, paymentIntentId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Get topup details
            const topupResult = await client.query('SELECT * FROM topups WHERE id = $1 AND status = \'processing\'', [topupId]);
            if (topupResult.rows.length === 0) {
                throw new Error(`Topup ${topupId} not found or not in processing state`);
            }
            const topup = topupResult.rows[0];
            // Get current wallet balance
            const walletResult = await client.query('SELECT balance FROM wallets WHERE id = $1 FOR UPDATE', [topup.wallet_id]);
            if (walletResult.rows.length === 0) {
                throw new Error(`Wallet ${topup.wallet_id} not found`);
            }
            const balanceBefore = parseFloat(walletResult.rows[0].balance);
            const topupAmount = parseFloat(topup.amount);
            const balanceAfter = balanceBefore + topupAmount;
            // Update wallet balance
            await client.query('UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2', [balanceAfter, topup.wallet_id]);
            // Create transaction record
            const txId = (0, uuid_1.v4)();
            await client.query(`INSERT INTO transactions (id, wallet_id, type, amount, currency, description, reference_id, status)
         VALUES ($1, $2, 'topup', $3, $4, $5, $6, 'completed')`, [txId, topup.wallet_id, topupAmount, topup.currency, `Stripe top-up`, paymentIntentId]);
            // Create ledger entry
            await client.query(`INSERT INTO ledger_entries (wallet_id, topup_id, transaction_id, entry_type, amount, balance_before, balance_after, description)
         VALUES ($1, $2, $3, 'credit', $4, $5, $6, $7)`, [topup.wallet_id, topupId, txId, topupAmount, balanceBefore, balanceAfter, 'Stripe checkout top-up']);
            // Update topup status
            await client.query(`UPDATE topups SET status = 'completed', provider_payment_id = $1, updated_at = NOW() WHERE id = $2`, [paymentIntentId, topupId]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    // -----------------------------------------
    // Fail / cancel a top-up
    // -----------------------------------------
    async failTopup(topupId) {
        await this.pool.query(`UPDATE topups SET status = 'failed', updated_at = NOW() WHERE id = $1`, [topupId]);
    }
    // -----------------------------------------
    // Get topup status
    // -----------------------------------------
    async getTopupStatus(topupId) {
        const result = await this.pool.query('SELECT id, user_id, wallet_id, amount, currency, status, payment_provider, created_at, updated_at FROM topups WHERE id = $1', [topupId]);
        return result.rows[0] || null;
    }
    // -----------------------------------------
    // Get user's topup history
    // -----------------------------------------
    async getUserTopups(userId, limit = 20, offset = 0) {
        const result = await this.pool.query(`SELECT id, wallet_id, amount, currency, status, payment_provider, created_at, updated_at
       FROM topups WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
        return result.rows;
    }
}
exports.StripeService = StripeService;
//# sourceMappingURL=stripe.service.js.map