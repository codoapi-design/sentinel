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

interface AlertEmailProps {
  alertType: 'inbound' | 'outbound' | 'large' | 'portfolio' | 'asset_rise' | 'asset_drop' | 'gas';
  title: string;
  message: string;
  details: {
    label: string;
    value: string;
  }[];
  timestamp: string;
  dashboardUrl: string;
}

/**
 * قالب تنبيه فوري
 */
export function AlertEmail({ title, message, details, timestamp, dashboardUrl }: AlertEmailProps) {
  const isInbound = title.includes('وارد') || title.includes('استلام');
  const isOutbound = title.includes('صادر') || title.includes('إرسال');
  const accentColor = isInbound ? '#0ecb81' : isOutbound ? '#f6465d' : '#0052ff';

  return (
    <Html dir="rtl" lang="ar">
      <Head />
      <Preview>{title} - CryptoBooks</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={{ ...headerStyle, borderBottom: `2px solid ${accentColor}` }}>
            <Heading style={logoStyle}>CryptoBooks</Heading>
            <Text style={subtitleStyle}>تنبيه فوري</Text>
          </Section>

          {/* Alert Badge */}
          <Section style={contentStyle}>
            <Section style={{ ...badgeStyle, backgroundColor: `${accentColor}15`, border: `1px solid ${accentColor}30` }}>
              <Text style={{ ...badgeTextStyle, color: accentColor }}>{title}</Text>
            </Section>

            <Text style={paragraphStyle}>{message}</Text>

            {/* Details */}
            <Section style={detailsBoxStyle}>
              {details.map((detail, index) => (
                <Row key={index} style={{ padding: '10px 0', borderBottom: index < details.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <Column style={{ width: '50%', paddingRight: '8px' }}>
                    <Text style={detailLabelStyle}>{detail.label}</Text>
                  </Column>
                  <Column style={{ width: '50%', paddingLeft: '8px', textAlign: 'left' }}>
                    <Text style={detailValueStyle}>{detail.value}</Text>
                  </Column>
                </Row>
              ))}
            </Section>

            <Section style={{ textAlign: 'center', marginTop: '24px' }}>
              <Button style={buttonStyle} href={dashboardUrl}>
                عرض في لوحة التحكم
              </Button>
            </Section>

            <Text style={timestampStyle}>{timestamp}</Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              تم إرسال هذا التنبيه بناءً على إعداداتك في CryptoBooks
            </Text>
            <Text style={{ ...footerTextStyle, color: '#8a8f98' }}>
              لإدارة إعدادات التنبيهات، قم بزيارة صفحة الإعدادات
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
  padding: '32px 40px',
  textAlign: 'center',
};

const logoStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
};

const subtitleStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '14px',
  margin: '4px 0 0',
};

const contentStyle: React.CSSProperties = {
  padding: '32px 40px',
};

const badgeStyle: React.CSSProperties = {
  borderRadius: '8px',
  padding: '12px 20px',
  textAlign: 'center',
  marginBottom: '20px',
};

const badgeTextStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: '600',
  margin: '0',
};

const paragraphStyle: React.CSSProperties = {
  color: '#d0d6e0',
  fontSize: '15px',
  lineHeight: '1.7',
  textAlign: 'center',
  margin: '0 0 20px',
};

const detailsBoxStyle: React.CSSProperties = {
  backgroundColor: '#191a1b',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '16px 0',
  border: '1px solid rgba(255,255,255,0.05)',
};

const detailLabelStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '13px',
  margin: '0',
};

const detailValueStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
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

const timestampStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '12px',
  textAlign: 'center',
  margin: '16px 0 0',
};

const hrStyle: React.CSSProperties = {
  borderColor: 'rgba(255,255,255,0.05)',
  margin: '0',
};

const footerStyle: React.CSSProperties = {
  padding: '20px 40px',
  textAlign: 'center',
};

const footerTextStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '12px',
  margin: '4px 0',
  lineHeight: '1.5',
};
