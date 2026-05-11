import { NextResponse } from 'next/server';
import { generateTransactions, defaultClients, assets } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      wallets: defaultClients.map(c => ({ id: c.id, name: c.name, address: c.address })),
      transactions: generateTransactions().slice(0, 20),
      clients: defaultClients,
      assets: assets.slice(0, 10),
    },
  });
}
