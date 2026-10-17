import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Test case imports post the whole workbook (or its parsed rows) to a server action.
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  serverExternalPackages: ['exceljs'],
}

export default nextConfig
