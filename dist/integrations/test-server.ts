import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { BinanceService } from './binance/binance.service';
import { StripeService } from './stripe/stripe.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'goldenia',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

// Initialize services
const binanceService = new BinanceService();
const stripeService = new StripeService(pool);

// Middleware
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream' }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', message: 'Test server is running' });
});

// ============= BINANCE ENDPOINTS =============

// Get single price
app.get('/api/crypto/price', async (req: Request, res: Response) => {
    try {
        const { symbol = 'BTCUSDT' } = req.query;

        if (!symbol || typeof symbol !== 'string') {
            return res.status(400).json({
                error: 'Symbol query parameter is required and must be a string',
            });
        }

        const price = await binanceService.getPrice(symbol.toUpperCase());

        res.json({
            success: true,
            data: price,
        });
    } catch (error: any) {
        console.error('Binance error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch price',
        });
    }
});

// Get multiple prices
app.get('/api/crypto/prices', async (req: Request, res: Response) => {
    try {
        const { symbols } = req.query;

        if (!symbols || typeof symbols !== 'string') {
            return res.status(400).json({
                error: 'Symbols query parameter is required (comma-separated)',
            });
        }

        const symbolArray = symbols.split(',').map((s) => s.trim().toUpperCase());
        const prices = await binanceService.getMultiplePrices(symbolArray);

        res.json({
            success: true,
            data: prices,
        });
    } catch (error: any) {
        console.error('Binance error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch prices',
        });
    }
});

// Get 24hr ticker
app.get('/api/crypto/ticker', async (req: Request, res: Response) => {
    try {
        const { symbol = 'BTCUSDT' } = req.query;

        if (!symbol || typeof symbol !== 'string') {
            return res.status(400).json({
                error: 'Symbol query parameter is required',
            });
        }

        const ticker = await binanceService.get24hrTicker(symbol.toUpperCase());

        res.json({
            success: true,
            data: ticker,
        });
    } catch (error: any) {
        console.error('Binance error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch ticker',
        });
    }
});

// Get exchange info
app.get('/api/crypto/exchange-info', async (req: Request, res: Response) => {
    try {
        const info = await binanceService.getExchangeInfo();

        res.json({
            success: true,
            data: info,
        });
    } catch (error: any) {
        console.error('Binance error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch exchange info',
        });
    }
});

// Convert amount
app.post('/api/crypto/convert', async (req: Request, res: Response) => {
    try {
        const { fromSymbol, toSymbol, amount } = req.body;

        if (!fromSymbol || !toSymbol || !amount) {
            return res.status(400).json({
                error: 'fromSymbol, toSymbol, and amount are required',
            });
        }

        const result = await binanceService.convertAmount(
            fromSymbol.toUpperCase(),
            toSymbol.toUpperCase(),
            amount
        );

        res.json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error('Binance error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to convert amount',
        });
    }
});

// ============= STRIPE ENDPOINTS =============

// Create topup session
app.post('/api/payments/create-session', async (req: Request, res: Response) => {
    try {
        const { userId, walletId, amount, currency = 'usd' } = req.body;

        if (!userId || !walletId || !amount) {
            return res.status(400).json({
                error: 'userId, walletId, and amount are required',
            });
        }

        if (amount <= 0) {
            return res.status(400).json({
                error: 'Amount must be greater than 0',
            });
        }

        const session = await stripeService.createTopupSession(userId, walletId, amount, currency);

        res.json({
            success: true,
            data: session,
        });
    } catch (error: any) {
        console.error('Stripe error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create payment session',
        });
    }
});

// Handle Stripe webhook
app.post('/api/payments/webhook', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['stripe-signature'] as string;

        if (!signature) {
            return res.status(400).json({
                error: 'Missing Stripe signature header',
            });
        }

        const payload = req.body as Buffer;
        const result = await stripeService.handleWebhook(payload, signature);

        res.json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error('Stripe webhook error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to handle webhook',
        });
    }
});

// Get topup status
app.get('/api/payments/topup/:topupId', async (req: Request, res: Response) => {
    try {
        const { topupId } = req.params;

        if (!topupId) {
            return res.status(400).json({
                error: 'topupId is required',
            });
        }

        const status = await stripeService.getTopupStatus(topupId);

        res.json({
            success: true,
            data: status,
        });
    } catch (error: any) {
        console.error('Stripe error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch topup status',
        });
    }
});

// Get user topups
app.get('/api/payments/user/:userId', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { limit = 10, offset = 0 } = req.query;

        if (!userId) {
            return res.status(400).json({
                error: 'userId is required',
            });
        }

        const topups = await stripeService.getUserTopups(
            userId,
            parseInt(limit as string),
            parseInt(offset as string)
        );

        res.json({
            success: true,
            data: topups,
        });
    } catch (error: any) {
        console.error('Stripe error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch user topups',
        });
    }
});

// ============= ERROR HANDLING =============

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
    });
});

// Global error handler
app.use((err: any, req: Request, res: Response) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message,
    });
});

// ============= START SERVER =============

app.listen(PORT, () => {
    console.log(`\nTest Server Running on http://localhost:${PORT}`);
    console.log(`\nAvailable Endpoints:`);
    console.log(`\n  Binance Endpoints:`);
    console.log(`    GET /api/crypto/price?symbol=BTCUSDT`);
    console.log(`    GET /api/crypto/prices?symbols=BTCUSDT,ETHUSDT`);
    console.log(`    GET /api/crypto/ticker?symbol=BTCUSDT`);
    console.log(`    GET /api/crypto/exchange-info`);
    console.log(`    POST /api/crypto/convert`);
    console.log(`\n  Stripe Endpoints:`);
    console.log(`    POST /api/payments/create-session`);
    console.log(`    POST /api/payments/webhook`);
    console.log(`    GET /api/payments/topup/:topupId`);
    console.log(`    GET /api/payments/user/:userId`);
    console.log(`\n  Health Check:`);
    console.log(`    GET /health`);
    console.log(`\nMake sure .env file is configured with API keys and database credentials\n`);
});