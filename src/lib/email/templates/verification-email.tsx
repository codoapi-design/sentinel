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
} from '@react-email/components';
import * as React from 'react';

/**
 * قالب رمز التحقق من البريد الإلكتروني
 */
export function VerificationEmail({ code }: { code: string }) {
  return (
    <Html dir="rtl" lang="ar">
      <Head />
      <Preview>رمز التحقق الخاص بك في CryptoBooks</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Heading style={logoStyle}>CryptoBooks</Heading>
            <Text style={subtitleStyle}>منصة المحاسبة الرقمية الذكية</Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Content */}
          <Section style={contentStyle}>
            <Heading style={headingStyle}>تحقق من بريدك الإلكتروني</Heading>
            <Text style={paragraphStyle}>
              شكراً لتسجيلك في CryptoBooks! لإكمال تفعيل تنبيهات البريد الإلكتروني،
              يرجى إدخال رمز التحقق التالي:
            </Text>

            {/* Verification Code Box */}
            <Section style={codeBoxStyle}>
              <Row>
                <Column align="center">
                  <Text style={codeDigitsStyle}>{code}</Text>
                </Column>
              </Row>
            </Section>

            <Text style={noteStyle}>
              هذا الرمز صالح لمدة 10 دقائق فقط. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              CryptoBooks - منصة المحاسبة الرقمية الذكية للعملات المشفرة
            </Text>
            <Text style={footerTextStyle}>
              تم إرسال هذه الرسالة تلقائياً، يرجى عدم الرد عليها
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
  letterSpacing: '-0.5px',
};

const subtitleStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '14px',
  margin: '4px 0 0',
};

const hrStyle: React.CSSProperties = {
  borderColor: 'rgba(255,255,255,0.05)',
  margin: '0',
};

const contentStyle: React.CSSProperties = {
  padding: '40px',
};

const headingStyle: React.CSSProperties = {
  color: '#f7f8f8',
  fontSize: '22px',
  fontWeight: '600',
  margin: '0 0 16px',
  textAlign: 'center',
};

const paragraphStyle: React.CSSProperties = {
  color: '#d0d6e0',
  fontSize: '15px',
  lineHeight: '1.7',
  textAlign: 'center',
  margin: '0 0 24px',
};

const codeBoxStyle: React.CSSProperties = {
  backgroundColor: '#191a1b',
  borderRadius: '12px',
  padding: '24px',
  margin: '24px 0',
  border: '1px solid rgba(0,82,255,0.2)',
  textAlign: 'center',
};

const codeDigitsStyle: React.CSSProperties = {
  color: '#0052ff',
  fontSize: '36px',
  fontWeight: '700',
  letterSpacing: '8px',
  margin: '0',
  direction: 'ltr',
  fontFamily: 'monospace',
};

const noteStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '13px',
  textAlign: 'center',
  margin: '20px 0 0',
  lineHeight: '1.6',
};

const footerStyle: React.CSSProperties = {
  padding: '24px 40px',
  textAlign: 'center',
};

const footerTextStyle: React.CSSProperties = {
  color: '#8a8f98',
  fontSize: '12px',
  margin: '4px 0',
  lineHeight: '1.5',
};
