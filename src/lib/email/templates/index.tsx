/**
 * Email Templates - Render functions
 *
 * تحويل قوالب React إلى HTML لإرسالها عبر SES
 */

import { render } from '@react-email/render';
import { VerificationEmail } from './verification-email';
import { AlertEmail } from './alert-email';
import { ReportEmail } from './report-email';

// ────────────────────────────────────────────────
// Verification Email
// ────────────────────────────────────────────────
export async function renderVerificationEmail(code: string): Promise<string> {
  const html = await render(<VerificationEmail code={code} />);
  return html;
}

// ────────────────────────────────────────────────
// Alert Email
// ────────────────────────────────────────────────
export interface AlertEmailData {
  alertType: 'inbound' | 'outbound' | 'large' | 'portfolio' | 'asset_rise' | 'asset_drop' | 'gas';
  title: string;
  message: string;
  details: { label: string; value: string }[];
  timestamp: string;
  dashboardUrl: string;
}

export async function renderAlertEmail(data: AlertEmailData): Promise<string> {
  const html = await render(<AlertEmail {...data} />);
  return html;
}

// ────────────────────────────────────────────────
// Report Email (Daily / Weekly / Monthly)
// ────────────────────────────────────────────────
export interface ReportEmailData {
  reportType: 'daily' | 'weekly' | 'monthly';
  periodLabel: string;
  portfolioValue: string;
  portfolioChange: string;
  totalIncome: string;
  totalExpenses: string;
  netFlow: string;
  gasFees: string;
  topAssets: { symbol: string; value: string; change: string }[];
  notableTransactions: { type: string; token: string; amount: string; date: string }[];
  dashboardUrl: string;
}

export async function renderReportEmail(data: ReportEmailData): Promise<string> {
  const html = await render(<ReportEmail {...data} />);
  return html;
}
