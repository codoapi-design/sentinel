import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Row,
  Column,
  Hr,
  Button,
} from '@react-email/components';
import * as React from 'react';

interface ReportEmailProps {
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

const reportTitles = {
  daily: 'Daily Summary',
  weekly: 'Weekly Report',
  monthly: 'Monthly Report',
};

/**
 * قالب التقرير الدوري (يومي / أسبوعي / شهري)
 */
export function ReportEmail({
  reportType,
  periodLabel,
  portfolioValue,
  portfolioChange,
  totalIncome,
  totalExpenses,
  netFlow,
  gasFees,
  topAssets,
  notableTransactions,
  dashboardUrl,
}: ReportEmailProps) {
  const isPositive = portfolioChange.startsWith('+') || !portfolioChange.startsWith('-');
  const changeColor = isPositive ? '#0ecb81' : '#f6465d';

  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>{reportTitles[reportType]} - CryptoBooks - {periodLabel}</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Heading style={logoStyle}>CryptoBooks</Heading>
            <Text style={subtitleStyle}>{reportTitles[reportType]}</Text>
            <Text style={dateStyle}>{periodLabel}</Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Portfolio Overview */}
          <Section style={contentStyle}>
            <Heading style={sectionHeadingStyle}>Portfolio Summary</Heading>

            <Section style={portfolioBoxStyle}>
              <Row>
                <Column style={{ width: '60%' }}>
                  <Text style={portfolioLabelStyle}>القيمة الإجمالية</Text>
                  <Text style={portfolioValueStyle}>{portfolioValue}</Text>
                </Column>
                <Column style={{ width: '40%', textAlign: 'left' }}>
                  <Text style={portfolioLabelStyle}>التغير</Text>
                  <Text style={{ ...changeStyle, color: changeColor }}>{portfolioChange}</Text>
                </Column>
              </Row>
            </Section>

            {/* Summary Cards */}
            <Section style={{ marginTop: '20px' }}>
              <Row>
                <Column style={{ width: '50%', paddingLeft: '6px' }}>
                  <Section style={summaryBoxStyle}>
                    <Text style={summaryLabelStyle}>Revenue</Text>
                    <Text style={{ ...summaryValueStyle, color: '#0ecb81' }}>{totalIncome}</Text>
                  </Section>
                </Column>
                <Column style={{ width: '50%', paddingRight: '6px' }}>
                  <Section style={summaryBoxStyle}>
                    <Text style={summaryLabelStyle}>Expenses</Text>
                    <Text style={{ ...summaryValueStyle, color: '#f6465d' }}>{totalExpenses}</Text>
                  </Section>
                </Column>
              </Row>
              <Row style={{ marginTop: '8px' }}>
                <Column style={{ width: '50%', paddingLeft: '6px' }}>
                  <Section style={summaryBoxStyle}>
                    <Text style={summaryLabelStyle}>صافي التدفق</Text>
                    <Text style={summaryValueStyle}>{netFlow}</Text>
                  </Section>
                </Column>
                <Column style={{ width: '50%', paddingRight: '6px' }}>
                  <Section style={summaryBoxStyle}>
                    <Text style={summaryLabelStyle}>Gas Fees</Text>
                    <Text style={summaryValueStyle}>{gasFees}</Text>
                  </Section>
                </Column>
              </Row>
            </Section>
          </Section>

          <Hr style={hrStyle} />

          {/* Top Assets */}
          <Section style={contentStyle}>
            <Heading style={sectionHeadingStyle}>أهم الأصول</Heading>
            <Section style={detailsBoxStyle}>
              {topAssets.map((asset, index) => (
                <Row key={index} style={{ padding: '10px 0', borderBottom: index < topAssets.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <Column style={{ width: '33%' }}>
                    <Text style={assetSymbolStyle}>{asset.symbol}</Text>
                  </Column>
                  <Column style={{ width: '34%', textAlign: 'center' }}>
                    <Text style={assetValueStyle}>{asset.value}</Text>
                  </Column>
                  <Column style={{ width: '33%', textAlign: 'left' }}>
                    <Text style={{
                      ...assetChangeStyle,
                      color: asset.change.startsWith('+') || !asset.change.startsWith('-') ? '#0ecb81' : '#f6465d',
                    }}>
                      {asset.change}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>
          </Section>

          {/* Notable Transactions */}
          {notableTransactions.length > 0 && (
            <>
              <Hr style={hrStyle} />
              <Section style={contentStyle}>
                <Heading style={sectionHeadingStyle}>أبرز المعاملات</Heading>
                <Section style={detailsBoxStyle}>
                  {notableTransactions.map((tx, index) => (
                    <Row key={index} style={{ padding: '8px 0', borderBottom: index < notableTransactions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <Column style={{ width: '25%' }}>
                        <Text style={{
                          ...txTypeStyle,
                          color: tx.type === 'إيراد' ? '#0ecb81' : '#f6465d',
                        }}>
                          {tx.type}
                        </Text>
                      </Column>
                      <Column style={{ width: '25%', textAlign: 'center' }}>
                        <Text style={txTokenStyle}>{tx.token}</Text>
                      </Column>
                      <Column style={{ width: '25%', textAlign: 'center' }}>
                        <Text style={txAmountStyle}>{tx.amount}</Text>
                      </Column>
                      <Column style={{ width: '25%', textAlign: 'left' }}>
                        <Text style={txDateStyle}>{tx.date}</Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              </Section>
            </>
          )}

          <Hr style={hrStyle} />

          {/* CTA */}
          <Section style={{ ...contentStyle, textAlign: 'center', paddingBottom: '40px' }}>
            <Button style={buttonStyle} href={dashboardUrl}>
              عرض لوحة التحكم الكاملة
            </Button>
            <Text style={noteStyle}>
              تم إرسال هذا التقرير بناءً على إعداداتك في CryptoBooks.
              يمكنك تعديل تفضيلاتك من صفحة الإعدادات.
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              CryptoBooks - منصة المحاسبة الرقمية الذكية للعملات المشفرة
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────
const mainStyle: React.CSSProperties = {
  backgroundColor: '#08090a',
  fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
  direction: 'rtl',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#0f1011',
  borderRadius: '12px',
  margin: '0 auto',
  maxWidth: '600px',
  border: '1px solid rgba(255,255,255,0.05)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: '#0f1011',
  padding: '32px 40px 20px',
  textAlign: 'center',
  borderBottom: '2px solid #0052ff',
};

const logoStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
};

const subtitleStyle: React.CSSProperties = {
  color: '#0052ff',
  fontSize: '18px',
  fontWeight: '600',
  margin: '8px 0 0',
};

const dateStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '14px',
  margin: '4px 0 0',
};

const hrStyle: React.CSSProperties = {
  borderColor: 'rgba(255,255,255,0.05)',
  margin: '0',
};

const contentStyle: React.CSSProperties = {
  padding: '28px 40px',
};

const sectionHeadingStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 16px',
};

const portfolioBoxStyle: React.CSSProperties = {
  backgroundColor: '#191a1b',
  borderRadius: '12px',
  padding: '20px 24px',
  border: '1px solid rgba(255,255,255,0.05)',
};

const portfolioLabelStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '12px',
  margin: '0 0 4px',
};

const portfolioValueStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
};

const changeStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: '600',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
};

const summaryBoxStyle: React.CSSProperties = {
  backgroundColor: '#191a1b',
  borderRadius: '8px',
  padding: '14px 16px',
  border: '1px solid rgba(255,255,255,0.05)',
  marginTop: '4px',
};

const summaryLabelStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '11px',
  margin: '0 0 4px',
};

const summaryValueStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
};

const detailsBoxStyle: React.CSSProperties = {
  backgroundColor: '#191a1b',
  borderRadius: '8px',
  padding: '12px 16px',
  border: '1px solid rgba(255,255,255,0.05)',
};

const assetSymbolStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
};

const assetValueStyle: React.CSSProperties = {
  color: '#d0d6e0',
  fontSize: '13px',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
};

const assetChangeStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: '600',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
};

const txTypeStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: '600',
  margin: '0',
};

const txTokenStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '13px',
  fontWeight: '600',
  margin: '0',
};

const txAmountStyle: React.CSSProperties = {
  color: '#d0d6e0',
  fontSize: '12px',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
};

const txDateStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '12px',
  margin: '0',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#0052ff',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600',
  padding: '12px 32px',
  textDecoration: 'none',
  display: 'inline-block',
};

const noteStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '12px',
  textAlign: 'center',
  margin: '16px 0 0',
  lineHeight: '1.6',
};

const footerStyle: React.CSSProperties = {
  padding: '20px 40px',
  textAlign: 'center',
  backgroundColor: '#0a0b0c',
};

const footerTextStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '12px',
  margin: '4px 0',
};
