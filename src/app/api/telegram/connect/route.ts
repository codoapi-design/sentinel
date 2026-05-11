/**
 * POST /api/telegram/connect
 *
 * Generate a Telegram bot link for user to connect their account.
 * When user clicks the link and presses Start in Telegram,
 * the webhook links their Telegram chat ID to their CryptoBooks account.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// In-memory pending connections (should be DB in production)
// Key: code, Value: { userId, plan, createdAt }
const pendingLinks = new Map<string, { userId: string; plan: string; createdAt: number }>();

// Telegram bot username (should be env variable)
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'CryptoBooksBot';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, plan } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Generate a unique connection code
    const code = crypto.randomBytes(8).toString('hex');

    // Store the pending connection
    pendingLinks.set(code, {
      userId,
      plan: plan || 'starter',
      createdAt: Date.now(),
    });

    // Clean up old codes (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of pendingLinks.entries()) {
      if (value.createdAt < tenMinutesAgo) {
        pendingLinks.delete(key);
      }
    }

    // Generate the Telegram deep link
    const telegramLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`;

    return NextResponse.json({
      success: true,
      data: {
        link: telegramLink,
        code,
        botUsername: TELEGRAM_BOT_USERNAME,
        expiresIn: 600, // 10 minutes in seconds
      },
    });
  } catch (error) {
    console.error('Telegram connect error:', error);
    return NextResponse.json(
      { error: 'Failed to generate connection link' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telegram/connect?code=xxx
 * Verify a pending connection code (called from the webhook)
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { error: 'code parameter is required' },
      { status: 400 }
    );
  }

  const pending = pendingLinks.get(code);

  if (!pending) {
    return NextResponse.json(
      { error: 'Invalid or expired connection code' },
      { status: 404 }
    );
  }

  // Check if code is expired
  if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
    pendingLinks.delete(code);
    return NextResponse.json(
      { error: 'Connection code expired' },
      { status: 410 }
    );
  }

  // Return user info and remove the code (one-time use)
  pendingLinks.delete(code);

  return NextResponse.json({
    success: true,
    data: {
      userId: pending.userId,
      plan: pending.plan,
    },
  });
}
