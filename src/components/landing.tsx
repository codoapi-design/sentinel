'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  BarChart3,
  Bell,
  FileText,
  Layers,
  Check,
  Wallet,
  Shield,
  Zap,
  Globe,
  Search,
  Bot,
  TrendingUp,
  Lock,
} from 'lucide-react';
import { pricingTiers } from '@/lib/mock-data';
import Link from 'next/link';

interface LandingPageProps {
  onGetStarted: () => void;
  onDemo: () => void;
}

export function LandingPage({ onGetStarted, onDemo }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#08090a] text-[#f7f8f8]" dir="ltr">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#08090a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0052ff] rounded-lg flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-bold text-[#f7f8f8]">Radareum</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm text-[#8a8f98]">
              <a href="#features" className="hover:text-[#f7f8f8] transition-colors">Features</a>
              <a href="#intelligence" className="hover:text-[#f7f8f8] transition-colors">AI Intelligence</a>
              <a href="#pricing" className="hover:text-[#f7f8f8] transition-colors">Pricing</a>
              <a href="#about" className="hover:text-[#f7f8f8] transition-colors">About</a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button
                  variant="ghost"
                  className="text-[#8a8f98] hover:text-[#f7f8f8] hidden sm:flex"
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  className="rounded-full bg-[#0052ff] hover:bg-[#0045dd] text-white px-6"
                >
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 landing-gradient" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#0052ff]/5 rounded-full blur-3xl" />

        <div className="max-w-4xl mx-auto text-center relative">
          <Badge className="mb-6 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 px-4 py-1.5 text-sm rounded-full">
            Crypto Wallet Intelligence Platform
          </Badge>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 tracking-tight">
            Your Crypto
            <br />
            <span className="text-[#0052ff]">Watchdog</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#8a8f98] max-w-2xl mx-auto mb-10 leading-relaxed">
            Auto-track transactions, AI-powered classification, real-time security alerts,
            and intelligent financial reports. All in one place.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link href="/signup">
              <Button
                size="lg"
                className="rounded-full bg-[#0052ff] hover:bg-[#0045dd] text-white px-8 py-6 text-lg font-medium shadow-lg shadow-[#0052ff]/25"
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-white/10 text-[#d0d6e0] hover:bg-[#191a1b] px-8 py-6 text-lg"
              >
                Try Demo
              </Button>
            </Link>
          </div>

          <p className="text-sm text-[#8a8f98]">
            No credit card required • Set up in under a minute
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-12 px-4 border-y border-white/5 bg-[#0f1011]/50">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '5,000+', label: 'Active Users' },
            { value: '$2.5B+', label: 'Assets Tracked' },
            { value: '50K+', label: 'Daily Transactions' },
            { value: '99.9%', label: 'Uptime' },
          ].map((stat, i) => (
            <div key={i}>
              <div className="text-2xl sm:text-3xl font-bold text-[#f7f8f8] font-mono-num">{stat.value}</div>
              <div className="text-sm text-[#8a8f98] mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 rounded-full">
              Features
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-[#f7f8f8]">Everything you need in one place</h2>
            <p className="text-[#8a8f98] text-lg max-w-2xl mx-auto">
              Integrated tools for managing your crypto wallet and financial reports
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Layers className="h-6 w-6" />,
                title: 'Auto Tracking',
                description: 'Connect your wallets and track all transactions automatically across multiple networks',
                color: 'bg-[#0052ff]/10 text-[#0052ff]',
              },
              {
                icon: <Zap className="h-6 w-6" />,
                title: 'Smart Classification',
                description: 'AI-powered transaction classification: income, expenses, DeFi, staking, and more',
                color: 'bg-[#0ecb81]/10 text-[#0ecb81]',
              },
              {
                icon: <FileText className="h-6 w-6" />,
                title: 'Financial Reports',
                description: 'Detailed financial reports exportable in PDF, CSV, and Excel formats',
                color: 'bg-[#f7931a]/10 text-[#f7931a]',
              },
              {
                icon: <Bell className="h-6 w-6" />,
                title: 'Instant Alerts',
                description: 'Telegram and email alerts for large transfers, market changes, and security events',
                color: 'bg-[#f6465d]/10 text-[#f6465d]',
              },
            ].map((feature, i) => (
              <Card
                key={i}
                className="bg-[#0f1011] border-white/5 hover:border-white/15 hover:shadow-lg transition-all duration-300 group"
              >
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-bold mb-2 text-[#f7f8f8]">{feature.title}</h3>
                  <p className="text-sm text-[#8a8f98] leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AI Intelligence Section */}
      <section id="intelligence" className="py-24 px-4 bg-[#0f1011]/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#627eea]/10 text-[#627eea] border-[#627eea]/20 rounded-full">
              AI Intelligence
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-[#f7f8f8]">Four AI-powered engines</h2>
            <p className="text-[#8a8f98] text-lg max-w-2xl mx-auto">
              Advanced intelligence features to optimize your portfolio and protect your assets
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: <TrendingUp className="h-6 w-6" />,
                title: 'Tax-Loss Harvesting',
                description: 'Automatically identifies opportunities to realize losses that can offset gains, reducing your tax burden. Tracks unrealized losses across all your wallets and suggests optimal timing for harvesting.',
                color: '#0ecb81',
                bgColor: 'bg-[#0ecb81]/10',
              },
              {
                icon: <Shield className="h-6 w-6" />,
                title: 'Security Radar',
                description: 'Real-time scanning for suspicious transactions, rug pulls, and contract exploits. Monitors your wallets 24/7 and sends instant alerts when dangerous activity is detected on connected addresses.',
                color: '#f6465d',
                bgColor: 'bg-[#f6465d]/10',
              },
              {
                icon: <BarChart3 className="h-6 w-6" />,
                title: 'True ROI Analyst',
                description: 'Calculates your real return on investment accounting for gas fees, slippage, impermanent loss, and opportunity cost. Goes beyond simple price appreciation to show your actual portfolio performance.',
                color: '#0052ff',
                bgColor: 'bg-[#0052ff]/10',
              },
              {
                icon: <Search className="h-6 w-6" />,
                title: 'Yield & Airdrop Hunter',
                description: 'Discovers yield farming opportunities and potential airdrops based on your wallet activity. Tracks protocol eligibility criteria and alerts you when new opportunities match your positions.',
                color: '#f7931a',
                bgColor: 'bg-[#f7931a]/10',
              },
            ].map((feature, i) => (
              <Card
                key={i}
                className="bg-[#0f1011] border-white/5 hover:border-white/15 transition-all duration-300 group"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`} style={{ color: feature.color }}>
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-2 text-[#f7f8f8]">{feature.title}</h3>
                      <p className="text-sm text-[#8a8f98] leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 rounded-full">
              How It Works
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-[#f7f8f8]">Three simple steps</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Connect Wallet',
                description: 'Add your wallet address or connect MetaMask for automatic tracking',
                icon: <Wallet className="h-8 w-8 text-[#0052ff]" />,
              },
              {
                step: '02',
                title: 'Review Transactions',
                description: 'See all your transactions automatically classified with advanced filtering',
                icon: <BarChart3 className="h-8 w-8 text-[#0ecb81]" />,
              },
              {
                step: '03',
                title: 'Generate Reports',
                description: 'Download professional financial reports in PDF or Excel format',
                icon: <FileText className="h-8 w-8 text-[#f7931a]" />,
              },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-[#0f1011] rounded-2xl shadow-lg flex items-center justify-center border border-white/5">
                  {item.icon}
                </div>
                <div className="text-sm font-mono-num text-[#0052ff] mb-2">{item.step}</div>
                <h3 className="text-xl font-bold mb-2 text-[#f7f8f8]">{item.title}</h3>
                <p className="text-[#8a8f98]">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 bg-[#0f1011]/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20 rounded-full">
              Pricing
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-[#f7f8f8]">Choose your plan</h2>
            <p className="text-[#8a8f98] text-lg">Start free for 3 days, or pay with crypto — USDC/USDT</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.id}
                className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl bg-[#0f1011] ${
                  tier.highlighted
                    ? 'border-[#0052ff] shadow-lg shadow-[#0052ff]/10 scale-[1.02]'
                    : 'border-white/5 hover:border-white/15'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#0052ff]" />
                )}
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    {tier.badge && (
                      <Badge
                        className={`rounded-full text-xs ${
                          tier.isFree
                            ? 'bg-white/10 text-[#d0d6e0] border-white/10'
                            : 'bg-[#0052ff] text-white'
                        }`}
                      >
                        {tier.badge}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-xl font-bold mb-1 text-[#f7f8f8]">{tier.nameEn}</h3>
                  <p className="text-sm text-[#8a8f98] mb-4">{tier.description}</p>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-bold font-mono-num text-[#f7f8f8]">
                      ${tier.price}
                    </span>
                    <span className="text-[#8a8f98] text-sm">
                      {tier.isFree ? `/${tier.trialDays ?? 3} days` : '/month'}
                    </span>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-[#d0d6e0]">
                        <div className="w-5 h-5 rounded-full bg-[#0ecb81]/10 flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-[#0ecb81]" />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup">
                    <Button
                      className={`w-full rounded-full font-medium ${
                        tier.highlighted
                          ? 'bg-[#0052ff] hover:bg-[#0045dd] text-white'
                          : 'bg-[#191a1b] hover:bg-[#28282c] text-[#f7f8f8]'
                      }`}
                    >
                      {tier.isFree ? 'Start Free Trial' : 'Get Started'}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Payment info */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 bg-[#191a1b] rounded-full px-6 py-3 border border-white/5">
              <Lock className="h-4 w-4 text-[#0052ff]" />
              <span className="text-sm text-[#8a8f98]">Crypto payments only — USDC/USDT on EVM networks</span>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Networks */}
      <section className="py-16 px-4 border-y border-white/5 bg-[#0f1011]/50">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm text-[#8a8f98] mb-6 uppercase tracking-wider">Supported Networks</p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
            {['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'BSC'].map((network) => (
              <div key={network} className="flex items-center gap-2 text-[#d0d6e0]">
                <Globe className="h-5 w-5" />
                <span className="text-sm font-medium">{network}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram Bot Section */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Bot className="h-8 w-8 text-[#0052ff]" />
            <h2 className="text-3xl sm:text-4xl font-bold text-[#f7f8f8]">Telegram Bot</h2>
          </div>
          <p className="text-[#8a8f98] text-lg max-w-2xl mx-auto mb-8">
            Get instant notifications, check your portfolio, and interact with AI — all from Telegram.
            Connect @wallet_Radareumbot to your account.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              { title: 'Portfolio Alerts', desc: 'Real-time price and balance changes' },
              { title: 'AI Chat', desc: 'Ask questions about your wallet' },
              { title: 'Security Alerts', desc: 'Instant notifications on threats' },
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1011] border border-white/5 rounded-xl p-4">
                <h4 className="text-sm font-medium text-[#f7f8f8] mb-1">{item.title}</h4>
                <p className="text-xs text-[#8a8f98]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="py-12 px-4 bg-[#08090a] border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-[#0052ff] rounded-lg flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold text-[#f7f8f8]">Radareum</span>
              </div>
              <p className="text-sm text-[#8a8f98] leading-relaxed">
                Crypto wallet intelligence platform. Track, classify, and report your crypto finances.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-sm text-[#f7f8f8]">Product</h4>
              <ul className="space-y-2 text-sm text-[#8a8f98]">
                <li><a href="#features" className="hover:text-[#f7f8f8] transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-[#f7f8f8] transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-[#f7f8f8] transition-colors">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-sm text-[#f7f8f8]">Networks</h4>
              <ul className="space-y-2 text-sm text-[#8a8f98]">
                <li><a href="#" className="hover:text-[#f7f8f8] transition-colors">Ethereum</a></li>
                <li><a href="#" className="hover:text-[#f7f8f8] transition-colors">Base</a></li>
                <li><a href="#" className="hover:text-[#f7f8f8] transition-colors">Arbitrum</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-sm text-[#f7f8f8]">Company</h4>
              <ul className="space-y-2 text-sm text-[#8a8f98]">
                <li><a href="#" className="hover:text-[#f7f8f8] transition-colors">About</a></li>
                <li><a href="#" className="hover:text-[#f7f8f8] transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-[#f7f8f8] transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[#8a8f98]">&copy; 2025 Radareum. All rights reserved.</p>
            <div className="flex items-center gap-4 text-sm text-[#8a8f98]">
              <a href="#" className="hover:text-[#f7f8f8] transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-[#f7f8f8] transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
