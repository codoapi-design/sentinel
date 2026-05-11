/**
 * Amazon SES Email Service
 *
 * خدمة إرسال البريد الإلكتروني عبر Amazon SES
 *
 * متطلبات الإعداد في AWS:
 * 1. إنشاء IAM User مع صلاحيات SES
 * 2. التحقق من النطاق (Domain Verification) في SES
 * 3. طلب رفع القيود عن الحساب (Sandbox → Production) إذا كان في وضع Sandbox
 *
 * @see https://docs.aws.amazon.com/ses/latest/dg/creating-iam-policies.html
 */

import { SESClient, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-ses';

// ────────────────────────────────────────────────
// SES Client Singleton
// ────────────────────────────────────────────────
let sesClient: SESClient | null = null;

function getSESClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return sesClient;
}

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ────────────────────────────────────────────────
// Send Email via SES
// ────────────────────────────────────────────────
export async function sendEmail({ to, subject, html, text, replyTo }: EmailOptions): Promise<SendResult> {
  try {
    const client = getSESClient();

    const params: SendEmailCommandInput = {
      Source: `${process.env.SES_FROM_NAME || 'CryptoBooks'} <${process.env.SES_FROM_EMAIL || 'noreply@yourdomain.com'}>`,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: html,
            Charset: 'UTF-8',
          },
          ...(text ? {
            Text: {
              Data: text,
              Charset: 'UTF-8',
            },
          } : {}),
        },
      },
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
    };

    const command = new SendEmailCommand(params);
    const response = await client.send(command);

    return {
      success: true,
      messageId: response.MessageId || undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error sending email';
    console.error('[SES] Send error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

// ────────────────────────────────────────────────
// Send Templated Email (rendered from React Email)
// ────────────────────────────────────────────────
export async function sendTemplatedEmail(
  to: string | string[],
  subject: string,
  htmlBody: string,
  textBody?: string,
): Promise<SendResult> {
  return sendEmail({
    to,
    subject,
    html: htmlBody,
    text: textBody,
  });
}

// ────────────────────────────────────────────────
// Bulk Send (for multiple recipients)
// ────────────────────────────────────────────────
export async function sendBulkEmails(
  recipients: string[],
  subject: string,
  html: string,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // SES allows sending to multiple recipients in one call,
  // but for individual tracking we send one by one
  for (const recipient of recipients) {
    const result = await sendEmail({ to: recipient, subject, html });
    if (result.success) {
      sent++;
    } else {
      failed++;
      if (result.error) errors.push(`${recipient}: ${result.error}`);
    }
  }

  return { sent, failed, errors };
}

// ────────────────────────────────────────────────
// Generate 6-digit verification code
// ────────────────────────────────────────────────
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
